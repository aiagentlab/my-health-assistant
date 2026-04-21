-- ============================================================
-- MedQA + KorMedMCQA 의료 지식 RAG 테이블
-- Migration: 003_medical_knowledge.sql
-- Created: 2026-03-25
-- Description:
--   MedQA 교과서/문제, KorMedMCQA 국가고시 문제 등 의료 지식 청크를
--   벡터 임베딩과 함께 저장하는 테이블. pgvector 코사인 유사도 검색 지원.
-- ============================================================


-- ============================================================
-- 1. 의료 지식 테이블
-- ============================================================
CREATE TABLE medical_knowledge (
    id         UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    content    TEXT         NOT NULL,                          -- 지식 청크 (질문+답변, 교과서 단락 등)
    embedding  VECTOR(768),                                   -- Google embedding-001 벡터
    source     VARCHAR(50)  NOT NULL,                          -- 'kormedmcqa' | 'medqa_textbook' | 'medqa_question'
    language   VARCHAR(5)   NOT NULL DEFAULT 'ko',             -- 'ko' | 'en' | 'zh'
    category   VARCHAR(100),                                   -- 과목/분야 (내과학, 외과학 등)
    metadata   JSONB        DEFAULT '{}',                      -- 추가 메타데이터 (year, exam_type 등)
    created_at TIMESTAMPTZ  DEFAULT NOW()
);

COMMENT ON TABLE  medical_knowledge           IS 'MedQA/KorMedMCQA 기반 의료 지식 RAG 테이블';
COMMENT ON COLUMN medical_knowledge.source    IS 'kormedmcqa | medqa_textbook | medqa_question';
COMMENT ON COLUMN medical_knowledge.language  IS 'ko(한국어), en(영어), zh(중국어)';
COMMENT ON COLUMN medical_knowledge.category  IS '의료 과목/분야 분류';
COMMENT ON COLUMN medical_knowledge.metadata  IS '출처별 추가 메타: year, exam_type, has_cot 등';


-- ============================================================
-- 2. 인덱스
-- ============================================================

-- IVFFlat 벡터 유사도 검색 인덱스
CREATE INDEX idx_medical_knowledge_embedding
    ON medical_knowledge
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- 소스 필터 인덱스
CREATE INDEX idx_medical_knowledge_source
    ON medical_knowledge (source);

-- 언어 필터 인덱스
CREATE INDEX idx_medical_knowledge_language
    ON medical_knowledge (language);

-- 소스+언어 복합 인덱스
CREATE INDEX idx_medical_knowledge_source_language
    ON medical_knowledge (source, language);


-- ============================================================
-- 3. RLS 정책 — 공개 읽기 전용
-- ============================================================
ALTER TABLE medical_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read medical_knowledge"
    ON medical_knowledge FOR SELECT
    USING (true);


-- ============================================================
-- 4. 벡터 유사도 검색 RPC 함수
--    언어/소스 필터 지원
-- ============================================================
CREATE OR REPLACE FUNCTION match_medical_knowledge(
    query_embedding  VECTOR(768),
    match_threshold  FLOAT DEFAULT 0.65,
    match_count      INT   DEFAULT 5,
    filter_language   TEXT  DEFAULT NULL,
    filter_source     TEXT  DEFAULT NULL
)
RETURNS TABLE (
    id         UUID,
    content    TEXT,
    source     TEXT,
    language   TEXT,
    category   TEXT,
    metadata   JSONB,
    similarity FLOAT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        mk.id,
        mk.content,
        mk.source::TEXT,
        mk.language::TEXT,
        mk.category::TEXT,
        mk.metadata,
        (1 - (mk.embedding <=> query_embedding))::FLOAT AS similarity
    FROM medical_knowledge mk
    WHERE mk.embedding IS NOT NULL
      AND (1 - (mk.embedding <=> query_embedding)) >= match_threshold
      AND (filter_language IS NULL OR mk.language = filter_language)
      AND (filter_source IS NULL OR mk.source = filter_source)
    ORDER BY mk.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_medical_knowledge(VECTOR(768), FLOAT, INT, TEXT, TEXT) IS
    '의료 지식 벡터 유사도 검색. '
    'filter_language/filter_source로 소스·언어별 필터링 가능.';
