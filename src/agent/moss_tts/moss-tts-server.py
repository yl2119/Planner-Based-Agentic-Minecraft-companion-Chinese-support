# moss-tts-server.py
# FastAPI server wrapping MOSS-TTS-Nano ONNX for Chinese TTS
# Port 8001 — separate from original Kokoro (8000)
#
# API:
#   POST /tts  {text, ref_audio?}  →  raw PCM int16, 48000 Hz, stereo
#   GET  /health                   →  {"status": "ok"}
#
# Default ref audio: assets/audio/zh_1.wav  (or $MOSS_REF_AUDIO)

import os
import sys
import io
import json
import subprocess
import tempfile
import time
import wave
import numpy as np
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from contextlib import asynccontextmanager

# ---- paths ----
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DEFAULT_REF_AUDIO = os.getenv(
    "MOSS_REF_AUDIO",
    str(PROJECT_ROOT / "assets" / "audio" / "zh_1.wav"),
)
# Directory for ONNX model cache
MODEL_DIR = os.getenv("MOSS_MODEL_DIR", str(PROJECT_ROOT / "models" / "moss_tts"))
os.makedirs(MODEL_DIR, exist_ok=True)

SAMPLE_RATE = 48000
CHANNELS = 2

# ---- helpers ----

def wav_bytes_to_pcm(wav_bytes: bytes) -> bytes:
    """Convert a WAV file (bytes) into raw s16le PCM samples."""
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        assert wf.getsampwidth() == 2, "Expected 16-bit WAV"
        assert wf.getnchannels() == CHANNELS, f"Expected {CHANNELS} channels"
        assert wf.getframerate() == SAMPLE_RATE, f"Expected {SAMPLE_RATE} Hz"
        return wf.readframes(wf.getnframes())


def split_sentences(text: str) -> list:
    """Split Chinese/English text into sentences."""
    import re
    # Split on Chinese/English punctuation
    sentences = re.split(r"(?<=[。！？.!?])\s*", text)
    return [s.strip() for s in sentences if s.strip()]


def generate_audio(text: str, ref_audio: str) -> bytes:
    """Generate WAV audio using moss-tts-nano CLI with ONNX backend."""
    # Check CLI availability
    try:
        subprocess.run(
            ["moss-tts-nano", "--help"],
            capture_output=True,
            timeout=10,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        raise RuntimeError(
            "moss-tts-nano CLI not found. Install with: pip install moss-tts-nano"
        )

    if not os.path.exists(ref_audio):
        raise HTTPException(
            status_code=400,
            detail=f"Reference audio not found: {ref_audio}",
        )

    # Use a temp file for the output
    fd, output_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)

    try:
        cmd = [
            "moss-tts-nano", "generate",
            "--backend", "onnx",
            "--prompt-speech", ref_audio,
            "--text", text,
            "--output", output_path,
        ]
        print(f"[MOSS-TTS] Generating: {text[:60]}...")
        start = time.time()

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            env={**os.environ, "MOSS_MODEL_DIR": MODEL_DIR},
        )

        elapsed = time.time() - start

        if result.returncode != 0:
            print(f"[MOSS-TTS] CLI stderr: {result.stderr}")
            raise RuntimeError(f"moss-tts-nano exited with code {result.returncode}: {result.stderr[:500]}")

        print(f"[MOSS-TTS] Generated in {elapsed:.1f}s")

        with open(output_path, "rb") as f:
            wav_data = f.read()

        return wav_data

    finally:
        try:
            os.unlink(output_path)
        except OSError:
            pass


# ---- lifespan ----
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[MOSS-TTS] Server starting...")
    print(f"[MOSS-TTS] Default ref audio: {DEFAULT_REF_AUDIO}")
    print(f"[MOSS-TTS] Model cache dir: {MODEL_DIR}")

    # Check that CLI works
    try:
        subprocess.run(
            ["moss-tts-nano", "--help"],
            capture_output=True,
            timeout=15,
        )
        print("[MOSS-TTS] CLI available")
    except FileNotFoundError:
        print("[MOSS-TTS] WARNING: moss-tts-nano CLI not found!")
        print("[MOSS-TTS] Install with: pip install moss-tts-nano")
    except subprocess.TimeoutExpired:
        print("[MOSS-TTS] WARNING: moss-tts-nano --help timed out (first run may download models)")

    # Quick warmup if ref audio exists
    if os.path.exists(DEFAULT_REF_AUDIO):
        print("[MOSS-TTS] Warming up with short generation...")
        try:
            generate_audio("你好", DEFAULT_REF_AUDIO)
            print("[MOSS-TTS] Warmup complete, server ready")
        except Exception as e:
            print(f"[MOSS-TTS] Warmup failed (will retry on first request): {e}")
    else:
        print(f"[MOSS-TTS] Default ref audio not found at {DEFAULT_REF_AUDIO}")
        print("[MOSS-TTS] Server will start but requests will fail until a valid ref_audio is provided")

    yield
    print("[MOSS-TTS] Shutting down")


# ---- app ----
app = FastAPI(title="MOSS-TTS-Nano Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    ref_exists = os.path.exists(DEFAULT_REF_AUDIO)
    return JSONResponse({
        "status": "ok",
        "ref_audio": DEFAULT_REF_AUDIO,
        "ref_audio_exists": ref_exists,
    })


@app.post("/tts")
async def tts_endpoint(payload: dict):
    text = payload.get("text", "").strip()
    ref_audio = payload.get("ref_audio", DEFAULT_REF_AUDIO)

    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    # Resolve ref_audio: if it's a bare filename, look in assets/audio/
    if ref_audio and not os.path.isabs(ref_audio):
        candidate = PROJECT_ROOT / "assets" / "audio" / ref_audio
        if candidate.exists():
            ref_audio = str(candidate)
        elif not os.path.exists(ref_audio):
            # try as-is (relative to cwd)
            if not os.path.exists(ref_audio):
                raise HTTPException(
                    status_code=400,
                    detail=f"Reference audio not found: {ref_audio} (also checked {candidate})",
                )

    print(f"[MOSS-TTS] Request: text='{text[:80]}...' ref='{ref_audio}'")

    # Split long text into sentences for better quality
    sentences = split_sentences(text)
    if not sentences:
        sentences = [text]

    async def audio_stream():
        for sentence in sentences:
            if not sentence.strip():
                continue
            try:
                wav_bytes = generate_audio(sentence, ref_audio)
                pcm_bytes = wav_bytes_to_pcm(wav_bytes)
                yield pcm_bytes
            except Exception as e:
                print(f"[MOSS-TTS] Error generating sentence: {e}")
                # Continue with remaining sentences rather than failing entirely
                continue

    return StreamingResponse(
        audio_stream(),
        media_type=f"audio/l16; rate={SAMPLE_RATE}; channels={CHANNELS}",
    )


if __name__ == "__main__":
    uvicorn.run(
        "moss-tts-server:app",
        host="127.0.0.1",
        port=8001,
        log_level="info",
    )
