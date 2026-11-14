r"""Speak a line with Kokoro (kokoro-onnx), fully offline: reads the local model and voices only.

    kokoro\venv\Scripts\python.exe kokoro\say.py out.wav af_bella "Text to speak" [--lang en-us] [--speed 1.0]
    kokoro\venv\Scripts\python.exe kokoro\say.py --batch jobs.json   (list of {out, voice, text, lang, speed})

Write acronyms plainly ("AI", "PII", "IT"): espeak spells all-caps words with natural stress. Dotted forms
("A.I.") read as sentence ends and get a pause after every letter.
"""
import argparse, os, pathlib, wave
import numpy as np
os.environ.setdefault("ONNX_PROVIDER", "CPUExecutionProvider")   # never pick up another execution provider
from kokoro_onnx import Kokoro

HERE = pathlib.Path(__file__).parent
_tts = None


def tts():
    global _tts
    if _tts is None:
        _tts = Kokoro(str(HERE / "models" / "kokoro-v1.0.onnx"), str(HERE / "models" / "voices-v1.0.bin"))
    return _tts


def speak(out, voice, text, lang="en-us", speed=1.0):
    samples, sr = tts().create(text, voice=voice, speed=speed, lang=lang)
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    with wave.open(str(out), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes())
    return len(samples) / sr


if __name__ == "__main__":
    import json, sys
    if len(sys.argv) == 3 and sys.argv[1] == "--batch":
        for j in json.loads(pathlib.Path(sys.argv[2]).read_text(encoding="utf-8")):
            speak(j["out"], j["voice"], j["text"], j.get("lang", "en-us"), j.get("speed", 1.0))
        sys.exit(0)
    ap = argparse.ArgumentParser()
    ap.add_argument("out"); ap.add_argument("voice"); ap.add_argument("text")
    ap.add_argument("--lang", default="en-us"); ap.add_argument("--speed", type=float, default=1.0)
    a = ap.parse_args()
    print(f"{speak(a.out, a.voice, a.text, a.lang, a.speed):.1f}s  {a.out}")
