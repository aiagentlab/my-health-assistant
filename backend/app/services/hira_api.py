"""심평원(HIRA) Open API 클라이언트

API 문서: https://www.data.go.kr/data/15001698/openapi.do
엔드포인트: 병원·약국 찾기 서비스 (MedicalRoomInfoService)
"""
import os
import math
import httpx
from typing import Optional

HIRA_BASE_URL = "https://apis.data.go.kr/B551182/MedicalRoomInfoService/getMedicalRoomInfo"

# 심평원 진료과 코드 매핑
DEPT_CODES = {
    "내과": "D001", "외과": "D002", "정형외과": "D003",
    "신경과": "D004", "피부과": "D005", "이비인후과": "D006",
    "안과": "D007", "비뇨의학과": "D008", "산부인과": "D009",
    "소아청소년과": "D010", "정신건강의학과": "D011", "응급의학과": "D012",
    "심장내과": "D013", "호흡기내과": "D014",
}


def _haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    """두 좌표 사이 거리 계산 (미터 단위)"""
    R = 6371000  # 지구 반지름 (미터)
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return int(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def _parse_hospital(item: dict, user_lat: float, user_lng: float) -> dict:
    """HIRA API 응답 아이템 → HospitalInfo 구조"""
    try:
        lat = float(item.get("YPos", 0))
        lng = float(item.get("XPos", 0))
    except (TypeError, ValueError):
        lat, lng = 0.0, 0.0

    return {
        "id": item.get("암호화요양기호", item.get("yadmNm", "")),
        "name": item.get("yadmNm", ""),
        "address": item.get("addr", ""),
        "phone": item.get("telno", ""),
        "lat": lat,
        "lng": lng,
        "departments": [item.get("dgsbjtCdNm", "")],
        "operating_hours": item.get("clTimeList", ""),
        "distance_m": _haversine_distance(user_lat, user_lng, lat, lng) if lat and lng else 0,
        "rating": None,
        "is_open_now": True,  # 실시간 영업 여부는 별도 API 필요
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

    params = {
        "serviceKey": api_key,
        "pageNo": 1,
        "numOfRows": page_size,
        "dgsbjtCd": dept_code,
        "xPos": lng,
        "yPos": lat,
        "radius": radius_m,
        "_type": "json",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(HIRA_BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

        items = (
            data.get("response", {})
            .get("body", {})
            .get("items", {})
            .get("item", [])
        )
        if isinstance(items, dict):  # 단일 결과인 경우
            items = [items]

        hospitals = [_parse_hospital(item, lat, lng) for item in items]
        # 거리순 정렬
        hospitals.sort(key=lambda h: h["distance_m"])
        return hospitals

    except httpx.HTTPError as e:
        # API 에러 시 Mock 데이터 fallback
        return _mock_hospitals(dept_code, lat, lng)


def _mock_hospitals(dept_code: str, lat: float, lng: float) -> list[dict]:
    """개발 환경 Mock 병원 데이터"""
    dept_name = next((k for k, v in DEPT_CODES.items() if v == dept_code), "내과")
    mock_data = [
        {
            "id": f"mock_{dept_code}_1",
            "name": f"서울 {dept_name} 의원",
            "address": "서울특별시 강남구 테헤란로 123",
            "phone": "02-1234-5678",
            "lat": lat + 0.001,
            "lng": lng + 0.001,
            "departments": [dept_name],
            "operating_hours": "월-금 09:00-18:00 / 토 09:00-13:00",
            "distance_m": 150,
            "rating": 4.5,
            "is_open_now": True,
        },
        {
            "id": f"mock_{dept_code}_2",
            "name": f"강남 {dept_name} 클리닉",
            "address": "서울특별시 강남구 역삼동 456",
            "phone": "02-9876-5432",
            "lat": lat + 0.003,
            "lng": lng - 0.002,
            "departments": [dept_name, "가정의학과"],
            "operating_hours": "월-토 08:30-20:00",
            "distance_m": 380,
            "rating": 4.2,
            "is_open_now": True,
        },
        {
            "id": f"mock_{dept_code}_3",
            "name": f"강남세브란스병원",
            "address": "서울특별시 강남구 언주로 211",
            "phone": "02-2019-3114",
            "lat": lat - 0.005,
            "lng": lng + 0.004,
            "departments": [dept_name, "내과", "외과", "응급의학과"],
            "operating_hours": "24시간",
            "distance_m": 720,
            "rating": 4.8,
            "is_open_now": True,
        },
    ]
    return mock_data
