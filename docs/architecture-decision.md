# Architecture Decision Record — 건강상담도우미 웹서비스

> **문서 버전**: v1.0
> **작성일**: 2026-03-11
> **작성자**: Architect Agent (oh-my-claudecode)
> **상태**: Approved
> **기준 문서**: PRD v1.0, 기능설명서 v1.0, User Journey Map v1.0, techstack.md, workflow.md

---

## 목차

1. [System Architecture Overview](#1-system-architecture-overview)
2. [LangGraph StateGraph Design](#2-langgraph-stategraph-design)
3. [Frontend ↔ Backend API Contract](#3-frontend--backend-api-contract)
4. [Streaming Architecture (SSE)](#4-streaming-architecture-sse)
5. [Deployment Options](#5-deployment-options)
6. [Security & Compliance](#6-security--compliance)
7. [Non-functional Requirements Mapping](#7-non-functional-requirements-mapping)

---

## 1. System Architecture Overview

### 1.1 고수준 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Client Layer (Port 3000)                          │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Next.js Frontend (App Router)                   │   │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │   │
│  │  │ S-01 │ │ S-02 │ │ S-03 │ │ S-04 │ │ S-05 │ │ S-06 │   │   │
│  │  │온보딩 │ │ 문진  │ │추천  │ │병원  │ │병원  │ │요약  │   │   │
│  │  │/동의  │ │채팅  │ │결과  │ │검색  │ │상세  │ │/PDF  │   │   │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘   │   │
│  │                                                              │   │
│  │  Clerk Auth  │  MUI v6 Components  │  Naver Maps JS API v3  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP REST / SSE (Server-Sent Events)
                               │ Authorization: Bearer {Clerk JWT}
┌──────────────────────────────▼──────────────────────────────────────┐
│                   FastAPI Backend (Port 8000)                        │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  API Routes                                                   │  │
│  │  POST /api/consultation/start    POST /api/consultation/message│  │
│  │  POST /api/consultation/diagnosis POST /api/consultation/pdf  │  │
│  │  GET  /api/hospital/search       GET  /api/hospital/{id}      │  │
│  │  GET  /api/hospital/{id}/directions  GET /health              │  │
│  └──────────────────────────────┬───────────────────────────────┘  │
│                                 │                                    │
│  ┌──────────────────────────────▼───────────────────────────────┐  │
│  │          LangGraph StateGraph (Supervisor Pattern)            │  │
│  │                                                               │  │
│  │         ┌─────────────────────────────┐                      │  │
│  │         │      supervisor_node         │                      │  │
│  │         │  (Phase-based routing logic) │                      │  │
│  │         └──┬───────┬────────┬─────────┘                      │  │
│  │            │       │        │         │                       │  │
│  │     ┌──────▼─┐ ┌───▼───┐ ┌─▼──────┐ ┌▼────────┐            │  │
│  │     │screen- │ │diagno-│ │search_ │ │info_    │            │  │
│  │     │ing_node│ │sis_   │ │node    │ │node     │            │  │
│  │     │        │ │node   │ │        │ │         │            │  │
│  │     │Gemini  │ │Gemini │ │HIRA+   │ │Hospital │            │  │
│  │     │Flash   │ │Flash  │ │Naver   │ │DB       │            │  │
│  │     └────────┘ └───────┘ └────────┘ └─────────┘            │  │
│  │                     │                                        │  │
│  │         ┌───────────▼──────────┐                            │  │
│  │         │  emergency_check_node │ (conditional edge)         │  │
│  │         └──────────────────────┘                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Checkpointer: InMemorySaver (dev) / PostgresSaver (prod)           │
└──────────┬──────────────────────┬──────────────────────────────────┘
           │                      │
┌──────────▼──────┐    ┌──────────▼────────────────────────┐
│  PostgreSQL      │    │  External APIs                    │
│  (Supabase)      │    │                                   │
│                  │    │  ┌─────────────────┐              │
│  - consultation_ │    │  │ Google Gemini   │              │
│    sessions      │    │  │ Flash (LLM)     │              │
│  - symptoms      │    │  │ langchain-      │              │
│  - departments   │    │  │ google-genai    │              │
│  - symptom_dept_ │    │  └─────────────────┘              │
│    mapping       │    │                                   │
│  - LangGraph     │    │  ┌─────────────────┐              │
│    checkpoint    │    │  │ HIRA 심평원 API  │              │
│    tables        │    │  │ (병원 데이터)    │              │
└──────────────────┘    │  └─────────────────┘              │
                        │                                   │
                        │  ┌─────────────────┐              │
                        │  │ Naver Maps API  │              │
                        │  │ - Geocoding     │              │
                        │  │ - Directions    │              │
                        │  │ - Maps JS v3    │              │
                        │  └─────────────────┘              │
                        │                                   │
                        │  ┌─────────────────┐              │
                        │  │ Clerk Auth      │              │
                        │  │ (JWT 발급/검증) │              │
                        │  └─────────────────┘              │
                        └───────────────────────────────────┘
```

### 1.2 아키텍처 결정 근거

| 결정 | 선택 | 근거 |
|------|------|------|
| Agent Framework | LangGraph v1 (Supervisor Pattern) | 문진→진단→검색→정보 단계별 조건부 분기, 재상담 루프백, Human-in-the-loop(응급 감지) 요구사항 충족. LangChain Agents는 오픈엔드 태스크에 적합하나 이 서비스는 명확한 단계 흐름이 있어 StateGraph가 우월 |
| LLM | Google Gemini Flash (langchain-google-genai) | 비용 효율적, 한국어 품질 우수, langchain-community 경유 없이 직접 패키지 제공으로 버전 안정성 확보 |
| Streaming | Server-Sent Events (SSE) | WebSocket 대비 단방향 스트림으로 충분(AI 응답만 스트리밍), HTTPS 프록시 친화적, FastAPI StreamingResponse와 자연스러운 통합 |
| Auth | Clerk + Google OAuth | Next.js App Router 공식 지원, JWT 발급/검증 내장, Google OAuth 소셜 로그인 간소화 |
| DB | PostgreSQL (Supabase) | LangGraph PostgresSaver 체크포인터 공식 지원, RLS 정책으로 데이터 보안, 관리형 서비스로 운영 부담 최소화 |
| Map | Naver Maps API v3 | 한국 병원 위치 데이터 정확도 우월, 한국어 주소 Geocoding 신뢰성, 한국 사용자 UX 친숙성 |
| Hospital Data | HIRA 심평원 Open API | 공공 의료기관 데이터 공식 출처, 무료, 전국 병원 망라 |

---

## 2. LangGraph StateGraph Design

### 2.1 HealthConsultationState TypedDict

```python
# backend/app/state.py

from typing_extensions import TypedDict, Annotated
from typing import Optional
import operator


class DiagnosisResult(TypedDict):
    primary_dept: str          # 1순위 진료과 (예: "신경과")
    secondary_dept: str        # 2순위 진료과 (예: "내과"), 없으면 ""
    urgency: str               # "일반" | "조기방문권장" | "응급"
    reasoning: str             # 추천 근거 설명 (한국어)
    disclaimer: str            # 의료 면책 문구


class HospitalInfo(TypedDict):
    hospital_id: str           # HIRA 병원 고유 ID
    name: str                  # 병원명
    address: str               # 도로명 주소
    phone: str                 # 전화번호
    dept_code: str             # 진료과 코드 (예: "D001")
    lat: float                 # 위도
    lng: float                 # 경도
    distance_m: int            # 사용자 위치에서 거리 (미터)
    rating: Optional[float]    # 평점 (없으면 None)
    is_open: bool              # 현재 진료 중 여부
    hours: str                 # 진료시간 문자열


class UserLocation(TypedDict):
    lat: float
    lng: float
    address: Optional[str]     # 역Geocoding 결과 주소


class HealthConsultationState(TypedDict):
    # --- 세션 식별 ---
    session_id: str                                    # thread_id와 동일, PostgresSaver 키

    # --- 흐름 제어 ---
    phase: str                                         # 'onboarding' | 'screening' | 'emergency'
                                                       # | 'diagnosis' | 'search' | 'info' | 'complete'

    # --- 대화 이력 (리듀서 필수 — 누적 append) ---
    messages: Annotated[list, operator.add]            # LangChain BaseMessage 목록

    # --- 문진 데이터 ---
    screening_data: dict                               # {symptoms, duration, severity, body_part,
                                                       #  accompanying_symptoms, medical_history,
                                                       #  medications, age_group, gender}
    screening_progress: float                          # 0.0 ~ 1.0 (프로그레스바 표시용)

    # --- 진단 결과 ---
    diagnosis_result: dict                             # DiagnosisResult 구조

    # --- 병원 검색 ---
    hospital_results: list                             # HospitalInfo 목록 (최대 3개)
    selected_hospital: dict                            # 사용자가 선택한 병원 HospitalInfo

    # --- 사용자 위치 ---
    user_location: dict                                # UserLocation 구조

    # --- 응급 감지 ---
    emergency_flag: bool                               # True = 응급 증상 감지됨
    emergency_keywords: list                           # 감지된 응급 키워드 목록
```

**설계 규칙 (langgraph-fundamentals 기준)**:

- `messages`만 `Annotated[list, operator.add]` 리듀서 적용 — 나머지 필드는 덮어쓰기(last-write-wins)
- 모든 노드 함수는 **부분 dict** 반환 (`return state` 전체 반환 금지)
- `session_id`는 항상 `config["configurable"]["thread_id"]`와 동일하게 유지
- `phase` 값이 노드 전환의 유일한 진실 공급원(SOT)

---

### 2.2 Graph Topology — 전체 StateGraph 구성

```python
# backend/app/graphs/consultation_graph.py

import os
import operator
from typing import Literal
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.postgres import PostgresSaver

from app.state import HealthConsultationState
from app.agents.screening_agent import screening_node
from app.agents.diagnosis_agent import diagnosis_node
from app.agents.search_agent import search_node
from app.agents.info_agent import info_node


# ─────────────────────────────────────────────
# Supervisor 라우팅 함수
# ─────────────────────────────────────────────

def supervisor_routing(state: HealthConsultationState) -> str:
    """Phase 값에 따라 다음 실행 노드를 결정한다."""
    phase = state["phase"]
    routing = {
        "onboarding":  "screening",
        "screening":   "emergency_check",   # 항상 응급 감지를 거침
        "emergency":   "emergency_handler",
        "diagnosis":   "diagnosis",
        "search":      "search",
        "info":        "info",
        "complete":    END,
    }
    return routing.get(phase, "screening")


# ─────────────────────────────────────────────
# 응급 감지 조건부 엣지 함수
# ─────────────────────────────────────────────

EMERGENCY_KEYWORDS = [
    "흉통", "가슴 통증", "가슴통증",
    "호흡곤란", "숨못쉬", "숨이 안",
    "의식 저하", "의식저하", "실신",
    "대량 출혈", "다량 출혈",
    "편측 마비", "반신마비",
    "언어 장애", "말이 안",
    "아나필락시스", "심한 알레르기",
]

def emergency_check_routing(
    state: HealthConsultationState,
) -> Literal["emergency_handler", "supervisor"]:
    """최신 사용자 메시지에서 응급 키워드를 감지한다."""
    last_human = next(
        (m for m in reversed(state["messages"]) if m.type == "human"),
        None,
    )
    if last_human:
        content = last_human.content.lower()
        found = [kw for kw in EMERGENCY_KEYWORDS if kw in content]
        if found:
            return "emergency_handler"
    return "supervisor"


# ─────────────────────────────────────────────
# 응급 핸들러 노드
# ─────────────────────────────────────────────

def emergency_handler_node(state: HealthConsultationState) -> dict:
    """
    응급 증상 감지 시 즉시 응급 안내 상태로 전환.
    프론트엔드는 emergency_flag=True를 수신하면 EmergencyModal을 표시한다.
    """
    last_human = next(
        (m for m in reversed(state["messages"]) if m.type == "human"),
        None,
    )
    found_keywords: list[str] = []
    if last_human:
        content = last_human.content.lower()
        found_keywords = [kw for kw in EMERGENCY_KEYWORDS if kw in content]

    return {
        "phase": "emergency",
        "emergency_flag": True,
        "emergency_keywords": found_keywords,
    }


# ─────────────────────────────────────────────
# StateGraph 조립
# ─────────────────────────────────────────────

def build_graph(checkpointer):
    builder = StateGraph(HealthConsultationState)

    # 노드 등록
    builder.add_node("supervisor",         supervisor_routing)   # 라우팅 전용 노드
    builder.add_node("screening",          screening_node)
    builder.add_node("emergency_check",    lambda s: s)          # pass-through, 엣지만 사용
    builder.add_node("emergency_handler",  emergency_handler_node)
    builder.add_node("diagnosis",          diagnosis_node)
    builder.add_node("search",             search_node)
    builder.add_node("info",               info_node)

    # 진입점
    builder.set_entry_point("supervisor")

    # Supervisor → 각 노드로 조건부 엣지
    builder.add_conditional_edges(
        "supervisor",
        supervisor_routing,
        {
            "screening":         "screening",
            "emergency_check":   "emergency_check",
            "emergency_handler": "emergency_handler",
            "diagnosis":         "diagnosis",
            "search":            "search",
            "info":              "info",
            END:                 END,
        },
    )

    # screening 완료 → emergency_check 경유
    builder.add_edge("screening", "emergency_check")

    # emergency_check: 응급 여부에 따라 분기
    builder.add_conditional_edges(
        "emergency_check",
        emergency_check_routing,
        {
            "emergency_handler": "emergency_handler",
            "supervisor":        "supervisor",
        },
    )

    # 나머지 노드 → supervisor로 귀환 (무한루프 방지: phase 값이 반드시 변경되어야 함)
    builder.add_edge("emergency_handler", "supervisor")
    builder.add_edge("diagnosis",         "supervisor")
    builder.add_edge("search",            "supervisor")
    builder.add_edge("info",              "supervisor")

    return builder.compile(checkpointer=checkpointer)


# ─────────────────────────────────────────────
# 환경별 그래프 인스턴스
# ─────────────────────────────────────────────

def get_graph():
    """
    개발: InMemorySaver
    프로덕션: PostgresSaver (Supabase)
    """
    env = os.getenv("APP_ENV", "development")
    if env == "production":
        conn_string = os.environ["SUPABASE_URL"]
        with PostgresSaver.from_conn_string(conn_string) as checkpointer:
            checkpointer.setup()  # 최초 1회 — LangGraph checkpoint 테이블 생성
            return build_graph(checkpointer)
    else:
        return build_graph(InMemorySaver())
```

### 2.3 노드별 상세 역할

| 노드 | 입력 State 키 | 출력 State 키 | LLM 사용 | 외부 API |
|------|-------------|-------------|---------|---------|
| `supervisor_node` | `phase` | — (라우팅만) | 없음 | 없음 |
| `screening_node` | `messages`, `screening_data`, `screening_progress` | `messages`, `screening_data`, `screening_progress`, `phase` | Gemini Flash | 없음 |
| `emergency_check_node` | `messages` | — (pass-through) | 없음 | 없음 |
| `emergency_handler_node` | `messages` | `phase`, `emergency_flag`, `emergency_keywords` | 없음 | 없음 |
| `diagnosis_node` | `screening_data` | `diagnosis_result`, `phase` | Gemini Flash | Supabase 매핑 DB |
| `search_node` | `diagnosis_result`, `user_location` | `hospital_results`, `phase` | 없음 | HIRA API, Naver Geocoding |
| `info_node` | `selected_hospital` | `selected_hospital` (상세 보완), `phase` | 없음 | HIRA API, Naver Directions |

### 2.4 Supervisor 라우팅 로직 상세

```python
# supervisor_routing이 반환하는 값과 phase 전이 규칙

# phase = "onboarding"  → screening 노드 실행
#   screening_node 반환: {"phase": "screening", ...}

# phase = "screening"   → emergency_check 경유
#   사용자 메시지에 응급 키워드 없음 → supervisor → (phase 그대로 "screening")
#   사용자 메시지에 응급 키워드 있음 → emergency_handler
#     emergency_handler 반환: {"phase": "emergency", "emergency_flag": True}
#   문진 완료 시 screening_node 반환: {"phase": "diagnosis"}
#   → supervisor → diagnosis 노드 실행

# phase = "diagnosis"   → diagnosis 노드 실행
#   diagnosis_node 반환: {"phase": "search", "diagnosis_result": {...}}

# phase = "search"      → search 노드 실행
#   search_node 반환: {"phase": "info", "hospital_results": [...]}

# phase = "info"        → info 노드 실행
#   info_node 반환: {"phase": "complete", "selected_hospital": {...}}

# phase = "complete"    → END
```

### 2.5 Checkpointer 구성 — thread_id 규칙

```python
# FastAPI 엔드포인트에서 그래프 호출 시 항상 config 제공
config = {
    "configurable": {
        "thread_id": session_id,  # POST /api/consultation/start에서 발급된 UUID
    }
}

# 동기 호출 (비스트리밍)
result = graph.invoke(input_state, config=config)

# 비동기 스트리밍 호출 (SSE)
async for chunk in graph.astream(input_state, config=config, stream_mode="messages"):
    token, metadata = chunk
    # ...
```

---

## 3. Frontend ↔ Backend API Contract

### 3.1 엔드포인트 목록

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/consultation/start` | 새 상담 세션 생성 | Required |
| `POST` | `/api/consultation/message` | 문진 메시지 전송 (SSE 스트리밍) | Required |
| `POST` | `/api/consultation/diagnosis` | 진료과 추천 실행 | Required |
| `POST` | `/api/consultation/complete` | 상담 완료 및 전체 요약 반환 | Required |
| `GET`  | `/api/hospital/search` | 위치 기반 병원 검색 | Required |
| `GET`  | `/api/hospital/{hospital_id}` | 병원 상세 정보 | Required |
| `GET`  | `/api/hospital/{hospital_id}/directions` | 길찾기 (도보/대중교통/자가용) | Required |
| `POST` | `/api/consultation/pdf` | 상담 결과 PDF 생성 | Required |
| `GET`  | `/health` | 헬스체크 | None |

---

### 3.2 POST `/api/consultation/start`

**설명**: 새 LangGraph 세션을 초기화하고 `session_id`를 발급한다.

**Request Body**:
```typescript
// TypeScript type
type StartConsultationRequest = Record<string, never>; // empty body {}
```

**Response**:
```typescript
type StartConsultationResponse = {
  session_id: string;    // UUID v4 — thread_id와 동일
  phase: string;         // 항상 "onboarding"
  created_at: string;    // ISO 8601 timestamp
};
```

**Example**:
```json
// Request
POST /api/consultation/start
Authorization: Bearer {clerk_jwt}
Content-Type: application/json
{}

// Response 200 OK
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "phase": "onboarding",
  "created_at": "2026-03-11T09:00:00Z"
}
```

---

### 3.3 POST `/api/consultation/message`

**설명**: 사용자 메시지를 LangGraph 문진 에이전트에 전달하고 Gemini Flash 응답을 SSE로 스트리밍한다.

**Request Body**:
```typescript
type SendMessageRequest = {
  session_id: string;    // /start에서 받은 UUID
  message: string;       // 사용자 입력 텍스트
};
```

**SSE Response Stream** (`Content-Type: text/event-stream`):
```typescript
// 스트리밍 중 — 토큰 단위 청크
type MessageChunk = {
  content: string;          // AI 응답 텍스트 청크
  done: false;
  phase: string;            // 현재 phase
  emergency_flag: false;
};

// 스트리밍 완료
type MessageComplete = {
  content: "";
  done: true;
  phase: string;            // 업데이트된 phase (예: "diagnosis")
  emergency_flag: boolean;  // true면 프론트엔드는 EmergencyModal 표시
  screening_progress: number; // 0.0 ~ 1.0
  screening_data?: object;  // 문진 완료 시 수집된 데이터
};
```

**Example**:
```json
// Request
POST /api/consultation/message
Authorization: Bearer {clerk_jwt}
Content-Type: application/json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "3일째 두통이 지속되고 어지러움이 있어요"
}

// Response — SSE Stream
data: {"content": "두통이 3일째", "done": false, "phase": "screening", "emergency_flag": false}
data: {"content": " 지속되고 있군요.", "done": false, "phase": "screening", "emergency_flag": false}
data: {"content": " 통증의 위치가 어디인가요?", "done": false, "phase": "screening", "emergency_flag": false}
data: {"content": "", "done": true, "phase": "screening", "emergency_flag": false, "screening_progress": 0.4, "screening_data": null}

// 응급 키워드 감지 시 완료 메시지
data: {"content": "", "done": true, "phase": "emergency", "emergency_flag": true, "screening_progress": 0.2, "screening_data": null}
```

---

### 3.4 POST `/api/consultation/diagnosis`

**설명**: 문진 완료 후 LangGraph 진단 노드를 실행하여 진료과를 추천한다.

**Request Body**:
```typescript
type DiagnosisRequest = {
  session_id: string;
};
```

**Response**:
```typescript
type DiagnosisResponse = {
  session_id: string;
  primary_dept: string;       // 예: "신경과"
  secondary_dept: string;     // 예: "내과", 없으면 ""
  urgency: "일반" | "조기방문권장" | "응급";
  reasoning: string;          // 추천 근거 (한국어)
  disclaimer: string;         // 의료 면책 문구
  phase: string;              // "search"로 업데이트됨
};
```

**Example**:
```json
// Request
POST /api/consultation/diagnosis
Authorization: Bearer {clerk_jwt}
Content-Type: application/json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}

// Response 200 OK
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "primary_dept": "신경과",
  "secondary_dept": "내과",
  "urgency": "조기방문권장",
  "reasoning": "3일 이상 지속되는 두통과 어지러움이 동반되어 신경과적 원인 감별이 필요합니다.",
  "disclaimer": "본 추천은 AI 기반 참고 정보이며, 정확한 진단은 반드시 의료기관을 방문하여 받으시기 바랍니다.",
  "phase": "search"
}
```

---

### 3.5 POST `/api/consultation/complete`

**설명**: 상담 세션의 전체 요약(문진 데이터 + 진단 결과 + 병원 검색 결과)을 반환한다.

**Request Body**:
```typescript
type CompleteConsultationRequest = {
  session_id: string;
};
```

**Response**:
```typescript
type CompleteConsultationResponse = {
  session_id: string;
  phase: string;                  // "complete"
  screening_data: ScreeningData;
  diagnosis_result: DiagnosisResult;
  hospital_results: HospitalInfo[];
  selected_hospital: HospitalInfo | null;
  completed_at: string;           // ISO 8601
};

type ScreeningData = {
  symptoms: SymptomItem[];
  duration: string;
  severity: number;               // 1~10
  body_part: string;
  accompanying_symptoms: string[];
  medical_history: string[];
  medications: string[];
  age_group: string;              // "20대" | "30대" | ...
  gender: string;                 // "남성" | "여성" | "기타"
};

type SymptomItem = {
  description: string;
  body_part: string;
  category: string;
  duration: string;
  severity: number;
  onset: string;
};

type DiagnosisResult = {
  primary_dept: string;
  secondary_dept: string;
  urgency: "일반" | "조기방문권장" | "응급";
  reasoning: string;
  disclaimer: string;
};

type HospitalInfo = {
  hospital_id: string;
  name: string;
  address: string;
  phone: string;
  dept_code: string;
  lat: number;
  lng: number;
  distance_m: number;
  rating: number | null;
  is_open: boolean;
  hours: string;
};
```

**Example**:
```json
// Request
POST /api/consultation/complete
Authorization: Bearer {clerk_jwt}
Content-Type: application/json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}

// Response 200 OK
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "phase": "complete",
  "screening_data": {
    "symptoms": [
      {
        "description": "두통이 3일째 지속",
        "body_part": "머리",
        "category": "신경계",
        "duration": "3일",
        "severity": 6,
        "onset": "점진적"
      }
    ],
    "accompanying_symptoms": ["어지러움", "메스꺼움"],
    "medical_history": ["고혈압"],
    "medications": ["혈압약"],
    "age_group": "30대",
    "gender": "남성"
  },
  "diagnosis_result": {
    "primary_dept": "신경과",
    "secondary_dept": "내과",
    "urgency": "조기방문권장",
    "reasoning": "3일 이상 지속되는 두통과 어지러움이 동반되어 신경과적 원인 감별이 필요합니다.",
    "disclaimer": "본 추천은 AI 기반 참고 정보입니다."
  },
  "hospital_results": [
    {
      "hospital_id": "HIRA-12345",
      "name": "강남신경과의원",
      "address": "서울시 강남구 강남대로 396",
      "phone": "02-1234-5678",
      "dept_code": "D001",
      "lat": 37.4979,
      "lng": 127.0276,
      "distance_m": 210,
      "rating": 4.5,
      "is_open": true,
      "hours": "평일 09:00-18:00, 토 09:00-13:00"
    }
  ],
  "selected_hospital": null,
  "completed_at": "2026-03-11T09:15:00Z"
}
```

---

### 3.6 GET `/api/hospital/search`

**설명**: 사용자 위치 기준 추천 진료과에 해당하는 주변 병원을 최대 3개 반환한다.

**Query Parameters**:
```typescript
type HospitalSearchParams = {
  dept_code: string;    // 예: "D001" (신경과)
  lat: number;          // 위도 (예: 37.4979)
  lng: number;          // 경도 (예: 127.0276)
  radius?: number;      // 검색 반경 km, 기본값 1 (자동확대: 1→3→5)
};
```

**Response**:
```typescript
type HospitalSearchResponse = {
  hospitals: HospitalInfo[];  // 최대 3개, 가중치 정렬
  total: number;              // 반경 내 전체 검색 결과 수
  radius_used_km: number;     // 실제 사용된 반경 (자동확대 결과 반영)
  dept_name: string;          // 진료과 한국어 명칭
};
```

**Example**:
```json
// Request
GET /api/hospital/search?dept_code=D001&lat=37.4979&lng=127.0276&radius=1
Authorization: Bearer {clerk_jwt}

// Response 200 OK
{
  "hospitals": [
    {
      "hospital_id": "HIRA-12345",
      "name": "강남신경과의원",
      "address": "서울시 강남구 강남대로 396",
      "phone": "02-1234-5678",
      "dept_code": "D001",
      "lat": 37.4979,
      "lng": 127.0276,
      "distance_m": 210,
      "rating": 4.5,
      "is_open": true,
      "hours": "평일 09:00-18:00, 토 09:00-13:00"
    },
    {
      "hospital_id": "HIRA-12346",
      "name": "강남내과신경과",
      "address": "서울시 강남구 테헤란로 145",
      "phone": "02-2345-6789",
      "dept_code": "D001",
      "lat": 37.4985,
      "lng": 127.0301,
      "distance_m": 380,
      "rating": 4.3,
      "is_open": true,
      "hours": "평일 09:00-19:00"
    }
  ],
  "total": 7,
  "radius_used_km": 1,
  "dept_name": "신경과"
}
```

---

### 3.7 GET `/api/hospital/{hospital_id}`

**설명**: 특정 병원의 전체 상세 정보를 반환한다.

**Path Parameter**:
```typescript
// hospital_id: string — HIRA 병원 고유 ID
```

**Response**:
```typescript
type HospitalDetailResponse = {
  hospital_id: string;
  name: string;
  address: string;
  phone: string;
  dept_code: string;
  dept_name: string;
  lat: number;
  lng: number;
  rating: number | null;
  is_open: boolean;
  hours: {
    weekday: string;      // 예: "09:00-18:00"
    saturday: string;     // 예: "09:00-13:00"
    sunday: string;       // 예: "휴진"
    lunch_break: string;  // 예: "12:30-13:30"
    holiday: string;      // 예: "공휴일 휴진"
  };
  website_url: string | null;   // 없으면 null
  naver_map_url: string;        // 네이버 지도 링크
  hira_data: {
    beds: number | null;
    staff_count: number | null;
    established_date: string | null;
  };
};
```

**Example**:
```json
// Request
GET /api/hospital/HIRA-12345
Authorization: Bearer {clerk_jwt}

// Response 200 OK
{
  "hospital_id": "HIRA-12345",
  "name": "강남신경과의원",
  "address": "서울시 강남구 강남대로 396 5층",
  "phone": "02-1234-5678",
  "dept_code": "D001",
  "dept_name": "신경과",
  "lat": 37.4979,
  "lng": 127.0276,
  "rating": 4.5,
  "is_open": true,
  "hours": {
    "weekday": "09:00-18:00",
    "saturday": "09:00-13:00",
    "sunday": "휴진",
    "lunch_break": "12:30-13:30",
    "holiday": "공휴일 휴진"
  },
  "website_url": "https://www.gangnamneurology.co.kr",
  "naver_map_url": "https://map.naver.com/v5/search/강남신경과의원",
  "hira_data": {
    "beds": null,
    "staff_count": 3,
    "established_date": "2015-03-01"
  }
}
```

---

### 3.8 GET `/api/hospital/{hospital_id}/directions`

**설명**: 사용자 현재 위치에서 선택 병원까지 도보/대중교통/자가용 예상 시간을 반환한다. (Naver Maps Directions API 호출은 Python 백엔드에서 수행 — API 키 보호)

**Query Parameters**:
```typescript
type DirectionsParams = {
  from_lat: number;   // 사용자 현재 위도
  from_lng: number;   // 사용자 현재 경도
};
```

**Response**:
```typescript
type DirectionsResponse = {
  hospital_id: string;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number; name: string };
  walking: {
    duration_min: number;    // 예상 도보 시간 (분)
    distance_m: number;
  };
  transit: {
    duration_min: number;    // 예상 대중교통 시간 (분)
    distance_m: number;
  };
  driving: {
    duration_min: number;    // 예상 자가용 시간 (분)
    distance_m: number;
  };
};
```

**Example**:
```json
// Request
GET /api/hospital/HIRA-12345/directions?from_lat=37.4969&from_lng=127.0256
Authorization: Bearer {clerk_jwt}

// Response 200 OK
{
  "hospital_id": "HIRA-12345",
  "from": { "lat": 37.4969, "lng": 127.0256 },
  "to": { "lat": 37.4979, "lng": 127.0276, "name": "강남신경과의원" },
  "walking": {
    "duration_min": 3,
    "distance_m": 210
  },
  "transit": {
    "duration_min": 8,
    "distance_m": 850
  },
  "driving": {
    "duration_min": 4,
    "distance_m": 650
  }
}
```

---

### 3.9 POST `/api/consultation/pdf`

**설명**: 세션의 상담 결과를 PDF로 생성하여 바이너리로 반환한다. 한국어 폰트(Noto Sans KR) 포함.

**Request Body**:
```typescript
type PdfRequest = {
  session_id: string;
};
```

**Response**: `application/pdf` 바이너리

```typescript
// Response Headers
// Content-Type: application/pdf
// Content-Disposition: attachment; filename="consultation-{session_id}-{date}.pdf"
// Content-Length: {bytes}
```

**Example**:
```json
// Request
POST /api/consultation/pdf
Authorization: Bearer {clerk_jwt}
Content-Type: application/json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}

// Response 200 OK
// Binary PDF stream
// Content-Type: application/pdf
// Content-Disposition: attachment; filename="consultation-550e8400-20260311.pdf"
```

**Error Response** (세션 없음):
```json
// Response 404 Not Found
{
  "detail": "Session not found or expired",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### 3.10 GET `/health`

**설명**: 서비스 헬스체크.

**Response**:
```typescript
type HealthResponse = {
  status: "ok" | "degraded";
  version: string;
  timestamp: string;
  checks: {
    database: "ok" | "error";
    langgraph: "ok" | "error";
  };
};
```

**Example**:
```json
// Response 200 OK
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2026-03-11T09:00:00Z",
  "checks": {
    "database": "ok",
    "langgraph": "ok"
  }
}
```

---

### 3.11 공통 에러 응답 형식

```typescript
type ErrorResponse = {
  detail: string;       // 에러 설명
  error_code: string;   // 예: "SESSION_NOT_FOUND", "LLM_TIMEOUT"
  session_id?: string;
};

// HTTP 상태 코드 규칙
// 400 Bad Request    — 요청 파라미터 오류
// 401 Unauthorized   — Clerk JWT 없음 또는 만료
// 404 Not Found      — session_id 또는 hospital_id 없음
// 422 Unprocessable  — FastAPI 요청 파싱 실패
// 429 Too Many Req.  — Rate limit (Gemini API)
// 500 Internal Error — LangGraph 실행 오류
// 503 Unavailable    — 외부 API(HIRA, Naver) 연결 실패
```

---

## 4. Streaming Architecture (SSE)

### 4.1 FastAPI SSE 구현

```python
# backend/app/api/routes/consultation.py

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
import json

from app.graphs.consultation_graph import get_graph
from app.models.consultation import MessageRequest
from app.middleware.auth import verify_clerk_jwt

router = APIRouter(prefix="/api/consultation")
graph = get_graph()


@router.post("/message")
async def send_message(
    req: MessageRequest,
    user_id: str = Depends(verify_clerk_jwt),
):
    """
    사용자 메시지를 LangGraph에 전달하고 Gemini Flash 응답을 SSE로 스트리밍.

    stream_mode="messages" — 노드 내 LLM이 생성하는 메시지를 토큰 단위로 스트리밍.
    """
    async def event_stream():
        config = {"configurable": {"thread_id": req.session_id}}
        input_state = {
            "messages": [HumanMessage(content=req.message)]
        }

        try:
            async for chunk in graph.astream(
                input_state,
                config=config,
                stream_mode="messages",
            ):
                token, metadata = chunk

                # AI 메시지 토큰 청크만 전달
                if hasattr(token, "content") and token.content:
                    data = {
                        "content": token.content,
                        "done": False,
                        "phase": metadata.get("phase", "screening"),
                        "emergency_flag": False,
                    }
                    yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

            # 스트리밍 완료 후 최종 상태 조회
            final_state = graph.get_state(config)
            values = final_state.values

            done_data = {
                "content": "",
                "done": True,
                "phase": values.get("phase", "screening"),
                "emergency_flag": values.get("emergency_flag", False),
                "screening_progress": values.get("screening_progress", 0.0),
                "screening_data": values.get("screening_data") if values.get("phase") == "diagnosis" else None,
            }
            yield f"data: {json.dumps(done_data, ensure_ascii=False)}\n\n"

        except Exception as e:
            error_data = {
                "content": "",
                "done": True,
                "error": str(e),
                "phase": "screening",
                "emergency_flag": False,
            }
            yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # Nginx 버퍼링 비활성화
        },
    )
```

### 4.2 Next.js SSE 클라이언트 구현

```typescript
// frontend/lib/api/consultation.ts

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type MessageChunk = {
  content: string;
  done: boolean;
  phase: string;
  emergency_flag: boolean;
  screening_progress?: number;
  screening_data?: object | null;
  error?: string;
};

/**
 * SSE 스트리밍으로 AI 문진 메시지를 수신한다.
 * onChunk: 토큰 청크 수신 콜백
 * onComplete: 스트리밍 완료 콜백 (최종 상태 포함)
 */
export async function sendMessage(
  sessionId: string,
  message: string,
  clerkToken: string,
  onChunk: (chunk: MessageChunk) => void,
  onComplete: (finalChunk: MessageChunk) => void,
  onError: (error: Error) => void,
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/consultation/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${clerkToken}`,
      },
      body: JSON.stringify({ session_id: sessionId, message }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";  // 마지막 미완성 라인은 버퍼에 보존

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const rawJson = line.slice(6).trim();
          if (!rawJson) continue;

          try {
            const chunk: MessageChunk = JSON.parse(rawJson);
            if (chunk.done) {
              onComplete(chunk);
            } else {
              onChunk(chunk);
            }
          } catch {
            // JSON 파싱 실패 — 무시 (부분 전송 방어)
          }
        }
      }
    }
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
  }
}
```

### 4.3 Next.js React Hook — 문진 채팅 통합

```typescript
// frontend/hooks/useConsultationChat.ts

import { useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { sendMessage, MessageChunk } from "@/lib/api/consultation";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

export function useConsultationChat(sessionId: string) {
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [phase, setPhase] = useState<string>("onboarding");
  const [emergencyFlag, setEmergencyFlag] = useState(false);
  const [progress, setProgress] = useState(0);

  const sendUserMessage = useCallback(async (text: string) => {
    const token = await getToken();
    if (!token) return;

    // 사용자 메시지 즉시 표시
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, timestamp: new Date() },
    ]);

    // AI 응답 스트리밍 시작
    setIsStreaming(true);
    let aiContent = "";

    // 빈 AI 메시지 자리 예약 (타이핑 애니메이션용)
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", timestamp: new Date() },
    ]);

    await sendMessage(
      sessionId,
      text,
      token,
      (chunk: MessageChunk) => {
        // 토큰 청크를 마지막 AI 메시지에 append
        aiContent += chunk.content;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: aiContent,
          };
          return updated;
        });
      },
      (finalChunk: MessageChunk) => {
        // 스트리밍 완료 처리
        setPhase(finalChunk.phase);
        setEmergencyFlag(finalChunk.emergency_flag);
        if (finalChunk.screening_progress !== undefined) {
          setProgress(finalChunk.screening_progress);
        }
        setIsStreaming(false);
      },
      (error: Error) => {
        console.error("Streaming error:", error);
        setIsStreaming(false);
      },
    );
  }, [sessionId, getToken]);

  return { messages, isStreaming, phase, emergencyFlag, progress, sendUserMessage };
}
```

### 4.4 SSE 아키텍처 결정 근거

| 옵션 | 장점 | 단점 | 결정 |
|------|------|------|------|
| **SSE (선택)** | HTTP 표준, 프록시 친화적, 자동 재연결, FastAPI StreamingResponse 자연 통합 | 단방향만 지원 | **채택** |
| WebSocket | 양방향, 낮은 레이턴시 | 프록시 설정 복잡, Railway/Vercel 제한 | 미채택 |
| Polling | 구현 단순 | 응답 지연, 불필요한 요청 | 미채택 |

**핵심 이유**: 문진 대화는 사용자 메시지 → AI 응답의 단방향 스트리밍 패턴이므로 SSE로 충분하다. WebSocket의 복잡도는 이 서비스에서 불필요한 오버헤드다.

---

## 5. Deployment Options

### 5.1 Option A: Vercel (Frontend) + Railway (Backend)

```
┌──────────────────────────────────────────────────────────────────┐
│  Option A: Vercel + Railway                                       │
│                                                                  │
│  ┌─────────────────┐          ┌──────────────────────────────┐  │
│  │  Vercel          │          │  Railway                      │  │
│  │  (Frontend)      │   HTTPS  │  (Backend)                   │  │
│  │                  │ ────────►│                              │  │
│  │  Next.js App     │   SSE    │  Docker Container            │  │
│  │  Edge Functions  │◄──────── │  FastAPI + LangGraph         │  │
│  │  Global CDN      │          │  Python 3.11+                │  │
│  │  자동 CI/CD      │          │  uvicorn ASGI                │  │
│  │                  │          │  $5~10/month                 │  │
│  │  Free Tier       │          └──────────────────────────────┘  │
│  │  (hobby plan)    │                    │                       │
│  └─────────────────┘                    │                       │
│                                         ▼                       │
│                              ┌──────────────────────┐           │
│                              │  Supabase            │           │
│                              │  PostgreSQL           │           │
│                              │  Free Tier (500MB)    │           │
│                              └──────────────────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

**Railway 배포 설정**:

```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir uv && \
    uv pip install --system -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```toml
# railway.toml
[build]
builder = "dockerfile"

[deploy]
startCommand = "uvicorn app.main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/health"
healthcheckTimeout = 30
```

**Vercel 환경 변수 설정**:
```
NEXT_PUBLIC_API_URL=https://{railway-app}.railway.app
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY={clerk_key}
NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID={naver_client_id}
```

---

### 5.2 Option B: Vercel (Frontend) + AWS Lightsail (Backend)

```
┌──────────────────────────────────────────────────────────────────┐
│  Option B: Vercel + AWS Lightsail                                 │
│                                                                  │
│  ┌─────────────────┐          ┌──────────────────────────────┐  │
│  │  Vercel          │          │  AWS Lightsail               │  │
│  │  (Frontend)      │   HTTPS  │  (ap-northeast-2: 서울)      │  │
│  │                  │ ────────►│                              │  │
│  │  Next.js App     │   SSE    │  $5/month — 2GB RAM          │  │
│  │  Edge Functions  │◄──────── │  Always-on (no cold start)  │  │
│  │  Global CDN      │          │  1TB 전송/month              │  │
│  │                  │          │                              │  │
│  │  Free Tier       │          │  Docker Compose:             │  │
│  │                  │          │  - FastAPI (uvicorn)         │  │
│  │                  │          │  - Nginx (reverse proxy)     │  │
│  └─────────────────┘          │  - Certbot (Let's Encrypt)   │  │
│                               └──────────────────────────────┘  │
│                                         │                       │
│                                         ▼                       │
│                              ┌──────────────────────┐           │
│                              │  Supabase            │           │
│                              │  PostgreSQL           │           │
│                              │  Free Tier (500MB)    │           │
│                              └──────────────────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

**Lightsail 배포 설정**:

```yaml
# docker-compose.yml (Lightsail 인스턴스)
version: "3.8"

services:
  fastapi:
    build: .
    environment:
      - APP_ENV=production
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
      - NAVER_CLIENT_SECRET=${NAVER_CLIENT_SECRET}
      - HIRA_API_KEY=${HIRA_API_KEY}
      - CORS_ORIGINS=https://{your-vercel-domain}.vercel.app
    restart: always

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - /etc/letsencrypt:/etc/letsencrypt
    depends_on:
      - fastapi
    restart: always
```

```nginx
# nginx.conf — SSE 전용 설정
location /api/consultation/message {
    proxy_pass         http://fastapi:8000;
    proxy_http_version 1.1;
    proxy_set_header   Connection "";          # Keep-Alive for SSE
    proxy_buffering    off;                    # SSE 버퍼링 비활성화 필수
    proxy_cache        off;
    proxy_read_timeout 300s;                   # 긴 문진 대화 대비 타임아웃 연장
    chunked_transfer_encoding on;
}

location / {
    proxy_pass http://fastapi:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

---

### 5.3 배포 옵션 비교표

| 항목 | Option A: Railway | Option B: AWS Lightsail |
|------|-------------------|------------------------|
| **월 비용** | Railway $5~10 + Vercel Free + Supabase Free = **$5~10/월** | Lightsail $5 + Vercel Free + Supabase Free = **$5/월** |
| **초기 설정 복잡도** | 낮음 (GitHub 연동 자동 CI/CD) | 중간 (SSH 설정, Docker Compose, Nginx, SSL 수동) |
| **콜드 스타트** | 있음 (Railway Free Tier 15분 비활성 시 슬립) | 없음 (Always-on 인스턴스) |
| **한국 사용자 레이턴시** | 중간 (Railway 서버: US East 기본) | 낮음 (ap-northeast-2 서울 리전) |
| **SSE 스트리밍 안정성** | 중간 (프록시 계층 적음) | 높음 (Nginx `proxy_buffering off` 직접 제어) |
| **스케일링** | 수평 자동 확장 (Railway Pro) | 수동 인스턴스 업그레이드 ($10 플랜: 4GB RAM) |
| **Gemini API 레이턴시** | US → Google API: 낮음 | 서울 → Google API: 낮음 (Google Cloud 서울 PoP 존재) |
| **HIRA/Naver API 레이턴시** | 높음 (US 서버 → 한국 API 왕복) | 낮음 (서울 서버 → 한국 API: ~5ms) |
| **모니터링** | Railway 내장 메트릭 | CloudWatch 별도 설정 또는 외부 도구 |
| **CI/CD** | GitHub Push → 자동 배포 | 수동 SSH + docker compose pull |
| **SSL/HTTPS** | 자동 (Railway 내장) | 수동 (Certbot Let's Encrypt) |
| **롤백** | Railway 대시보드 1클릭 | 수동 이미지 태그 관리 |
| **추천 대상** | MVP 빠른 출시, 개발팀 소규모 | 한국 사용자 성능 최우선, 운영 안정성 중요 |

**권장**: HIRA API와 Naver Maps API가 한국 서버에 위치하므로 **Option B (AWS Lightsail ap-northeast-2)** 가 API 왕복 레이턴시 면에서 유리하다. MVP 단계에서는 Option A로 빠르게 출시하고, MAU 1,000+ 달성 시 Option B로 마이그레이션하는 전략도 유효하다.

---

## 6. Security & Compliance

### 6.1 인증 흐름

```
사용자 브라우저         Next.js (Vercel)      FastAPI (Backend)     Clerk
     │                      │                      │                  │
     │  1. 로그인 요청       │                      │                  │
     │─────────────────────►│                      │                  │
     │                      │  2. Clerk SDK 호출   │                  │
     │                      │─────────────────────────────────────────►│
     │                      │  3. Clerk JWT 발급   │                  │
     │                      │◄─────────────────────────────────────────│
     │  4. JWT 쿠키/세션    │                      │                  │
     │◄─────────────────────│                      │                  │
     │                      │                      │                  │
     │  5. API 요청 (JWT)   │                      │                  │
     │─────────────────────►│                      │                  │
     │                      │  6. Authorization: Bearer {JWT}         │
     │                      │─────────────────────►│                  │
     │                      │                      │  7. JWT 검증     │
     │                      │                      │──────────────────►│
     │                      │                      │  8. user_id 반환 │
     │                      │                      │◄──────────────────│
     │                      │                      │  9. 비즈니스 로직│
     │                      │  10. 응답             │                  │
     │◄─────────────────────│◄─────────────────────│                  │
```

### 6.2 보안 원칙

| 원칙 | 구현 방법 |
|------|----------|
| API 키 보호 | `GEMINI_API_KEY`, `NAVER_CLIENT_SECRET`, `HIRA_API_KEY` — 모두 Python 백엔드 환경 변수에만 저장. Next.js 클라이언트 노출 절대 금지 |
| PII 최소화 | 문진 데이터에 성명, 주민번호, 연락처 수집 없음. Gemini API 전달 전 Presidio 기반 PII 마스킹 |
| 세션 격리 | LangGraph thread_id = session_id (UUID), 타 사용자 세션 접근 불가 |
| HTTPS 전용 | 모든 API 통신 TLS 1.3. Nginx HTTP → HTTPS 강제 리다이렉트 |
| CORS 제한 | `CORS_ORIGINS` 환경 변수로 허용 도메인 명시 (와일드카드 `*` 금지) |
| 세션 TTL | `consultation_sessions` 테이블 `expires_at` 24시간, 만료 후 자동 삭제 |
| 의료 면책 | 모든 진단 API 응답에 `disclaimer` 필드 필수 포함 |

### 6.3 법적 준수 (한국 의료법/개인정보보호법)

- 서비스는 **의료 행위가 아닌 건강 정보 안내** 목적임을 모든 화면과 API 응답에 명시
- 건강 정보는 개인정보보호법 상 **민감 정보** — 별도 동의(S-01 체크박스) 및 세션 만료 후 즉시 삭제
- 응급 상황(`emergency_flag: true`) 시 119 연결 안내 필수 (FR-008)

---

## 7. Non-functional Requirements Mapping

| 요구사항 | 목표 | 구현 방법 |
|---------|------|----------|
| 문진 응답 지연 | ≤3초 | Gemini Flash SSE 스트리밍 (첫 토큰 도착까지) |
| 진료과 추천 지연 | ≤5초 | LangGraph 진단 노드 + Supabase 매핑 쿼리 |
| 병원 검색 응답 | ≤3초 | HIRA API httpx + 결과 캐싱 (Redis 향후) |
| 지도 로딩 | ≤2초 | Naver Maps JS API v3 next/dynamic lazy load |
| 동시 접속 | ≥500명 | FastAPI async + uvicorn workers 4개 (Lightsail $10 플랜) |
| 가용률 | ≥99.5% | Railway/Lightsail 재시작 정책 + Supabase 99.9% SLA |
| 진료과 추천 정확도 | ≥85% | Gemini Flash + Supabase 매핑 DB 하이브리드 방식 |
| 상담 완료율 | ≥70% | 문진 프로그레스바 + 3분 이내 완료 목표 |

---

## 8. 환경 변수 목록

### 8.1 Backend `.env`

```bash
# App
APP_ENV=development          # development | production

# LLM
GEMINI_API_KEY=              # Google AI Studio API Key

# Database (Supabase)
SUPABASE_URL=                # postgresql://... (LangGraph PostgresSaver 포맷)
SUPABASE_SERVICE_KEY=        # Supabase Service Role Key (RLS 우회)

# External APIs
NAVER_CLIENT_ID=             # Naver Maps API Client ID
NAVER_CLIENT_SECRET=         # Naver Maps API Client Secret
HIRA_API_KEY=                # 심평원 공공데이터 API Key

# Auth
CLERK_SECRET_KEY=            # Clerk Backend Secret Key

# CORS
CORS_ORIGINS=http://localhost:3000  # 콤마 구분 허용 도메인
```

### 8.2 Frontend `.env.local`

```bash
# API
NEXT_PUBLIC_API_URL=http://localhost:8000   # FastAPI 백엔드 URL

# Auth (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=          # Clerk Publishable Key

# Maps (공개 가능 — Next.js 클라이언트에서 Naver Maps JS API 로드)
NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID=           # Naver Maps JS API Client ID
```

---

## 9. 패키지 버전 고정

### 9.1 Backend (Python — uv 관리)

```txt
# requirements.txt
python>=3.11

# LangChain/LangGraph v1 (semver 고정)
langchain>=1.0,<2.0
langchain-core>=1.0,<2.0
langgraph>=1.0,<2.0
langchain-google-genai>=2.0,<3.0   # Gemini Flash 전용 패키지

# Observability
langsmith>=0.3.0

# API Framework
fastapi>=0.115.0,<1.0
uvicorn[standard]>=0.30.0

# Database
supabase>=2.0.0,<3.0

# HTTP Client
httpx>=0.27.0

# Utilities
python-dotenv>=1.0.0
presidio-analyzer>=2.2.0           # PII 마스킹
```

### 9.2 Frontend (Node.js — pnpm 관리)

```json
{
  "dependencies": {
    "next": "latest",
    "react": "latest",
    "react-dom": "latest",
    "@mui/material": "^6.0.0",
    "@mui/icons-material": "^6.0.0",
    "@emotion/react": "^11.0.0",
    "@emotion/styled": "^11.0.0",
    "@clerk/nextjs": "latest",
    "typescript": "^5.0.0"
  }
}
```

---

*본 문서는 건강상담도우미 웹서비스의 아키텍처 결정 사항을 정의합니다.*
*구현 착수 전 PRD v1.0, workflow.md Step 2.1 수용 기준을 함께 검토하십시오.*

---

**문서 이력**

| 버전 | 일자 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| v1.0 | 2026-03-11 | Architect Agent | 초안 작성 — 5개 섹션 전체 |
