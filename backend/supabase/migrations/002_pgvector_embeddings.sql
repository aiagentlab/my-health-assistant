-- ============================================================
-- pgvector 임베딩 마이그레이션
-- Migration: 002_pgvector_embeddings.sql
-- Created: 2026-03-24
-- Description:
--   pgvector 확장 활성화, 증상 테이블에 벡터 임베딩 컬럼 추가,
--   코사인 유사도 기반 증상 검색 함수 및 증상-진료과 매핑 조회 함수 생성
-- ============================================================


-- ============================================================
-- 1. pgvector 확장 활성화
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;


-- ============================================================
-- 2. 증상 테이블에 임베딩 컬럼 추가
--    Google Embedding (models/embedding-001) 차원: 768
-- ============================================================
ALTER TABLE symptoms
    ADD COLUMN IF NOT EXISTS embedding VECTOR(768);

COMMENT ON COLUMN symptoms.embedding IS
    'Google Generative AI embedding-001 모델로 생성된 768차원 벡터. '
    'name_ko + keywords를 결합하여 생성.';


-- ============================================================
-- 3. 벡터 유사도 검색용 인덱스 (IVFFlat)
--    데이터가 적을 때는 순차 스캔이 빠르지만, 확장성을 위해 생성
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_symptoms_embedding
    ON symptoms
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 10);


-- ============================================================
-- 4. 코사인 유사도 기반 증상 검색 함수
--    query_embedding과 가장 유사한 증상을 match_count개 반환
--    similarity = 1 - cosine_distance (1에 가까울수록 유사)
-- ============================================================
CREATE OR REPLACE FUNCTION match_symptoms(
    query_embedding VECTOR(768),
    match_threshold FLOAT DEFAULT 0.7,
    match_count     INT   DEFAULT 5
)
RETURNS TABLE (
    id             UUID,
    name_ko        TEXT,
    category       TEXT,
    body_part      TEXT,
    keywords       TEXT[],
    emergency_flag BOOLEAN,
    similarity     FLOAT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.name_ko::TEXT,
        s.category::TEXT,
        s.body_part::TEXT,
        s.keywords,
        s.emergency_flag,
        (1 - (s.embedding <=> query_embedding))::FLOAT AS similarity
    FROM symptoms s
    WHERE s.embedding IS NOT NULL
      AND (1 - (s.embedding <=> query_embedding)) >= match_threshold
    ORDER BY s.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_symptoms(VECTOR(768), FLOAT, INT) IS
    '코사인 유사도 기반 증상 벡터 검색. '
    'match_threshold 이상의 유사도를 가진 증상을 match_count개 반환.';


-- ============================================================
-- 5. 증상 ID 배열로 진료과 매핑 조회 함수
--    match_symptoms 결과의 증상 ID들로 추천 진료과를 조회
-- ============================================================
CREATE OR REPLACE FUNCTION get_departments_for_symptoms(
    symptom_ids UUID[]
)
RETURNS TABLE (
    symptom_id      UUID,
    symptom_name    TEXT,
    department_id   UUID,
    department_code TEXT,
    department_name TEXT,
    priority        INT,
    confidence      FLOAT,
    urgency         TEXT,
    notes           TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        sdm.symptom_id,
        s.name_ko::TEXT              AS symptom_name,
        sdm.department_id,
        dep.code::TEXT               AS department_code,
        dep.name_ko::TEXT            AS department_name,
        sdm.priority,
        sdm.confidence,
        sdm.urgency::TEXT,
        sdm.notes::TEXT
    FROM symptom_department_mapping sdm
    JOIN symptoms    s   ON s.id   = sdm.symptom_id
    JOIN departments dep ON dep.id = sdm.department_id
    WHERE sdm.symptom_id = ANY(symptom_ids)
    ORDER BY sdm.priority ASC, sdm.confidence DESC;
END;
$$;

COMMENT ON FUNCTION get_departments_for_symptoms(UUID[]) IS
    '증상 ID 배열에 대한 추천 진료과 목록을 우선순위/신뢰도 순으로 반환. '
    'match_symptoms 함수 결과와 함께 사용하여 RAG 파이프라인 구성.';
