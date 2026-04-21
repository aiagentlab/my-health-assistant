"""Clerk JWT 인증 미들웨어

CLERK_JWKS_URL 환경변수에서 JWKS를 가져와 Bearer 토큰을 검증합니다.
개발 환경(APP_ENV=development + ALLOW_UNAUTHENTICATED=true)에서만 게스트 허용.
"""
import os
import logging

import httpx
import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)

_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient | None:
    global _jwks_client
    if _jwks_client is not None:
        return _jwks_client

    jwks_url = os.getenv("CLERK_JWKS_URL")
    if not jwks_url:
        return None

    _jwks_client = PyJWKClient(jwks_url)
    return _jwks_client


def _is_dev_unauthenticated_allowed() -> bool:
    return (
        os.getenv("APP_ENV", "production") == "development"
        and os.getenv("ALLOW_UNAUTHENTICATED", "").lower() == "true"
    )


async def verify_clerk_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Clerk JWT 검증. 실패 시 401, 개발 환경에서만 게스트 허용."""

    # No credentials provided
    if credentials is None:
        if _is_dev_unauthenticated_allowed():
            return {"user_id": "guest", "email": "guest@localhost", "session_id": "guest-session"}
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증 토큰이 필요합니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    jwks_client = _get_jwks_client()

    if jwks_client is None:
        if _is_dev_unauthenticated_allowed():
            return {"user_id": "guest", "email": "guest@localhost", "session_id": "guest-session"}
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="CLERK_JWKS_URL 환경변수가 설정되지 않았습니다.",
        )

    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"require": ["sub", "exp", "iat"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="토큰이 만료되었습니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except (jwt.InvalidTokenError, Exception) as e:
        logger.warning("JWT verification failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 인증 토큰입니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub", "")
    email = payload.get("email", "")
    session_id = payload.get("sid", "")

    return {"user_id": user_id, "email": email, "session_id": session_id}
