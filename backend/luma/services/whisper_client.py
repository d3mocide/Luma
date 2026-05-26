"""faster-whisper STT client — Phase 1."""
import httpx
import logging
from luma.config import settings

logger = logging.getLogger("whisper_client")


async def transcribe(audio_bytes: bytes, filename: str = "audio.wav") -> str:
    """Send audio bytes to the Whisper container and return the transcribed text."""
    url = f"{settings.whisper_url}/transcribe"
    files = {"audio": (filename, audio_bytes, "application/octet-stream")}
    data = {"language": "en"}
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, files=files, data=data)
            if resp.status_code != 200:
                logger.error(f"Whisper server returned status {resp.status_code}: {resp.text}")
                return ""
            
            result = resp.json()
            return result.get("text", "").strip()
    except Exception as e:
        logger.exception(f"Error during audio transcription call to Whisper: {e}")
        return ""
