"""
HealthConsultationState — LangGraph StateGraph 공유 상태
langgraph-fundamentals 스킬 규칙 준수:
- messages 필드는 반드시 Annotated[list, operator.add] 리듀서 사용
- 노드는 부분 dict만 반환 (전체 state 반환 금지)
"""
from typing import Annotated, Optional
from typing_extensions import TypedDict
import operator


class ScreeningData(TypedDict):
    """문진 결과 데이터"""
    chief_complaint: str          # 주증상
    body_part: str                # 발생 부위
    duration_days: int            # 증상 지속 기간 (일)
    severity: int                 # 증상 강도 1-10
    accompanying_symptoms: list   # 동반 증상 목록
    medical_history: str          # 과거 병력
    medications: str              # 현재 복용 약물
    onset_type: str               # '급성'|'만성'|'반복성'


class DiagnosisResult(TypedDict):
    """진료과 추천 결과"""
    primary_department: str       # 1순위 진료과
    primary_dept_code: str        # 진료과 코드 (D001 등)
    secondary_department: str     # 2순위 진료과 (optional)
    secondary_dept_code: str      # 2순위 코드
    urgency: str                  # '일반'|'조기방문권장'|'응급'
    reasoning: str                # 추천 근거
    disclaimer: str               # 의료 면책 고지


class HospitalInfo(TypedDict):
    """병원 정보"""
    id: str
    name: str
    address: str
    phone: str
    lat: float
    lng: float
    departments: list
    operating_hours: str
    distance_m: int               # 사용자로부터 거리 (미터)
    rating: Optional[float]
    is_open_now: bool


class HealthConsultationState(TypedDict):
    """
    LangGraph StateGraph 전체 상태

    규칙:
    - messages: Annotated[list, operator.add] — 누적 리듀서 필수
    - 나머지 필드: 기본 덮어쓰기 (리듀서 없음)
    """
    session_id: str
    phase: str                              # 'onboarding'|'screening'|'diagnosis'|'search'|'info'|'complete'
    messages: Annotated[list, operator.add] # LangChain 메시지 누적 (리듀서 필수!)
    screening_data: dict                    # ScreeningData 구조
    diagnosis_result: dict                  # DiagnosisResult 구조
    hospital_results: list                  # List[HospitalInfo]
    selected_hospital: dict                 # 사용자가 선택한 병원
    emergency_flag: bool                    # 응급 증상 감지 여부
    emergency_keywords: list                # 감지된 응급 키워드 목록
    user_location: dict                     # {'lat': float, 'lng': float} 또는 {'address': str}
    owner_user_id: str                      # 세션 소유자 Clerk user_id (세션 하이재킹 방지)
