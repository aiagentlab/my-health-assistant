"""인증 미들웨어 (인증 비활성화 상태)

인증/권한 기능은 현재 구현하지 않습니다.
모든 요청을 게스트 사용자로 처리합니다.
"""
from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer(auto_error=False)


async def verify_clerk_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """인증 없이 항상 게스트 사용자로 통과"""
    return {"user_id": "guest", "email": "guest@localhost", "session_id": "guest-session"}
