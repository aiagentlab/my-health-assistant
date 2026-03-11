"""상담 관련 API 엔드포인트"""
import uuid
import re
import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, field_validator
from langchain_core.messages import HumanMessage
from langgraph.types import Command
import json

from app.graphs.consultation_graph import get_graph
from app.services.pdf_generator import generate_consultation_pdf
from app.middleware.auth import verify_clerk_token

router = APIRouter()
logger = logging.getLogger(__name__)

# 제어 문자 제거 패턴 (탭·개행 제외)
_CTRL_CHARS = re.compile(r'[\x00-\x08\x0b-\x1f\x7f]')


class StartRequest(BaseModel):
    pass

class MessageRequest(BaseModel):
    session_id: str
    message: str

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("메시지를 입력해주세요.")
        if len(v) > 2000:
            raise ValueError("메시지는 2000자 이하로 입력해주세요.")
        # 위험한 제어 문자 제거 (탭·개행은 유지)
        v = _CTRL_CHARS.sub('', v)
        return v

class PDFRequest(BaseModel):
    session_id: str

class ResumeRequest(BaseModel):
    session_id: str
    decision: str  # "call_119" | "continue_consultation"


@router.post("/start")
async def start_consultation(
    req: StartRequest = StartRequest(),
    user: dict = Depends(verify_clerk_token),
):
    """새 상담 세션 시작 — LangGraph thread_id = session_id로 체크포인트 초기화"""
    session_id = str(uuid.uuid4())
    graph = get_graph()
    config = {"configurable": {"thread_id": session_id}}

    # 초기 상태로 그래프 체크포인트 생성 (owner_user_id: 세션 소유자 바인딩)
    initial_state = {
        "session_id": session_id,
        "phase": "onboarding",
        "messages": [],
        "screening_data": {},
        "diagnosis_result": {},
        "hospital_results": [],
        "selected_hospital": {},
        "emergency_flag": False,
        "emergency_keywords": [],
        "user_location": {},
        "owner_user_id": user["user_id"],
    }

    # langgraph-persistence: update_state로 초기 체크포인트 저장
    graph.update_state(config, initial_state)

    return {"session_id": session_id, "phase": "onboarding"}


@router.post("/message")
async def send_message(
    req: MessageRequest,
    user: dict = Depends(verify_clerk_token),
):
    """문진 메시지 전송 — SSE 스트리밍 응답"""
    graph = get_graph()
    config = {"configurable": {"thread_id": req.session_id}}

    # 세션 소유자 검증
    try:
        current_state = graph.get_state(config)
        state_values = current_state.values if hasattr(current_state, "values") else {}
    except Exception:
        state_values = {}

    owner = state_values.get("owner_user_id")
    if owner and owner != user["user_id"]:
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다.")

    async def event_stream():
        try:
            async for chunk in graph.astream(
                {"messages": [HumanMessage(content=req.message)]},
                config=config,
                stream_mode="messages"
            ):
                token, metadata = chunk
                if hasattr(token, 'content') and token.content:
                    data = {"content": token.content, "done": False}
                    yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

            # 완료 후 현재 상태 조회
            current_state = graph.get_state(config)
            final_values = current_state.values if hasattr(current_state, 'values') else {}

            yield f"data: {json.dumps({'done': True, 'phase': final_values.get('phase', 'screening'), 'emergency_flag': final_values.get('emergency_flag', False)})}\n\n"
        except Exception as e:
            logger.error("Stream error session=%s: %s", req.session_id[:8], e, exc_info=True)
            yield f"data: {json.dumps({'error': '처리 중 오류가 발생했습니다.'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@router.post("/resume")
async def resume_consultation(
    req: ResumeRequest,
    user: dict = Depends(verify_clerk_token),
):
    """
    응급 interrupt() 재개 — langgraph-human-in-the-loop 패턴

    interrupt() 이후 중단된 그래프를 Command(resume=decision)으로 재개.
    decision: "call_119" (응급) | "continue_consultation" (상담 계속)
    """
    if req.decision not in ("call_119", "continue_consultation"):
        raise HTTPException(
            status_code=400,
            detail="decision은 'call_119' 또는 'continue_consultation'이어야 합니다."
        )

    graph = get_graph()
    config = {"configurable": {"thread_id": req.session_id}}

    # 세션 소유자 검증
    try:
        pre_state = graph.get_state(config)
        pre_values = pre_state.values if hasattr(pre_state, "values") else {}
    except Exception:
        pre_values = {}

    owner = pre_values.get("owner_user_id")
    if owner and owner != user["user_id"]:
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다.")

    try:
        # Command(resume=value) — interrupt()의 반환값으로 전달
        graph.invoke(Command(resume=req.decision), config=config)
    except Exception as e:
        logger.error("Resume error session=%s: %s", req.session_id[:8], e, exc_info=True)
        raise HTTPException(status_code=500, detail="재개 처리 중 오류가 발생했습니다.")

    current_state = graph.get_state(config)
    state_values = current_state.values if hasattr(current_state, "values") else {}

    return {
        "session_id": req.session_id,
        "decision": req.decision,
        "phase": state_values.get("phase", "complete"),
        "emergency_flag": state_values.get("emergency_flag", False),
    }


@router.post("/pdf")
async def generate_pdf(
    req: PDFRequest,
    user: dict = Depends(verify_clerk_token),
):
    """
    상담 결과 PDF 생성 — ReportLab (한글 지원)

    LangGraph 체크포인트에서 현재 세션 상태를 가져와 PDF 생성
    """
    graph = get_graph()
    config = {"configurable": {"thread_id": req.session_id}}

    # 체크포인트에서 현재 세션 상태 조회
    try:
        current_state = graph.get_state(config)
        state_values = current_state.values if hasattr(current_state, "values") else {}
    except Exception:
        state_values = {}

    if not state_values:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다. 상담을 먼저 진행해주세요.")

    # 세션 소유자 검증
    owner = state_values.get("owner_user_id")
    if owner and owner != user["user_id"]:
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다.")

    session_data = {
        "session_id": req.session_id,
        "created_at": datetime.now().isoformat(),
        "screening_data": state_values.get("screening_data", {}),
        "diagnosis_result": state_values.get("diagnosis_result", {}),
        "hospital_results": state_values.get("hospital_results", []),
        "selected_hospital": state_values.get("selected_hospital", {}),
    }

    try:
        pdf_bytes = generate_consultation_pdf(session_data)
    except Exception as e:
        logger.error("PDF error session=%s: %s", req.session_id[:8], e, exc_info=True)
        raise HTTPException(status_code=500, detail="PDF 생성 중 오류가 발생했습니다.")

    filename = f"health-consultation-{req.session_id[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )
