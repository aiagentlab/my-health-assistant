"""RAG Retriever — 증상 벡터 유사도 검색 + 진료과 매핑 + 의학 지식 검색

Google Generative AI Embeddings로 쿼리 벡터를 생성하고,
PostgreSQL pgvector (로컬 또는 Supabase)에서 유사도 검색을 수행하여
LLM 프롬프트에 주입할 컨텍스트를 구성한다.
"""
import os
import json
import logging
from typing import Any

import psycopg2
from langchain_google_genai import GoogleGenerativeAIEmbeddings

logger = logging.getLogger(__name__)

_conn = None
_embeddings: GoogleGenerativeAIEmbeddings | None = None


def _get_conn():
    """로컬 PostgreSQL 연결 (DATABASE_URL 사용)"""
    global _conn
    if _conn is None or _conn.closed:
        db_url = os.environ.get("DATABASE_URL", "")
        if not db_url:
            raise RuntimeError("DATABASE_URL 환경변수가 설정되지 않았습니다.")
        _conn = psycopg2.connect(db_url)
        _conn.autocommit = True
    return _conn


def _get_embeddings() -> GoogleGenerativeAIEmbeddings:
    global _embeddings
    if _embeddings is None:
        _embeddings = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001",
        )
    return _embeddings


def _build_query_text(
    chief_complaint: str,
    body_part: str = "",
    accompanying_symptoms: list[str] | None = None,
) -> str:
    """검색 쿼리 텍스트 구성: 주 호소 + 부위 + 동반 증상"""
    parts = [chief_complaint]
    if body_part:
        parts.append(body_part)
    if accompanying_symptoms:
        parts.extend(accompanying_symptoms)
    return " ".join(parts)


def _match_symptoms(query_vector: list[float], threshold: float = 0.7, count: int = 5) -> list[dict]:
    """symptoms 테이블에서 벡터 유사도 검색"""
    try:
        conn = _get_conn()
        cur = conn.cursor()
        vector_str = "[" + ",".join(str(v) for v in query_vector) + "]"
        cur.execute("""
            SELECT id, name_ko, category, body_part, keywords, emergency_flag,
                   (1 - (embedding <=> %s::vector)) AS similarity
            FROM symptoms
            WHERE embedding IS NOT NULL
              AND (1 - (embedding <=> %s::vector)) >= %s
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        """, (vector_str, vector_str, threshold, vector_str, count))
        rows = cur.fetchall()
        cur.close()
        return [
            {
                "id": str(row[0]),
                "name_ko": row[1],
                "category": row[2],
                "body_part": row[3],
                "keywords": row[4] or [],
                "emergency_flag": row[5],
                "similarity": float(row[6]),
            }
            for row in rows
        ]
    except Exception as e:
        logger.warning("Symptom search failed (non-fatal): %s", e)
        return []


def _get_departments_for_symptoms(symptom_ids: list[str]) -> list[dict]:
    """증상 ID 목록으로 추천 진료과 매핑 조회"""
    if not symptom_ids:
        return []
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT sdm.symptom_id, s.name_ko, sdm.department_id,
                   dep.code, dep.name_ko, sdm.priority, sdm.confidence,
                   sdm.urgency, sdm.notes
            FROM symptom_department_mapping sdm
            JOIN symptoms s ON s.id = sdm.symptom_id
            JOIN departments dep ON dep.id = sdm.department_id
            WHERE sdm.symptom_id = ANY(%s::uuid[])
            ORDER BY sdm.priority ASC, sdm.confidence DESC
        """, (symptom_ids,))
        rows = cur.fetchall()
        cur.close()
        return [
            {
                "symptom_id": str(row[0]),
                "symptom_name": row[1],
                "department_id": str(row[2]),
                "department_code": row[3],
                "department_name": row[4],
                "priority": row[5],
                "confidence": float(row[6]),
                "urgency": row[7],
                "notes": row[8],
            }
            for row in rows
        ]
    except Exception as e:
        logger.warning("Department lookup failed (non-fatal): %s", e)
        return []


def _search_knowledge_base(
    query_vector: list[float],
    threshold: float = 0.65,
    count: int = 5,
) -> list[dict[str, Any]]:
    """medical_knowledge 테이블에서 벡터 유사도 검색 (non-fatal)"""
    try:
        conn = _get_conn()
        cur = conn.cursor()
        vector_str = "[" + ",".join(str(v) for v in query_vector) + "]"
        cur.execute("""
            SELECT id, content, source, language, category, metadata,
                   (1 - (embedding <=> %s::vector)) AS similarity
            FROM medical_knowledge
            WHERE embedding IS NOT NULL
              AND (1 - (embedding <=> %s::vector)) >= %s
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        """, (vector_str, vector_str, threshold, vector_str, count))
        rows = cur.fetchall()
        cur.close()
        return [
            {
                "id": str(row[0]),
                "content": row[1],
                "source": row[2],
                "language": row[3],
                "category": row[4],
                "metadata": row[5] or {},
                "similarity": float(row[6]),
            }
            for row in rows
        ]
    except Exception as e:
        logger.warning("Knowledge base search failed (non-fatal): %s", e)
        return []


def _format_context_text(
    matched_symptoms: list[dict[str, Any]],
    recommended_departments: list[dict[str, Any]],
) -> str:
    """LLM 프롬프트에 주입할 구조화된 컨텍스트 문자열 생성"""
    lines: list[str] = []

    if matched_symptoms:
        lines.append("## 유사 증상 검색 결과")
        for sym in matched_symptoms:
            emergency = " [응급]" if sym.get("emergency_flag") else ""
            similarity = sym.get("similarity", 0)
            lines.append(
                f"- {sym['name_ko']} (분류: {sym.get('category', '-')}, "
                f"부위: {sym.get('body_part', '-')}, "
                f"유사도: {similarity:.2f}){emergency}"
            )

    if recommended_departments:
        lines.append("")
        lines.append("## 추천 진료과")
        for dept in recommended_departments:
            lines.append(
                f"- [{dept['priority']}순위] {dept['department_name']} "
                f"(코드: {dept['department_code']}, "
                f"신뢰도: {dept['confidence']:.2f}, "
                f"긴급도: {dept['urgency']})"
            )
            if dept.get("notes"):
                lines.append(f"  참고: {dept['notes']}")

    return "\n".join(lines) if lines else ""


def _format_knowledge_context(chunks: list[dict[str, Any]]) -> str:
    """의학 지식 검색 결과를 LLM 참고 컨텍스트 문자열로 변환"""
    if not chunks:
        return ""

    source_labels = {
        "kormedmcqa": "한국의학시험",
        "medqa_textbook": "의학교과서",
        "medqa_question": "USMLE",
    }

    lines = ["## 의학 지식 참고"]
    for chunk in chunks:
        source = source_labels.get(chunk.get("source"), chunk.get("source", "unknown"))
        similarity = float(chunk.get("similarity", 0))
        content = str(chunk.get("content", ""))[:500]
        lines.append(f"- [{source}, 유사도:{similarity:.2f}] {content}")

    return "\n".join(lines)


async def retrieve_relevant_context(
    chief_complaint: str,
    body_part: str = "",
    accompanying_symptoms: list[str] | None = None,
    match_threshold: float = 0.7,
    match_count: int = 5,
) -> dict[str, Any]:
    """
    RAG 컨텍스트 검색 메인 함수

    1. 쿼리 텍스트 → Google Embedding 벡터 생성
    2. PostgreSQL pgvector: 증상 유사도 검색
    3. PostgreSQL: 진료과 매핑 조회
    4. PostgreSQL pgvector: 의학 지식 검색
    5. 구조화된 컨텍스트 반환
    """
    empty_result: dict[str, Any] = {
        "matched_symptoms": [],
        "recommended_departments": [],
        "knowledge_chunks": [],
        "context_text": "",
    }

    try:
        # 1. 쿼리 텍스트 구성
        query_text = _build_query_text(
            chief_complaint, body_part, accompanying_symptoms
        )
        if not query_text.strip():
            return empty_result

        # 2. 임베딩 생성
        embeddings = _get_embeddings()
        query_vector = embeddings.embed_query(query_text)

        # 3. 증상 벡터 유사도 검색
        matched_symptoms = _match_symptoms(query_vector, match_threshold, match_count)

        # 4. 매칭된 증상 ID로 진료과 매핑 조회
        recommended_departments = []
        if matched_symptoms:
            symptom_ids = [s["id"] for s in matched_symptoms]
            recommended_departments = _get_departments_for_symptoms(symptom_ids)

        # 5. 의학 지식 청크 검색
        knowledge_chunks = _search_knowledge_base(query_vector, threshold=0.65, count=5)

        # 6. 컨텍스트 텍스트 구성
        context_text = _format_context_text(matched_symptoms, recommended_departments)
        if knowledge_chunks:
            context_text += ("\n\n" if context_text else "") + _format_knowledge_context(knowledge_chunks)

        return {
            "matched_symptoms": matched_symptoms,
            "recommended_departments": recommended_departments,
            "knowledge_chunks": knowledge_chunks,
            "context_text": context_text,
        }

    except Exception as e:
        logger.warning("RAG retrieval failed (non-fatal): %s", e, exc_info=True)
        return empty_result
