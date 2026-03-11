# API 통합 가이드 - 건강 상담 어시스턴트

이 문서는 Python FastAPI 백엔드 + Next.js 15 App Router 프론트엔드 프로젝트에서 사용되는 외부 API들의 통합 방법을 설명합니다.

---

## 목차

1. [Google Gemini Flash via LangChain](#1-google-gemini-flash-via-langchain)
2. [LangGraph 수퍼바이저 패턴](#2-langgraph-수퍼바이저-패턴)
3. [네이버 지도 JavaScript API v3](#3-네이버-지도-javascript-api-v3)
4. [HIRA 심평원 공공데이터 API](#4-hira-심평원-공공데이터-api)
5. [FastAPI + Next.js CORS 설정](#5-fastapi--nextjs-cors-설정)

---

## 1. Google Gemini Flash via LangChain

### 설치

```bash
pip install langchain-google-genai langgraph
```

### 환경 변수

```env
GOOGLE_API_KEY=your_google_api_key_here
```

### 기본 ChatGoogleGenerativeAI 설정

```python
# backend/app/llm/gemini.py
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage

def create_gemini_model(streaming: bool = False) -> ChatGoogleGenerativeAI:
    """
    Create a Gemini Flash model instance.
    Use streaming=True for SSE endpoints.
    """
    return ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",          # or "gemini-1.5-flash"
        temperature=0.7,
        streaming=streaming,
        convert_system_message_to_human=True,  # Gemini requires this
    )


# 기본 사용 예시 (비스트리밍)
async def simple_chat(user_message: str) -> str:
    llm = create_gemini_model()
    messages = [
        SystemMessage(content="당신은 친절한 건강 상담 어시스턴트입니다."),
        HumanMessage(content=user_message),
    ]
    response = await llm.ainvoke(messages)
    return response.content
```

### 스트리밍 설정

```python
# backend/app/llm/streaming.py
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from typing import AsyncIterator

async def stream_gemini_response(
    user_message: str,
    system_prompt: str,
) -> AsyncIterator[str]:
    """
    Stream tokens from Gemini Flash for SSE endpoint.
    Yields each token chunk as it arrives.
    """
    llm = create_gemini_model(streaming=True)
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_message),
    ]

    async for chunk in llm.astream(messages):
        if chunk.content:
            yield chunk.content
```

### Pydantic 구조화 출력

```python
# backend/app/llm/structured.py
from pydantic import BaseModel, Field
from langchain_google_genai import ChatGoogleGenerativeAI
from typing import List

class SymptomAnalysis(BaseModel):
    """Structured output for symptom screening."""
    severity: str = Field(description="증상 심각도: low/medium/high/emergency")
    suspected_conditions: List[str] = Field(description="의심 가능한 질환 목록")
    recommended_department: str = Field(description="추천 진료과")
    needs_emergency: bool = Field(description="응급실 방문 필요 여부")
    follow_up_questions: List[str] = Field(description="추가 확인이 필요한 질문 목록")


async def analyze_symptoms_structured(symptoms: str) -> SymptomAnalysis:
    """
    Use with_structured_output to get typed Pydantic response from Gemini.
    """
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        temperature=0.3,    # lower temperature for structured output
        convert_system_message_to_human=True,
    )

    # Bind Pydantic schema to model output
    structured_llm = llm.with_structured_output(SymptomAnalysis)

    result = await structured_llm.ainvoke(
        f"다음 증상을 분석해주세요: {symptoms}"
    )
    return result  # type: SymptomAnalysis
```

### 멀티턴 대화 관리

```python
# backend/app/llm/conversation.py
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from typing import List

HEALTH_SYSTEM_PROMPT = """당신은 전문적인 건강 상담 어시스턴트입니다.
사용자의 증상을 이해하고, 적절한 의료 기관을 추천하며, 건강 정보를 제공합니다.
단, 의학적 진단은 반드시 전문의에게 받아야 함을 안내하세요."""

async def multi_turn_chat(
    conversation_history: List[BaseMessage],
    new_user_message: str,
) -> str:
    """
    Continue a multi-turn conversation with Gemini.
    conversation_history contains previous HumanMessage and AIMessage pairs.
    """
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        temperature=0.7,
        convert_system_message_to_human=True,
    )

    # Build message list with system prompt + history + new message
    messages = [
        SystemMessage(content=HEALTH_SYSTEM_PROMPT),
        *conversation_history,
        HumanMessage(content=new_user_message),
    ]

    response = await llm.ainvoke(messages)

    # Add new exchange to history for next turn
    conversation_history.append(HumanMessage(content=new_user_message))
    conversation_history.append(AIMessage(content=response.content))

    return response.content
```

---

## 2. LangGraph 수퍼바이저 패턴

### 설치

```bash
pip install langgraph langchain-core psycopg2-binary
```

### 상태 정의 (TypedDict)

```python
# backend/app/graph/state.py
from typing import TypedDict, Annotated, List, Optional
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

class HealthConsultationState(TypedDict):
    """
    Shared state across all LangGraph agent nodes.
    messages uses add_messages reducer to append (not overwrite).
    """
    messages: Annotated[List[BaseMessage], add_messages]

    # Screening node outputs
    symptoms: Optional[str]
    severity: Optional[str]             # low / medium / high / emergency
    recommended_department: Optional[str]

    # Diagnosis node outputs
    suspected_conditions: List[str]
    needs_emergency: bool

    # Search node outputs (hospital search results)
    hospital_results: List[dict]

    # User location
    user_latitude: Optional[float]
    user_longitude: Optional[float]

    # Routing control
    next_node: Optional[str]            # supervisor sets this
    conversation_id: str                # for checkpointer thread_id
```

### 에이전트 노드 구현

```python
# backend/app/graph/nodes.py
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from .state import HealthConsultationState
from ..llm.structured import SymptomAnalysis, analyze_symptoms_structured
from ..services.hira import search_hospitals
from ..services.naver_maps import get_hospital_travel_times

llm = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash",
    temperature=0.7,
    convert_system_message_to_human=True,
)


async def screening_node(state: HealthConsultationState) -> dict:
    """
    Node 1: Initial symptom screening.
    Extracts severity and recommended department from user symptoms.
    """
    last_message = state["messages"][-1]
    symptoms_text = last_message.content

    analysis: SymptomAnalysis = await analyze_symptoms_structured(symptoms_text)

    response_text = f"""증상을 분석했습니다.

**심각도**: {analysis.severity}
**의심 질환**: {', '.join(analysis.suspected_conditions)}
**추천 진료과**: {analysis.recommended_department}

{"⚠️ 응급실 방문을 즉시 권장합니다!" if analysis.needs_emergency else ""}

추가로 확인이 필요한 사항이 있습니다:
{chr(10).join(f"- {q}" for q in analysis.follow_up_questions)}"""

    return {
        "messages": [AIMessage(content=response_text)],
        "symptoms": symptoms_text,
        "severity": analysis.severity,
        "recommended_department": analysis.recommended_department,
        "suspected_conditions": analysis.suspected_conditions,
        "needs_emergency": analysis.needs_emergency,
        "next_node": "supervisor",
    }


async def diagnosis_node(state: HealthConsultationState) -> dict:
    """
    Node 2: Detailed diagnosis information.
    Provides more context about suspected conditions.
    """
    conditions = state.get("suspected_conditions", [])
    symptoms = state.get("symptoms", "")

    prompt = f"""
    증상: {symptoms}
    의심 질환: {', '.join(conditions)}

    각 의심 질환에 대해 다음을 설명해주세요:
    1. 주요 증상과 특징
    2. 일반적인 치료 방법
    3. 주의사항
    """

    response = await llm.ainvoke([HumanMessage(content=prompt)])

    return {
        "messages": [AIMessage(content=response.content)],
        "next_node": "supervisor",
    }


async def hospital_search_node(state: HealthConsultationState) -> dict:
    """
    Node 3: Search nearby hospitals using HIRA API.
    Requires user_latitude and user_longitude in state.
    """
    department = state.get("recommended_department", "내과")
    lat = state.get("user_latitude")
    lng = state.get("user_longitude")

    if not lat or not lng:
        return {
            "messages": [AIMessage(content="위치 정보가 필요합니다. 현재 위치를 공유해주세요.")],
            "next_node": "supervisor",
        }

    # Call HIRA API (see section 4)
    hospitals = await search_hospitals(
        department=department,
        latitude=lat,
        longitude=lng,
        radius=3000,  # 3km radius
    )

    # Enrich with travel times from Naver Maps (see section 3)
    hospitals_with_times = await get_hospital_travel_times(
        hospitals=hospitals,
        origin_lat=lat,
        origin_lng=lng,
    )

    hospital_list = "\n".join([
        f"- **{h['name']}** ({h['address']}) | 도보 {h.get('walk_time', '?')}분"
        for h in hospitals_with_times[:5]
    ])

    return {
        "messages": [AIMessage(content=f"근처 {department} 병원 목록입니다:\n\n{hospital_list}")],
        "hospital_results": hospitals_with_times,
        "next_node": "supervisor",
    }


async def health_info_node(state: HealthConsultationState) -> dict:
    """
    Node 4: General health information and advice.
    Handles questions not requiring screening or hospital search.
    """
    last_message = state["messages"][-1]

    system_prompt = """당신은 건강 정보 전문가입니다.
    의학적 진단 없이 일반적인 건강 정보와 생활 습관 개선 방법을 안내하세요."""

    response = await llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=last_message.content),
    ])

    return {
        "messages": [AIMessage(content=response.content)],
        "next_node": "supervisor",
    }
```

### 수퍼바이저 노드와 라우팅

```python
# backend/app/graph/supervisor.py
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field
from .state import HealthConsultationState

class RouterDecision(BaseModel):
    """Supervisor routing decision."""
    next_node: str = Field(
        description="Next node to call: screening/diagnosis/hospital_search/health_info/END"
    )
    reasoning: str = Field(description="Reason for routing decision")


supervisor_llm = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash",
    temperature=0.1,    # deterministic routing
    convert_system_message_to_human=True,
).with_structured_output(RouterDecision)

SUPERVISOR_PROMPT = """당신은 건강 상담 워크플로우의 수퍼바이저입니다.
대화 내용을 분석하고 다음 에이전트를 결정하세요:

- **screening**: 새로운 증상이 언급되었을 때
- **diagnosis**: 특정 질환에 대한 상세 정보가 필요할 때
- **hospital_search**: 병원 찾기를 요청할 때
- **health_info**: 일반 건강 정보 질문일 때
- **END**: 대화가 완료되었을 때

현재 대화 요약:
{conversation_summary}

마지막 메시지: {last_message}
현재 상태: severity={severity}, department={department}"""


async def supervisor_node(state: HealthConsultationState) -> dict:
    """
    Supervisor decides which agent node to call next.
    Returns next_node to control conditional edge routing.
    """
    messages = state["messages"]
    last_message = messages[-1].content if messages else ""

    # Build conversation summary for context
    recent_messages = messages[-6:]  # last 3 turns
    conversation_summary = "\n".join([
        f"{'사용자' if msg.type == 'human' else 'AI'}: {msg.content[:100]}..."
        for msg in recent_messages
    ])

    prompt = SUPERVISOR_PROMPT.format(
        conversation_summary=conversation_summary,
        last_message=last_message,
        severity=state.get("severity", "미평가"),
        department=state.get("recommended_department", "미정"),
    )

    decision: RouterDecision = await supervisor_llm.ainvoke(
        [HumanMessage(content=prompt)]
    )

    return {"next_node": decision.next_node}


def route_from_supervisor(state: HealthConsultationState) -> str:
    """
    Conditional edge function: reads next_node from state
    and returns the target node name for LangGraph routing.
    """
    return state.get("next_node", "END")
```

### StateGraph 조립

```python
# backend/app/graph/graph.py
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.postgres import PostgresSaver
import psycopg2
import os

from .state import HealthConsultationState
from .nodes import screening_node, diagnosis_node, hospital_search_node, health_info_node
from .supervisor import supervisor_node, route_from_supervisor


def create_health_consultation_graph():
    """
    Build and compile the LangGraph StateGraph with PostgresSaver checkpointer.
    Returns compiled graph ready for invocation.
    """
    # PostgresSaver checkpointer (Supabase connection string)
    db_url = os.environ["SUPABASE_DB_URL"]
    # e.g. postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres

    conn = psycopg2.connect(db_url)
    checkpointer = PostgresSaver(conn)
    checkpointer.setup()   # create langgraph tables if not exist

    # Build graph
    builder = StateGraph(HealthConsultationState)

    # Add all nodes
    builder.add_node("supervisor", supervisor_node)
    builder.add_node("screening", screening_node)
    builder.add_node("diagnosis", diagnosis_node)
    builder.add_node("hospital_search", hospital_search_node)
    builder.add_node("health_info", health_info_node)

    # Entry point: always start at supervisor
    builder.set_entry_point("supervisor")

    # Supervisor routes to agent nodes via conditional edge
    builder.add_conditional_edges(
        "supervisor",
        route_from_supervisor,
        {
            "screening": "screening",
            "diagnosis": "diagnosis",
            "hospital_search": "hospital_search",
            "health_info": "health_info",
            "END": END,
        },
    )

    # All agent nodes loop back to supervisor after completion
    builder.add_edge("screening", "supervisor")
    builder.add_edge("diagnosis", "supervisor")
    builder.add_edge("hospital_search", "supervisor")
    builder.add_edge("health_info", "supervisor")

    # Compile with checkpointer for state persistence
    graph = builder.compile(checkpointer=checkpointer)
    return graph


# Singleton graph instance
_graph = None

def get_graph():
    global _graph
    if _graph is None:
        _graph = create_health_consultation_graph()
    return _graph
```

### SSE 스트리밍 엔드포인트

```python
# backend/app/routers/chat.py
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
import json
import asyncio

from ..graph.graph import get_graph

router = APIRouter(prefix="/api/chat", tags=["chat"])


async def stream_graph_events(
    conversation_id: str,
    user_message: str,
) -> AsyncIterator[str]:
    """
    Stream LangGraph node events as SSE data chunks.
    Each event is JSON-encoded for the client.
    """
    graph = get_graph()

    # LangGraph config: thread_id maps to checkpointer state key
    config = {"configurable": {"thread_id": conversation_id}}

    input_state = {
        "messages": [HumanMessage(content=user_message)],
    }

    # astream_events yields granular events including token-level streaming
    async for event in graph.astream_events(input_state, config=config, version="v2"):
        event_type = event["event"]

        if event_type == "on_chat_model_stream":
            # Token-level streaming from Gemini
            chunk = event["data"]["chunk"]
            if chunk.content:
                data = json.dumps({
                    "type": "token",
                    "content": chunk.content,
                    "node": event.get("name", ""),
                })
                yield f"data: {data}\n\n"

        elif event_type == "on_chain_end" and "node" in event.get("name", ""):
            # Node completed - send state update
            output = event["data"].get("output", {})
            if "next_node" in output:
                data = json.dumps({
                    "type": "node_complete",
                    "next_node": output["next_node"],
                })
                yield f"data: {data}\n\n"

    # Signal stream end
    yield f"data: {json.dumps({'type': 'done'})}\n\n"


@router.get("/stream/{conversation_id}")
async def chat_stream(
    conversation_id: str,
    message: str,
    request: Request,
):
    """
    SSE endpoint for streaming LangGraph responses.
    Client connects via EventSource and receives token chunks.
    """
    return StreamingResponse(
        stream_graph_events(conversation_id, message),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",    # disable nginx buffering for SSE
        },
    )


@router.post("/message/{conversation_id}")
async def chat_message(
    conversation_id: str,
    body: dict,
):
    """
    Non-streaming endpoint: returns complete response.
    Use this for simple request-response without SSE.
    """
    graph = get_graph()
    config = {"configurable": {"thread_id": conversation_id}}

    result = await graph.ainvoke(
        {"messages": [HumanMessage(content=body["message"])]},
        config=config,
    )

    return {
        "conversation_id": conversation_id,
        "messages": [
            {"role": "ai" if m.type == "ai" else "human", "content": m.content}
            for m in result["messages"][-2:]   # return last exchange
        ],
        "severity": result.get("severity"),
        "hospital_results": result.get("hospital_results", []),
    }
```

---

## 3. 네이버 지도 JavaScript API v3

### API 키 발급

네이버 클라우드 플랫폼(https://www.ncloud.com)에서 Application 등록 후 Client ID를 발급받습니다.

```env
# .env.local (Next.js)
NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID=your_naver_client_id

# .env (FastAPI backend)
NAVER_CLIENT_ID=your_naver_client_id
NAVER_CLIENT_SECRET=your_naver_client_secret
```

### Next.js Dynamic Import (SSR 비활성화)

네이버 지도 SDK는 브라우저 전용이므로 `next/dynamic`으로 SSR을 비활성화해야 합니다.

```typescript
// app/components/HospitalMap/index.tsx
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Dynamically import the map component with SSR disabled
const HospitalMapClient = dynamic(
  () => import("./HospitalMapClient"),
  {
    ssr: false,
    loading: () => (
      <Skeleton className="w-full h-[400px] rounded-lg" />
    ),
  }
);

interface HospitalMapProps {
  hospitals: Hospital[];
  userLocation: { lat: number; lng: number };
}

export function HospitalMap({ hospitals, userLocation }: HospitalMapProps) {
  return <HospitalMapClient hospitals={hospitals} userLocation={userLocation} />;
}
```

### 지도 클라이언트 컴포넌트

```typescript
// app/components/HospitalMap/HospitalMapClient.tsx
"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    naver: typeof naver;
  }
}

interface Hospital {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  walk_time?: number;
  phone?: string;
}

interface Props {
  hospitals: Hospital[];
  userLocation: { lat: number; lng: number };
}

export default function HospitalMapClient({ hospitals, userLocation }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<naver.maps.Map | null>(null);

  useEffect(() => {
    // Load Naver Maps script dynamically
    const script = document.createElement("script");
    script.src = `https://openapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${process.env.NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID}&submodules=geocoder`;
    script.async = true;

    script.onload = () => {
      if (!mapRef.current) return;

      // Initialize map centered on user location
      const map = new window.naver.maps.Map(mapRef.current, {
        center: new window.naver.maps.LatLng(
          userLocation.lat,
          userLocation.lng
        ),
        zoom: 14,
        mapTypeId: window.naver.maps.MapTypeId.NORMAL,
      });

      mapInstanceRef.current = map;

      // Add user location marker
      new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(
          userLocation.lat,
          userLocation.lng
        ),
        map,
        icon: {
          content: '<div class="user-marker">나</div>',
          anchor: new window.naver.maps.Point(15, 15),
        },
      });

      // Add hospital markers with info windows
      hospitals.forEach((hospital) => {
        const marker = new window.naver.maps.Marker({
          position: new window.naver.maps.LatLng(
            hospital.latitude,
            hospital.longitude
          ),
          map,
          title: hospital.name,
        });

        const infoWindow = new window.naver.maps.InfoWindow({
          content: `
            <div style="padding: 12px; min-width: 200px;">
              <h4 style="margin: 0 0 4px; font-weight: bold;">${hospital.name}</h4>
              <p style="margin: 0; color: #666; font-size: 12px;">${hospital.address}</p>
              ${hospital.walk_time ? `<p style="margin: 4px 0 0; color: #007AFF;">도보 ${hospital.walk_time}분</p>` : ""}
              ${hospital.phone ? `<p style="margin: 4px 0 0;">${hospital.phone}</p>` : ""}
            </div>
          `,
        });

        // Toggle info window on marker click
        window.naver.maps.Event.addListener(marker, "click", () => {
          if (infoWindow.getMap()) {
            infoWindow.close();
          } else {
            infoWindow.open(map, marker);
          }
        });
      });
    };

    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, [hospitals, userLocation]);

  return <div ref={mapRef} className="w-full h-[400px] rounded-lg" />;
}
```

### Python 백엔드: Geocoding API

```python
# backend/app/services/naver_maps.py
import httpx
import os
from typing import Optional

NAVER_CLIENT_ID = os.environ["NAVER_CLIENT_ID"]
NAVER_CLIENT_SECRET = os.environ["NAVER_CLIENT_SECRET"]

GEOCODING_URL = "https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode"
DIRECTIONS5_URL = "https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving"
DIRECTIONS_TRANSIT_URL = "https://naveropenapi.apigw.ntruss.com/map-direction-15/v1/transit"


async def geocode_address(address: str) -> Optional[dict]:
    """
    Convert Korean address string to latitude/longitude using Naver Geocoding API.
    Returns dict with lat/lng or None if not found.
    """
    headers = {
        "X-NCP-APIGW-API-KEY-ID": NAVER_CLIENT_ID,
        "X-NCP-APIGW-API-KEY": NAVER_CLIENT_SECRET,
    }
    params = {"query": address}

    async with httpx.AsyncClient() as client:
        response = await client.get(
            GEOCODING_URL,
            headers=headers,
            params=params,
            timeout=10.0,
        )
        response.raise_for_status()
        data = response.json()

    if data.get("status") != "OK" or not data.get("addresses"):
        return None

    first = data["addresses"][0]
    return {
        "latitude": float(first["y"]),
        "longitude": float(first["x"]),
        "road_address": first.get("roadAddress", ""),
        "jibun_address": first.get("jibunAddress", ""),
    }


async def get_travel_time_driving(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
) -> Optional[int]:
    """
    Get driving travel time in minutes using Naver Directions 5 API.
    Returns travel time in minutes or None on failure.
    """
    headers = {
        "X-NCP-APIGW-API-KEY-ID": NAVER_CLIENT_ID,
        "X-NCP-APIGW-API-KEY": NAVER_CLIENT_SECRET,
    }
    params = {
        "start": f"{origin_lng},{origin_lat}",
        "goal": f"{dest_lng},{dest_lat}",
        "option": "traoptimal",
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(
            DIRECTIONS5_URL,
            headers=headers,
            params=params,
            timeout=10.0,
        )
        if response.status_code != 200:
            return None

        data = response.json()

    try:
        duration_ms = data["route"]["traoptimal"][0]["summary"]["duration"]
        return round(duration_ms / 60000)   # convert ms to minutes
    except (KeyError, IndexError):
        return None


async def get_walk_time_estimate(distance_meters: float) -> int:
    """
    Estimate walking time from distance (no API call needed).
    Average walking speed: 4 km/h = 67 m/min.
    """
    return round(distance_meters / 67)


async def get_hospital_travel_times(
    hospitals: list[dict],
    origin_lat: float,
    origin_lng: float,
) -> list[dict]:
    """
    Enrich hospital list with estimated travel times.
    Uses driving API for hospitals, estimates walk time from distance.
    Runs requests concurrently using asyncio.gather.
    """
    import asyncio
    from math import radians, cos, sin, asin, sqrt

    def haversine_distance(lat1, lng1, lat2, lng2) -> float:
        """Calculate straight-line distance in meters."""
        R = 6371000  # Earth radius in meters
        phi1, phi2 = radians(lat1), radians(lat2)
        dphi = radians(lat2 - lat1)
        dlambda = radians(lng2 - lng1)
        a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlambda / 2) ** 2
        return R * 2 * asin(sqrt(a))

    async def enrich_hospital(hospital: dict) -> dict:
        dist = haversine_distance(
            origin_lat, origin_lng,
            hospital["latitude"], hospital["longitude"],
        )
        hospital["distance_meters"] = round(dist)
        hospital["walk_time"] = await get_walk_time_estimate(dist)

        # Only fetch driving time for hospitals within 20km
        if dist <= 20000:
            drive_time = await get_travel_time_driving(
                origin_lat, origin_lng,
                hospital["latitude"], hospital["longitude"],
            )
            hospital["drive_time"] = drive_time

        return hospital

    # Run all enrichments concurrently
    enriched = await asyncio.gather(
        *[enrich_hospital(h) for h in hospitals],
        return_exceptions=True,
    )

    # Filter out failed enrichments
    return [h for h in enriched if isinstance(h, dict)]
```

---

## 4. HIRA 심평원 공공데이터 API

### API 키 발급

공공데이터포털(https://www.data.go.kr)에서 "건강보험심사평가원_병원 정보 서비스" 신청 후 API 키를 발급받습니다.

```env
HIRA_API_KEY=your_hira_api_key_here
```

### 진료과 코드 매핑

```python
# backend/app/services/hira_constants.py

DEPARTMENT_CODE_MAP = {
    "내과": "01",
    "신경과": "02",
    "정신건강의학과": "03",
    "외과": "04",
    "정형외과": "05",
    "신경외과": "06",
    "심장혈관흉부외과": "07",
    "성형외과": "08",
    "마취통증의학과": "09",
    "산부인과": "10",
    "소아청소년과": "11",
    "안과": "12",
    "이비인후과": "13",
    "피부과": "14",
    "비뇨의학과": "15",
    "영상의학과": "16",
    "방사선종양학과": "17",
    "병리과": "18",
    "진단검사의학과": "19",
    "재활의학과": "20",
    "핵의학과": "21",
    "가정의학과": "22",
    "응급의학과": "23",
    "직업환경의학과": "24",
    "치과": "49",
    "한방내과": "80",
}


def get_department_code(department_name: str) -> str:
    """
    Convert Korean department name to HIRA department code.
    Returns '22' (가정의학과) as default fallback.
    """
    return DEPARTMENT_CODE_MAP.get(department_name, "22")
```

### 병원 검색 서비스

```python
# backend/app/services/hira.py
import httpx
import os
import xml.etree.ElementTree as ET
from typing import Optional
from .hira_constants import get_department_code

HIRA_API_KEY = os.environ["HIRA_API_KEY"]
HIRA_BASE_URL = "https://apis.data.go.kr/B551182/MedicalClinicAPI"

# Endpoint for nearby hospital search
HOSPITAL_SEARCH_ENDPOINT = f"{HIRA_BASE_URL}/getMedClinicInfoInGeoInfo"


async def search_hospitals(
    department: str,
    latitude: float,
    longitude: float,
    radius: int = 3000,
    max_results: int = 20,
) -> list[dict]:
    """
    Search nearby hospitals using HIRA public data API.

    Args:
        department: Korean department name (e.g., "내과")
        latitude: User latitude (WGS84)
        longitude: User longitude (WGS84)
        radius: Search radius in meters (default 3km)
        max_results: Maximum number of results to return

    Returns:
        List of hospital dicts with name, address, location, phone, etc.
    """
    dept_code = get_department_code(department)

    params = {
        "serviceKey": HIRA_API_KEY,     # API key as query parameter (no encoding needed)
        "pageNo": "1",
        "numOfRows": str(max_results),
        "WGS84_LAT": str(latitude),
        "WGS84_LON": str(longitude),
        "radius": str(radius),
        "dgsbjtCd": dept_code,          # department code filter
        "_type": "json",                # request JSON response
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(
            HOSPITAL_SEARCH_ENDPOINT,
            params=params,
            timeout=15.0,
        )
        response.raise_for_status()

    data = response.json()

    # Navigate HIRA response structure
    try:
        items = data["response"]["body"]["items"]["item"]
        if isinstance(items, dict):
            items = [items]     # single result returned as dict, not list
    except (KeyError, TypeError):
        return []

    hospitals = []
    for item in items:
        hospital = {
            "id": item.get("ykiho", ""),            # 요양기관기호 (unique ID)
            "name": item.get("clnNm", ""),          # 기관명
            "address": item.get("addr", ""),         # 주소
            "phone": item.get("telno", ""),          # 전화번호
            "latitude": float(item.get("YPos", 0)), # 위도
            "longitude": float(item.get("XPos", 0)),# 경도
            "type": item.get("clCd", ""),           # 기관 종별 코드
            "type_name": item.get("clCdNm", ""),    # 기관 종별명 (의원/병원/종합병원 등)
            "departments": item.get("dgsbjtCdNm", "").split(","),  # 진료과목
        }
        hospitals.append(hospital)

    return hospitals


async def get_hospital_detail(hospital_id: str) -> Optional[dict]:
    """
    Fetch detailed information for a specific hospital by ID (ykiho).
    """
    detail_endpoint = f"{HIRA_BASE_URL}/getMedClinicInfo"

    params = {
        "serviceKey": HIRA_API_KEY,
        "ykiho": hospital_id,
        "_type": "json",
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(
            detail_endpoint,
            params=params,
            timeout=10.0,
        )
        if response.status_code != 200:
            return None

    data = response.json()

    try:
        item = data["response"]["body"]["items"]["item"]
        return {
            "id": item.get("ykiho"),
            "name": item.get("clnNm"),
            "address": item.get("addr"),
            "phone": item.get("telno"),
            "website": item.get("hospUrl"),
            "weekday_hours": item.get("lunchWeek"),
            "saturday_hours": item.get("trmtSatStart"),
            "emergency_24h": item.get("emyDayYn") == "Y",
        }
    except (KeyError, TypeError):
        return None
```

### 병원 검색 FastAPI 라우터

```python
# backend/app/routers/hospitals.py
from fastapi import APIRouter, Query, HTTPException
from ..services.hira import search_hospitals, get_hospital_detail
from ..services.naver_maps import get_hospital_travel_times

router = APIRouter(prefix="/api/hospitals", tags=["hospitals"])


@router.get("/search")
async def hospital_search(
    department: str = Query(..., description="진료과 (예: 내과, 정형외과)"),
    lat: float = Query(..., description="위도 (WGS84)"),
    lng: float = Query(..., description="경도 (WGS84)"),
    radius: int = Query(3000, ge=500, le=10000, description="검색 반경 (미터)"),
):
    """
    Search nearby hospitals by department and location.
    Enriches results with travel time from Naver Maps.
    """
    hospitals = await search_hospitals(
        department=department,
        latitude=lat,
        longitude=lng,
        radius=radius,
    )

    if not hospitals:
        return {"hospitals": [], "total": 0}

    # Enrich with travel times
    enriched = await get_hospital_travel_times(
        hospitals=hospitals,
        origin_lat=lat,
        origin_lng=lng,
    )

    # Sort by walking distance
    enriched.sort(key=lambda h: h.get("distance_meters", float("inf")))

    return {
        "hospitals": enriched[:10],     # return top 10
        "total": len(enriched),
        "search_params": {
            "department": department,
            "radius": radius,
        },
    }


@router.get("/{hospital_id}")
async def hospital_detail(hospital_id: str):
    """Fetch detailed info for a single hospital."""
    detail = await get_hospital_detail(hospital_id)
    if not detail:
        raise HTTPException(status_code=404, detail="병원 정보를 찾을 수 없습니다.")
    return detail
```

---

## 5. FastAPI + Next.js CORS 설정

### FastAPI CORS 미들웨어

```python
# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

app = FastAPI(
    title="건강 상담 어시스턴트 API",
    version="1.0.0",
)

# Allowed origins: Next.js dev server and production domain
ALLOWED_ORIGINS = [
    "http://localhost:3000",        # Next.js dev server
    "http://localhost:3001",        # alternative dev port
    os.environ.get("FRONTEND_URL", "https://your-domain.com"),
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
        "Cache-Control",    # required for SSE connections
    ],
    expose_headers=["Content-Type"],    # expose for SSE clients
)


# Register routers
from .routers import chat, hospitals

app.include_router(chat.router)
app.include_router(hospitals.router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
```

### 환경 변수 전체 목록

```env
# backend/.env

# Google AI
GOOGLE_API_KEY=your_google_api_key

# Supabase (PostgresSaver checkpointer)
SUPABASE_DB_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres

# Naver Maps (backend REST API)
NAVER_CLIENT_ID=your_naver_client_id
NAVER_CLIENT_SECRET=your_naver_client_secret

# HIRA Public Data API
HIRA_API_KEY=your_hira_api_key

# CORS
FRONTEND_URL=https://your-production-domain.com
```

```env
# frontend/.env.local

# Naver Maps (browser SDK)
NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID=your_naver_client_id

# FastAPI backend URL
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### Next.js SSE 클라이언트 훅

```typescript
// app/hooks/useHealthChat.ts
"use client";

import { useState, useCallback, useRef } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface UseHealthChatOptions {
  conversationId: string;
  onToken?: (token: string) => void;
  onComplete?: (fullResponse: string) => void;
}

export function useHealthChat({
  conversationId,
  onToken,
  onComplete,
}: UseHealthChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (userMessage: string) => {
      // Add user message immediately
      setMessages((prev) => [
        ...prev,
        { role: "user", content: userMessage },
      ]);
      setIsStreaming(true);
      setError(null);

      // Cancel any existing stream
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      let assistantContent = "";

      // Add empty assistant message to update in-place
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "" },
      ]);

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
        const params = new URLSearchParams({ message: userMessage });
        const url = `${apiUrl}/api/chat/stream/${conversationId}?${params}`;

        const response = await fetch(url, {
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) throw new Error("No response body");

        // Read SSE stream
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            const event = JSON.parse(jsonStr);

            if (event.type === "token") {
              assistantContent += event.content;
              onToken?.(event.content);

              // Update the last (assistant) message in-place
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                };
                return updated;
              });
            } else if (event.type === "done") {
              onComplete?.(assistantContent);
              break;
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "알 수 없는 오류");
      } finally {
        setIsStreaming(false);
      }
    },
    [conversationId, onToken, onComplete]
  );

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, error, sendMessage, stopStreaming };
}
```

### Next.js 프록시 설정 (선택사항)

CORS 문제를 완전히 우회하려면 Next.js rewrites를 활용합니다.

```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        // Proxy /api/* to FastAPI backend (avoids CORS in development)
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
```

---

## 주요 패키지 버전 요구사항

| 패키지 | 버전 | 비고 |
|--------|------|------|
| `langchain-google-genai` | `>=2.0.0` | Gemini 2.0 지원 |
| `langgraph` | `>=0.2.0` | `astream_events` v2 지원 |
| `fastapi` | `>=0.115.0` | `StreamingResponse` 안정화 |
| `httpx` | `>=0.27.0` | async HTTP 클라이언트 |
| `psycopg2-binary` | `>=2.9.0` | PostgresSaver 의존성 |
| `next` | `15.x` | App Router |
| `typescript` | `>=5.0` | - |

---

## 트러블슈팅

### Gemini: "convert_system_message_to_human" 오류
Gemini API는 시스템 메시지를 직접 지원하지 않습니다. `ChatGoogleGenerativeAI` 초기화 시 반드시 `convert_system_message_to_human=True`를 설정하세요.

### HIRA API: "SERVICE_ACCESS_DENIED_ERROR"
`serviceKey` 파라미터는 URL 인코딩 없이 원본 키를 사용해야 합니다. `httpx`의 `params=` 딕셔너리에 직접 전달하면 자동 인코딩되어 오류가 발생할 수 있습니다. 이 경우 `params`를 문자열로 수동 구성하거나 `urllib.parse.urlencode(..., quote_via=urllib.parse.quote)`를 사용하세요.

### 네이버 지도: "Uncaught ReferenceError: naver is not defined"
지도 SDK 스크립트 로드 전에 `window.naver`에 접근하지 마세요. 반드시 `script.onload` 콜백 내에서 지도를 초기화하세요.

### SSE: 브라우저에서 스트림이 끊기는 경우
Nginx/Apache 역방향 프록시를 사용하는 경우 버퍼링을 비활성화해야 합니다. FastAPI 응답 헤더에 `X-Accel-Buffering: no`를 추가하거나 Nginx 설정에서 `proxy_buffering off;`를 설정하세요.

### PostgresSaver: "table does not exist"
`checkpointer.setup()`을 반드시 한 번 실행해야 합니다. Supabase에서는 SQL Editor로 직접 실행하거나 앱 시작 시 자동 실행되도록 설정하세요.
