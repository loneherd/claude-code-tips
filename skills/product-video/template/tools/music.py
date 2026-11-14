r"""Make a soft background bed and mix it under the narration. No samples, no downloads: plain synthesis.

    <kokoro venv python> tools\music.py            -> out\voice\bed.wav and out\voice\mix.wav
    BED=path\to\your.wav <python> tools\music.py   -> use your own music file (16-bit WAV) instead of the synth bed

The bed is slow warm chords (F major: Fmaj7, Dm7, Bbmaj7, Csus2), 8 s each, with a quiet bell note now and then.
It is lowered while a narration line plays (times from out\voice\timing.json) and comes up a little in the gaps.
BED_DB (default -27) is the bed level under speech in dB relative to full scale; GAP_DB (default +5) the lift in gaps.
"""
import json, os, pathlib, wave
import numpy as np
BUILD = pathlib.Path(__file__).resolve().parent.parent
V = BUILD / "out" / "voice"; SR = 48000
def rd(p):
    with wave.open(str(p)) as w:
        ch, sr = w.getnchannels(), w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float64) / 32768
    return x.reshape(-1, ch), sr
voice, sr = rd(V / "track.wav"); assert sr == SR
N = len(voice); t = np.arange(N) / SR

def synth_bed():
    rng = np.random.default_rng(7)
    f = lambda m: 440 * 2 ** ((m - 69) / 12)
    chords = [[41, 53, 57, 60, 64], [38, 50, 53, 57, 60], [34, 46, 50, 53, 57], [36, 48, 55, 60, 62]]   # MIDI notes
    L = 8.0; out = np.zeros((N, 2))
    for k in range(int(N / SR / L) + 1):
        a = k * L - 1.5; n0 = max(0, int(a * SR)); n1 = min(N, int((a + L + 3.0) * SR))
        if n1 <= n0: continue
        tt = t[n0:n1] - a
        env = np.clip(tt / 3.0, 0, 1) * np.clip((L + 3.0 - tt) / 3.0, 0, 1); env = np.sin(env * np.pi / 2) ** 2   # equal-power overlap
        for j, m in enumerate(chords[k % 4]):
            for side, det in ((0, -0.0015), (1, 0.0015)):
                fr = f(m) * (1 + det * (1 + j % 2)); ph = rng.uniform(0, 6.283)
                tone = np.sin(6.283185 * fr * tt + ph) + 0.28 * np.sin(6.283185 * 2 * fr * tt + ph * 1.7) + 0.08 * np.sin(6.283185 * 3 * fr * tt)
                trem = 1 + 0.12 * np.sin(6.283185 * (0.11 + 0.03 * j) * tt + ph)
                out[n0:n1, side] += tone * env * trem * (0.5 if j == 0 else 0.3)
        # one quiet bell note per chord, a chord tone two octaves up, placed off the bar line
        m = chords[k % 4][2 + k % 3] + 24; b0 = int((k * L + 2.5 + (k % 2) * 2.0) * SR)
        if b0 < N:
            bt = np.arange(min(N - b0, int(5 * SR))) / SR
            bell = (np.sin(6.283185 * f(m) * bt) + 0.2 * np.sin(6.283185 * 2.01 * f(m) * bt)) * np.exp(-bt / 1.3) * np.clip(bt / 0.02, 0, 1)
            pan = 0.35 + 0.3 * (k % 2); out[b0:b0 + len(bt), 0] += bell * 0.5 * (1 - pan); out[b0:b0 + len(bt), 1] += bell * 0.5 * pan
    return out / np.abs(out).max()

if os.environ.get("BED"):
    bed, bsr = rd(os.environ["BED"])
    if bed.shape[1] == 1: bed = np.repeat(bed, 2, axis=1)
    if bsr != SR: bed = np.stack([np.interp(np.arange(int(len(bed) * SR / bsr)) / SR, np.arange(len(bed)) / bsr, bed[:, c]) for c in (0, 1)], axis=1)
    reps = int(np.ceil(N / len(bed))); bed = np.tile(bed, (reps, 1))[:N]; bed = bed / np.abs(bed).max()
else:
    bed = synth_bed()
rms = np.sqrt((bed ** 2).mean()); bed = bed / rms                      # unit RMS, then set by level
under = 10 ** (float(os.environ.get("BED_DB", "-27")) / 20); lift = 10 ** (float(os.environ.get("GAP_DB", "5")) / 20)
gain = np.full(N, under * lift)
for c in json.loads((V / "timing.json").read_text(encoding="utf-8"))["chunks"]:
    gain[max(0, int((c["t0"] - 0.35) * SR)): int((c["end"] + 0.35) * SR)] = under
k = int(0.5 * SR); cs = np.cumsum(np.concatenate([[0.0], np.pad(gain, k, mode="edge")])); gain = (cs[2 * k + 1:] - cs[:-(2 * k + 1)])[:N] / (2 * k + 1)   # 0.5 s ramps (running mean)
gain *= np.clip(t / 2.5, 0, 1) * np.clip((N / SR - t) / 3.5, 0, 1)                                                   # fade in and out
bedg = bed * gain[:, None]
def wr(p, x):
    with wave.open(str(p), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
wr(V / "bed.wav", bedg / max(1e-9, np.abs(bedg).max()) * 0.7)          # the bed alone, loud enough to audition
mix = voice + bedg; wr(V / "mix.wav", mix)
db = lambda x: 20 * np.log10(max(1e-9, x))
print("voice peak %.1f dBFS, bed under speech %.1f dBFS rms, in gaps %.1f, mix peak %.1f dBFS" % (db(np.abs(voice).max()), db(under), db(under * lift), db(np.abs(mix).max())))
print("wrote", V / "bed.wav", "and", V / "mix.wav", "%.1f s" % (N / SR))
