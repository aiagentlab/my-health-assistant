#!/usr/bin/env python3
"""KorMedMCQA 데이터셋 인제스트 스크립트

HuggingFace에서 KorMedMCQA (의사/간호사/약사/치과) 데이터셋을 다운로드하고,
각 문제를 임베딩과 함께 medical_knowledge 테이블에 삽입한다.

사용법:
    python -m scripts.ingest_kormedmcqa
    python -m scripts.ingest_kormedmcqa --subsets doctor nurse
    python -m scripts.ingest_kormedmcqa --batch-size 10
"""
import argparse

from datasets import load_dataset

from scripts.ingest_base import init_db, init_embeddings, batch_embed_and_insert

# KorMedMCQA 서브셋 목록
ALL_SUBSETS = ["doctor", "nurse", "pharm", "dentist"]

# 선택지 라벨 매핑 (1-based index → 텍스트)
CHOICE_KEYS = {1: "A", 2: "B", 3: "C", 4: "D", 5: "E"}


def extract_correct_answer(example: dict) -> str:
    """정답 번호(1-5)에 해당하는 선택지 텍스트를 추출한다."""
    answer_idx = int(example.get("answer", 1))
    # 선택지 필드명: A, B, C, D, E
    choice_label = CHOICE_KEYS.get(answer_idx, "A")
    return example.get(choice_label, "")


def build_chunk(example: dict) -> str:
    """문제 레코드에서 인제스트용 텍스트 청크를 구성한다."""
    question = example.get("question", "").strip()
    answer_text = extract_correct_answer(example)
    subject = example.get("subject", "")

    parts = [f"Question: {question}", f"Answer: {answer_text}"]
    if subject:
        parts.append(f"Subject: {subject}")

    # fewshot split의 CoT(Chain of Thought) 설명 포함
    cot = example.get("cot", "")
    if cot and cot.strip():
        parts.append(f"Explanation: {cot.strip()}")

    return "\n".join(parts)


def ingest_subset(
    subset: str,
    conn,
    embeddings,
    batch_size: int,
) -> int:
    """단일 서브셋의 모든 split을 로드하여 인제스트한다."""
    rows = []

    for split_name in ["train", "fewshot"]:
        try:
            ds = load_dataset(
                "sean0042/KorMedMCQA", subset, split=split_name
            )
        except Exception as e:
            print(f"  Skipping {subset}/{split_name}: {e}")
            continue

        print(f"  Loading {subset}/{split_name}: {len(ds)} examples")

        for example in ds:
            content = build_chunk(example)
            if not content.strip():
                continue

            has_cot = bool(example.get("cot", "").strip())

            rows.append(
                {
                    "content": content,
                    "source": "kormedmcqa",
                    "language": "ko",
                    "category": example.get("subject", subset),
                    "metadata": {
                        "year": example.get("year"),
                        "exam_type": subset,
                        "has_cot": has_cot,
                        "split": split_name,
                    },
                }
            )

    if rows:
        print(f"\n  Embedding & inserting {len(rows)} chunks for [{subset}]...")
        batch_embed_and_insert(conn, embeddings, rows, batch_size=batch_size)

    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="KorMedMCQA 데이터셋을 medical_knowledge 테이블에 인제스트"
    )
    parser.add_argument(
        "--subsets",
        nargs="+",
        default=ALL_SUBSETS,
        choices=ALL_SUBSETS,
        help="인제스트할 서브셋 (기본: 전체)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=20,
        help="임베딩 배치 크기 (기본: 20)",
    )
    args = parser.parse_args()

    conn = init_db()
    embeddings = init_embeddings()

    total_rows = 0
    for subset in args.subsets:
        print(f"\n{'='*60}")
        print(f"Processing subset: {subset}")
        print(f"{'='*60}")
        count = ingest_subset(subset, conn, embeddings, args.batch_size)
        total_rows += count

    print(f"\n{'='*60}")
    print(f"All done. Total rows ingested: {total_rows}")


if __name__ == "__main__":
    main()
