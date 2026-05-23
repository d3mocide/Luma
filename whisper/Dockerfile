FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    fastapi>=0.115.0 \
    uvicorn[standard]>=0.30.0 \
    faster-whisper>=1.0.0 \
    python-multipart>=0.0.12

COPY server.py .

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "9000"]
