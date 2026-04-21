"""의료 지식 인제스트 공통 유틸리티

로컬 PostgreSQL + Google Embeddings 초기화,
배치 임베딩 + 삽입 함수 등 인제스트 스크립트 공통 로직.
"""
import os
import sys
import time
import json

from dotenv import load_dotenv

load_dotenv()

import psycopg2
from langchain_google_genai import GoogleGenerativeAIEmbeddings


def init_db():
    """DATABASE_URL 환경변수로 PostgreSQL 연결."""
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL must be set")
        sys.exit(1)
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    return conn


def init_embeddings() -> GoogleGenerativeAIEmbeddings:
    """GOOGLE_API_KEY 환경변수로 Google Generative AI Embeddings 초기화."""
    if not os.environ.get("GOOGLE_API_KEY"):
        print("ERROR: GOOGLE_API_KEY must be set")
        sys.exit(1)
    return GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")


def batch_embed_and_insert(
    conn,
    embeddings: GoogleGenerativeAIEmbeddings,
    rows: list[dict],
    batch_size: int = 20,
    delay: float = 0.5,
) -> None:
    """
    rows를 batch_size 단위로 임베딩 생성 후 medical_knowledge에 삽입.

    Args:
        conn: psycopg2 connection
        embeddings: Google Embeddings 인스턴스
        rows: [{content, source, language, category, metadata}, ...]
        batch_size: 한 번에 임베딩할 문서 수
        delay: 배치 간 대기 시간 (초, API rate limit 방지)
    """
    total = len(rows)
    if total == 0:
        print("No rows to insert.")
        return

    print(f"Inserting {total} rows in batches of {batch_size}...\n")

    inserted = 0
    errors = 0

    for start in range(0, total, batch_size):
        batch = rows[start : start + batch_size]
        batch_num = start // batch_size + 1
        batch_total = (total + batch_size - 1) // batch_size

        texts = [r["content"] for r in batch]

        try:
            vectors = embeddings.embed_documents(texts)
        except Exception as e:
            print(f"  Batch {batch_num}/{batch_total} — embedding ERROR: {e}")
            errors += len(batch)
            if start + batch_size < total:
                time.sleep(delay)
            continue

        cur = conn.cursor()
        for row, vector in zip(batch, vectors):
            vector_str = "[" + ",".join(str(v) for v in vector) + "]"
            try:
                cur.execute("""
                    INSERT INTO medical_knowledge (content, embedding, source, language, category, metadata)
                    VALUES (%s, %s::vector, %s, %s, %s, %s)
                """, (
                    row["content"],
                    vector_str,
                    row["source"],
                    row["language"],
                    row.get("category"),
                    json.dumps(row.get("metadata", {})),
                ))
                inserted += 1
            except Exception as e:
                print(f"  Insert error: {e}")
                errors += 1
        cur.close()

        print(
            f"  Batch {batch_num}/{batch_total} — "
            f"inserted {len(batch)} rows (total: {inserted}/{total})"
        )

        if start + batch_size < total:
            time.sleep(delay)

    print(f"\nDone: {inserted} inserted, {errors} errors out of {total}")
