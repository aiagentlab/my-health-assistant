#!/usr/bin/env python3
"""증상 임베딩 일괄 생성 스크립트

기존 symptoms 테이블의 모든 레코드에 대해 Google Generative AI
gemini-embedding-001 모델로 벡터 임베딩을 생성하고 embedding 컬럼을 업데이트한다.

사용법:
    python -m scripts.generate_embeddings
"""
import os
import sys
import time

from dotenv import load_dotenv

load_dotenv()

import psycopg2
from langchain_google_genai import GoogleGenerativeAIEmbeddings


def build_text_for_symptom(name_ko: str, keywords: list) -> str:
    parts = [name_ko]
    if keywords:
        parts.extend(keywords)
    return " ".join(parts)


def main() -> None:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL must be set")
        sys.exit(1)
    if not os.environ.get("GOOGLE_API_KEY"):
        print("ERROR: GOOGLE_API_KEY must be set")
        sys.exit(1)

    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")

    cur = conn.cursor()
    cur.execute("SELECT id, name_ko, keywords FROM symptoms")
    symptoms = cur.fetchall()
    cur.close()

    if not symptoms:
        print("No symptoms found in database.")
        return

    total = len(symptoms)
    print(f"Found {total} symptoms. Generating embeddings...\n")

    success_count = 0
    error_count = 0

    for i, (sid, name_ko, keywords) in enumerate(symptoms, 1):
        text = build_text_for_symptom(name_ko, keywords or [])

        try:
            vector = embeddings.embed_query(text)
            vector_str = "[" + ",".join(str(v) for v in vector) + "]"

            cur = conn.cursor()
            cur.execute(
                "UPDATE symptoms SET embedding = %s::vector WHERE id = %s",
                (vector_str, str(sid)),
            )
            cur.close()

            success_count += 1
            print(f"  [{i}/{total}] {name_ko} — OK (dim={len(vector)})")

        except Exception as e:
            error_count += 1
            print(f"  [{i}/{total}] {name_ko} — ERROR: {e}")

        if i < total:
            time.sleep(0.5)

    conn.close()
    print(f"\nDone: {success_count} succeeded, {error_count} failed out of {total}")


if __name__ == "__main__":
    main()
