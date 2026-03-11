# 건강상담도우미 웹서비스 개발 워크플로우

> **Version**: 1.2.0
> **Created**: 2026-03-11
> **Updated**: 2026-03-11 (LangChain/LangGraph 스킬 반영)
> **Project**: my-health-assistant
> **기준 문서**: PRD v1.0, 기능설명서 v1.0, User Journey Map v1.0, 화면설계서 v1.0, techstack.md

---

## Overview

| 항목 | 내용 |
|------|------|
| **목표** | AI 기반 건강상담 웹서비스 전체 구현 (증상 문진 → 진료과 추천 → 병의원 안내 → PDF 출력) |
| **Frontend** | Next.js (latest), React.js (latest), TypeScript, MUI |
| **Backend** | Python, LangChain, LangGraph (Supervisor 패턴) |
| **DB** | PostgreSQL (Supabase) |
| **Auth** | Clerk / Google OAuth |
| **패키지 매니저** | pnpm (frontend) / uv (backend Python) |
| **Autopilot** | disabled |
| **pACS** | enabled |

### 시스템 아키텍처 개요

```
┌─────────────────────────────────────────────────────┐
│              Frontend (Next.js + MUI)                │
│  S-01 → S-02 → S-03 → S-04 → S-05 → S-06           │
│  Clerk 인증  │  Naver Maps JS API                    │
└──────────────┬──────────────────────────────────────┘
               │ HTTP / REST API
┌──────────────▼──────────────────────────────────────┐
│         Backend (Python + FastAPI)                   │
│  LangGraph Supervisor Pattern (latest)               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ 문진 Agent│ │ 진단 Agent│ │ 검색 Agent│ │정보Agent│ │
│  │ (Gemini) │ │ (Gemini) │ │(Naver+심평│ │(병원DB)│ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│  PostgreSQL (Supabase) │ 심평원 API │ Naver Maps API │
└─────────────────────────────────────────────────────┘
```

### 구현 범위

**포함 (MVP):**
- S-01 온보딩/동의 화면
- S-02 AI 문진 상담 (LangGraph 문진 Agent + Gemini Flash + 3-teammate 토론)
- S-03 진료과 추천 (LangGraph 진단 Agent + Gemini Flash + 3-teammate 토론)
- S-04 위치 입력 + 병원 검색 (LangGraph 검색 Agent + Naver Maps API + 3-teammate 토론)
- S-05 병원 상세 정보 (네이버 지도 임베드 + 3-teammate 토론)
- S-06 상담 요약 + PDF 다운로드 (3-teammate 토론)
- 인증: Clerk + Google OAuth

**제외 (구현 X):**
- 결과 저장 (DB 저장)
- 카카오톡 공유
- 상담 피드백

---

## 스킬 참조 가이드 (Skills Reference Order)

> **원칙**: `langchain-langgraph-best-practices`는 다른 모든 LangChain/LangGraph 스킬을 참조한 **이후** 마지막에 적용한다.

### 스킬 호출 순서 (이 워크플로우에서 권장)

```
Phase 1 (Research)
  Step 1.1 → /langchain-dependencies     ← Python 버전·패키지 버전 확정

Phase 2 (Planning)
  Step 2.1 → /framework-selection        ← LangGraph Supervisor 적합성 확인
  Step 2.3 → /langgraph-fundamentals     ← StateGraph 설계 전 필수 참조

Phase 3 (Implementation)
  Step 3.1 → /langgraph-persistence      ← PostgresSaver(Supabase) 설정
  Step 3.5 → /langgraph-human-in-the-loop ← 응급 감지 interrupt() 패턴
  Step 3.10→ /langgraph-human-in-the-loop ← (human) 리뷰 단계 재확인

  Step 3.12→ /langchain-langgraph-best-practices  ← 최종 코드 품질 검토 (마지막)
```

### 스킬별 핵심 요건 요약

| 스킬 | 이 프로젝트에 적용되는 핵심 제약 |
|------|-------------------------------|
| `framework-selection` | LangGraph ✅ (복잡한 분기·HITL·다단계 상태) |
| `langchain-dependencies` | Python **3.10+** 필수, `langchain>=1.0,<2.0`, `langgraph>=1.0,<2.0`, `langchain-google-genai` (Gemini), `uv` 패키지 매니저 |
| `langgraph-fundamentals` | `Annotated[list, operator.add]` 리듀서 필수, 노드는 **부분 dict 반환**, `compile()` 후 실행, 무한루프 방지 조건부 엣지 필수 |
| `langgraph-persistence` | 개발=`InMemorySaver`, 프로덕션=`PostgresSaver` (Supabase URL), `thread_id` 항상 필수, `checkpointer.setup()` 최초 1회 |
| `langgraph-human-in-the-loop` | `interrupt()` + checkpointer + thread_id 3요소 필수, `interrupt()` 이전 코드는 재개 시 재실행됨(멱등성), `Command(resume=)` 로 재개 |
| `langchain-langgraph-best-practices` | `create_agent` 현대 엔트리포인트 사용, deprecation 마이그레이션 확인, `assets/03-langgraph/agent-patterns/` Supervisor 패턴 참조 |

---

## Inherited DNA (Parent Genome)

> **parent_genome.version**: 2026-03-11
> **parent_genome.source**: agenticworkflow-core/workflow-generator

### 절대 기준 1 — 품질 최우선 (Quality First)

건강상담도우미의 **AI 진료과 추천 정확도 ≥85%** 달성이 모든 구현 결정의 최우선 기준이다.
LangGraph Supervisor 패턴으로 4개 에이전트를 조율하며, 각 에이전트의 역할 분리가 품질을 보장한다.
Gemini Flash를 사용하는 문진/진단 단계에서 **3-teammate 토론 후 합의** 방식으로 단일 호출 대비 품질을 높인다.
PII 보호와 의료 면책 고지는 모든 화면과 API 응답에서 타협 없이 유지한다.

### 절대 기준 2 — 단일 파일 SOT (Single Source of Truth)

각 Agent Team 토론의 공유 상태는 단일 SOT 파일에 집중한다.
Team Lead만 SOT에 쓰기 권한을 갖고, 각 Teammate는 결과를 Team Lead에게 보고한 후 병합한다.

**SOT 파일 위치**: `.claude/state/workflow-state.json`

```json
{
  "current_phase": "research|planning|implementation",
  "current_step": "step_id",
  "arch_decisions": {
    "api_protocol": "",
    "langgraph_pattern": "",
    "deployment_option": ""
  },
  "active_team": {
    "name": "",
    "status": "active|complete",
    "tasks_completed": [],
    "tasks_pending": [],
    "consensus_decision": ""
  },
  "implementation_status": {
    "backend_setup": "pending|in-progress|complete",
    "frontend_setup": "pending|in-progress|complete",
    "langgraph_agents": "pending|in-progress|complete",
    "auth": "pending|in-progress|complete",
    "s01_onboarding": "pending|in-progress|complete",
    "s02_screening": "pending|in-progress|complete",
    "s03_recommendation": "pending|in-progress|complete",
    "s04_hospital_search": "pending|in-progress|complete",
    "s05_hospital_detail": "pending|in-progress|complete",
    "s06_summary_pdf": "pending|in-progress|complete"
  }
}
```

### 절대 기준 3 — 코드 변경 프로토콜 (CCP)

코딩 기준점 (CAP):
- **CAP-1 — 의도 파악**: 건강 정보 서비스, PII 보호, 의료 면책 고지 유지
- **CAP-2 — 영향 범위**: LangGraph Graph State 변경 시 모든 노드(Agent)의 상태 접근 패턴 점검
- **CAP-3 — 변경 설계**: Gemini API 프롬프트 변경 시 LangChain 메시지 형식 + LangGraph State 동시 업데이트
- **CAP-4 — 보안**: Gemini API 키는 Python 백엔드 환경 변수에만 보관, Next.js 클라이언트 노출 절대 금지

---

## Phase 1: Research — 문서 분석 및 기술 검증

### Step 1.1: 기술 스택 의존성 분석

> **Context Injection**: Pattern A (문서 크기 < 50KB)
> **스킬 참조**: `/langchain-dependencies` — 패키지 버전 확정 전 반드시 참조

**기술 제약 (langchain-dependencies 스킬 기준):**
- Python **3.10+** 필수 (LangChain 1.0 요구사항)
- `langchain>=1.0,<2.0` (LTS — 0.3은 레거시, 신규 프로젝트 금지)
- `langchain-core>=1.0,<2.0` (명시적 설치 필수)
- `langgraph>=1.0,<2.0` (semver 준수)
- `langchain-google-genai` (Gemini Flash 전용 패키지 — `langchain-community` 경유 금지)
- `langchain-community` 사용 시 정확한 마이너 버전 고정 필수 (non-semver)
- `langsmith>=0.3.0` (observability 권장)
- 패키지 매니저: **uv** (Python), pnpm (Node.js)

**Verification**:
- [ ] Python 3.10+ 환경 확인됨
- [ ] LangChain + LangGraph 최신 v1 버전 확인됨 (`langchain`, `langgraph`, `langchain-google-genai`)
- [ ] `langgraph` Supervisor 패턴 구현 방법 확인됨 (`create_supervisor` 또는 StateGraph 직접 구성)
- [ ] Next.js (latest) + MUI 버전 호환성 확인됨
- [ ] FastAPI + LangGraph 통합 패턴 확인됨
- [ ] Supabase Python 클라이언트 + JS 클라이언트 버전 확인됨

**Task**: "Analyze the tech stack for the health consultation assistant. Two separate stacks need dependency analysis: (1) Frontend: Next.js (latest), React.js (latest), TypeScript, MUI (latest), Clerk (latest for Next.js App Router), Supabase JS client — find exact compatible versions, check for known issues. (2) Backend: Python, LangChain (latest v1), LangGraph (latest v1), langchain-google-genai (for Gemini Flash), FastAPI, supabase-py — find exact versions, verify LangGraph Supervisor pattern availability (create_supervisor or StateGraph), confirm Gemini Flash model name for langchain-google-genai. Also identify the recommended PDF generation library for Python backend (reportlab, weasyprint, fpdf2) with Korean font support. Output two dependency manifests (frontend/backend) with exact recommended versions."

**@agent**: `dependency-expert`

**Pre-processing**: `docs/techstack.md` 읽기

**Output**:
- `docs/dependency-analysis-frontend.md`
- `docs/dependency-analysis-backend.md`

**Review**: `@reviewer`

**Translation**: none

**Post-processing**: 버전 확정값 → Step 2.1 아키텍처 설계 + Step 3.1, 3.2 프로젝트 초기화 입력

---

### Step 1.2: 외부 API 연동 방법 조사

**Verification**:
- [ ] `langchain-google-genai`로 Gemini Flash 스트리밍 호출 코드 패턴 확인됨
- [ ] LangGraph 내에서 Gemini Flash Tool Calling 사용 패턴 확인됨
- [ ] Naver Maps JavaScript API v3 Next.js 동적 임포트 패턴 확인됨
- [ ] 심평원 공공데이터 API Python 호출 방법 + 인증 확인됨
- [ ] FastAPI ↔ Next.js CORS 설정 방법 확인됨

**Task**: "Research integration patterns for the following APIs and frameworks: (1) Google Gemini Flash via LangChain — use langchain-google-genai ChatGoogleGenerativeAI, streaming with LangGraph nodes, multi-turn conversation state management in LangGraph StateGraph; (2) LangGraph Supervisor pattern — how to implement create_supervisor or custom StateGraph for orchestrating 4 agents (screening, diagnosis, search, info), state schema design for HealthConsultationState; (3) Naver Maps JavaScript API v3 in Next.js — SSR-safe dynamic import with next/dynamic ssr:false, geocoding and directions API calls from Python backend; (4) HIRA (심평원) Open API — Python httpx/requests calls for hospital search by department code and coordinates; (5) FastAPI + Next.js integration — CORS configuration, async endpoints for LangGraph streaming, session management. Output a technical integration guide with code examples."

**@agent**: `document-specialist`

**Pre-processing**: Step 1.1 backend dependency-analysis 로드

**Output**:
- `docs/api-integration-guide.md`
- `.env.example` (frontend), `.env.example` (backend) — 모든 필수 환경 변수

**Review**: `@fact-checker`

**Translation**: none

**Post-processing**: API 인증 키 목록 정리 → 환경 변수 파일 초안 작성

---

## Phase 2: Planning — 기술 아키텍처 설계

### Step 2.1: 시스템 아키텍처 설계 (3-Teammate 토론)

> **Agent Team**: Frontend(Next.js) + Backend(Python+LangGraph) 분리 아키텍처 설계
> **SOT 갱신**: TeamCreate 직후 → Teammate 완료 시 → TeamDelete 직후
> **스킬 참조**: `/framework-selection` — LangGraph 선택 근거 확인 후 진행

**framework-selection 스킬 확인 결과 (이 프로젝트에 LangGraph가 적합한 이유):**
- ✅ 복잡한 제어 흐름: 문진→진단→검색→정보 단계별 조건부 분기
- ✅ 루프/반복: 재상담 루프백 (S-03 → S-02)
- ✅ Human-in-the-loop: S-03 검토 단계, 응급 감지 후 119 확인
- ✅ 다단계 상태 유지: HealthConsultationState 전 세션에 걸쳐 공유
- → **LangGraph (Supervisor Pattern)** 확정 ← Deep Agents는 불필요 (오픈엔드 플래닝 불필요)

**SOT 스키마 (active_team)**:
```json
{
  "active_team": {
    "name": "arch-decision-team",
    "status": "active",
    "tasks_pending": [
      "design-langgraph-state-and-agent-flow",
      "design-frontend-backend-api-contract",
      "propose-two-deployment-options"
    ],
    "tasks_completed": [],
    "consensus_decision": ""
  }
}
```

**Verification**:
- [ ] LangGraph StateGraph 설계됨 — HealthConsultationState 스키마 + 4 에이전트 노드 + Supervisor 라우팅
- [ ] Frontend-Backend API 계약(엔드포인트 목록) 정의됨
- [ ] Next.js → FastAPI 통신 방식 결정됨 (REST streaming or WebSocket)
- [ ] 배포 방식 2가지 비교표 완성됨

**Task**: "Design the system architecture for the health consultation assistant. Three specialized teammates must discuss and reach consensus: Teammate 1 (langgraph-architect): Design the LangGraph StateGraph with Supervisor pattern — define HealthConsultationState TypedDict schema (conversation_history, screening_data, diagnosis_result, hospital_results, session_id, phase), design 4 agent nodes (screening_agent, diagnosis_agent, search_agent, info_agent), define Supervisor routing logic between agents, design how Gemini Flash is called within each LangGraph node via langchain-google-genai. Teammate 2 (api-contract-designer): Define the REST API contract between Next.js frontend and FastAPI backend — list all endpoints (POST /api/consultation/start, POST /api/consultation/message, GET /api/hospital/search, GET /api/hospital/{id}, POST /api/consultation/pdf), define request/response schemas, decide on streaming approach (Server-Sent Events from FastAPI to Next.js). Teammate 3 (deployment-specialist): Propose exactly 2 deployment options for the stack (Next.js frontend + Python FastAPI backend + Supabase): Option A and Option B comparing hosting platforms suitable for Korean users. Team Lead synthesizes all 3 into architecture-decision.md."

**@agent**: Agent Team (arch-decision-team)
- **Team Lead**: `architect`
- **Teammate 1**: `architect` (LangGraph 설계)
- **Teammate 2**: `executor` (API 계약 설계)
- **Teammate 3**: `document-specialist` (배포 방식 제안)

**Pre-processing**: Step 1.1, 1.2 출력물 전체 로드

**Output**:
- `docs/architecture-decision.md`
  - LangGraph StateGraph 다이어그램
  - HealthConsultationState 스키마
  - Frontend ↔ Backend API 엔드포인트 목록
  - 배포 방식 2가지 비교표

**Review**: `@reviewer`

**Translation**: none

**Post-processing**: 아키텍처 결정서 → Step 3.1(백엔드), 3.2(프론트엔드) 초기화 입력

---

### Step 2.2: 데이터베이스 스키마 설계

**Verification**:
- [ ] `symptom_department_mapping` 테이블 (PRD §5.2 SQL 기반)
- [ ] `symptoms`, `departments` 테이블
- [ ] 세션 상태 저장 테이블 (TTL 기반, 구현 제외 요건 준수)
- [ ] Supabase RLS 정책 포함됨

**Task**: "Design the PostgreSQL schema for the health consultation assistant using Supabase. Based on PRD §4.4 HealthConsultationState and §5.2 symptom-department mapping SQL schema: (1) symptoms table (id, name_ko, category, body_part, keywords TEXT[], emergency_flag BOOLEAN); (2) departments table (id, code, name_ko, description); (3) symptom_department_mapping table (symptom_id FK, department_id FK, priority INT, confidence FLOAT); (4) consultation_sessions table (session_id UUID, langgraph_state JSONB, phase TEXT, created_at, expires_at — TTL 24h for temporary storage only, NOT persistent result storage per techstack.md exclusions). Apply PII minimization. Include Supabase RLS policies. Output SQL migration file."

**@agent**: `executor`

**Pre-processing**: PRD §4.4, §5.2 추출

**Output**:
- `backend/supabase/migrations/001_initial_schema.sql`

**Review**: `@reviewer`

**Translation**: none

**Post-processing**: 스키마 → Step 3.1 백엔드 DB 설정에 사용

---

### Step 2.3: LangGraph 에이전트 + LangChain 프롬프트 설계

> **핵심**: LangGraph 노드 내에서 LangChain + Gemini Flash 호출 구조 설계
> **스킬 참조**: `/langgraph-fundamentals` — StateGraph 코드 작성 전 필수 참조

**langgraph-fundamentals 스킬 적용 규칙:**
```python
# HealthConsultationState 설계 규칙
from typing_extensions import TypedDict, Annotated
import operator

class HealthConsultationState(TypedDict):
    session_id: str                                    # 덮어쓰기 (리듀서 없음)
    phase: str                                         # 덮어쓰기
    messages: Annotated[list, operator.add]            # 반드시 리듀서! (누적)
    screening_data: dict                               # 덮어쓰기
    diagnosis_result: dict                             # 덮어쓰기
    hospital_results: list                             # 덮어쓰기 (검색 결과 교체)
    emergency_flag: bool                               # 덮어쓰기

# 노드 작성 규칙: 반드시 부분 dict 반환
def screening_node(state: HealthConsultationState) -> dict:
    # ...
    return {"messages": [new_msg], "phase": "screening"}  # ✅ 부분 dict
    # return state  ❌ 금지 — 전체 state 반환 금지

# 응급 감지: 조건부 엣지 (conditional edge)
def check_emergency(state: HealthConsultationState) -> str:
    return "emergency_handler" if state["emergency_flag"] else "screening"
```

**Verification**:
- [ ] LangGraph StateGraph 4개 노드(에이전트) 구현 구조 설계됨
- [ ] 각 노드에서 `ChatGoogleGenerativeAI` (Gemini Flash) 호출 패턴 확인됨
- [ ] Supervisor 라우팅 로직 — phase별 다음 에이전트 결정 로직 설계됨
- [ ] 응급 키워드 감지 노드(조건부 엣지) 설계됨
- [ ] 5개 시나리오 테스트로 프롬프트 품질 검증됨

**Task**: "Design LangGraph agent nodes and LangChain prompts for the health consultation assistant. Using langchain-google-genai ChatGoogleGenerativeAI (Gemini Flash model): (1) Supervisor node: routes between agents based on HealthConsultationState.phase (onboarding→screening→diagnosis→search→info→complete), implements conditional edges; (2) Screening agent node: multi-turn symptom collection using LangChain ChatPromptTemplate with system prompt following Korean standard health questionnaire (symptoms, body part, duration, severity 1-10, accompanying symptoms, medical history), extracts structured JSON output using LangChain with_structured_output or PydanticOutputParser; (3) Diagnosis agent node: maps HealthConsultationState.screening_data to medical departments using PRD §3.4 mapping table, returns {primary_department, secondary_department, urgency: 일반|조기방문권장|응급, reasoning, disclaimer}; (4) Emergency detection: conditional edge in StateGraph that checks for emergency keywords (흉통, 호흡곤란, 의식저하, 대량출혈, 편측마비, 언어장애) and routes to emergency_handler node. Test all prompts with 5 scenarios."

**@agent**: `executor`

**Pre-processing**: PRD §3.3~3.4 진료과 매핑 테이블, FR-002, FR-003, FR-008 수용 조건 추출

**Output**:
- `backend/app/agents/screening_agent.py`
- `backend/app/agents/diagnosis_agent.py`
- `backend/app/agents/search_agent.py`
- `backend/app/agents/info_agent.py`
- `backend/app/graphs/consultation_graph.py` (LangGraph StateGraph 정의)
- `backend/app/state.py` (HealthConsultationState TypedDict)
- `docs/prompt-test-results.md`

**Review**: `@fact-checker` (의료 정보 사실 검증) + `@reviewer`

**Translation**: none

**Post-processing**: LangGraph 그래프 정의 → Step 3.1 백엔드 구현 핵심 입력

---

## Phase 3: Implementation — 전체 구현

### Step 3.1: 백엔드 프로젝트 초기화 (Python + FastAPI + LangGraph)

> **스킬 참조**: `/langgraph-persistence` — Checkpointer 설정 전 필수 참조

**langgraph-persistence 스킬 적용 규칙:**
```python
# 개발 환경
from langgraph.checkpoint.memory import InMemorySaver
checkpointer = InMemorySaver()  # 개발/테스트 전용

# 프로덕션 환경 (Supabase PostgreSQL 연결)
from langgraph.checkpoint.postgres import PostgresSaver
with PostgresSaver.from_conn_string(os.environ["SUPABASE_URL"]) as checkpointer:
    checkpointer.setup()  # 최초 1회만 실행 (테이블 생성)
    graph = consultation_graph.compile(checkpointer=checkpointer)

# thread_id 규칙: 항상 session_id와 매핑
config = {"configurable": {"thread_id": session_id}}  # 필수 — 없으면 상태 미저장

# requirements.txt 최소 패키지 (uv 사용)
# langchain>=1.0,<2.0
# langchain-core>=1.0,<2.0
# langgraph>=1.0,<2.0
# langchain-google-genai    (Gemini Flash)
# langsmith>=0.3.0
# fastapi, uvicorn[standard]
# supabase
# python-dotenv
# httpx
```

**Verification**:
- [ ] FastAPI 프로젝트 구조 생성됨 (`backend/` 디렉토리)
- [ ] `langchain`, `langgraph`, `langchain-google-genai`, `fastapi`, `supabase` 설치됨
- [ ] LangGraph StateGraph 기본 실행 확인됨 (단위 테스트)
- [ ] FastAPI 서버 기동 확인됨 (`uvicorn app.main:app`)
- [ ] `.env` 백엔드 환경 변수 설정됨 (`GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `NAVER_CLIENT_SECRET`, `HIRA_API_KEY`)
- [ ] CORS 설정 — Next.js 개발 서버(localhost:3000) 허용됨

**Task**: "Initialize the Python backend for the health consultation assistant. Execute: (1) Create backend/ directory with structure: backend/app/agents/, backend/app/graphs/, backend/app/api/routes/, backend/app/models/, backend/app/services/; (2) Create pyproject.toml or requirements.txt with exact versions from Step 1.1 dependency-analysis-backend.md (langchain, langgraph, langchain-google-genai, fastapi, uvicorn, supabase, python-dotenv, httpx); (3) Create FastAPI main.py with CORS middleware allowing Next.js origin, health check endpoint GET /health; (4) Create HealthConsultationState TypedDict in app/state.py (from Step 2.3 design); (5) Create skeleton LangGraph StateGraph in app/graphs/consultation_graph.py (4 agent nodes + supervisor routing, using design from Step 2.3); (6) Create .env.example with all backend environment variables; (7) Run uvicorn and verify GET /health returns 200."

**@agent**: `executor`

**Pre-processing**: Step 1.1 backend dependency manifest + Step 2.1 architecture-decision.md + Step 2.3 LangGraph 설계 로드

**Output**:
- `backend/` 전체 초기 구조
- `backend/requirements.txt` 또는 `backend/pyproject.toml`
- `backend/app/main.py` (FastAPI + CORS)
- `backend/app/state.py` (HealthConsultationState)
- `backend/app/graphs/consultation_graph.py` (LangGraph skeleton)
- `backend/.env.example`

**Review**: `@reviewer`

**Translation**: none

**Post-processing**: `uvicorn` 기동 + `/health` 200 응답 확인 → 다음 단계 진행

---

### Step 3.2: 프론트엔드 프로젝트 초기화 (Next.js + MUI)

**Verification**:
- [ ] Next.js (latest) + TypeScript + pnpm 설정 완료
- [ ] MUI 테마 — 화면설계서 §1.4 디자인 토큰 반영됨
- [ ] FastAPI 백엔드 호출용 API 클라이언트 모듈 생성됨 (`lib/api/`)
- [ ] `.env.local.example` 프론트엔드 환경 변수 완성됨
- [ ] `pnpm build` 에러 없이 통과됨

**Task**: "Initialize the Next.js frontend for the health consultation assistant. Execute: (1) Create Next.js app (latest) with App Router, TypeScript strict, pnpm in frontend/ directory (or project root if monorepo); (2) Install MUI (latest) and configure custom theme with design tokens: Primary #1B6B5A, Primary Light #E8F5F1, Accent #E8913A, Danger #D64545, Success #2E9E6B, font Pretendard; (3) Create API client module lib/api/consultation.ts — typed fetch wrapper for FastAPI backend endpoints (POST /api/consultation/start, POST /api/consultation/message, GET /api/hospital/search, GET /api/hospital/{id}, POST /api/consultation/pdf) with base URL from NEXT_PUBLIC_API_URL env var; (4) Create lib/api/types.ts — TypeScript types matching backend HealthConsultationState schema; (5) Create .env.local.example: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID; (6) Run pnpm build and verify zero errors."

**@agent**: `executor`

**Pre-processing**: Step 1.1 frontend dependency manifest + Step 2.1 API 계약 엔드포인트 목록 로드

**Output**:
- Next.js 프로젝트 구조
- `lib/theme/index.ts` (MUI 테마)
- `lib/api/consultation.ts` (백엔드 API 클라이언트)
- `lib/api/types.ts` (TypeScript 타입)
- `.env.local.example`

**Review**: `@reviewer`

**Translation**: none

**Post-processing**: `pnpm build` 성공 확인 → 다음 단계 진행

---

### Step 3.3: 인증 설정 (Clerk + Google OAuth)

**Verification**:
- [ ] Clerk middleware — `/consultation/*` 보호 라우트 설정됨
- [ ] Google OAuth 설정 완료
- [ ] 로그인/로그아웃 UI 통합됨
- [ ] 미로그인 사용자 → `/sign-in` 리다이렉트 확인됨

**Task**: "Implement Clerk authentication with Google OAuth for the Next.js frontend. Configure: (1) clerkMiddleware in middleware.ts — public: ['/', '/sign-in(.*)', '/sign-up(.*)'], protected: ['/consultation/(.*)'']; (2) ClerkProvider in root layout; (3) Sign-in/sign-up pages using Clerk prebuilt components; (4) UserButton in consultation layout header; (5) Pass Clerk session token to FastAPI backend calls in API client (Authorization: Bearer {token}) for backend auth verification; (6) FastAPI backend: add Clerk JWT verification middleware using python-clerk-backend-api or manual JWT verification."

**@agent**: `executor`

**Pre-processing**: Step 1.1 Clerk 버전 확인

**Output**:
- `middleware.ts`
- `app/(auth)/sign-in/[[...sign-in]]/page.tsx`
- `app/(auth)/sign-up/[[...sign-up]]/page.tsx`
- `backend/app/middleware/auth.py` (FastAPI Clerk JWT 검증)

**Review**: `@security-reviewer`

**Translation**: none

**Post-processing**: 인증 플로우 E2E 확인 → 다음 단계 진행

---

### Step 3.4: 공통 UI 컴포넌트 및 레이아웃

**Verification**:
- [ ] EmergencyModal, ExitConfirmModal, Toast, LoadingSkeleton, AppBar, ProgressBar 구현됨
- [ ] 모든 인터랙티브 요소 44×44px 터치 영역 준수
- [ ] 반응형 375px ~ 데스크톱 max-width 480px 중앙 정렬 작동

**Task**: "Implement common UI components based on screen design spec §9. Create: (1) AppBar — back button, title, step indicator (e.g. 2/4); (2) ProgressBar — percentage + step labels; (3) EmergencyModal — triggered by backend emergency_flag in LangGraph state, shows 119 call button and 'continue consultation' option; (4) ExitConfirmModal; (5) Toast — 4 variants (success/info/warning/error) with design tokens; (6) LoadingSkeleton — card/list/map variants; (7) ConsultationLayout — mobile-first max-width 480px centered wrapper. All components use MUI v6 TypeScript with design tokens."

**@agent**: `executor`

**Pre-processing**: 화면설계서 §9 + §1.4 추출

**Output**:
- `components/ui/AppBar.tsx`
- `components/ui/ProgressBar.tsx`
- `components/ui/EmergencyModal.tsx`
- `components/ui/ExitConfirmModal.tsx`
- `components/ui/Toast.tsx` + `lib/toast/useToast.ts`
- `components/ui/LoadingSkeleton.tsx`
- `components/layout/ConsultationLayout.tsx`

**Review**: `@reviewer`

**Translation**: none

**Post-processing**: 컴포넌트 렌더링 확인 → 다음 단계 진행

---

### Step 3.5: S-01 온보딩/동의 화면

**Verification**:
- [ ] FR-001 AC-1~4 모두 충족됨
- [ ] 필수 동의 미완료 시 CTA 버튼 비활성화됨
- [ ] 면책 고지 배너 항상 노출됨
- [ ] 재방문 사용자 동의 생략 처리됨 (localStorage)
- [ ] 동의 완료 → FastAPI `POST /api/consultation/start` 호출 → session_id 획득 → `/consultation/screening` 이동

**Task**: "Implement S-01 onboarding and consent screen. Screen design spec §3 requirements: (1) App icon + service name + description; (2) 3 feature cards (AI문진/진료과추천/병원안내); (3) Medical disclaimer banner always visible (#FFF3E6); (4) Consent checkboxes — required: 이용약관+개인정보, optional: 위치정보 — CTA active only when required checked; (5) On CTA click: call POST /api/consultation/start (FastAPI) → receives {session_id}, store in React context/sessionStorage → navigate to /consultation/screening; (6) Return visitor logic: localStorage 'consent_given' flag skips to /consultation/screening (still calls /start to get session_id); (7) Emergency footer tel:119."

**@agent**: `executor`

**Pre-processing**: 화면설계서 §3 + PRD FR-001 추출

**Output**:
- `app/(consultation)/consultation/onboarding/page.tsx`
- `components/screens/S01Onboarding.tsx`
- `lib/consultation/useSession.ts` (session_id 관리)
- `backend/app/api/routes/consultation.py` — `POST /api/consultation/start` 엔드포인트 (LangGraph 세션 초기화)

**Review**: `@reviewer`

**Translation**: none

**Post-processing**: FR-001 체크리스트 확인 → S-02 구현 진행

---

### Step 3.6: S-02 AI 문진 에이전트 (LangGraph + Gemini Flash) — 3-Teammate 토론

> **Agent Team**: FastAPI에서 LangGraph 문진 에이전트 스트리밍 구현 방식 — 3가지 접근법 비교
> **핵심**: LangGraph 문진 노드가 Gemini Flash로 증상을 수집, Next.js가 SSE로 실시간 수신
> **스킬 참조**: `/langgraph-human-in-the-loop` — 응급 감지 interrupt() 패턴 구현 시 필수 참조

**langgraph-human-in-the-loop 스킬 적용 — 응급 감지 패턴:**
```python
from langgraph.types import interrupt, Command

def emergency_handler_node(state: HealthConsultationState) -> dict:
    """응급 감지 시 사용자 확인 — interrupt() 패턴 사용"""
    # interrupt() 이전 코드는 재개 시 재실행됨 (멱등성 필수)
    user_decision = interrupt({
        "type": "emergency_detected",
        "message": "응급 증상이 감지되었습니다. 119에 연락하시겠습니까?",
        "keywords_found": state.get("emergency_keywords", []),
        "action": "call_119 | continue_consultation"
    })
    if user_decision == "call_119":
        return {"phase": "emergency_exit", "emergency_flag": True}
    return {"phase": "screening", "emergency_flag": False}

# 재개 방법 (Next.js → FastAPI)
# graph.invoke(Command(resume="continue_consultation"), config)

# 3요소 필수 확인:
# 1. checkpointer=PostgresSaver (Step 3.1에서 설정)
# 2. thread_id in config
# 3. interrupt() payload는 JSON 직렬화 가능해야 함
```

**SOT 스키마 (active_team)**:
```json
{
  "active_team": {
    "name": "screening-impl-team",
    "status": "active",
    "tasks_pending": [
      "approach-a-fastapi-sse-langgraph-stream",
      "approach-b-fastapi-websocket-langgraph",
      "approach-c-fastapi-polling-langgraph"
    ],
    "consensus_decision": ""
  }
}
```

**Verification**:
- [ ] FR-002 AC-1~7 모두 충족됨
- [ ] LangGraph `consultation_graph.py` 문진 노드가 Gemini Flash로 증상 수집 완료됨
- [ ] 응급 키워드 → LangGraph 조건부 엣지 → `emergency_flag: true` → Next.js EmergencyModal 표시됨
- [ ] 문진 5단계 프로그레스 표시됨
- [ ] `screening_data` JSON이 LangGraph State에 저장됨
- [ ] 실시간 스트리밍 응답 타이핑 인디케이터와 동기화됨

**Task**: "Implement S-02 AI screening agent using LangGraph + Gemini Flash. Three teammates prototype different streaming approaches from FastAPI to Next.js: Approach A (Teammate 1): FastAPI Server-Sent Events (SSE) with LangGraph .astream() — EventSourceResponse from fastapi-sse-starlette, Next.js client uses EventSource or fetch with ReadableStream. Approach B (Teammate 2): FastAPI WebSocket with LangGraph .astream() — bidirectional for user input + AI streaming response, Next.js uses WebSocket client. Approach C (Teammate 3): FastAPI regular POST returning complete LangGraph response + Next.js optimistic UI with typing indicator simulation (simpler but no real streaming). Each approach implements: user message → FastAPI → LangGraph screening_agent node → Gemini Flash ChatGoogleGenerativeAI with screening prompt → LangGraph State update → response to frontend. Emergency detection: LangGraph conditional edge checks for emergency keywords in user message, sets state.emergency_flag=True, streams emergency response. Team Lead selects best approach for reliability + UX. Implement full S-02 screen: chat UI with ChatBubble, QuickReply chips, SeveritySlider (1-10), ProgressBar 5-phase."

**@agent**: Agent Team (screening-impl-team)
- **Team Lead**: `architect`
- **Teammate 1**: `executor` (Approach A — SSE)
- **Teammate 2**: `executor` (Approach B — WebSocket)
- **Teammate 3**: `executor` (Approach C — Polling)

**Pre-processing**: Step 2.3 LangGraph 설계 + screening prompt + FR-002 수용 조건 로드

**Output**:
- `backend/app/agents/screening_agent.py` (LangGraph 문진 노드 구현)
- `backend/app/graphs/consultation_graph.py` (업데이트 — 문진 노드 + 응급 엣지)
- `backend/app/api/routes/consultation.py` — `POST /api/consultation/message` 엔드포인트
- `components/screens/S02Screening.tsx`
- `components/chat/ChatBubble.tsx`, `TypingIndicator.tsx`, `QuickReply.tsx`, `SeveritySlider.tsx`

**Review**: `@security-reviewer` (Gemini API 키 백엔드 격리) + `@reviewer`

**Translation**: none

**Post-processing**: 5개 증상 시나리오 문진 플로우 테스트 + 응급 키워드 감지 테스트

---

### Step 3.7: S-03 진료과 추천 (LangGraph 진단 노드) — 3-Teammate 토론

> **Agent Team**: LangGraph 진단 에이전트 정확도 ≥85% 달성 — 3가지 구현 방식 비교

**SOT 스키마 (active_team)**:
```json
{
  "active_team": {
    "name": "diagnosis-impl-team",
    "status": "active",
    "tasks_pending": [
      "approach-a-pure-llm-langchain-prompt",
      "approach-b-hybrid-supabase-langchain",
      "approach-c-langchain-multistep-reasoning"
    ],
    "consensus_decision": ""
  }
}
```

**Verification**:
- [ ] FR-003 AC-1~6 모두 충족됨
- [ ] LangGraph 진단 노드가 `screening_data` State를 읽어 진료과 추천 생성됨
- [ ] 10개 시나리오 테스트 ≥85% 추천 정확도
- [ ] 긴급도 3단계 정확 분류됨
- [ ] 의료 면책 문구 API 응답에 포함됨

**Task**: "Implement S-03 department recommendation using LangGraph diagnosis_agent node + Gemini Flash. Three teammates prototype approaches to achieve ≥85% accuracy: Approach A (Teammate 1): Pure LangChain LLM — LangGraph diagnosis node uses ChatGoogleGenerativeAI with full PRD §3.4 mapping table embedded in system prompt, uses with_structured_output(DiagnosisResult) for structured JSON output. Approach B (Teammate 2): Hybrid — LangGraph node first queries Supabase symptom_department_mapping table via supabase-py using keywords from screening_data, then LangChain LLM for complex disambiguation. Approach C (Teammate 3): Multi-step LangChain chain — step 1: LLM extracts symptom entities from screening_data → step 2: Supabase DB lookup → step 3: LLM generates reasoning and final recommendation. Test all 3 with 10 scenarios from PRD §3.4 mapping table. Team Lead selects highest accuracy. Implement S-03 screen: DepartmentCard (1순위/2순위), UrgencyBadge (일반/조기방문권장/응급), emergency banner (119 button if 응급), disclaimer text, two CTAs: '주변 ○○과 찾기'→S-04, '다시 상담하기'→S-02."

**@agent**: Agent Team (diagnosis-impl-team)
- **Team Lead**: `architect`
- **Teammate 1**: `executor` (Approach A)
- **Teammate 2**: `executor` (Approach B)
- **Teammate 3**: `executor` (Approach C)

**Pre-processing**: Step 2.3 diagnosis prompt + PRD §3.4 진료과 매핑 테이블 전체 + FR-003 추출

**Output**:
- `backend/app/agents/diagnosis_agent.py`
- `backend/app/graphs/consultation_graph.py` (진단 노드 통합)
- `components/screens/S03Recommendation.tsx`
- `components/recommendation/DepartmentCard.tsx`, `UrgencyBadge.tsx`
- `docs/diagnosis-accuracy-test.md` (10개 시나리오 결과)

**Review**: `@fact-checker` + `@reviewer`

**Translation**: none

**Post-processing**: 정확도 ≥85% 미달 시 프롬프트 재설계 후 재테스트

---

### Step 3.8: S-04 병원 검색 (LangGraph 검색 노드 + Naver Maps + 심평원) — 3-Teammate 토론

> **Agent Team**: LangGraph 검색 에이전트에서 Naver Maps + 심평원 API 최적 조합

**SOT 스키마 (active_team)**:
```json
{
  "active_team": {
    "name": "hospital-search-team",
    "status": "active",
    "tasks_pending": [
      "approach-a-hira-primary-naver-geocoding",
      "approach-b-naver-geocoding-hira-search",
      "approach-c-evaluate-naver-local-search"
    ],
    "consensus_decision": ""
  }
}
```

**Verification**:
- [ ] FR-004 AC-1~6 모두 충족됨
- [ ] LangGraph 검색 노드가 `diagnosis_result.primary_department`를 읽어 병원 검색 실행됨
- [ ] GPS 자동 감지(Next.js navigator.geolocation) + 주소 입력 모두 작동됨
- [ ] 반경 1km→3km→5km 자동 확대 로직 작동됨
- [ ] 가중치 정렬(거리 50%+평점 30%+운영상태 20%) 작동됨
- [ ] 검색 응답 ≤3초

**Task**: "Implement S-04 hospital search using LangGraph search_agent node + Naver Maps API + HIRA API. Three teammates compare API integration strategies from Python backend: Approach A (Teammate 1): HIRA API as primary (httpx GET with department code + lat/lng radius), Naver Maps Geocoding API to convert user address to lat/lng, Python scoring algorithm (distance 50%+rating 30%+status 20%). Approach B (Teammate 2): Naver Maps Geocoding for user location + HIRA hospital search by department code and coordinates + LangGraph search_agent uses LangChain Tool for HIRA API calls. Approach C (Teammate 3): Evaluate Naver Maps Local Search API for hospitals as single source, fallback to HIRA if insufficient. LangGraph search_agent receives (department_code, user_lat, user_lng) from State, calls chosen API strategy, stores top 3 hospitals in State.hospital_results. FastAPI endpoint: GET /api/hospital/search?dept={}&lat={}&lng={}&radius={}. Frontend S-04 screen: GPS button (navigator.geolocation → send to backend), address autocomplete input, mini-map (h:120px, numbered markers ❶❷❸ via Naver Maps JS API dynamic import), 3 hospital cards, sort dropdown, radius auto-expansion toast."

**@agent**: Agent Team (hospital-search-team)
- **Team Lead**: `architect`
- **Teammate 1**: `executor` (Approach A)
- **Teammate 2**: `executor` (Approach B)
- **Teammate 3**: `executor` (Approach C)

**Pre-processing**: Step 1.2 api-integration-guide.md (Naver Maps + HIRA 섹션) + FR-004 추출

**Output**:
- `backend/app/agents/search_agent.py`
- `backend/app/services/naver_maps.py` (Python Naver Maps Geocoding/Directions 클라이언트)
- `backend/app/services/hira_api.py` (심평원 API Python 클라이언트)
- `backend/app/api/routes/hospital.py` — `GET /api/hospital/search`
- `components/screens/S04HospitalSearch.tsx`
- `components/hospital/HospitalCard.tsx`
- `components/maps/MiniMap.tsx` (Naver Maps JS API, next/dynamic)

**Review**: `@reviewer`

**Translation**: none

**Post-processing**: 실제 위치 3곳으로 검색 테스트 (응답시간 + 정렬 정확도)

---

### Step 3.9: S-05 병원 상세 정보 (네이버 지도 임베드) — 3-Teammate 토론

> **Agent Team**: Next.js SSR 환경에서 Naver Maps JS API v3 최적 임베드 방식 결정

**Verification**:
- [ ] FR-005 AC-1~6, FR-006 AC-1~4, FR-007 모두 충족됨
- [ ] 네이버 지도 임베드 zoom:16 마커 표시됨
- [ ] 도보/대중교통/자가용 예상 시간 (Python backend → Naver Directions API)
- [ ] 전화번호 탭 → `tel:` 프로토콜 실행됨
- [ ] 병원 웹사이트 없으면 버튼 숨김

**Task**: "Implement S-05 hospital detail with Naver Maps embed. Three teammates compare approaches: Approach A (Teammate 1): Naver Maps JS API v3 with next/dynamic (ssr:false) — interactive map with custom hospital marker zoom:16, Directions API called from Python backend (GET /api/hospital/{id}/directions), returns walking/transit/driving times. Approach B (Teammate 2): Naver Maps Static Map API image for fast initial render + 'open in Naver Maps' deep link, Directions API from Python backend. Approach C (Teammate 3): Naver Maps iframe embed (official embed code) as SSR-safe zero-JS solution. FastAPI endpoint: GET /api/hospital/{id} returns full hospital detail, GET /api/hospital/{id}/directions?from_lat={}&from_lng={} calls Naver Directions API from backend. S-05 screen: hospital header (dept tag, operating status, name, rating), map embed area, 3 direction buttons (🚶도보/🚌대중교통/🚗자가용 + times), info card (address/phone/hours/lunch/holidays), call button (tel:), website link (hidden if null), '네이버 지도에서 보기' button."

**@agent**: Agent Team (hospital-detail-team)
- **Team Lead**: `architect`
- **Teammate 1**: `executor` (Approach A)
- **Teammate 2**: `executor` (Approach B)
- **Teammate 3**: `executor` (Approach C)

**Pre-processing**: Step 1.2 api-integration-guide.md (Naver Maps 섹션) + FR-005~007 추출

**Output**:
- `backend/app/api/routes/hospital.py` — `GET /api/hospital/{id}`, `GET /api/hospital/{id}/directions`
- `components/screens/S05HospitalDetail.tsx`
- `components/maps/NaverMapEmbed.tsx`
- `components/hospital/DirectionsButtons.tsx`, `HospitalInfoCard.tsx`

**Review**: `@reviewer`

**Translation**: none

**Post-processing**: 실제 병원 3곳 상세 테스트 (지도/전화/길찾기 작동)

---

### Step 3.10: S-06 상담 요약 + PDF 다운로드 (Python 백엔드) — 3-Teammate 토론

> **Agent Team**: Python 백엔드에서 한국어 PDF 생성 최적 라이브러리 선택

**Verification**:
- [ ] FR-009 (상담 결과 요약), FR-010 (PDF 다운로드) 충족됨
- [ ] PDF 한국어 폰트(Noto Sans KR 또는 Malgun Gothic) 올바르게 렌더링됨
- [ ] PDF 생성 시간 ≤5초
- [ ] 모바일 PDF 다운로드 작동됨
- [ ] 카카오톡 공유/결과저장/피드백 — 미구현 확인됨 (techstack.md 제외 항목)

**Task**: "Implement S-06 consultation summary and PDF download. Three teammates prototype Python PDF generation approaches: Approach A (Teammate 1): ReportLab (reportlab) — programmatic PDF with TTFont for Korean (Noto Sans KR .ttf), draws consultation summary layout (symptoms, departments, hospital, disclaimer, timestamp); Approach B (Teammate 2): WeasyPrint — HTML/CSS to PDF, render Jinja2 HTML template with Korean CSS font, supports complex layouts; Approach C (Teammate 3): fpdf2 — lightweight, TTFont Korean support, simple layout. Test all 3 for Korean font rendering quality and generation speed (target ≤5s). FastAPI endpoint: POST /api/consultation/pdf receives {session_id}, reads LangGraph State, generates PDF, returns as application/pdf response with Content-Disposition: attachment. Frontend S-06 screen: success icon (56×56px green gradient), result summary card (3 sections: symptoms tags/department badges/hospital info), urgency reminder banner, PDF download button (full-width), '새로운 상담 시작하기' text link → reset session → S-01. NOTE: 결과저장/카카오톡공유/피드백 EXCLUDED per techstack.md."

**@agent**: Agent Team (pdf-team)
- **Team Lead**: `architect`
- **Teammate 1**: `executor` (Approach A — ReportLab)
- **Teammate 2**: `executor` (Approach B — WeasyPrint)
- **Teammate 3**: `executor` (Approach C — fpdf2)

**Pre-processing**: 화면설계서 §8 (S-06) 추출 + techstack.md 구현 제외 항목 재확인

**Output**:
- `backend/app/services/pdf_generator.py`
- `backend/app/api/routes/consultation.py` — `POST /api/consultation/pdf`
- `backend/app/templates/consultation_summary.html` (WeasyPrint 선택 시)
- `components/screens/S06Summary.tsx`

**Review**: `@reviewer`

**Translation**: none

**Post-processing**: 실제 상담 데이터로 PDF 생성 테스트 (한국어 폰트 + 파일 크기 확인)

---

### Step 3.11: E2E 통합 테스트 및 최종 검증 (human)

> **(human) 단계 — 사용자 직접 검토 및 승인 필요**
> **스킬 참조**: `/langgraph-human-in-the-loop` — HITL 플로우 검증 체크리스트 재확인

**사용자 검토 항목:**

**1. 전체 플로우 E2E 테스트 (Next.js ↔ FastAPI ↔ LangGraph):**
- Happy Path: S-01 → S-02(문진) → S-03(진료과 추천) → S-04(병원 검색) → S-05(상세) → S-06(PDF)
- 응급 감지 플로우: S-02에서 "흉통" 입력 → EmergencyModal 즉시 표시
- 재상담 플로우: S-03 "다시 상담하기" → S-02 LangGraph 상태 리셋

**2. 핵심 KPI 수동 확인:**

| KPI | 목표 | 결과 |
|-----|------|------|
| 전체 상담 소요 시간 | ≤5분 | |
| Gemini Flash 응답 지연 | ≤3초 | |
| 진료과 추천 정확도 | ≥85% (10개 시나리오) | |
| 병원 검색 응답 | ≤3초 | |
| PDF 생성 시간 (Python) | ≤5초 | |

**3. 모바일 디바이스 테스트:**
- iOS Safari, Android Chrome 전체 플로우 확인
- GPS 위치 감지 작동 확인
- `tel:` 프로토콜 작동 확인

**4. 배포 방식 선택:**
- Step 2.1에서 제안된 2가지 배포 옵션 중 선택
- Frontend(Next.js) + Backend(Python FastAPI) 각각 배포 환경 설정

**Autopilot Default**: KPI 전체 통과 + 사용자 승인 시 Step 3.12 배포 진행

---

### Step 3.12: 코드 품질 최종 검토 + 프로덕션 배포

> **스킬 참조**: `/langchain-langgraph-best-practices` — **모든 LangChain/LangGraph 스킬 참조 완료 후 마지막에 적용**

**langchain-langgraph-best-practices 스킬 적용 체크리스트:**
```
배포 전 최종 코드 품질 검토:
□ create_agent 현대 엔트리포인트 사용 확인
  (references/02-langchain/90-deprecations-and-migration.md 기준)
□ Supervisor 패턴: assets/03-langgraph/agent-patterns/ 참조하여 구현 일치 확인
□ State 설계: assets/03-langgraph/state-management/ 참조하여 TypedDict 스키마 검토
□ Streaming: assets/03-langgraph/streaming/ 참조하여 SSE 스트리밍 패턴 검토
□ Error handling: assets/03-langgraph/error-handling/ 참조하여 RetryPolicy 확인
□ Durable execution: assets/03-langgraph/durable-execution/ 참조하여 멱등성 확인
□ 공식 문서 최신 API 기준: docs.langchain.com/llms.txt 확인
```

**Verification**:
- [ ] `pnpm build` 성공 (TypeScript 에러 0개)
- [ ] Python 백엔드 의존성 설치 + 서버 기동 확인
- [ ] Supabase 마이그레이션 프로덕션 실행 완료
- [ ] Naver Maps API 도메인 화이트리스트 등록됨
- [ ] Clerk 프로덕션 인스턴스 + 리다이렉트 URL 설정됨
- [ ] 배포 후 smoke test — 전체 플로우 1회 완료

**Task**: "Deploy the health consultation assistant to production using the selected deployment option from Step 3.11. Two-component deployment (frontend + backend): (1) Frontend (Next.js): set env vars NEXT_PUBLIC_API_URL (production FastAPI URL), NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID; (2) Backend (Python FastAPI): set env vars GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, NAVER_CLIENT_SECRET, HIRA_API_KEY, CLERK_SECRET_KEY, CORS_ORIGINS (production Next.js URL); (3) Run Supabase migration in production; (4) Register production domains in Naver Maps API console; (5) Run post-deployment smoke test: complete one full consultation flow and verify PDF download. Document production URLs."

**@agent**: `executor`

**Pre-processing**: Step 2.1 배포 방식 선택 결과 + Step 3.11 사용자 승인

**Output**:
- 프론트엔드 프로덕션 URL
- 백엔드 FastAPI 프로덕션 URL
- `docs/deployment.md`

**Review**: `@security-reviewer` (프로덕션 API 키 노출, HTTPS, CORS 설정 검증)

**Translation**: none

**Post-processing**: 스모크 테스트 결과 → 완료 보고서 작성

---

## 워크플로우 완료 기준 (Definition of Done)

| 기준 | 목표 | 검증 방법 |
|------|------|----------|
| 상담 완료율 | ≥70% | S-01~S-06 E2E 테스트 |
| 진료과 추천 정확도 | ≥85% | 10개 시나리오 수동 검증 |
| 평균 상담 소요 시간 | ≤5분 | 타이머 측정 |
| Gemini Flash 응답 지연 | ≤3초 | FastAPI 응답 시간 측정 |
| 병원 검색 응답 | ≤3초 | FastAPI 응답 시간 측정 |
| PDF 생성 시간 | ≤5초 | Python 실측 |
| FR-001~FR-010 | 전체 충족 | 화면설계서 요구사항 추적 |
| TypeScript 에러 | 0개 | `pnpm build` |
| Python 에러 | 0개 | `pytest` + uvicorn 기동 |
| 보안 검토 | 통과 | `@security-reviewer` 승인 |
| 모바일 반응형 | 375px~1440px | 실기기 테스트 |
| 구현 제외 항목 미포함 | 확인 | 코드 검색 (카카오톡/결과저장/피드백) |

---

## 참조 문서

| 문서 | 경로 | 용도 |
|------|------|------|
| PRD v1.0 | `docs/health-assistant-prd.md` | 기능 요구사항, KPI |
| 기능설명서 v1.0 | `docs/health-assistant-features.md` | LangGraph 에이전트 역할 |
| User Journey Map v1.0 | `docs/health-consultation-journey-map.md` | 6단계 사용자 여정 |
| 화면설계서 v1.0 | `docs/health-consultation-screen-design.md` | S-01~S-06 UI 명세 |
| 기술 스택 | `docs/techstack.md` | 확정 기술 스택 |

---

*본 워크플로우는 AgenticWorkflow Genome Inheritance Protocol에 따라 생성되었습니다.*
*백엔드: Python + LangChain + LangGraph / 프론트엔드: Next.js + MUI*
