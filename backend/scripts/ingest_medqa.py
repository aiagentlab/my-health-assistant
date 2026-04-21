#!/usr/bin/env python3
"""MedQA 데이터셋 인제스트 스크립트

MedQA 교과서(*.txt) 및 문제(*.jsonl) 파일을 파싱하여
medical_knowledge 테이블에 임베딩과 함께 삽입한다.

데이터 준비:
    MedQA를 Google Drive에서 다운로드 후 backend/data/medqa/ 에 배치:
    backend/data/medqa/
    ├── textbooks/en/        # 영문 교과서 .txt
    ├── textbooks/zh/        # 중문 교과서 .txt
    ├── questions/en/        # 영문 문제 .jsonl
    └── questions/zh/        # 중문 문제 .jsonl

사용법:
    python -m scripts.ingest_medqa \\
        --textbooks-dir data/medqa/textbooks/en \\
        --questions-dir data/medqa/questions/en \\
        --language en

    python -m scripts.ingest_medqa \\
        --textbooks-dir data/medqa/textbooks/zh \\
        --language zh
"""
import argparse
import json
import os
from pathlib import Path

from scripts.ingest_base import init_supabase, init_embeddings, batch_embed_and_insert

# 청크 크기 설정 (대략적인 토큰 수 → 문자 수 변환, 1 token ≈ 4 chars for English)
TARGET_CHUNK_CHARS = 1500   # ~375 tokens
MAX_CHUNK_CHARS = 2000      # ~500 tokens
OVERLAP_RATIO = 0.2


def chunk_text(text: str) -> list[str]:
    """
    텍스트를 단락(이중 줄바꿈) 기준으로 분리 후,
    300-500 토큰(~1200-2000 문자) 범위로 청킹. 20% 오버랩.
    """
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

    chunks: list[str] = []
    current_chunk = ""

    for para in paragraphs:
        # 단락이 단독으로 MAX를 초과하면 강제 분할
        if len(para) > MAX_CHUNK_CHARS:
            if current_chunk:
                chunks.append(current_chunk)
                current_chunk = ""
            # 문장 단위 분할
            start = 0
            while start < len(para):
                end = min(start + TARGET_CHUNK_CHARS, len(para))
                # 문장 끝 찾기
                if end < len(para):
                    for sep in [". ", "。", "\n", "! ", "? "]:
                        last_sep = para.rfind(sep, start, end)
                        if last_sep > start:
                            end = last_sep + len(sep)
                            break
                chunks.append(para[start:end].strip())
                overlap_start = max(start, end - int(TARGET_CHUNK_CHARS * OVERLAP_RATIO))
                start = overlap_start if end < len(para) else len(para)
            continue

        # 현재 청크에 추가하면 초과하는지 확인
        candidate = f"{current_chunk}\n\n{para}" if current_chunk else para
        if len(candidate) > MAX_CHUNK_CHARS and current_chunk:
            chunks.append(current_chunk)
            # 오버랩: 현재 청크의 마지막 부분 유지
            overlap_len = int(len(current_chunk) * OVERLAP_RATIO)
            overlap_text = current_chunk[-overlap_len:] if overlap_len > 0 else ""
            current_chunk = f"{overlap_text}\n\n{para}" if overlap_text else para
        else:
            current_chunk = candidate

    if current_chunk.strip():
        chunks.append(current_chunk.strip())

    return chunks


def ingest_textbooks(
    textbooks_dir: str,
    language: str,
    supabase,
    embeddings,
    batch_size: int,
) -> int:
    """교과서 .txt 파일을 청킹하여 인제스트."""
    txt_dir = Path(textbooks_dir)
    if not txt_dir.exists():
        print(f"Textbooks directory not found: {txt_dir}")
        return 0

    txt_files = sorted(txt_dir.glob("*.txt"))
    if not txt_files:
        print(f"No .txt files found in {txt_dir}")
        return 0

    print(f"Found {len(txt_files)} textbook files in {txt_dir}")

    all_rows: list[dict] = []

    for txt_file in txt_files:
        book_name = txt_file.stem
        print(f"  Processing: {book_name}")

        text = txt_file.read_text(encoding="utf-8")
        chunks = chunk_text(text)
        print(f"    → {len(chunks)} chunks")

        for i, chunk in enumerate(chunks):
            all_rows.append(
                {
                    "content": chunk,
                    "source": "medqa_textbook",
                    "language": language,
                    "category": book_name,
                    "metadata": {
                        "filename": txt_file.name,
                        "chunk_index": i,
                        "total_chunks": len(chunks),
                    },
                }
            )

    if all_rows:
        print(f"\nEmbedding & inserting {len(all_rows)} textbook chunks...")
        batch_embed_and_insert(supabase, embeddings, all_rows, batch_size=batch_size)

    return len(all_rows)


def ingest_questions(
    questions_dir: str,
    language: str,
    supabase,
    embeddings,
    batch_size: int,
) -> int:
    """문제 .jsonl 파일을 파싱하여 인제스트."""
    q_dir = Path(questions_dir)
    if not q_dir.exists():
        print(f"Questions directory not found: {q_dir}")
        return 0

    jsonl_files = sorted(q_dir.glob("*.jsonl"))
    if not jsonl_files:
        print(f"No .jsonl files found in {q_dir}")
        return 0

    print(f"Found {len(jsonl_files)} question files in {q_dir}")

    all_rows: list[dict] = []

    for jsonl_file in jsonl_files:
        print(f"  Processing: {jsonl_file.name}")

        with open(jsonl_file, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue

                question = obj.get("question", "").strip()
                answer = obj.get("answer", "").strip()
                if not question:
                    continue

                content = f"Question: {question}\nAnswer: {answer}"

                all_rows.append(
                    {
                        "content": content,
                        "source": "medqa_question",
                        "language": language,
                        "category": obj.get("meta_info", obj.get("type", "")),
                        "metadata": {
                            "filename": jsonl_file.name,
                            "options": obj.get("options", {}),
                        },
                    }
                )

        print(f"    → {len(all_rows)} questions so far")

    if all_rows:
        print(f"\nEmbedding & inserting {len(all_rows)} question chunks...")
        batch_embed_and_insert(supabase, embeddings, all_rows, batch_size=batch_size)

    return len(all_rows)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="MedQA 교과서/문제 데이터를 medical_knowledge 테이블에 인제스트"
    )
    parser.add_argument(
        "--textbooks-dir",
        type=str,
        default=None,
        help="교과서 .txt 파일 디렉토리 경로",
    )
    parser.add_argument(
        "--questions-dir",
        type=str,
        default=None,
        help="문제 .jsonl 파일 디렉토리 경로",
    )
    parser.add_argument(
        "--language",
        type=str,
        default="en",
        choices=["en", "zh", "ko"],
        help="데이터 언어 (기본: en)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=20,
        help="임베딩 배치 크기 (기본: 20)",
    )
    args = parser.parse_args()

    if not args.textbooks_dir and not args.questions_dir:
        parser.error("--textbooks-dir 또는 --questions-dir 중 하나 이상 지정 필요")

    supabase = init_supabase()
    embeddings = init_embeddings()

    total = 0

    if args.textbooks_dir:
        print(f"\n{'='*60}")
        print(f"Ingesting textbooks ({args.language})")
        print(f"{'='*60}")
        total += ingest_textbooks(
            args.textbooks_dir, args.language, supabase, embeddings, args.batch_size
        )

    if args.questions_dir:
        print(f"\n{'='*60}")
        print(f"Ingesting questions ({args.language})")
        print(f"{'='*60}")
        total += ingest_questions(
            args.questions_dir, args.language, supabase, embeddings, args.batch_size
        )

    print(f"\n{'='*60}")
    print(f"All done. Total rows ingested: {total}")


if __name__ == "__main__":
    main()
