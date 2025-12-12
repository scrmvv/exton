FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir \
    fastapi uvicorn[standard] mysql-connector-python numpy sentence-transformers

COPY semantic_search_service.py /app/semantic_search_service.py

CMD ["uvicorn", "semantic_service:app", "--host", "0.0.0.0", "--port", "8000"]