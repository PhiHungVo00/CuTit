"""
Máy chủ TTS + STT chạy trên máy (D9) — CHỈ dùng lúc soạn nội dung để dựng sẵn âm thanh khóa học theo miền.
Không chạy trong app hay ở Gateway production (Nguyên tắc 1 áp dụng cho lúc chạy; đây là công cụ soạn nội dung).

API kiểu OpenAI để Gateway gọi qua adapter chung (Nguyên tắc 4, không gọi tên hãng):
  POST /v1/audio/speech          {"model", "input", "voice", "response_format": "wav"} -> WAV 24 kHz mono PCM16
  POST /v1/audio/transcriptions  multipart: file, language=vi                          -> {"text": "..."}
  GET  /health

TTS: VieNeu-TTS v3 Turbo (Apache-2.0), CPU fp32. STT kiểm lời: faster-whisper (MIT) model `medium` int8.
Cài một lần (ngoài repo):
  uv venv --python 3.11 %USERPROFILE%/.becutit/tts
  uv pip install --python %USERPROFILE%/.becutit/tts/Scripts/python.exe vieneu faster-whisper
Chạy:
  %USERPROFILE%/.becutit/tts/Scripts/python.exe -X utf8 tools/tts-local/server.py [--port 8765]
"""
import argparse
import io
import os
import tempfile
import threading

import numpy as np
import soundfile as sf
import soxr
import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

OUT_RATE = 24000  # 48 kHz của model -> 24 kHz: nhẹ một nửa cho mobile, đủ cho giọng nói
TEMPERATURE = 0.8  # khuyến nghị của model card

app = FastAPI(title='becutit-tts-local')
_lock = threading.Lock()  # model không an toàn đa luồng: xử lý tuần tự
_tts = None
_stt = None


def tts():
    global _tts
    if _tts is None:
        from vieneu import Vieneu
        _tts = Vieneu()
    return _tts


def stt():
    global _stt
    if _stt is None:
        from faster_whisper import WhisperModel
        _stt = WhisperModel(os.environ.get('WHISPER_MODEL', 'medium'), device='cpu', compute_type='int8')
    return _stt


class SpeechRequest(BaseModel):
    model: str = 'vieneu-v3-turbo'
    input: str = Field(min_length=1, max_length=500)
    voice: str = Field(min_length=1, max_length=60)
    response_format: str = 'wav'


@app.get('/health')
def health():
    return {'ok': True}


@app.post('/v1/audio/speech')
def speech(req: SpeechRequest):
    if req.response_format != 'wav':
        raise HTTPException(400, 'chỉ hỗ trợ wav')
    with _lock:
        engine = tts()
        known = {vid for _, vid in engine.list_preset_voices()}
        if req.voice not in known:
            raise HTTPException(400, f'giọng không có: {req.voice}')
        audio = engine.infer(req.input, voice=req.voice, temperature=TEMPERATURE)
        rate = engine.sample_rate
    audio = np.asarray(audio, dtype=np.float32).reshape(-1)
    if rate != OUT_RATE:
        audio = soxr.resample(audio, rate, OUT_RATE)
    buf = io.BytesIO()
    sf.write(buf, np.clip(audio, -1, 1), OUT_RATE, format='WAV', subtype='PCM_16')
    return Response(buf.getvalue(), media_type='audio/wav')


@app.post('/v1/audio/transcriptions')
def transcriptions(file: UploadFile = File(...), language: str = Form('vi'), model: str = Form('whisper')):
    data = file.file.read()
    if not data:
        raise HTTPException(400, 'tệp rỗng')
    # Không đưa câu mong đợi làm prompt cho Whisper — như vậy là tự chấm đúng cho mình.
    # Đoạn rất ngắn (một âm tiết) làm Whisper "ảo giác" ra câu dài: đệm 0,5 s lặng hai đầu, tắt nối ngữ cảnh.
    audio, rate = sf.read(io.BytesIO(data), dtype='float32', always_2d=False)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    pad = np.zeros(int(rate * 0.5), dtype=np.float32)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        sf.write(f, np.concatenate([pad, audio, pad]), rate, format='WAV', subtype='PCM_16')
        path = f.name
    try:
        with _lock:
            segs, _ = stt().transcribe(
                path, language=language, beam_size=5, vad_filter=False,
                condition_on_previous_text=False, temperature=0.0, without_timestamps=True,
            )
            text = ' '.join(s.text.strip() for s in segs).strip()
    finally:
        os.unlink(path)
    return {'text': text}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8765)
    a = ap.parse_args()
    uvicorn.run(app, host='127.0.0.1', port=a.port, log_level='warning')
