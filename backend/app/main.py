"""
건강상담도우미 FastAPI 백엔드
"""
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

# LangSmith 설정 (observability)
os.environ.setdefault("LANGSMITH_TRACING", "true")
os.environ.setdefault("LANGSMITH_PROJECT", "my-health-assistant")

logger = logging.getLogger(__name__)


APP_ENV = os.environ.get("APP_ENV", "production")

# 프로덕션 필수 환경변수
_REQUIRED_PROD_VARS = ["GOOGLE_API_KEY"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """앱 시작/종료 이벤트 — fail-fast 환경변수 검증"""
    # 필수 환경변수 검사 (프로덕션에서만 강제)
    if APP_ENV != "development":
        missing = [v for v in _REQUIRED_PROD_VARS if not os.environ.get(v)]
        if missing:
            raise RuntimeError(f"필수 환경변수 누락: {missing}. 서버를 시작할 수 없습니다.")

        # InMemorySaver는 프로덕션에서 사용 금지 (재시작 시 세션 전체 소실)
        from app.graphs.consultation_graph import _default_graph
        if _default_graph is not None:
            from langgraph.checkpoint.memory import InMemorySaver
            cp = getattr(_default_graph, "checkpointer", None)
            if isinstance(cp, InMemorySaver):
                raise RuntimeError(
                    "InMemorySaver는 개발 환경 전용입니다. "
                    "APP_ENV=production에서는 PostgresSaver를 사용하세요."
                )

    logger.info("건강상담도우미 FastAPI 서버 시작 (ENV=%s)", APP_ENV)
    # 프로덕션 PostgresSaver 초기화 예시:
    # from langgraph.checkpoint.postgres import PostgresSaver
    # checkpointer = PostgresSaver.from_conn_string(os.environ["SUPABASE_DB_URL"])
    # checkpointer.setup()
    yield
    logger.info("서버 종료")


app = FastAPI(
    title="건강상담도우미 API",
    version="1.0.0",
    description="AI 기반 건강상담 + 진료과 추천 + 병원 검색",
    lifespan=lifespan,
)

# CORS 설정 — Next.js 프론트엔드 허용
cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

# 라우터 등록
from app.api.routes.consultation import router as consultation_router
from app.api.routes.hospital import router as hospital_router

app.include_router(consultation_router, prefix="/api/consultation", tags=["consultation"])
app.include_router(hospital_router, prefix="/api/hospital", tags=["hospital"])


@app.get("/health")
async def health_check():
    """헬스체크 엔드포인트"""
    return {"status": "ok", "service": "health-assistant-api", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
