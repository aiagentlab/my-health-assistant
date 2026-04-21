# RAG 데이터 소스

## 데이터 소스 현황

| 소스 | 건수 | 언어 | 상태 |
|------|------|------|------|
| 증상 시드 데이터 (symptoms) | 10 | 한국어 | 적용 완료 |
| 증상-진료과 매핑 (mapping) | 16 | 한국어 | 적용 완료 |
| KorMedMCQA | 5,316 | 한국어 | 적용 완료 |
| MedQA 교과서 | ~50K | 영어/중국어 | 미적용 |
| MedQA 문제 | ~61K | 영어/중국어 | 미적용 |

## 1. 증상 시드 데이터

**테이블**: `symptoms` (10건)

두통, 흉통, 호흡곤란, 복통, 관절통, 피부 발진, 발열, 기침/가래, 눈 충혈/시력저하, 귀 통증/이명

각 증상에 대해:
- `keywords[]` — 검색용 키워드 배열 (예: ["머리 아픔", "두통", "편두통"])
- `emergency_flag` — 응급 여부 (흉통, 호흡곤란 = TRUE)
- `embedding VECTOR(3072)` — gemini-embedding-001로 생성

## 2. 증상-진료과 매핑

**테이블**: `symptom_department_mapping` (16건)

| 증상 | 1순위 진료과 | 2순위 진료과 | 긴급도 |
|------|-------------|-------------|--------|
| 두통 | 신경과 (0.85) | 내과 (0.65) | 일반 |
| 흉통 | 심장내과 (0.90) | 응급의학과 (0.88) | 응급 |
| 호흡곤란 | 호흡기내과 (0.88) | 응급의학과 (0.90) | 응급 |
| 복통 | 내과 (0.80) | 외과 (0.70) | 일반/조기방문권장 |
| 관절통 | 정형외과 (0.88) | 내과 (0.60) | 일반 |
| 피부 발진 | 피부과 (0.92) | — | 일반 |
| 발열 | 내과 (0.85) | — | 일반 |
| 기침/가래 | 호흡기내과 (0.82) | 이비인후과 (0.65) | 일반 |
| 눈 충혈/시력저하 | 안과 (0.95) | — | 조기방문권장 |
| 귀 통증/이명 | 이비인후과 (0.93) | — | 일반 |

괄호 안 숫자 = 신뢰도 (confidence, 0.0~1.0)

## 3. KorMedMCQA

**테이블**: `medical_knowledge` (5,316건, source='kormedmcqa')

### 출처
- [HuggingFace: sean0042/KorMedMCQA](https://huggingface.co/datasets/sean0042/KorMedMCQA)
- 한국 의료인 국가시험 문제 (2012~2024)
- 라이선스: CC-BY-NC-2.0

### 구성

| 서브셋 | 건수 | 내용 |
|--------|------|------|
| doctor (의사) | ~1,895 | 의사 국가시험 |
| nurse (간호사) | ~587 | 간호사 국가시험 |
| pharm (약사) | ~632 | 약사 국가시험 |
| dentist (치과의사) | ~302 | 치과의사 국가시험 |

### 청크 포맷
```
Question: 45세 여자가 어지럼 때문에 병원에 왔다. 어지럼은 오늘 아침에 일어나면서 갑자기 생겼으며...
Answer: 이석증(양성 발작성 체위성 어지럼)
Subject: doctor
Explanation: (fewshot split만 포함) 전문가 Chain-of-Thought 해설
```

### metadata
```json
{
  "year": 2023,
  "exam_type": "doctor",
  "has_cot": false,
  "split": "train"
}
```

## 4. MedQA (미적용)

### 출처
- [GitHub: jind11/MedQA](https://github.com/jind11/MedQA)
- Google Drive에서 다운로드 필요

### 교과서 데이터 (~50K 청크 예상)
- 영어 + 중국어 간체 의학 교과서
- 단락 단위 청크 (300~500 토큰, 20% 오버랩)
- source: `medqa_textbook`, language: `en`/`zh`

### 문제 데이터 (~61K)
- USMLE (미국), 중국, 대만 의사 면허 시험
- JSONL 포맷: `{question, options, answer, answer_idx}`
- source: `medqa_question`, language: `en`/`zh`

### 적용 방법
```bash
# 1. Google Drive에서 데이터 다운로드 → backend/data/medqa/
# 2. 수집 스크립트 실행
cd backend
uv run python -m scripts.ingest_medqa \
  --textbooks-dir data/medqa/textbooks/en \
  --language en
```

## 데이터 수집 스크립트

| 스크립트 | 용도 |
|----------|------|
| `scripts/generate_embeddings.py` | 시드 증상 임베딩 생성 |
| `scripts/ingest_kormedmcqa.py` | KorMedMCQA HuggingFace → DB |
| `scripts/ingest_medqa.py` | MedQA 교과서/문제 → DB |
| `scripts/ingest_base.py` | 공통 유틸 (DB 연결, 배치 삽입) |

## 데이터 확장 가이드

새 의학 데이터를 추가하려면:

1. `scripts/ingest_base.py`의 `batch_embed_and_insert()` 사용
2. 데이터를 `[{content, source, language, category, metadata}]` 형태로 변환
3. 스크립트 실행 → `medical_knowledge` 테이블에 자동 임베딩 + 삽입
4. 기존 RAG retriever가 자동으로 새 데이터 검색

```python
from scripts.ingest_base import init_db, init_embeddings, batch_embed_and_insert

conn = init_db()
embeddings = init_embeddings()

rows = [
    {
        "content": "새로운 의학 지식 텍스트...",
        "source": "custom_source",
        "language": "ko",
        "category": "내과",
        "metadata": {"origin": "example"},
    }
]

batch_embed_and_insert(conn, embeddings, rows)
```
