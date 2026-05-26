"""faster-whisper STT microservice."""
import io
import logging
import os
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

# Supported faster-whisper model sizes (English-only variants are ~50% smaller):
#   tiny / tiny.en | base / base.en | small / small.en | medium / medium.en | large-v3
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base.en")

app = FastAPI(title="Whisper STT")

_model: WhisperModel | None = None


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        logger.info("Loading Whisper model: %s", WHISPER_MODEL)
        _model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    return _model


@app.on_event("startup")
async def _warmup() -> None:
    get_model()
    logger.info("Whisper model '%s' loaded and ready", WHISPER_MODEL)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(
    audio: Annotated[UploadFile, File()],
    language: Annotated[str, Form()] = "en",
) -> dict:
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Empty audio")

    try:
        model = get_model()
        segments, info = model.transcribe(io.BytesIO(data), language=language, beam_size=5)
        text = " ".join(seg.text.strip() for seg in segments).strip()
    except Exception as exc:
        logger.exception("Transcription error")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Transcription failed")

    return {"text": text, "language": info.language}
