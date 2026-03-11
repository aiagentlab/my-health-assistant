# Backend 의존성 분석 (Python)

> Generated: 2026-03-11 | Source: langchain-dependencies skill + Step 1.1

## 환경 요구사항

| 항목 | 요구사항 |
|------|---------|
| Python | **3.10+** 필수 (LangChain 1.0 요구사항) |
| 패키지 매니저 | **uv** (권장) |

## 핵심 패키지 (requirements.txt)

```txt
# LangChain 코어 (LTS v1.0 - 0.3은 레거시 금지)
langchain>=1.0,<2.0
langchain-core>=1.0,<2.0

# LangGraph (Supervisor 패턴)
langgraph>=1.0,<2.0

# Google Gemini Flash (전용 패키지 - community 경유 금지)
langchain-google-genai

# Observability
langsmith>=0.3.0

# Web Framework
fastapi>=0.111.0
uvicorn[standard]>=0.29.0

# Database
supabase>=2.4.0
asyncpg>=0.29.0

# HTTP Client
httpx>=0.27.0

# Utilities
python-dotenv>=1.0.0
pydantic>=2.0.0

# PDF Generation (Korean font support - 3-teammate 토론 후 선택 예정)
# Option A: reportlab>=4.2.0
# Option B: weasyprint>=62.0
# Option C: fpdf2>=2.7.9
```

## 버전 정책 (langchain-dependencies 스킬 기준)

| 패키지 그룹 | 버전 정책 | 이유 |
|------------|---------|------|
| `langchain`, `langchain-core` | `>=1.0,<2.0` | Strict semver LTS |
| `langgraph` | `>=1.0,<2.0` | Strict semver LTS |
| `langchain-google-genai` | latest | 전용 패키지, semver |
| `langchain-community` | **사용 금지** (전용 패키지로 대체) | non-semver, 불안정 |
| `langsmith` | `>=0.3.0` | semver |

## 주의사항

- `langchain-community`의 Gemini 통합 경로 사용 금지:
  ```python
  # ❌ 금지
  from langchain_community.chat_models import ChatGoogleGenerativeAI
  # ✅ 올바른 방법
  from langchain_google_genai import ChatGoogleGenerativeAI
  ```
- `langchain` 0.3 금지 (레거시, 2026년 12월까지만 보안패치)

## 환경 변수 (.env.example)

```bash
# LangSmith (Observability)
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=my-health-assistant

# Google Gemini
GOOGLE_API_KEY=

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
SUPABASE_ANON_KEY=

# Naver Maps
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=

# HIRA (심평원)
HIRA_API_KEY=

# Clerk (백엔드 JWT 검증)
CLERK_SECRET_KEY=

# CORS
CORS_ORIGINS=http://localhost:3000
```
