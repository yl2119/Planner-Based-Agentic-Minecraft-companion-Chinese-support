# moss-tts-server.py
# FastAPI server wrapping bundled MOSS-TTS-Nano ONNX for Chinese TTS
# Port 8001 — separate from original Kokoro (8000)
#
# API:
#   POST /tts  {text, ref_audio?}  →  raw PCM int16, 48000 Hz, stereo
#   GET  /health                   →  {"status": "ok"}
#
# Default ref audio: assets/audio/zh_1.wav  (or $MOSS_REF_AUDIO)
#
# Models auto-download from HuggingFace on first use.
# For users in China, set HF_ENDPOINT=https://hf-mirror.com

import os
import sys
import io
import json
import time
import wave
import numpy as np
from pathlib import Path

# Ensure the bundled MOSS-TTS-Nano is on the path
_BUNDLED_DIR = Path(__file__).resolve().parent / "MOSS-TTS-Nano"
sys.path.insert(0, str(_BUNDLED_DIR))

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from contextlib import asynccontextmanager

# ---- paths ----
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DEFAULT_REF_AUDIO = os.getenv(
    "MOSS_REF_AUDIO",
    str(PROJECT_ROOT / "assets" / "audio" / "zh_1.wav"),
)
# Model cache: use project-level models dir, configurable via env
MODEL_DIR = os.getenv(
    "MOSS_MODEL_DIR",
    str(PROJECT_ROOT / "models" / "moss_tts"),
)

SAMPLE_RATE = 48000
CHANNELS = 2

# ---- helpers ----

def split_sentences(text: str) -> list:
    """Split Chinese/English text into sentences."""
    import re
    sentences = re.split(r"(?<=[。！？.!?])\s*", text)
    return [s.strip() for s in sentences if s.strip()]


def wav_bytes_to_pcm(wav_bytes: bytes) -> bytes:
    """Convert WAV bytes to raw s16le PCM."""
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        return wf.readframes(wf.getnframes())


def waveform_to_wav_bytes(waveform: np.ndarray, sr: int) -> bytes:
    """Convert numpy waveform to WAV bytes."""
    buf = io.BytesIO()
    # waveform shape: (samples, channels) or (samples,)
    if waveform.ndim == 1:
        waveform = waveform.reshape(-1, 1)
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(waveform.shape[1])
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sr)
        audio_int16 = (np.clip(waveform, -1.0, 1.0) * 32767).astype(np.int16)
        wf.writeframes(audio_int16.tobytes())
    return buf.getvalue()


# ---- lifespan ----
_tts_runtime = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _tts_runtime
    from onnx_tts_runtime import (
        OnnxTtsRuntime,
        ensure_browser_onnx_model_dir,
        _download_default_browser_onnx_assets,
        _find_manifest_path,
    )

    print("[MOSS-TTS] Server starting...")
    print(f"[MOSS-TTS] Default ref audio: {DEFAULT_REF_AUDIO}")
    print(f"[MOSS-TTS] Model cache dir: {MODEL_DIR}")

    # HuggingFace mirror hint for China users
    hf_endpoint = os.getenv("HF_ENDPOINT", "")
    if hf_endpoint:
        print(f"[MOSS-TTS] Using HF endpoint: {hf_endpoint}")
    else:
        print("[MOSS-TTS] Tip: set HF_ENDPOINT=https://hf-mirror.com if you are in China")

    try:
        # Ensure models exist: download if missing (first run)
        model_dir_path = Path(MODEL_DIR)
        tts_manifest = model_dir_path / "MOSS-TTS-Nano-100M-ONNX" / "browser_poc_manifest.json"
        codec_meta = model_dir_path / "MOSS-Audio-Tokenizer-Nano-ONNX" / "codec_browser_onnx_meta.json"
        if not tts_manifest.exists() or not codec_meta.exists():
            print(f"[MOSS-TTS] Models not found or incomplete, downloading from HuggingFace (~500MB, one-time)...")
            _download_default_browser_onnx_assets(model_dir_path)
            print("[MOSS-TTS] Download complete")

        tts_device = os.getenv("MOSS_TTS_DEVICE", "cuda")
        print(f"[MOSS-TTS] Loading ONNX TTS runtime (device: {tts_device})...")
        _tts_runtime = OnnxTtsRuntime(model_dir=MODEL_DIR, execution_provider=tts_device)
        print("[MOSS-TTS] Runtime loaded, warming up...")

        # Warmup
        if os.path.exists(DEFAULT_REF_AUDIO):
            _tts_runtime.synthesize(
                text="你好",
                prompt_audio_path=DEFAULT_REF_AUDIO,
                streaming=False,
            )
            print("[MOSS-TTS] Warmup complete, server ready")
        else:
            print(f"[MOSS-TTS] WARNING: default ref audio not found at {DEFAULT_REF_AUDIO}")
            print("[MOSS-TTS] Server will start but requests will fail without valid ref_audio")
    except Exception as e:
        print(f"[MOSS-TTS] Failed to load runtime: {e}")
        print("[MOSS-TTS] Make sure Python 3.11+ is used and dependencies are installed")
        raise

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
    hf_endpoint = os.getenv("HF_ENDPOINT", "https://huggingface.co")
    return JSONResponse({
        "status": "ok",
        "ref_audio": DEFAULT_REF_AUDIO,
        "ref_audio_exists": ref_exists,
        "hf_endpoint": hf_endpoint,
        "model_dir": MODEL_DIR,
    })


@app.post("/tts")
async def tts_endpoint(payload: dict):
    global _tts_runtime

    text = payload.get("text", "").strip()
    ref_audio = payload.get("ref_audio", DEFAULT_REF_AUDIO)

    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    # Resolve ref_audio path
    ref_path = None
    if ref_audio and not os.path.isabs(ref_audio):
        candidate = PROJECT_ROOT / "assets" / "audio" / ref_audio
        if candidate.exists():
            ref_path = str(candidate)
        elif os.path.exists(ref_audio):
            ref_path = ref_audio
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Reference audio not found: {ref_audio} (also checked {candidate})",
            )
    elif ref_audio:
        ref_path = ref_audio if os.path.exists(ref_audio) else None
        if not ref_path:
            raise HTTPException(status_code=400, detail=f"Reference audio not found: {ref_audio}")

    if not ref_path:
        ref_path = DEFAULT_REF_AUDIO
        if not os.path.exists(ref_path):
            raise HTTPException(
                status_code=500,
                detail=f"Default reference audio not found: {ref_path}. Set MOSS_REF_AUDIO env var or place a .wav file in assets/audio/",
            )

    print(f"[MOSS-TTS] Request: text='{text[:80]}...' ref='{ref_path}'")

    async def audio_stream():
        try:
            result = _tts_runtime.synthesize(
                text=text,
                prompt_audio_path=ref_path,
                streaming=False,
            )
            waveform = result["waveform"]
            sr = result["sample_rate"]

            wav_bytes = waveform_to_wav_bytes(waveform, sr)
            pcm = wav_bytes_to_pcm(wav_bytes)
            yield pcm

        except Exception as e:
            print(f"[MOSS-TTS] Generation error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

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
