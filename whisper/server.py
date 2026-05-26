"""faster-whisper STT microservice."""
import io
import logging
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

app = FastAPI(title="Whisper STT")

# Load model once at startup — "base.en" is fast; swap for "small.en" for higher accuracy.
_model: WhisperModel | None = None


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel("base.en", device="cpu", compute_type="int8")
    return _model


@app.on_event("startup")
async def _warmup() -> None:
    # Force model load at startup rather than on first request.
    get_model()
    logger.info("Whisper model loaded and ready")


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
