# RAG 구현 가이드

## 아키텍처 개요

```
사용자 증상 입력
  → screening_agent (5단계 문진)
  → diagnosis_agent
      → retrieve_relevant_context() 호출
         → Google Embedding (gemini-embedding-001, 3072차원)
         → PostgreSQL pgvector: symptoms 테이블 벡터 검색
         → PostgreSQL: symptom_department_mapping → departments 조인
         → PostgreSQL pgvector: medical_knowledge 테이블 벡터 검색
      → 검색 결과를 Gemini Flash 프롬프트에 주입
      → LLM이 DB 근거 + 임상 판단 종합
  → 진료과 추천 결과 (RAG 근거 포함)
```

## 기술 스택

| 구성요소 | 기술 |
|----------|------|
| 벡터 DB | PostgreSQL 17 + pgvector 0.8.2 |
| 임베딩 모델 | Google `gemini-embedding-001` (3072차원) |
| LLM | Google `gemini-2.5-flash` |
| 프레임워크 | LangChain + LangGraph |
| DB 클라이언트 | psycopg2 |

## 데이터베이스 스키마

### 기존 테이블 (시드 데이터)

**symptoms** — 10개 증상
```
id, name_ko, name_en, category, body_part, keywords[], emergency_flag, embedding VECTOR(3072)
```

**departments** — 14개 진료과
```
id, code (D001~D014), name_ko, name_en, description, hira_code
```

**symptom_department_mapping** — 16개 매핑
```
symptom_id, department_id, priority (1순위/2순위), confidence (0.0~1.0), urgency, notes
```

### RAG 지식 테이블

**medical_knowledge** — 의학 지식 청크
```
id, content (TEXT), embedding VECTOR(3072), source, language, category, metadata (JSONB)
```

source 값: `kormedmcqa` | `medqa_textbook` | `medqa_question`

## RAG 검색 파이프라인

### 1단계: 쿼리 구성
```python
query_text = chief_complaint + body_part + accompanying_symptoms
# 예: "두통 머리 어지러움"
```

### 2단계: 임베딩 생성
```python
embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")
query_vector = embeddings.embed_query(query_text)  # → 3072차원 벡터
```

### 3단계: 3중 검색
1. **symptoms 벡터 검색** — 코사인 유사도 >= 0.7, 상위 5개
2. **진료과 매핑 조회** — 매칭된 증상 ID로 JOIN
3. **medical_knowledge 벡터 검색** — 코사인 유사도 >= 0.65, 상위 5개

### 4단계: 컨텍스트 포맷팅
```
## 유사 증상 검색 결과
- 두통 (분류: 두통, 부위: 머리, 유사도: 0.85)

## 추천 진료과
- [1순위] 신경과 (코드: D004, 신뢰도: 0.85, 긴급도: 일반)

## 의학 지식 참고
- [한국의학시험, 유사도:0.78] Question: 45세 여자가 어지럼 때문에...
```

### 5단계: LLM 프롬프트 주입
```
문진 결과: ...
RAG 참고 컨텍스트:
{context_text}
위 RAG 결과를 참고하되, 사용자 문진 정보와 임상적 타당성을 우선하여 최종 추천을 생성하세요.
```

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `backend/app/services/rag_retriever.py` | RAG 검색 엔진 (임베딩 + 벡터 검색 + 포맷팅) |
| `backend/app/agents/diagnosis_agent.py` | RAG 호출 → LLM 프롬프트 주입 → 진료과 추천 |
| `backend/app/agents/screening_agent.py` | state.rag_context를 참고하여 문진 질문 강화 |
| `backend/app/state.py` | `rag_context: NotRequired[dict]` 필드 |
| `backend/supabase/migrations/002_pgvector_embeddings.sql` | symptoms 벡터 검색 함수 |
| `backend/supabase/migrations/003_medical_knowledge.sql` | knowledge 테이블 + 벡터 검색 함수 |

## Fallback 전략

RAG 실패 시 (DB 미연결, 임베딩 에러 등) 기존 LLM-only 방식으로 자동 fallback:
- `retrieve_relevant_context()` → except → 빈 context 반환
- `diagnosis_agent.py` → `rag_prompt_block = ""` → 프롬프트에 RAG 없이 진행
- 사용자 경험에 영향 없음

## 프론트엔드 RAG 표시

S03 Recommendation 화면에서 "AI 분석 근거 보기" Accordion:
- DB 유사 증상 매칭 (Chip 형태)
- 관련 의학 지식 (KorMedMCQA 문제/해설)
- DB 추천 진료과 (우선순위/신뢰도/긴급도)

## 환경변수

```env
DATABASE_URL=postgresql://user@localhost:5432/health_assistant
GOOGLE_API_KEY=...  # Gemini Flash + Embedding 모두 사용
```
