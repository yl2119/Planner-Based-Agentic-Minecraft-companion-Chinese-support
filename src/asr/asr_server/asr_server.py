from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
import io
import os
import soundfile as sf
from faster_whisper import WhisperModel
import torch

app = FastAPI()

# CORS (allow browser cross-origin requests)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
ASR_LANGUAGE = os.getenv("ASR_LANGUAGE", "zh").strip()

# Load ASR model
device = "cuda" if torch.cuda.is_available() else "cpu"
print("[ASR] Loading Whisper model... to "+device)
if device == "cuda":
    asr_model = WhisperModel("small", device=device, compute_type="float16")
else:
    asr_model = WhisperModel("small", device="cpu", compute_type="int8")

print("[ASR] Model loaded successfully")


def transcribe_wav_bytes(wav_bytes: bytes, language: str = "en") -> str:
    """Transcribe WAV audio bytes to text using faster-whisper."""
    audio, sr = sf.read(io.BytesIO(wav_bytes), dtype="float32")
    if len(audio.shape) > 1:
        audio = audio.mean(axis=1)
    segments, _ = asr_model.transcribe(audio, language=language, vad_filter=True)
    return "".join(seg.text for seg in segments).strip()


@app.post("/asr")
async def asr(req: Request):
    """Receive WAV audio bytes, return transcribed text."""
    wav_bytes = await req.body()
    text = transcribe_wav_bytes(wav_bytes, language=ASR_LANGUAGE)
    return Response(content=text, media_type="text/plain; charset=utf-8")