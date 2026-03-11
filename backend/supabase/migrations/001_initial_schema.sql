-- ============================================================
-- 헬스 상담 어시스턴트 초기 스키마 마이그레이션
-- Migration: 001_initial_schema.sql
-- Created: 2026-03-11
-- Description:
--   증상(symptoms), 진료과(departments), 증상-진료과 매핑
--   (symptom_department_mapping), 상담 세션(consultation_sessions)
--   테이블 생성, RLS 정책, 인덱스, 기초 데이터, TTL 정리 함수 포함
-- ============================================================


-- ============================================================
-- 확장 기능 활성화
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- 1. 증상 테이블 (symptoms)
--    환자가 호소하는 증상 정보를 저장하는 마스터 테이블
-- ============================================================
CREATE TABLE symptoms (
    id             UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    name_ko        VARCHAR(100) NOT NULL,                   -- 증상명 (한국어)
    name_en        VARCHAR(100),                            -- 증상명 (영어)
    category       VARCHAR(50)  NOT NULL,                   -- 증상 분류: '두통', '복통', '흉통', '피부', '관절', '호흡', '신경' 등
    body_part      VARCHAR(50),                             -- 신체 부위: '머리', '가슴', '배', '팔/다리', '피부', '전신'
    keywords       TEXT[]       DEFAULT '{}',               -- 검색용 키워드 배열 (GIN 인덱스 적용)
    emergency_flag BOOLEAN      DEFAULT FALSE,              -- 응급 증상 여부 (TRUE 이면 즉시 응급실 안내)
    created_at     TIMESTAMPTZ  DEFAULT NOW()
);

COMMENT ON TABLE  symptoms               IS '증상 마스터 테이블 — 진료과 매핑의 기준이 되는 증상 목록';
COMMENT ON COLUMN symptoms.category      IS '증상 대분류: 두통/복통/흉통/피부/관절/호흡/신경 중 하나';
COMMENT ON COLUMN symptoms.keywords      IS 'GIN 인덱스를 통한 전문 검색에 활용되는 키워드 배열';
COMMENT ON COLUMN symptoms.emergency_flag IS 'TRUE이면 즉시 응급실 안내 필요';


-- ============================================================
-- 2. 진료과 테이블 (departments)
--    심평원(건강보험심사평가원) 진료과 코드 기반 진료과 목록
-- ============================================================
CREATE TABLE departments (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    code             VARCHAR(10) NOT NULL UNIQUE,           -- 내부 진료과 코드 (D001 등)
    name_ko          VARCHAR(50) NOT NULL,                  -- 진료과명 (한국어): '내과', '외과', '정형외과' 등
    name_en          VARCHAR(50),                           -- 진료과명 (영어)
    description      TEXT,                                  -- 진료과 설명
    typical_symptoms TEXT[]      DEFAULT '{}',              -- 해당 진료과 대표 증상 목록
    hira_code        VARCHAR(10),                           -- 심평원 API 진료과 코드
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE  departments           IS '진료과 마스터 테이블 — 심평원 코드 기반';
COMMENT ON COLUMN departments.code      IS '내부 진료과 식별 코드 (D001, D002, ...)';
COMMENT ON COLUMN departments.hira_code IS '심평원 병원 검색 API 호출 시 사용하는 진료과 코드';


-- ============================================================
-- 3. 증상-진료과 매핑 테이블 (symptom_department_mapping)
--    특정 증상에 대해 추천 진료과를 우선순위/신뢰도/긴급도와 함께 저장
-- ============================================================
CREATE TABLE symptom_department_mapping (
    id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    symptom_id    UUID        NOT NULL REFERENCES symptoms(id) ON DELETE CASCADE,
    department_id UUID        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    priority      INTEGER     NOT NULL DEFAULT 1,           -- 추천 순위: 1=1순위, 2=2순위
    confidence    FLOAT       NOT NULL DEFAULT 0.8,         -- 매핑 신뢰도 (0.0 ~ 1.0)
    urgency       VARCHAR(20) DEFAULT '일반',               -- 긴급도: '일반', '조기방문권장', '응급'
    notes         TEXT,                                     -- 추가 안내 문구
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (symptom_id, department_id, priority)
);

COMMENT ON TABLE  symptom_department_mapping            IS '증상별 추천 진료과 매핑 — 우선순위/신뢰도/긴급도 포함';
COMMENT ON COLUMN symptom_department_mapping.priority   IS '1=1순위 추천, 2=2순위 추천';
COMMENT ON COLUMN symptom_department_mapping.confidence IS '0.0(낮음) ~ 1.0(높음) 범위의 추천 신뢰도';
COMMENT ON COLUMN symptom_department_mapping.urgency    IS '일반 | 조기방문권장 | 응급';


-- ============================================================
-- 4. 상담 세션 테이블 (consultation_sessions)
--    LangGraph 상태 및 문진/진단 결과를 임시 저장 (TTL 24시간)
-- ============================================================
CREATE TABLE consultation_sessions (
    session_id       UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          VARCHAR(255),                          -- Clerk user ID (익명 사용자는 NULL)
    langgraph_state  JSONB       DEFAULT '{}',              -- LangGraph StateGraph 전체 상태 직렬화
    phase            VARCHAR(50) DEFAULT 'onboarding',     -- 현재 상담 단계
                                                           --   onboarding → screening → diagnosis → search → complete
    screening_data   JSONB       DEFAULT '{}',              -- 문진(온보딩) 수집 결과 데이터
    diagnosis_result JSONB       DEFAULT '{}',              -- AI 진단 결과 (추천 진료과 등)
    hospital_results JSONB       DEFAULT '[]',              -- 병원 검색 결과 목록
    emergency_flag   BOOLEAN     DEFAULT FALSE,             -- 응급 상황 여부 플래그
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    expires_at       TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'  -- TTL: 24시간 후 자동 만료
);

COMMENT ON TABLE  consultation_sessions                  IS '상담 세션 임시 저장 테이블 (TTL 24시간). LangGraph 상태 포함.';
COMMENT ON COLUMN consultation_sessions.user_id          IS 'Clerk 인증 user ID. NULL이면 익명 세션.';
COMMENT ON COLUMN consultation_sessions.phase            IS 'onboarding → screening → diagnosis → search → complete';
COMMENT ON COLUMN consultation_sessions.langgraph_state  IS 'LangGraph StateGraph 전체 상태 — 세션 재개(resume) 시 복원에 사용';
COMMENT ON COLUMN consultation_sessions.expires_at       IS '이 시각 이후 세션은 TTL 만료 처리 대상';


-- ============================================================
-- 5. 인덱스
--    쿼리 성능 최적화를 위한 인덱스 정의
-- ============================================================

-- 상담 세션: user_id 기준 조회 (사용자별 세션 목록)
CREATE INDEX idx_consultation_sessions_user_id
    ON consultation_sessions (user_id);

-- 상담 세션: 만료 시각 기준 조회 (TTL 정리 작업용)
CREATE INDEX idx_consultation_sessions_expires_at
    ON consultation_sessions (expires_at);

-- 증상-진료과 매핑: symptom_id 기준 조회
CREATE INDEX idx_symptom_dept_mapping_symptom
    ON symptom_department_mapping (symptom_id);

-- 증상-진료과 매핑: department_id 기준 조회
CREATE INDEX idx_symptom_dept_mapping_dept
    ON symptom_department_mapping (department_id);

-- 증상 키워드: GIN 인덱스 (배열 포함 검색 성능 향상)
CREATE INDEX idx_symptoms_keywords
    ON symptoms USING GIN (keywords);


-- ============================================================
-- 6. Row Level Security (RLS) 정책
--    Supabase 보안 레이어 — 테이블별 접근 제어
-- ============================================================

ALTER TABLE symptoms                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE symptom_department_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_sessions      ENABLE ROW LEVEL SECURITY;

-- 증상 테이블: 누구나 읽기 가능 (공개 참조 데이터)
CREATE POLICY "Public read symptoms"
    ON symptoms FOR SELECT
    USING (true);

-- 진료과 테이블: 누구나 읽기 가능 (공개 참조 데이터)
CREATE POLICY "Public read departments"
    ON departments FOR SELECT
    USING (true);

-- 증상-진료과 매핑 테이블: 누구나 읽기 가능 (공개 참조 데이터)
CREATE POLICY "Public read mappings"
    ON symptom_department_mapping FOR SELECT
    USING (true);

-- 상담 세션: 자신의 세션만 전체 접근 가능
--   - 로그인 사용자: auth.uid()::text = user_id 인 레코드만 허용
--   - 익명 세션:    user_id IS NULL 인 레코드 접근 허용
--   - 백엔드 서비스(service_role): RLS 우회하여 전체 접근 가능
CREATE POLICY "Users access own sessions"
    ON consultation_sessions FOR ALL
    USING (auth.uid()::text = user_id OR user_id IS NULL);


-- ============================================================
-- 7. TTL 자동 정리 함수
--    만료된 상담 세션을 삭제하는 함수
--    pg_cron 또는 Supabase Scheduled Functions 으로 주기 호출
-- ============================================================
CREATE OR REPLACE FUNCTION delete_expired_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- service_role 권한으로 실행하여 RLS 우회
AS $$
BEGIN
    DELETE FROM consultation_sessions
    WHERE expires_at < NOW();
END;
$$;

COMMENT ON FUNCTION delete_expired_sessions() IS
    '만료된 상담 세션 정리 함수. '
    'pg_cron 등록 예시: '
    'SELECT cron.schedule(''cleanup-sessions'', ''0 * * * *'', ''SELECT delete_expired_sessions()'');';

-- pg_cron 사용 시 아래 주석 해제하여 매 정각 실행 등록:
-- SELECT cron.schedule('cleanup-sessions', '0 * * * *', 'SELECT delete_expired_sessions()');


-- ============================================================
-- 8. 기초 데이터 (Seed Data)
--    PRD §3.4 진료과 매핑 기반 초기 데이터
-- ============================================================

-- ----------------------------------------------------------
-- 8-1. 진료과 데이터 삽입 (14개 진료과)
-- ----------------------------------------------------------
INSERT INTO departments (code, name_ko, name_en, description, hira_code) VALUES
    ('D001', '내과',           'Internal Medicine',       '발열, 감기, 만성 질환 등 일반 내과 질환 진료',                         'D001'),
    ('D002', '외과',           'General Surgery',         '외상, 복부 수술, 소화기계 수술적 치료',                                'D002'),
    ('D003', '정형외과',       'Orthopedic Surgery',      '뼈, 관절, 근육, 인대 등 근골격계 질환 및 외상 치료',                   'D003'),
    ('D004', '신경과',         'Neurology',               '두통, 어지럼증, 뇌졸중, 말초신경 질환 등 신경계 질환',                 'D004'),
    ('D005', '피부과',         'Dermatology',             '피부 발진, 아토피, 건선, 피부암 등 피부 질환',                         'D005'),
    ('D006', '이비인후과',     'Otorhinolaryngology',     '귀, 코, 목 질환: 중이염, 비염, 편도염, 이명 등',                       'D006'),
    ('D007', '안과',           'Ophthalmology',           '눈 충혈, 시력 저하, 백내장, 녹내장, 망막 질환 등',                     'D007'),
    ('D008', '비뇨의학과',     'Urology',                 '신장, 방광, 전립선, 요도 등 비뇨기계 질환',                            'D008'),
    ('D009', '산부인과',       'Obstetrics & Gynecology', '여성 생식기 질환, 임신, 출산, 갱년기 관련 진료',                       'D009'),
    ('D010', '소아청소년과',   'Pediatrics',              '영유아부터 청소년까지 성장, 발달, 소아 감염 질환 진료',                 'D010'),
    ('D011', '정신건강의학과', 'Psychiatry',              '우울증, 불안장애, 수면장애, ADHD 등 정신건강 질환',                    'D011'),
    ('D012', '응급의학과',     'Emergency Medicine',      '중증 외상, 심정지, 뇌졸중 등 즉각적 처치가 필요한 응급 상황',          'D012'),
    ('D013', '심장내과',       'Cardiology',              '협심증, 심근경색, 부정맥, 심부전 등 심장 질환',                        'D013'),
    ('D014', '호흡기내과',     'Pulmonology',             '폐렴, 천식, COPD, 기관지염, 호흡곤란 등 호흡기 질환',                  'D014')
ON CONFLICT (code) DO NOTHING;


-- ----------------------------------------------------------
-- 8-2. 증상 데이터 삽입 (10개 주요 증상)
-- ----------------------------------------------------------
INSERT INTO symptoms (name_ko, name_en, category, body_part, keywords, emergency_flag) VALUES
    ('두통',             'Headache',          '두통', '머리',    ARRAY['머리 아픔', '두통', '편두통', '머리 통증', '머리가 아프다', '군발두통'],  FALSE),
    ('흉통',             'Chest Pain',        '흉통', '가슴',    ARRAY['가슴 통증', '흉통', '가슴이 아프다', '심장 통증', '가슴 압박감'],         TRUE),
    ('호흡곤란',         'Dyspnea',           '호흡', '가슴',    ARRAY['숨이 차다', '호흡곤란', '숨쉬기 힘들다', '숨 막힘', '호흡 어려움'],        TRUE),
    ('복통',             'Abdominal Pain',    '복통', '배',      ARRAY['배 아픔', '복통', '배가 아프다', '위통', '장 통증', '복부 통증'],           FALSE),
    ('관절통',           'Joint Pain',        '관절', '팔/다리', ARRAY['관절 통증', '관절이 아프다', '무릎 통증', '어깨 통증', '관절염'],           FALSE),
    ('피부 발진',        'Skin Rash',         '피부', '피부',    ARRAY['피부 발진', '두드러기', '피부 가려움', '피부 트러블', '발진', '두드러기'],   FALSE),
    ('발열',             'Fever',             '발열', '전신',    ARRAY['열', '발열', '고열', '체온 상승', '오한', '미열'],                          FALSE),
    ('기침/가래',        'Cough/Phlegm',      '호흡', '가슴',    ARRAY['기침', '가래', '기침이 난다', '마른기침', '가래가 낀다', '기침 가래'],       FALSE),
    ('눈 충혈/시력저하', 'Eye Redness/Vision Loss', '눈', '머리', ARRAY['눈 충혈', '시력 저하', '눈이 빨갛다', '눈 통증', '시야 흐림', '결막염'],  FALSE),
    ('귀 통증/이명',     'Ear Pain/Tinnitus', '귀',   '머리',    ARRAY['귀 통증', '이명', '귀가 아프다', '귀에서 소리', '중이염', '귀 먹먹함'],     FALSE)
ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------
-- 8-3. 증상-진료과 매핑 삽입
--      WITH 절로 UUID를 이름 기반으로 조회하여 삽입 (하드코딩 UUID 방지)
-- ----------------------------------------------------------
WITH
    s AS (SELECT id, name_ko FROM symptoms),
    d AS (SELECT id, code    FROM departments)

INSERT INTO symptom_department_mapping
    (symptom_id, department_id, priority, confidence, urgency, notes)
SELECT
    s.id,
    d.id,
    m.priority,
    m.confidence,
    m.urgency,
    m.notes
FROM (VALUES
    -- 두통: 신경과(1순위), 내과(2순위)
    ('두통',             'D004', 1, 0.85, '일반',         '반복적이거나 갑작스러운 심한 두통은 신경과 전문의 진료 권장'),
    ('두통',             'D001', 2, 0.65, '일반',         '일반적인 긴장성 두통은 내과에서도 진료 가능'),

    -- 흉통: 심장내과(1순위, 응급), 응급의학과(2순위, 응급)
    ('흉통',             'D013', 1, 0.90, '응급',         '흉통은 심근경색 등 심혈관 응급 징후일 수 있어 즉시 병원 방문 필요'),
    ('흉통',             'D012', 2, 0.88, '응급',         '심장내과 진료가 어려운 경우 응급의학과 즉시 방문'),

    -- 호흡곤란: 호흡기내과(1순위, 응급), 응급의학과(2순위, 응급)
    ('호흡곤란',         'D014', 1, 0.88, '응급',         '갑작스러운 호흡곤란은 폐색전증·천식 발작 등 응급 상황일 수 있음'),
    ('호흡곤란',         'D012', 2, 0.90, '응급',         '심한 호흡곤란 시 즉시 응급실 방문'),

    -- 복통: 내과(1순위), 외과(2순위)
    ('복통',             'D001', 1, 0.80, '일반',         '위장관 관련 복통은 내과 우선 진료'),
    ('복통',             'D002', 2, 0.70, '조기방문권장', '급성 복통이나 수술적 원인이 의심될 경우 외과 진료'),

    -- 관절통: 정형외과(1순위), 내과(2순위)
    ('관절통',           'D003', 1, 0.88, '일반',         '근골격계 관절 통증은 정형외과 우선 진료'),
    ('관절통',           'D001', 2, 0.60, '일반',         '류마티스 관절염 등 자가면역 질환 가능성 시 내과 진료'),

    -- 피부 발진: 피부과(1순위)
    ('피부 발진',        'D005', 1, 0.92, '일반',         '두드러기, 접촉성 피부염, 아토피 등 피부과 전문 진료'),

    -- 발열: 내과(1순위)
    ('발열',             'D001', 1, 0.85, '일반',         '고열(38.5°C 이상) 지속 시 조기 방문 권장'),

    -- 기침/가래: 호흡기내과(1순위), 이비인후과(2순위)
    ('기침/가래',        'D014', 1, 0.82, '일반',         '3주 이상 지속 기침은 호흡기내과 진료 권장'),
    ('기침/가래',        'D006', 2, 0.65, '일반',         '상기도 감염(인후염, 비염)에 의한 기침은 이비인후과 진료'),

    -- 눈 충혈/시력저하: 안과(1순위)
    ('눈 충혈/시력저하', 'D007', 1, 0.95, '조기방문권장', '갑작스러운 시력 저하는 조기 진료 필수'),

    -- 귀 통증/이명: 이비인후과(1순위)
    ('귀 통증/이명',     'D006', 1, 0.93, '일반',         '이명이 갑자기 발생한 경우 1~2일 내 진료 권장')

) AS m (symptom_name, dept_code, priority, confidence, urgency, notes)
JOIN s ON s.name_ko = m.symptom_name
JOIN d ON d.code    = m.dept_code
ON CONFLICT (symptom_id, department_id, priority) DO NOTHING;
