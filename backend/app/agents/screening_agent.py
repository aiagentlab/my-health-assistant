"""
문진 에이전트 — Gemini Flash로 증상 수집 + 구조화 추출

2-chain 패턴:
1. 대화 체인: 사용자와 자연스러운 5단계 문진 진행
2. 추출 체인: 3단계 이상 완료 시 with_structured_output으로 ScreeningData 추출
"""
import os
from typing import Optional
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from pydantic import BaseModel, Field

from app.state import HealthConsultationState

SYSTEM_PROMPT = """당신은 건강상담도우미의 AI 문진 의사입니다.
사용자의 증상을 체계적으로 수집하여 진료과 추천을 위한 정보를 모읍니다.

## 문진 순서 (5단계)
1. 주증상 확인: "어떤 증상으로 상담하시나요?"
2. 발생 부위: "증상이 신체 어느 부위에서 나타나나요?"
3. 지속 기간: "언제부터 증상이 시작되었나요?"
4. 심각도 (1-10): "현재 불편한 정도를 1(가벼움)~10(매우 심함)으로 말씀해주세요."
5. 동반 증상: "다른 증상이 함께 있나요? (발열, 구역질, 어지러움 등)"

## 중요 지침
- 친절하고 공감하는 톤 유지
- 의료 진단은 절대 하지 말 것 — "저는 AI입니다. 실제 진단은 의사에게 받으세요."
- 한 번에 하나의 질문만 진행
- 응급 증상 감지 시 즉시 응급 처치 안내

## 면책 고지
모든 응답 마지막에: "본 서비스는 의료 진단이 아닌 병원 방문 안내 서비스입니다."

현재 문진 단계: {current_step}/5
"""

EXTRACTION_PROMPT = """다음 대화에서 문진 정보를 JSON 형식으로 추출해주세요.
정보가 없으면 null을 사용하세요.

대화:
{conversation_text}
"""


class ScreeningDataExtracted(BaseModel):
    """LLM 구조화 추출용 Pydantic 모델"""
    chief_complaint: Optional[str] = Field(None, description="주증상 (예: '두통', '복통')")
    body_part: Optional[str] = Field(None, description="증상 발생 부위")
    duration_days: Optional[int] = Field(None, description="증상 지속 일수")
    severity: Optional[int] = Field(None, ge=1, le=10, description="증상 강도 1-10")
    accompanying_symptoms: Optional[list[str]] = Field(default_factory=list, description="동반 증상 목록")
    medical_history: Optional[str] = Field(None, description="과거 병력")
    medications: Optional[str] = Field(None, description="현재 복용 약물")
    onset_type: Optional[str] = Field(None, description="발생 유형: 급성|만성|반복성")
    is_complete: bool = Field(False, description="5단계 문진이 완료되었으면 True")


def _get_llm(streaming: bool = False) -> ChatGoogleGenerativeAI:
    """Gemini Flash 인스턴스 (호출 시마다 새로 생성 — 상태 없음)"""
    return ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        google_api_key=os.environ["GOOGLE_API_KEY"],
        streaming=streaming,
        temperature=0.3,
    )


def _extract_screening_data(messages: list, current_data: dict) -> dict:
    """
    대화 히스토리에서 문진 데이터를 구조화 추출

    diagnosis_agent.py와 동일한 with_structured_output 패턴 사용
    """
    try:
        llm = _get_llm(streaming=False)
        extractor = llm.with_structured_output(ScreeningDataExtracted)

        # 대화를 텍스트로 변환
        conversation_lines = []
        for msg in messages[-10:]:  # 최근 10개 메시지만 사용
            if isinstance(msg, HumanMessage):
                conversation_lines.append(f"사용자: {msg.content}")
            elif isinstance(msg, AIMessage):
                conversation_lines.append(f"AI: {msg.content}")
        conversation_text = "\n".join(conversation_lines)

        result = extractor.invoke([
            SystemMessage(content="당신은 대화에서 의료 문진 정보를 추출하는 전문가입니다."),
            HumanMessage(content=EXTRACTION_PROMPT.format(conversation_text=conversation_text))
        ])

        # 추출된 값으로 기존 데이터 업데이트 (None 값은 기존 값 유지)
        updated = dict(current_data)
        if result.chief_complaint:
            updated["chief_complaint"] = result.chief_complaint
        if result.body_part:
            updated["body_part"] = result.body_part
        if result.duration_days is not None:
            updated["duration_days"] = result.duration_days
        if result.severity is not None:
            updated["severity"] = result.severity
        if result.accompanying_symptoms:
            updated["accompanying_symptoms"] = result.accompanying_symptoms
        if result.medical_history:
            updated["medical_history"] = result.medical_history
        if result.medications:
            updated["medications"] = result.medications
        if result.onset_type:
            updated["onset_type"] = result.onset_type
        updated["is_complete"] = result.is_complete

        return updated, result.is_complete

    except Exception:
        # 추출 실패 시 기존 데이터 그대로 유지
        return current_data, False


def run_screening(state: HealthConsultationState) -> dict:
    """
    문진 노드 실행 — 부분 dict 반환 필수

    단계:
    1. 대화 응답 생성 (Gemini Flash)
    2. step >= 3이면 구조화 추출 실행
    3. 추출 완료 + chief_complaint 확보 시 phase → "diagnosis"
    """
    llm = _get_llm(streaming=False)
    messages = state.get("messages", [])
    screening_data = state.get("screening_data", {})
    current_step = screening_data.get("step", 1)

    # ─── 1단계: 대화 응답 생성 ──────────────────────────────────────────────
    prompt = ChatPromptTemplate.from_messages([
        SystemMessage(content=SYSTEM_PROMPT.format(current_step=current_step)),
        MessagesPlaceholder(variable_name="messages"),
    ])
    chain = prompt | llm
    response = chain.invoke({"messages": messages})

    # ─── 2단계: 구조화 추출 (step >= 3부터) ─────────────────────────────────
    all_messages = messages + [response]
    new_screening_data = {**screening_data, "step": current_step + 1}
    is_complete = False

    if current_step >= 3:
        new_screening_data, is_complete = _extract_screening_data(all_messages, new_screening_data)

    # ─── 3단계: phase 전환 판단 ──────────────────────────────────────────────
    # 5단계 완료 + 주증상 확보 + LLM이 완료 판단
    new_phase = "screening"
    if (
        current_step >= 5
        and new_screening_data.get("chief_complaint")
        and (is_complete or current_step >= 7)  # 최대 7회 후 강제 전환
    ):
        new_phase = "diagnosis"

    return {
        "messages": [response],
        "phase": new_phase,
        "screening_data": new_screening_data,
    }
