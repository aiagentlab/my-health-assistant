"""병원 검색/상세/길찾기 API 엔드포인트"""
import re
from fastapi import APIRouter, Query, HTTPException, Depends, Path
from app.services.hira_api import search_hospitals_by_dept, DEPT_CODES
from app.services.naver_maps import get_directions, geocode_address
from app.middleware.auth import verify_clerk_token

router = APIRouter()

# hospital_id 유효성 검사 패턴
HOSPITAL_ID_PATTERN = re.compile(r'^[A-Za-z0-9_\-]{1,64}$')


@router.get("/search")
async def search_hospitals(
    dept_code: str = Query(..., description="진료과 코드 (예: D001)"),
    lat: float = Query(..., description="사용자 위도"),
    lng: float = Query(..., description="사용자 경도"),
    radius: int = Query(3000, description="검색 반경 (미터)"),
    user: dict = Depends(verify_clerk_token),
):
    """
    진료과 코드 기반 근처 병원 검색 — 심평원 HIRA API

    인증 필수: Clerk JWT 토큰
    """
    if dept_code not in DEPT_CODES.values():
        raise HTTPException(
            status_code=400,
            detail=f"유효하지 않은 진료과 코드입니다. 유효 코드: {list(DEPT_CODES.values())}"
        )

    hospitals = await search_hospitals_by_dept(
        dept_code=dept_code,
        lat=lat,
        lng=lng,
        radius_m=radius,
    )

    return {
        "hospitals": hospitals,
        "total": len(hospitals),
        "dept_code": dept_code,
        "dept_name": next((k for k, v in DEPT_CODES.items() if v == dept_code), ""),
        "search_center": {"lat": lat, "lng": lng},
        "radius_m": radius,
    }


@router.get("/geocode")
async def geocode(
    address: str = Query(..., description="주소"),
    user: dict = Depends(verify_clerk_token),
):
    """주소 → 위경도 변환 — Naver Geocoding API (인증 필수)"""
    result = await geocode_address(address)
    if not result:
        raise HTTPException(status_code=404, detail="주소를 찾을 수 없습니다.")
    return result


@router.get("/{hospital_id}/directions")
async def get_hospital_directions(
    hospital_id: str = Path(..., description="병원 ID"),
    from_lat: float = Query(..., description="출발지 위도"),
    from_lng: float = Query(..., description="출발지 경도"),
    to_lat: float = Query(..., description="목적지 위도"),
    to_lng: float = Query(..., description="목적지 경도"),
    user: dict = Depends(verify_clerk_token),
):
    """병원까지 길찾기 — Naver Directions API (인증 필수)"""
    if not HOSPITAL_ID_PATTERN.match(hospital_id):
        raise HTTPException(status_code=400, detail="유효하지 않은 병원 ID입니다.")

    directions = await get_directions(
        from_lat=from_lat,
        from_lng=from_lng,
        to_lat=to_lat,
        to_lng=to_lng,
    )
    # 자동차 경로 기반으로 도보·대중교통 추정
    # (Naver Maps 기본 플랜 = 자동차 전용; 도보·대중교통은 별도 API)
    distance_m = directions.get("distance_m", 0)
    driving_min = max(1, directions.get("duration_sec", 0) // 60)
    walking_min = max(1, distance_m // 80)    # 도보 약 4.8km/h = 80m/min
    transit_min = max(1, int(driving_min * 1.4))  # 대중교통 추정 (환승·대기 포함)

    return {
        "hospital_id": hospital_id,
        "walking_min": walking_min,
        "transit_min": transit_min,
        "driving_min": driving_min,
    }


@router.get("/{hospital_id}")
async def get_hospital_detail(
    hospital_id: str = Path(..., description="병원 ID"),
    user: dict = Depends(verify_clerk_token),
):
    """병원 상세 정보 (인증 필수)"""
    if not HOSPITAL_ID_PATTERN.match(hospital_id):
        raise HTTPException(status_code=400, detail="유효하지 않은 병원 ID입니다.")

    return {
        "id": hospital_id,
        "message": "병원 상세 정보는 검색 결과에 포함되어 있습니다.",
        "hint": "프론트엔드에서 /hospital/search 결과를 로컬 상태로 유지하세요."
    }
