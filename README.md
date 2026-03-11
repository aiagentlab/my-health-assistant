# 건강상담도우미 (My Health Assistant)

AI 기반 건강상담 웹서비스 — 증상 문진 → 진료과 추천 → 병의원 안내 → PDF 출력

```
Frontend (Next.js + MUI + Clerk)
  ↕ REST / SSE
Backend  (FastAPI + LangGraph + Gemini Flash)
  ↕
PostgreSQL (Supabase) | 심평원 API | 네이버 지도 API
```

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | Next.js 16, React 19, TypeScript, MUI v7 |
| Backend | Python 3.11+, FastAPI, LangGraph v1, Gemini Flash |
| 인증 | Clerk (Google OAuth 포함) |
| DB | Supabase (PostgreSQL) |
| 지도 | 네이버 지도 JS API v3 |
| 병원 검색 | 심평원(HIRA) Open API |
| 패키지 매니저 | pnpm (frontend) / uv (backend) |

---

## 사전 준비

### 필수 도구 설치

```bash
# Node.js 20+
node --version

# pnpm
npm install -g pnpm

# Python 3.11+
python3 --version

# uv (Python 패키지 매니저)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### API 키 발급

| 서비스 | 용도 | 발급 위치 |
|--------|------|----------|
| Google AI Studio | Gemini Flash (`GOOGLE_API_KEY`) | [aistudio.google.com](https://aistudio.google.com) |
| Clerk | 인증 (`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) | [clerk.com](https://clerk.com) |
| 네이버 클라우드 | 지도 API (`NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`) | [console.ncloud.com](https://console.ncloud.com) |
| 심평원 공공데이터 | 병원 검색 (`HIRA_API_KEY`) | [data.go.kr](https://data.go.kr) |
| Supabase | DB (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`) | [supabase.com](https://supabase.com) |

---

## 개발 환경 실행

### 1. 저장소 클론

```bash
git clone <repo-url>
cd my-health-assistant
```

### 2. 백엔드 설정

```bash
cd backend

# 의존성 설치 (가상환경 자동 생성 포함)
uv sync

# 환경 변수 설정
cp .env.example .env
# .env 파일을 열어 API 키 입력
```

`.env` 주요 항목:

```env
GOOGLE_API_KEY=AIza...          # Gemini Flash API 키
CLERK_SECRET_KEY=sk_test_...    # Clerk Secret Key
CLERK_JWKS_URL=https://sincere-yak-47.clerk.accounts.dev/.well-known/jwks.json
NAVER_CLIENT_ID=...             # 네이버 클라우드 Client ID
NAVER_CLIENT_SECRET=...         # 네이버 클라우드 Client Secret
HIRA_API_KEY=...                # 심평원 API 키 (없으면 Mock 데이터 사용)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
CORS_ORIGINS=http://localhost:3000
APP_ENV=development             # 개발 환경 (필수)
ALLOW_UNAUTHENTICATED=true      # 개발 중 인증 우회 (선택)
```

백엔드 서버 실행:

```bash
# backend/ 디렉토리에서 실행
uv run uvicorn app.main:app --reload --port 8000

# 정상 동작 확인
curl http://localhost:8000/health
# → {"status": "ok", "env": "development"}
```

### 3. 프론트엔드 설정

```bash
cd frontend

# 의존성 설치
pnpm install

# 환경 변수 설정
cp .env.local.example .env.local
# .env.local 파일을 열어 API 키 입력
```

`.env.local` 주요 항목:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID=...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

프론트엔드 서버 실행:

```bash
pnpm dev
# → http://localhost:3000
```

### 4. 동시 실행 (권장)

터미널 2개를 열어 동시에 실행합니다:

```bash
# 터미널 1 — 백엔드
cd backend && uv run uvicorn app.main:app --reload --port 8000

# 터미널 2 — 프론트엔드
cd frontend && pnpm dev
```

브라우저에서 `http://localhost:3000` 접속

---

## 프로젝트 구조

```
my-health-assistant/
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI 앱, CORS, lifespan
│   │   ├── state.py                   # HealthConsultationState TypedDict
│   │   ├── agents/
│   │   │   ├── screening_agent.py     # 문진 에이전트 (Gemini Flash)
│   │   │   ├── diagnosis_agent.py     # 진단 에이전트 (진료과 추천)
│   │   │   ├── search_agent.py        # 병원 검색 에이전트
│   │   │   └── info_agent.py          # 병원 정보 에이전트
│   │   ├── graphs/
│   │   │   └── consultation_graph.py  # LangGraph StateGraph
│   │   ├── api/routes/
│   │   │   ├── consultation.py        # /start /message /resume /pdf
│   │   │   └── hospital.py            # /search /geocode /{id}/directions
│   │   ├── middleware/
│   │   │   └── auth.py                # Clerk JWT 검증
│   │   └── services/
│   │       ├── hira_api.py            # 심평원 API 클라이언트
│   │       ├── naver_maps.py          # 네이버 지도 클라이언트
│   │       └── pdf_generator.py       # ReportLab PDF 생성
│   ├── supabase/migrations/           # DB 마이그레이션 SQL
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/
    ├── app/
    │   ├── (auth)/                    # Clerk 로그인/회원가입
    │   └── (consultation)/            # 상담 플로우 S01~S06
    ├── components/
    │   ├── screens/                   # S01~S06 화면 컴포넌트
    │   ├── chat/                      # ChatBubble, QuickReply 등
    │   ├── hospital/                  # HospitalCard
    │   ├── maps/                      # MiniMap, NaverMapEmbed
    │   └── ui/                        # 공통 UI (AppBar, Toast 등)
    ├── lib/
    │   ├── api/                       # consultation.ts, types.ts
    │   ├── theme/                     # MUI 디자인 토큰
    │   └── toast/                     # Toast 훅
    └── .env.local.example
```

---

## 상담 플로우

```
S01 온보딩/동의  →  S02 AI 문진 (Gemini Flash SSE 스트리밍)
                 →  S03 진료과 추천
                 →  S04 병원 검색 (GPS / 주소 입력)
                 →  S05 병원 상세 (네이버 지도 + 길찾기)
                 →  S06 상담 요약 + PDF 다운로드
```

---

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/health` | 서버 상태 확인 |
| `POST` | `/api/consultation/start` | 상담 세션 시작 |
| `POST` | `/api/consultation/message` | 메시지 전송 (SSE 스트리밍) |
| `POST` | `/api/consultation/resume` | 중단된 세션 재개 |
| `POST` | `/api/consultation/pdf` | 상담 요약 PDF 생성 |
| `GET` | `/api/hospital/search` | 진료과별 병원 검색 |
| `GET` | `/api/hospital/geocode` | 주소 → 좌표 변환 |
| `GET` | `/api/hospital/{id}/directions` | 길찾기 (소요 시간) |

---

## 개발 참고사항

### API 키 없이 실행

`HIRA_API_KEY`, `NAVER_CLIENT_ID` 없이도 **Mock 데이터**로 동작합니다.
`GOOGLE_API_KEY` 없으면 Gemini 호출이 실패합니다 — 반드시 입력 필요.

### 인증 우회 (개발 전용)

```env
# backend/.env
ALLOW_UNAUTHENTICATED=true
APP_ENV=development
```

### Naver Maps 지도 표시 안 될 때

`frontend/app/layout.tsx`의 Script src에서 `ncpClientId` 값이
`.env.local`의 `NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID`와 일치하는지 확인합니다.

---

## 라이선스

MIT
