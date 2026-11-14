---
name: product-video
description: Make a clean narrated walkthrough video of a web app (intro, what's new, feature tour, training clip). HTML scenes built from the product's real CSS with invented data, captured frame by frame in headless Chrome, encoded to MP4 with WebCodecs, a local Kokoro voice, burned-in captions and soft music. No ffmpeg, no npm packages. Use when the user wants to make a video of an app, site, feature or release - "make a video", "intro video", "what's new video", "product tour", "walkthrough video", "/product-video" - or to change or re-render one.
---

# Product video: scenes in HTML, captured to MP4

The picture is not a screen recording. Each scene is an HTML page that draws the product from its real CSS, filled
with invented data, where a fake cursor clicks, drags and types and a camera zooms in. Every frame is a pure function
of time, so it renders the same every time and any line or beat can be changed and re-rendered in minutes.

`template/` beside this file is a complete build folder: the stage kit, the tools, and one example scene.

## What you need

- **Node 24** (built-in WebSocket; no npm packages).
- **Google Chrome** (or Edge). It does the capture and the H.264/AAC encoding through WebCodecs. Set `CHROME` to its
  path if it is not the standard Windows install.
- **For the voice:** Python 3.12 with `kokoro-onnx`, `numpy` (see `template/kokoro/requirements.txt`) and the two
  Kokoro model files `kokoro-v1.0.onnx` and `voices-v1.0.bin` in `template/kokoro/models/`. Runs on CPU, offline.
- **Music (optional):** any track you are licensed to use. Without one, `music.py` synthesizes a quiet chord bed.

## Rules that apply every time

- Every name, host, ticket, address and number on screen is invented and obviously so. Page and button names are
  verbatim from the product's code. If the script and the code disagree, the code wins; say so.
- Facts only in the narration. Do not describe a feature you have not found in the code.
- No installs without the user's approval. Only voices and music licensed for the use.
- Claude cannot hear audio. Say so, and report levels as numbers; the user reviews by watching.

## Steps

### 1. Script first

Write a short script and get the user's yes before building anything. One row per scene:

| # | Time | What is on screen | Narration (verbatim) |
|---|---|---|---|

Aim for 8 to 20 seconds a scene and under two minutes in total. Speech runs about 2.6 words per second at speed 0.9,
so check each line fits its scene with room to spare. Read the product's views first so every name is real. Decide
each scene's end state now, so scenes join cleanly.

### 2. Set up the build folder

Copy `template/` to `<project>/video/build/`. Then:
1. Fill in the paths at the top of `CONTRACT.md`.
2. Snapshot the product's CSS and fonts into `site-css/`, unedited, and note in `site-css/SOURCES.md` what came from
   where and at which commit. If the product loads a font from a CDN, copy the file and declare it in `kit/stage.css`.
3. Optional: write `kit/shell.js` + `shell.css` that draw the product's sidebar and top bar from its real classes, so
   every scene shares the same frame.
4. Prove the pipeline: `node tools/render.mjs check tools/selftest.html` must pass.

### 3. Build the scenes

Read `kit/README.md` (API and gotchas) and `scenes/s01-example.html`. Build the first real scene yourself so the look
is settled, then hand the rest to parallel subagents, one or two scenes each, each with its own `PORT`, using
`SCENE_BRIEF.md` as the brief. Look at every contact sheet yourself when they report.

### 4. Silent cut

List the scenes in `film.json`, then from the build folder:

```
OUT=<name> node tools/render.mjs film     -> out/<name>.mp4 + .vtt + .vcache.json
node tools/verify.mjs out/<name>.mp4
```

About 50 to 110 ms a frame. The cut is silent by design; tell the user before they open it.

### 5. Voice

```
PYTHONUTF8=1 kokoro/venv/Scripts/python.exe tools/voice.py out/<name>.vtt <film seconds>
```

One recording per caption cue. Defaults: voice `bm_george`, `en-gb`, speed 0.9 (env `VOICE`, `LANG_`, `SPEED`;
`KOKORO_DIR` if Kokoro lives elsewhere). It prints each line's start and length and flags any line that is **late**
(pushed back because the line before ran long) or runs past the film end. Fix those in the scenes (caption `t0`
values and `BEATS`, or a longer scene), re-render, and re-run until nothing is late by more than about half a second.

### 6. Music and the final file

```
node tools/render.mjs decode "music/<file>.mp3" out/voice/music.wav       (skip for the synthesized bed)
BED=out/voice/music.wav PYTHONUTF8=1 <python> tools/music.py              -> out/voice/mix.wav
OUT=<name> node tools/render.mjs audio out/voice/mix.wav out/<name>-final.mp4   (reuses the cached picture)
node tools/verify.mjs out/<name>-final.mp4
```

`BED_DB` (default -27 dBFS under speech) and `GAP_DB` (+5 dB between lines) set the music level; voice peaks at
-3 dBFS. `OUT` must match the film's, or `audio` cannot find the cached picture.

### 7. Hand off

- Poster frame: `node tools/render.mjs still scenes/<first>.html <t> out/<name>-poster.png`, at a moment the camera
  is still.
- Captions are burned in. A player must not also show the VTT by default.
- On a web page: `preload="none"`, open paused (browsers block autoplay with sound), serve with range requests.
- Never commit the MP4 to the product's repo by default; hand over the file and its hash.

## What went wrong the first time

- **Too many repeated clicks.** Show a repetitive action once or cut to the result.
- **Narration late against the picture** because scenes were timed before the voice existed. Step 5's loop fixes it;
  do it before the first voiced review.
- **A scene too short for its lines.** Check words per second while writing the script.
- **Script named a thing the code does not have.** Check every label against the views.
- **Real source credits under invented data** (a widget's "data from ..." line). Hide them.
- **`hash` says DIFFERENT by a few pixels** after a big seek: Chrome finishes text raster late. `SETTLE_MS=1000`.
- Encoded bytes differ between identical runs. Compare decoded frames, never MP4 hashes.

## Reference

- `template/tools/README.md`: every command, environment variable, how capture and encode work, measured speed.
- `template/kit/README.md`: `Stage` API (anim, camera, cursor, ring, spot, type, boot), scene skeleton, gotchas.
- `template/CONTRACT.md`, `template/SCENE_BRIEF.md`: the rules for scenes and the brief for scene agents.
