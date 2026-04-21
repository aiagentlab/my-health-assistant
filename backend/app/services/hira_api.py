"""심평원(HIRA) Open API 클라이언트

API 문서: https://www.data.go.kr/data/15001698/openapi.do
엔드포인트: 병원정보서비스 (hospInfoServicev2)
"""
import os
import math
from datetime import datetime, timezone, timedelta
import httpx
from typing import Optional

# 한국 시간대
KST = timezone(timedelta(hours=9))

HIRA_BASE_URL = "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList"

# 내부 진료과 코드 (앱 내부용)
DEPT_CODES = {
    "내과": "D001", "외과": "D002", "정형외과": "D003",
    "신경과": "D004", "피부과": "D005", "이비인후과": "D006",
    "안과": "D007", "비뇨의학과": "D008", "산부인과": "D009",
    "소아청소년과": "D010", "정신건강의학과": "D011", "응급의학과": "D012",
    "심장내과": "D013", "호흡기내과": "D014",
}

# 심평원 API 진료과목코드 매핑 (hospInfoServicev2 dgsbjtCd)
_HIRA_DEPT_CODES = {
    "D001": "01",  # 내과
    "D002": "04",  # 외과
    "D003": "05",  # 정형외과
    "D004": "02",  # 신경과
    "D005": "13",  # 피부과
    "D006": "10",  # 이비인후과
    "D007": "11",  # 안과
    "D008": "06",  # 비뇨의학과
    "D009": "08",  # 산부인과
    "D010": "12",  # 소아청소년과
    "D011": "03",  # 정신건강의학과
    "D012": "24",  # 응급의학과
    "D013": "01",  # 심장내과 → 내과
    "D014": "01",  # 호흡기내과 → 내과
}


def _haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    """두 좌표 사이 거리 계산 (미터 단위)"""
    R = 6371000  # 지구 반지름 (미터)
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return int(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def _estimate_operating_hours(cl_cd: str) -> str:
    """기관 종별 코드로 영업시간 추정"""
    # clCd: 01=상급종합, 11=종합병원, 21=병원, 28=요양병원, 31=의원
    if cl_cd in ("01",):
        return "24시간 (응급실 운영)"
    elif cl_cd in ("11", "21"):
        return "월-금 08:30-17:30 / 토 08:30-12:30"
    else:  # 의원, 클리닉 등
        return "월-금 09:00-18:00 / 토 09:00-13:00"


def _is_currently_open(cl_cd: str) -> bool:
    """현재 시각(KST) + 기관 종별로 진료중 여부 판단"""
    # 상급종합 (응급실) → 항상 진료중
    if cl_cd in ("01",):
        return True

    now = datetime.now(KST)
    weekday = now.weekday()  # 0=월, 6=일
    hour = now.hour
    minute = now.minute
    current_minutes = hour * 60 + minute

    if weekday == 6:  # 일요일
        return False

    if cl_cd in ("11", "21"):  # 종합병원, 병원
        if weekday == 5:  # 토요일
            return 510 <= current_minutes < 750  # 08:30~12:30
        return 510 <= current_minutes < 1050  # 08:30~17:30
    else:  # 의원
        if weekday == 5:  # 토요일
            return 540 <= current_minutes < 780  # 09:00~13:00
        return 540 <= current_minutes < 1080  # 09:00~18:00


def _parse_hospital(item: dict, user_lat: float, user_lng: float) -> dict:
    """HIRA hospInfoServicev2 응답 아이템 → HospitalInfo 구조"""
    try:
        lat = float(item.get("YPos") or item.get("yPos") or 0)
        lng = float(item.get("XPos") or item.get("xPos") or 0)
    except (TypeError, ValueError):
        lat, lng = 0.0, 0.0

    cl_cd = item.get("clCd", "31")
    cl_cd_nm = item.get("clCdNm", "")

    # 기관종별 → 사용자 친화적 라벨
    _TYPE_LABELS = {
        "상급종합": "상급병원",
        "종합병원": "종합병원",
        "병원": "병원",
        "요양병원": "요양병원",
        "의원": "동네의원",
    }
    hospital_type = _TYPE_LABELS.get(cl_cd_nm, cl_cd_nm or "의원")

    return {
        "id": item.get("ykiho", item.get("yadmNm", "")),
        "name": item.get("yadmNm", ""),
        "address": item.get("addr", ""),
        "phone": item.get("telno", ""),
        "lat": lat,
        "lng": lng,
        "departments": [item.get("dgsbjtCdNm", "")],
        "operating_hours": _estimate_operating_hours(cl_cd),
        "distance_m": _haversine_distance(user_lat, user_lng, lat, lng) if lat and lng else 0,
        "rating": None,
        "is_open_now": _is_currently_open(cl_cd),
        "hospital_type": hospital_type,
    }


async def search_hospitals_by_dept(
    dept_code: str,
    lat: float,
    lng: float,
    radius_m: int = 3000,
    page_size: int = 10,
) -> list[dict]:
    """
    심평원 API로 진료과별 근처 병원 검색

    Args:
        dept_code: 진료과 코드 (예: "D001" for 내과)
        lat: 사용자 위도
        lng: 사용자 경도
        radius_m: 검색 반경 (미터)
        page_size: 결과 수

    Returns:
        HospitalInfo 구조의 병원 목록 (거리순 정렬)
    """
    api_key = os.environ.get("HIRA_API_KEY", "")
    if not api_key:
        # API 키 없을 경우 Mock 데이터 반환 (개발 환경)
        return _mock_hospitals(dept_code, lat, lng)

    # 내부 코드(D001) → 심평원 코드(01) 변환
    hira_code = _HIRA_DEPT_CODES.get(dept_code, "01")

    params = {
        "serviceKey": api_key,
        "pageNo": 1,
        "numOfRows": page_size,
        "dgsbjtCd": hira_code,
        "xPos": str(lng),
        "yPos": str(lat),
        "radius": str(radius_m),
        "_type": "json",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(HIRA_BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

        body = data.get("response", {}).get("body", {})
        if not isinstance(body, dict):
            return _mock_hospitals(dept_code, lat, lng)

        items_wrapper = body.get("items", {})
        if isinstance(items_wrapper, str) or not items_wrapper:
            return _mock_hospitals(dept_code, lat, lng)

        items = items_wrapper.get("item", []) if isinstance(items_wrapper, dict) else []
        if isinstance(items, dict):  # 단일 결과인 경우
            items = [items]
        if not items:
            return _mock_hospitals(dept_code, lat, lng)

        hospitals = [_parse_hospital(item, lat, lng) for item in items]
        hospitals.sort(key=lambda h: h["distance_m"])
        return hospitals

    except Exception as e:
        # API 에러 시 Mock 데이터 fallback
        import logging
        logging.getLogger(__name__).error("HIRA API error: %s (%s)", e, type(e).__name__, exc_info=True)
        return _mock_hospitals(dept_code, lat, lng)


def _guess_area(lat: float, lng: float) -> str:
    """좌표 기반 대략적인 지역명 추정 (mock용)"""
    areas = [
        (37.5445, 127.0561, "성동구 성수동"),
        (37.4979, 127.0276, "강남구 역삼동"),
        (37.5547, 126.9707, "용산구 한강로"),
        (37.5571, 126.9236, "마포구 서교동"),
        (37.5133, 127.1001, "송파구 잠실동"),
        (37.5216, 126.9243, "영등포구 여의도동"),
        (37.5553, 126.9372, "서대문구 신촌동"),
        (37.5404, 127.0696, "광진구 화양동"),
        (37.5700, 126.9820, "종로구 종로"),
        (37.5636, 126.9869, "중구 명동"),
    ]
    best = min(areas, key=lambda a: (a[0] - lat) ** 2 + (a[1] - lng) ** 2)
    return best[2]


def _mock_hospitals(dept_code: str, lat: float, lng: float) -> list[dict]:
    """개발 환경 Mock 병원 데이터 — 입력 좌표 기준 지역으로 생성"""
    dept_name = next((k for k, v in DEPT_CODES.items() if v == dept_code), "내과")
    area = _guess_area(lat, lng)
    mock_data = [
        {
            "id": f"mock_{dept_code}_1",
            "name": f"{area.split()[0]} {dept_name} 의원",
            "address": f"서울특별시 {area} 100",
            "phone": "02-1234-5678",
            "lat": lat + 0.001,
            "lng": lng + 0.001,
            "departments": [dept_name],
            "operating_hours": "월-금 09:00-18:00 / 토 09:00-13:00",
            "distance_m": 150,
            "rating": 4.5,
            "is_open_now": _is_currently_open("31"),  # 의원
        },
        {
            "id": f"mock_{dept_code}_2",
            "name": f"{area.split()[0]} {dept_name} 클리닉",
            "address": f"서울특별시 {area} 200",
            "phone": "02-9876-5432",
            "lat": lat + 0.003,
            "lng": lng - 0.002,
            "departments": [dept_name, "가정의학과"],
            "operating_hours": "월-토 08:30-20:00",
            "distance_m": 380,
            "rating": 4.2,
            "is_open_now": _is_currently_open("31"),  # 의원
        },
        {
            "id": f"mock_{dept_code}_3",
            "name": f"서울 {area.split()[0]} 병원",
            "address": f"서울특별시 {area} 300",
            "phone": "02-2019-3114",
            "lat": lat - 0.005,
            "lng": lng + 0.004,
            "departments": [dept_name, "내과", "외과", "응급의학과"],
            "operating_hours": "24시간 (응급실 운영)",
            "distance_m": 720,
            "rating": 4.8,
            "is_open_now": True,  # 응급실 → 항상 진료중
        },
    ]
    return mock_data
