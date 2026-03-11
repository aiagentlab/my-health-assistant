"""
진단 에이전트 — 증상 → 진료과 추천
PRD §3.4 증상-진료과 매핑 테이블 기반
"""
import os
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from pydantic import BaseModel

from app.state import HealthConsultationState

DIAGNOSIS_SYSTEM_PROMPT = """당신은 의료 전문 AI로, 문진 결과를 분석하여 적절한 진료과를 추천합니다.

## 진료과 매핑 가이드 (PRD §3.4)
- 두통/어지러움/신경증상 → 신경과, 내과
- 흉통/심계항진 → 심장내과 (응급주의)
- 호흡곤란/기침 → 호흡기내과, 이비인후과
- 복통/소화불량 → 내과, 외과
- 관절통/근육통 → 정형외과
- 피부 발진/가려움 → 피부과
- 안과 증상 → 안과
- 이비인후 증상 → 이비인후과
- 비뇨기 증상 → 비뇨의학과
- 산부인과 증상 → 산부인과
- 소아 증상 → 소아청소년과
- 정신/불안/수면 → 정신건강의학과
- 응급 증상 → 응급의학과

## 긴급도 분류
- 일반: 1-2주 내 방문 권장
- 조기방문권장: 3-7일 내 방문 권장
- 응급: 즉시 응급실/119

## 출력 형식 (JSON)
반드시 아래 형식으로 출력:
{
  "primary_department": "진료과명",
  "primary_dept_code": "D001",
  "secondary_department": "2순위 진료과명 (없으면 빈 문자열)",
  "secondary_dept_code": "D002",
  "urgency": "일반|조기방문권장|응급",
  "reasoning": "추천 근거 2-3문장",
  "disclaimer": "본 추천은 AI 분석 결과로 의사의 진단을 대체하지 않습니다."
}

진료과 코드: 내과=D001, 외과=D002, 정형외과=D003, 신경과=D004, 피부과=D005,
이비인후과=D006, 안과=D007, 비뇨의학과=D008, 산부인과=D009, 소아청소년과=D010,
정신건강의학과=D011, 응급의학과=D012, 심장내과=D013, 호흡기내과=D014
"""

class DiagnosisOutput(BaseModel):
    primary_department: str
    primary_dept_code: str
    secondary_department: str
    secondary_dept_code: str
    urgency: str
    reasoning: str
    disclaimer: str

def run_diagnosis(state: HealthConsultationState) -> dict:
    """진단 노드 실행 — 부분 dict 반환"""
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        google_api_key=os.environ["GOOGLE_API_KEY"],
        temperature=0.1,
    )

    screening_data = state.get("screening_data", {})
    structured_llm = llm.with_structured_output(DiagnosisOutput)

    prompt = f"""다음 문진 결과를 분석하여 적절한 진료과를 추천해주세요.

문진 결과:
- 주증상: {screening_data.get('chief_complaint', '미입력')}
- 발생 부위: {screening_data.get('body_part', '미입력')}
- 지속 기간: {screening_data.get('duration_days', '미입력')}일
- 심각도: {screening_data.get('severity', '미입력')}/10
- 동반 증상: {screening_data.get('accompanying_symptoms', [])}
- 과거 병력: {screening_data.get('medical_history', '없음')}
"""

    result = structured_llm.invoke([
        SystemMessage(content=DIAGNOSIS_SYSTEM_PROMPT),
        HumanMessage(content=prompt)
    ])

    return {
        "diagnosis_result": result.model_dump(),
        "phase": "search"
    }
