"""네이버 지도 API 클라이언트 (Python — Geocoding + Directions)

API 문서: https://api.ncloud-docs.com/docs/ai-naver-mapsgeocoding
인증: X-NCP-APIGW-API-KEY-ID + X-NCP-APIGW-API-KEY 헤더
"""
import os
import logging
import httpx

logger = logging.getLogger(__name__)

NAVER_GEOCODING_URL = "https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode"
NAVER_DIRECTIONS_URL = "https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving"
NAVER_DIRECTIONS_15_URL = "https://naveropenapi.apigw.ntruss.com/map-direction-15/v1/driving"

# 개발 환경 mock용 주요 장소 좌표 (Geocoding API 미구독 시 fallback)
_KNOWN_PLACES: dict[str, tuple[float, float, str]] = {
    "성수역": (37.5445, 127.0561, "서울특별시 성동구 뚝섬로 지하 273"),
    "성수": (37.5445, 127.0561, "서울특별시 성동구 성수동"),
    "강남역": (37.4979, 127.0276, "서울특별시 강남구 강남대로 396"),
    "강남": (37.4979, 127.0276, "서울특별시 강남구"),
    "서울역": (37.5547, 126.9707, "서울특별시 용산구 한강대로 405"),
    "홍대입구역": (37.5571, 126.9236, "서울특별시 마포구 양화로 160"),
    "홍대": (37.5571, 126.9236, "서울특별시 마포구 서교동"),
    "잠실역": (37.5133, 127.1001, "서울특별시 송파구 올림픽로 지하 265"),
    "잠실": (37.5133, 127.1001, "서울특별시 송파구 잠실동"),
    "여의도역": (37.5216, 126.9243, "서울특별시 영등포구 여의나루로 지하 42"),
    "여의도": (37.5216, 126.9243, "서울특별시 영등포구 여의도동"),
    "신촌역": (37.5553, 126.9372, "서울특별시 서대문구 신촌역로 1"),
    "신촌": (37.5553, 126.9372, "서울특별시 서대문구 신촌동"),
    "건대입구역": (37.5404, 127.0696, "서울특별시 광진구 아차산로 지하 243"),
    "건대": (37.5404, 127.0696, "서울특별시 광진구 화양동"),
    "종로": (37.5700, 126.9820, "서울특별시 종로구"),
    "명동": (37.5636, 126.9869, "서울특별시 중구 명동"),
    "이태원": (37.5345, 126.9946, "서울특별시 용산구 이태원동"),
    "판교역": (37.3948, 127.1112, "경기도 성남시 분당구 판교역로 160"),
    "판교": (37.3948, 127.1112, "경기도 성남시 분당구 판교동"),
}


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
    client_id = os.environ.get("NAVER_CLIENT_ID", "")
    client_secret = os.environ.get("NAVER_CLIENT_SECRET", "")

    if not client_id or not client_secret:
        logger.warning("NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 미설정 — mock 좌표 반환")
        return _fallback_geocode(address)

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
            logger.warning("Naver Geocoding 결과 없음: %s", address)
            return _fallback_geocode(address)

        first = addresses[0]
        return {
            "lat": float(first.get("y", 0)),
            "lng": float(first.get("x", 0)),
            "road_address": first.get("roadAddress", address),
        }
    except httpx.HTTPError as e:
        logger.error("Naver Geocoding API 오류: %s", e)
        return _fallback_geocode(address)


def _fallback_geocode(address: str) -> dict:
    """Geocoding API 사용 불가 시 주요 장소 좌표 매핑으로 fallback"""
    query = address.strip()
    # 정확한 매칭
    if query in _KNOWN_PLACES:
        lat, lng, road = _KNOWN_PLACES[query]
        return {"lat": lat, "lng": lng, "road_address": road}
    # 부분 매칭 (입력에 포함된 장소명)
    for name, (lat, lng, road) in _KNOWN_PLACES.items():
        if name in query:
            return {"lat": lat, "lng": lng, "road_address": road}
    # 기본값: 서울시청
    logger.warning("알 수 없는 장소 '%s' — 서울시청 좌표 반환", address)
    return {"lat": 37.5666, "lng": 126.9784, "road_address": address}


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
