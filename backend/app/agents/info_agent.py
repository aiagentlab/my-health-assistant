"""병원 상세 정보 에이전트"""
from app.state import HealthConsultationState

def run_info(state: HealthConsultationState) -> dict:
    """병원 정보 노드 — Step 3.9에서 구현"""
    return {"phase": "complete"}
