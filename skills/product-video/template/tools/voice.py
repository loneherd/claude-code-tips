r"""Record the narration with Kokoro and lay it on a film-length track.

    kokoro\venv\Scripts\python.exe tools\voice.py out\intro-animatic.vtt <film seconds>

Reads the film's caption file. One recording per caption cue (JOIN=cue, default), or cues joined to sentence ends
(JOIN=sentence). A line starts at its cue time, or GAP (0.25 s) after the previous line ends if that is later; the
printout marks those "late". KOKORO_DIR overrides where say.py lives. Writes out\voice\cNN.wav (trimmed, 24 kHz mono),
out\voice\track.wav (48 kHz stereo, film length) and out\voice\timing.json, and prints every sentence's fit.
VOICE / LANG / SPEED env override the defaults (bm_george, en-gb, 0.9).
"""
import json, os, pathlib, re, sys, wave
import numpy as np
BUILD = pathlib.Path(__file__).resolve().parent.parent
KOKORO = pathlib.Path(os.environ.get("KOKORO_DIR", str(BUILD / "kokoro")))
sys.path.insert(0, str(KOKORO))
from say import speak

VOICE = os.environ.get("VOICE", "bm_george"); LANG = os.environ.get("LANG_", "en-gb"); SPEED = float(os.environ.get("SPEED", "0.9"))
JOIN = os.environ.get("JOIN", "cue")   # cue: one recording per caption cue (stays in step with the picture); sentence: join cues to sentence ends
GAP = float(os.environ.get("GAP", "0.25"))   # least silence between two recordings; a late one is pushed back
vtt = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else BUILD / "out" / "intro-animatic.vtt"
out = BUILD / "out" / "voice"; out.mkdir(parents=True, exist_ok=True)

def sec(s):
    h, m, r = s.split(":"); return int(h) * 3600 + int(m) * 60 + float(r)
cues = []
for block in re.split(r"\n\s*\n", vtt.read_text(encoding="utf-8")):
    m = re.search(r"(\d\d:\d\d:\d\d\.\d+) --> (\d\d:\d\d:\d\d\.\d+)\s*\n(.+)", block, re.S)
    if m: cues.append((sec(m.group(1)), sec(m.group(2)), " ".join(m.group(3).split())))
chunks, cur = [], None
for t0, t1, text in cues:
    if cur is None: cur = {"t0": t0, "t1": t1, "text": text}
    else: cur["text"] += " " + text; cur["t1"] = t1
    if JOIN == "cue" or re.search(r"[.?!]$", text): chunks.append(cur); cur = None
if cur: chunks.append(cur)

SR = 48000
film_len = max(c["t1"] for c in chunks) + 2.0
if len(sys.argv) > 2: film_len = float(sys.argv[2])
track = np.zeros(int(film_len * SR), dtype=np.float64)
prev_end = 0.0
for i, c in enumerate(chunks):
    raw = out / f"_c{i:02d}.wav"; speak(str(raw), VOICE, c["text"], LANG, SPEED)
    with wave.open(str(raw)) as w:
        sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), "<i2")
    raw.unlink()
    loud = np.nonzero(np.abs(x.astype(int)) > 300)[0]
    y = x[max(0, loud[0] - int(.03 * sr)): min(len(x), loud[-1] + int(.12 * sr))]
    with wave.open(str(out / f"c{i:02d}.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(y.tobytes())
    dur = len(y) / sr
    n48 = int(round(dur * SR))
    y48 = np.interp(np.arange(n48) / SR, np.arange(len(y)) / sr, y.astype(np.float64))
    at = max(c["t0"], prev_end + GAP) if i else c["t0"]
    a = int(at * SR); seg = y48[: max(0, len(track) - a)]; track[a:a + len(seg)] += seg
    c.update(cue=c["t0"], t0=round(at, 3), dur=round(dur, 3), end=round(at + dur, 3)); prev_end = c["end"]
    nxt = chunks[i + 1]["t0"] if i + 1 < len(chunks) else film_len
    flag = ("late %.2f s; " % (c["t0"] - c["cue"]) if c["t0"] - c["cue"] > 0.01 else "") + ("RUNS PAST FILM END by %.2f s" % (c["end"] - film_len) if c["end"] > film_len else "%.2f s to next cue" % (nxt - c["end"]))
    print(f"c{i:02d} start {c['t0']:6.2f} dur {dur:5.2f} end {c['end']:6.2f}  {flag}  | {c['text']}")
peak = np.abs(track).max(); track *= (32767 * 10 ** (-3 / 20)) / peak
pcm = np.repeat(track.astype("<i2")[:, None], 2, axis=1)
with wave.open(str(out / "track.wav"), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
(out / "timing.json").write_text(json.dumps({"voice": VOICE, "lang": LANG, "speed": SPEED, "chunks": chunks}, indent=1), encoding="utf-8")
print("wrote", out / "track.wav", "%.2f s" % film_len, "total speech %.1f s" % sum(c["dur"] for c in chunks))
