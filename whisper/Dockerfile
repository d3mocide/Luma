FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    fastapi==0.136.3 \
    uvicorn[standard]==0.48.0 \
    faster-whisper==1.2.1 \
    python-multipart==0.0.29

COPY server.py .

# Bake model weights into the image so the first transcription request is fast.
# base.en ~145 MB — swap for small.en (~484 MB) if you need higher accuracy.
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('base.en', device='cpu', compute_type='int8')"

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "9000"]
