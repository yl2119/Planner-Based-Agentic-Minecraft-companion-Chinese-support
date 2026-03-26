# kokoro-tts-server.py
import os
import sys
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
import uvicorn
from kokoro_onnx import Kokoro
import onnxruntime
from contextlib import asynccontextmanager
import time
import re

print(onnxruntime.get_available_providers())

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[TTS] Warming up model...")
    try:
        # Run a short generation to load everything into GPU
        async for _ in kokoro.create_stream("Hello", "af_heart", speed=1.2, lang="en-us"):
            pass
        print("[TTS] Model ready.")
    except Exception as e:
        print(f"[TTS] Warmup failed: {e}")
    
    yield  # The app runs here
    
    # --- Shutdown (after yield) ---
    print("[TTS] Shutting down, releasing GPU resources...")

app = FastAPI(lifespan=lifespan)

MODEL_PATH = os.getenv("KOKORO_ONNX_MODEL", "kokoro-v0_19.fp16.onnx")
VOICES_PATH = os.getenv("KOKORO_ONNX_VOICES", "voices-v1.0.bin")

print("Loading Kokoro ONNX model...")
try:
    kokoro = Kokoro(MODEL_PATH, VOICES_PATH)
except Exception as e:
    print("Failed to initialize Kokoro:", e)
    raise

@app.get("/health")
async def health():
    return JSONResponse({"status": "ok"})

@app.get("/voices")
async def list_voices():
    try:
        voices = list(kokoro.get_voices())
    except Exception as e:
        voices = []
        print("ERROR: could not get voices:", e)
    return JSONResponse({"voices": voices})

def clean_text_for_tts(text: str) -> str:
    """Remove bot commands and other unwanted patterns before TTS."""
    # Remove !commandName(...) style commands
    text = re.sub(r'!\w+\([^)]*\)', '', text)
    # Remove any remaining ! commands without parens (e.g. !stop)
    text = re.sub(r'!\w+', '', text)
    return text

def split_sentences(text):
    """Split text into sentences using punctuation."""
    # Simple regex: split after .!? followed by space or end of string
    sentences = re.split(r'(?<=[.!?。！？])\s+', text)
    return [s.strip() for s in sentences if s.strip()]

async def audio_generator(text: str, voice: str, speed: float = 1.0, lang: str = "en-us"):
    sentences = split_sentences(text)
    if not sentences:
        sentences = [text]  # fallback if no punctuation
    
    chunk_count = 0
    total_bytes = 0
    start_time = time.time()
    
    try:
        for sentence in sentences:
            print(f"[TTS] Generating sentence: {sentence[:50]}...")
            async for audio, sample_rate in kokoro.create_stream(sentence, voice, speed=speed, lang=lang):
                if audio is None:
                    continue
                chunk_count += 1
                # Convert to int16 PCM
                audio_int16 = (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16)
                data = audio_int16.tobytes()
                total_bytes += len(data)
                if chunk_count == 1:
                    print(f"[TTS] First chunk: {len(data)} bytes, arrived after {time.time()-start_time:.3f}s")
                yield data
        print(f"[TTS] Total chunks: {chunk_count}, total bytes: {total_bytes}, duration: {time.time()-start_time:.3f}s")
    except Exception as e:
        print("ERROR in audio_generator:", repr(e))

@app.post("/tts")
async def tts_endpoint(payload: dict):
    text = payload.get("text", "")
    voice = payload.get("voice", "af_heart")
    speed = float(payload.get("speed", 1.0))
    lang = payload.get("lang", "en-us")

    text = clean_text_for_tts(text)
    
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    # Validate voice name early so we fail fast
    available = kokoro.get_voices()
    if voice not in available:
        raise HTTPException(status_code=400, detail=f"Unknown voice '{voice}'. Available voices: {sorted(list(available))[:20]}")

    # Note: we stream raw s16le PCM at 24000 Hz (kokoro default)
    return StreamingResponse(
        audio_generator(text, voice, speed=speed, lang=lang),
        media_type="audio/l16; rate=24000"
    )

if __name__ == "__main__":
    uvicorn.run("kokoro-tts-server:app", host="127.0.0.1", port=8000, log_level="info")