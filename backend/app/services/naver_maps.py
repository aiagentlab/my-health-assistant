"""네이버 지도 API 클라이언트 (Python — Geocoding + Directions)

API 문서: https://api.ncloud-docs.com/docs/ai-naver-mapsgeocoding
인증: X-NCP-APIGW-API-KEY-ID + X-NCP-APIGW-API-KEY 헤더
"""
import os
import httpx

NAVER_GEOCODING_URL = "https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode"
NAVER_DIRECTIONS_URL = "https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving"
NAVER_DIRECTIONS_15_URL = "https://naveropenapi.apigw.ntruss.com/map-direction-15/v1/driving"


def _naver_headers() -> dict:
    """네이버 클라우드 API 인증 헤더"""
    return {
        "X-NCP-APIGW-API-KEY-ID": os.environ.get("NAVER_CLIENT_ID", ""),
        "X-NCP-APIGW-API-KEY": os.environ.get("NAVER_CLIENT_SECRET", ""),
    }


async def geocode_address(address: str) -> dict:
    """
    주소 → 위경도 변환 (네이버 Geocoding API)

    Returns:
        {"lat": float, "lng": float, "road_address": str} 또는 {}
    """
    if not os.environ.get("NAVER_CLIENT_ID"):
        # 개발 환경 Mock: 서울 강남구 좌표 반환
        return {"lat": 37.4979, "lng": 127.0276, "road_address": address}

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                NAVER_GEOCODING_URL,
                params={"query": address},
                headers=_naver_headers(),
            )
            response.raise_for_status()
            data = response.json()

        addresses = data.get("addresses", [])
        if not addresses:
            return {}

        first = addresses[0]
        return {
            "lat": float(first.get("y", 0)),
            "lng": float(first.get("x", 0)),
            "road_address": first.get("roadAddress", address),
        }
    except httpx.HTTPError:
        return {}


async def get_directions(
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    mode: str = "car",
) -> dict:
    """
    길찾기 (네이버 Directions API)

    Args:
        from_lat, from_lng: 출발지 좌표
        to_lat, to_lng: 목적지 좌표
        mode: "car" | "walk" (walk는 별도 Pedestrian API 필요)

    Returns:
        {
            "duration_sec": int,      # 소요 시간 (초)
            "distance_m": int,        # 거리 (미터)
            "duration_text": str,     # "약 15분"
            "distance_text": str,     # "1.2km"
            "summary": str            # "승용차로 약 15분 (1.2km)"
        }
    """
    if not os.environ.get("NAVER_CLIENT_ID"):
        # 개발 환경 Mock: 적당한 소요 시간 반환
        return _mock_directions(from_lat, from_lng, to_lat, to_lng)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                NAVER_DIRECTIONS_URL,
                params={
                    "start": f"{from_lng},{from_lat}",
                    "goal": f"{to_lng},{to_lat}",
                    "option": "traoptimal",
                },
                headers=_naver_headers(),
            )
            response.raise_for_status()
            data = response.json()

        route = (
            data.get("route", {})
            .get("traoptimal", [{}])[0]
            .get("summary", {})
        )
        duration_sec = route.get("duration", 0) // 1000  # ms → 초
        distance_m = route.get("distance", 0)

        return _format_directions(duration_sec, distance_m)

    except httpx.HTTPError:
        return _mock_directions(from_lat, from_lng, to_lat, to_lng)


def _format_directions(duration_sec: int, distance_m: int) -> dict:
    """소요 시간/거리 포맷팅"""
    minutes = max(1, duration_sec // 60)
    km = distance_m / 1000

    if km < 1:
        distance_text = f"{distance_m}m"
    else:
        distance_text = f"{km:.1f}km"

    return {
        "duration_sec": duration_sec,
        "distance_m": distance_m,
        "duration_text": f"약 {minutes}분",
        "distance_text": distance_text,
        "summary": f"승용차로 약 {minutes}분 ({distance_text})",
    }


def _mock_directions(from_lat: float, from_lng: float, to_lat: float, to_lng: float) -> dict:
    """개발 환경 Mock 길찾기 데이터"""
    import math
    # 직선 거리 기반 대략적인 소요 시간 추정
    dlat = (to_lat - from_lat) * 111000
    dlng = (to_lng - from_lng) * 111000 * math.cos(math.radians(from_lat))
    distance_m = int(math.sqrt(dlat ** 2 + dlng ** 2))
    duration_sec = max(60, distance_m // 8)  # 평균 시속 30km 가정
    return _format_directions(duration_sec, distance_m)
