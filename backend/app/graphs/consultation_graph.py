"""
건강상담 LangGraph StateGraph — Supervisor 패턴
langgraph-fundamentals + langgraph-persistence + langgraph-human-in-the-loop 스킬 준수
"""
import os
from typing import Literal
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import interrupt, Command
from langchain_core.messages import HumanMessage, AIMessage

from app.state import HealthConsultationState


# ─── 응급 키워드 목록 ───────────────────────────────────────────────────────
EMERGENCY_KEYWORDS = [
    "흉통", "가슴통증", "가슴이 아파", "심장", "호흡곤란", "숨이 안 쉬어져",
    "의식", "의식저하", "정신을 잃", "대량출혈", "출혈이 심",
    "편측마비", "반신마비", "언어장애", "말이 안 나와", "뇌졸중",
    "119", "응급"
]


# ─── Supervisor 라우팅 ────────────────────────────────────────────────────────
def supervisor_routing(state: HealthConsultationState) -> Literal[
    "screening_node", "diagnosis_node", "search_node", "info_node", "__end__"
]:
    """phase 기반 다음 에이전트 결정"""
    phase = state.get("phase", "onboarding")
    routing = {
        "onboarding": "screening_node",
        "screening": "screening_node",
        "diagnosis": "diagnosis_node",
        "search": "search_node",
        "info": "info_node",
        "complete": "__end__",
    }
    return routing.get(phase, "screening_node")


# ─── 응급 감지 엣지 ───────────────────────────────────────────────────────────
def check_emergency(state: HealthConsultationState) -> Literal["emergency_node", "supervisor"]:
    """마지막 사용자 메시지에서 응급 키워드 감지"""
    messages = state.get("messages", [])
    if not messages:
        return "supervisor"

    last_human_msg = ""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            last_human_msg = msg.content
            break

    found_keywords = [kw for kw in EMERGENCY_KEYWORDS if kw in last_human_msg]
    if found_keywords:
        return "emergency_node"
    return "supervisor"


# ─── 응급 처리 노드 (langgraph-human-in-the-loop interrupt 패턴) ──────────────
def emergency_node(state: HealthConsultationState) -> dict:
    """
    응급 증상 감지 시 사용자 확인 요청
    interrupt() 이전 코드는 재개 시 재실행됨 — 멱등성 필수
    """
    messages = state.get("messages", [])
    # 마지막 HumanMessage만 검색 — check_emergency와 검색 범위 일치
    last_human_msg = ""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            last_human_msg = msg.content
            break
    found_keywords = [kw for kw in EMERGENCY_KEYWORDS if kw in last_human_msg]

    # interrupt() — 사용자 결정 대기 (checkpointer + thread_id 필수)
    user_decision = interrupt({
        "type": "emergency_detected",
        "message": "⚠️ 응급 증상이 감지되었습니다. 즉시 119에 연락하거나 응급실을 방문하세요.",
        "keywords_found": found_keywords,
        "options": ["call_119", "continue_consultation"]
    })

    if user_decision == "call_119":
        return {
            "phase": "complete",
            "emergency_flag": True,
            "emergency_keywords": found_keywords
        }
    # continue_consultation — 문진 계속
    return {
        "phase": "screening",
        "emergency_flag": False,
        "emergency_keywords": []
    }


# ─── 문진 노드 (placeholder — screening_agent.py에서 구현) ─────────────────────
def screening_node(state: HealthConsultationState) -> dict:
    """문진 에이전트 — app/agents/screening_agent.py에서 실제 구현"""
    from app.agents.screening_agent import run_screening
    return run_screening(state)


# ─── 진단 노드 (placeholder) ──────────────────────────────────────────────────
async def diagnosis_node(state: HealthConsultationState) -> dict:
    """진단 에이전트 — app/agents/diagnosis_agent.py에서 실제 구현"""
    from app.agents.diagnosis_agent import run_diagnosis
    return await run_diagnosis(state)


# ─── 검색 노드 (placeholder) ──────────────────────────────────────────────────
async def search_node(state: HealthConsultationState) -> dict:
    """병원 검색 에이전트 — app/agents/search_agent.py에서 실제 구현"""
    from app.agents.search_agent import run_search
    return await run_search(state)


# ─── 정보 노드 (placeholder) ──────────────────────────────────────────────────
def info_node(state: HealthConsultationState) -> dict:
    """병원 상세 정보 에이전트 — app/agents/info_agent.py에서 실제 구현"""
    from app.agents.info_agent import run_info
    return run_info(state)


# ─── StateGraph 빌드 ──────────────────────────────────────────────────────────
def build_consultation_graph(checkpointer=None):
    """
    LangGraph StateGraph 빌드

    Args:
        checkpointer: InMemorySaver (개발) 또는 PostgresSaver (프로덕션)
                      langgraph-persistence 스킬: thread_id 항상 필수
    """
    builder = StateGraph(HealthConsultationState)

    # 노드 등록
    builder.add_node("emergency_check", lambda state: {})   # 라우팅 전용 — 빈 dict 반환 필수
    builder.add_node("supervisor", lambda state: {})         # 라우팅 전용 — 빈 dict 반환 필수
    builder.add_node("emergency_node", emergency_node)
    builder.add_node("screening_node", screening_node)
    builder.add_node("diagnosis_node", diagnosis_node)
    builder.add_node("search_node", search_node)
    builder.add_node("info_node", info_node)

    # 진입점: START → 응급 감지 체크
    builder.add_edge(START, "emergency_check")

    # 응급 감지 조건부 엣지
    builder.add_conditional_edges(
        "emergency_check",
        check_emergency,
        {"emergency_node": "emergency_node", "supervisor": "supervisor"}
    )

    # 응급 처리 후 → END
    builder.add_edge("emergency_node", END)

    # Supervisor 조건부 라우팅
    builder.add_conditional_edges(
        "supervisor",
        supervisor_routing,
        {
            "screening_node": "screening_node",
            "diagnosis_node": "diagnosis_node",
            "search_node": "search_node",
            "info_node": "info_node",
            "__end__": END,
        }
    )

    # 각 에이전트 노드 → END (다음 invocation에서 supervisor가 재라우팅)
    builder.add_edge("screening_node", END)
    builder.add_edge("diagnosis_node", END)
    builder.add_edge("search_node", END)
    builder.add_edge("info_node", END)

    # 컴파일 (checkpointer는 interrupt() 사용 시 필수)
    if checkpointer is None:
        checkpointer = InMemorySaver()

    return builder.compile(checkpointer=checkpointer)


# ─── 개발용 기본 그래프 인스턴스 ─────────────────────────────────────────────
_default_graph = None

def get_graph():
    """개발 환경 그래프 (InMemorySaver). 프로덕션은 main.py에서 PostgresSaver 사용."""
    global _default_graph
    if _default_graph is None:
        _default_graph = build_consultation_graph()
    return _default_graph
