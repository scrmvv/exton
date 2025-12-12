import os
import numpy as np
import mysql.connector
from fastapi import FastAPI, Query
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

DB_CONFIG = dict(
    host=os.environ.get("DB_HOST", "localhost"),
    user=os.environ.get("DB_USER", "root"),
    password=os.environ.get("DB_PASS", ""),
    database=os.environ.get("DB_NAME", "equipment_aggregator"),
)

MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"

app = FastAPI(title="Семантический поиск")

model: SentenceTransformer | None = None
product_ids: list[int] = []
product_texts: list[str] = []
embeddings: np.ndarray | None = None


# подгрузка из бд
def load_products():
    conn = mysql.connector.connect(**DB_CONFIG)
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT id, sku, name, specs FROM products")
    rows = cur.fetchall()
    cur.close()
    conn.close()

    ids, texts = [], []
    for r in rows:
        ids.append(r["id"])
        text = f"{r['name'] or ''}"
        texts.append(text.strip())
    return ids, texts


def build_index():
    global model, product_ids, product_texts, embeddings

    print("Модель загружена:", MODEL_NAME)
    model = SentenceTransformer(MODEL_NAME)

    print("Загрузка продуктов из БД")
    product_ids, product_texts = load_products()
    print(f"Загружено {len(product_texts)} продуктов")

    print("Энкодинг...")
    emb = model.encode(product_texts, convert_to_numpy=True, batch_size=64, show_progress_bar=True)

    # косинусное сходство
    norms = np.linalg.norm(emb, axis=1, keepdims=True)
    embeddings = emb / np.clip(norms, 1e-8, None)

    print("Индекс сходства рассчитан.")


class SearchResult(BaseModel):
    id: int
    text: str
    score: float


@app.on_event("startup")
def startup_event():
    build_index()

@app.get("/search", response_model=list[SearchResult])
def search(q: str = Query(..., min_length=1), top_k: int = 10):
    if embeddings is None or model is None:
        return []

    # токены из запроса
    tokens = [t.lower() for t in q.split() if len(t) >= 3]

    query_vec = model.encode([q], convert_to_numpy=True)[0]
    query_vec = query_vec / np.clip(np.linalg.norm(query_vec), 1e-8, None)

    scores = embeddings @ query_vec
    top_idx = np.argsort(-scores)[: min(100, len(scores))]

    filtered: list[SearchResult] = []

    for idx in top_idx:
        text = product_texts[idx]
        text_low = text.lower()

        if tokens and not any(tok in text_low for tok in tokens):
            continue

        filtered.append(SearchResult(
            id=int(product_ids[idx]),
            text=text,
            score=float(scores[idx]),
        ))

        if len(filtered) >= top_k:
            break

    # если после фильтра ничего не осталось
    if not filtered:
        fallback: list[SearchResult] = []
        for idx in np.argsort(-scores)[: min(top_k, len(scores))]:
            fallback.append(SearchResult(
                id=int(product_ids[idx]),
                text=product_texts[idx],
                score=float(scores[idx]),
            ))
        return fallback

    return filtered