"""병원 검색 에이전트 — HIRA API + Naver Maps

LangGraph 노드로 호출될 때 diagnosis_result에서 진료과 코드를 읽어
HIRA API로 근처 병원을 검색하고 hospital_results 상태를 갱신한다.
"""
from app.state import HealthConsultationState
from app.services.hira_api import search_hospitals_by_dept, DEPT_CODES

# 기본 검색 반경 단계 (미터)
_RADIUS_STEPS = [1000, 3000, 5000]
# 서울 중심 좌표 (위치 정보 미제공 시 fallback)
_DEFAULT_LAT = 37.5665
_DEFAULT_LNG = 126.9780


async def run_search(state: HealthConsultationState) -> dict:
    """
    LangGraph 병원 검색 노드

    1. diagnosis_result 에서 primary_department 읽기
    2. DEPT_CODES 로 심평원 코드 변환
    3. HIRA API 호출 (반경 자동 확대: 1km→3km→5km)
    4. hospital_results + phase 반환
    """
    diagnosis = state.get("diagnosis_result", {})
    dept_name = diagnosis.get("primary_department", "내과")
    dept_code = DEPT_CODES.get(dept_name, "D001")

    # 사용자 위치: state에 있으면 사용, 없으면 서울 기본값
    lat = float(state.get("user_lat") or _DEFAULT_LAT)
    lng = float(state.get("user_lng") or _DEFAULT_LNG)

    hospitals: list[dict] = []
    for radius in _RADIUS_STEPS:
        hospitals = await search_hospitals_by_dept(
            dept_code=dept_code,
            lat=lat,
            lng=lng,
            radius_m=radius,
        )
        if hospitals:
            break  # 결과가 나오면 반경 확대 중단

    return {
        "phase": "info",
        "hospital_results": hospitals,
    }
