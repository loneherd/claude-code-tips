# Render tools for the intro video

Node 24 and an installed Chrome (set `CHROME` to use another path, Edge, or Chrome on Linux/macOS). No npm packages. Run the commands from `build\`. Scene paths resolve
against the current folder first, then against `build\`.

## Commands

| Command | What it does |
|---|---|
| `node tools/render.mjs check <scene.html>` | Contract check, printed as a PASS/FAIL list (see below). Exit code 1 on any FAIL. |
| `node tools/render.mjs still <scene.html> <t> [out.png]` | One 1920x1080 PNG. Default `out\still_<id>_<t>.png`. |
| `node tools/render.mjs contact <scene.html> [n] [out.png]` | Contact sheet of n evenly spaced frames (default 12, 4 per row), each tile labelled `<id>  t=<s>`. `TIMES=1,2.5,4` picks the times (up to 6 get larger tiles). Default `out\contact_<id>.png`. |
| `node tools/render.mjs hash <scene.html> <t>` | Captures t, seeks elsewhere, seeks back, captures again, waits 500 ms, captures a third time. Prints `IDENTICAL` or `DIFFERENT` (pixel hash of the decoded PNG). |
| `node tools/render.mjs film [--scenes a,b]` | Every frame of every scene in `build\film.json` (or the listed scenes) at the film fps, encoded to H.264. Writes `out\intro-animatic.mp4` and `out\intro-animatic.vtt`. Progress every 20 s; frames, keyframes, duration, size and timing at the end. |
| `node tools/render.mjs paint tools/selftest.html [n]` | Selftest only. Captures n frames in shuffled order and reads the frame-number strip back from each screenshot. Proves each capture shows the frame just seeked. |
| `node tools/verify.mjs [file.mp4]` | Decode check (below). Default `out\intro-animatic.mp4`. |
| `node tools/render.mjs audio <track.wav> [out.mp4]` | Encode a 16-bit PCM WAV to AAC in Chrome and mux it with the cached picture (no re-capture). |
| `node tools/render.mjs decode <music.mp3> <out.wav>` | Decode audio with Chrome to a 48 kHz stereo WAV (no ffmpeg). |

Environment:
- `PORT`: DevTools port (render default 9361, verify default 9371). Give each parallel run its own.
- `PAR`: film only. Scene tabs capturing in parallel, default min(3, cores - 1).
- `FMT=jpeg|png` and `Q`: film frame transport, default JPEG at quality 92.
- `SETTLE=raf|none`: how a frame is made sure to be painted after `seek` (default `raf`).
- `VBR`: bitrate in bits per second, default 4,500,000. `BRMODE=variable|constant`, default variable.
- `FPS`: overrides `film.json`. `OUT`: output base name, default `intro-animatic`.
- `STRIP=<frames per scene>`: verify only, for selftest films.

`build\film.json`: `{ "fps": 30, "scenes": ["scenes/s01-example.html", ...] }`, in order.

Chrome is always shut down and its temporary profile (`%TEMP%\introvid-*`) removed. This covers normal exit, errors
and Ctrl+C. It was checked on the error paths: a missing scene, and a scene that never sets `__ready`.

## How it works

- One headless Chrome, driven over the DevTools protocol with Node's built-in WebSocket. It uses flat sessions, so
  one connection drives several tabs. Each tab is its own window with
  `Emulation.setDeviceMetricsOverride` 1920x1080 at device scale factor 1.
- **Scene tab(s)**: load `scene.html?render` and poll until `window.__ready === true`. To take a frame:
  `SCENE.seek(t)`, wait two `requestAnimationFrame`s, then `Page.captureScreenshot`. Console errors, exceptions,
  failed loads and HTTP errors are collected in every mode. `film` prints them as warnings and `check` fails on them.
- **Workbench tab** (`tools/encode.html`, loaded from `file://` because WebCodecs does not run on about:blank). It
  decodes each screenshot with `createImageBitmap`, wraps it in a `VideoFrame`, and feeds `VideoEncoder`. The
  encoder settings are `avc1.640028`, 4.5 Mbps, a keyframe every 2 s (60 frames) and `latencyMode: quality`. The same
  page also builds the contact sheets and the pixel hashes.
- **Frame transport**: the screenshot comes back from `captureScreenshot` as base64 JPEG (q92). Node passes the string
  unchanged to the workbench in a `Runtime.evaluate` call. Nothing is written to disk.
  - Why: the screenshot already arrives as base64 over the protocol, so passing it on costs one string copy.
    PNG files on disk would add a write and a read for every frame and leave about 3,300 files to clean up.
  - JPEG and PNG measured the same capture time (about 89 ms per frame with one tab). At q92, JPEG is visually
    lossless before an H.264 pass at 4.5 Mbps, and its strings are smaller. `FMT=png` is available.
  - `still`, `hash` and `check` always use PNG.
- **Memory**: the workbench chains `__frame` calls, so they reach the encoder in order. Node keeps at most two batches
  (2 x PAR frames) queued. The page refuses a frame that arrives out of order. Only the encoded H.264 chunks are kept
  in memory, about 2 to 3 MB per 10 s at the bitrates measured. At the end they are pulled out in batches of 150 and
  muxed by `mux.mjs`.
- **Parallel capture**: scenes are pure functions of t, so with PAR=3 three tabs hold the same scene and each captures
  one frame of every batch of three. The workbench then encodes the batch in frame order.
- **mux.mjs**: a small MP4 muxer in plain Node. The audio track is now optional (a video-only MP4 works), and the
  video timescale is 90 kHz with a frame duration of 90000/fps, so it is exact for 24, 25, 30 and 60 fps. The audio
  path (`audio: { sampleRate, channels, desc, samples }`, AAC) is unchanged, ready for a voice pass. It is tested (see below).
- **VTT**: each scene's captions, offset by the scene's start time. A scene starts at its first frame, so the start is
  the frame count so far divided by fps. Cue ends are clipped to the scene duration.

### What `check` verifies
1. The page loads and sets `__ready`.
2. `SCENE.id` and `SCENE.title` are non-empty strings, `duration` is greater than 0, and `seek` is a function.
3. The captions are an array. Each cue has numbers for `t0` and `t1`, with 0 <= t0 < t1 <= duration, and non-empty
   text. Cues are in order and do not overlap.
4. `seek` runs without throwing at the end, 0, 1/2, 1/3 and the last frame, in that order.
5. The viewport is 1920x1080 at dpr 1. The page's scroll size is exactly 1920x1080. The stage element
   (`#stage`, `.stage` or `[data-stage]`) is at 0,0 and is 1920x1080. The screenshot is 1920x1080.
6. The pixels at duration/2 are the same after seeking elsewhere and back, and still the same 600 ms later with no
   seek. `document.getAnimations()` is empty.
7. There are no console errors, exceptions, failed resource loads or HTTP errors.

## Measured speed (2026-11-13, a 4-core Windows VM with no GPU, numbers vary run to run on a shared host)

| Run | Frames | ms per frame, total wall time |
|---|---|---|
| selftest x8, PAR=1 | 960 | 87.3 (capture ~85, encode fully overlapped) |
| selftest x2, PAR=1, SETTLE=none | 240 | 81.2 |
| selftest x2, PAR=1, FMT=png | 240 | 90.7 |
| selftest x2, PAR=2 / 3 / 4 (older lockstep encoder) | 240 | 85.9 / 67.0 / 84.2 |
| selftest x8, PAR=3 (default) | 960 | **50.7** |
| a real product scene (site CSS), PAR=3 | 240 | **68.1** (a second run measured 115 while the host was busy) |

- Encode is not the bottleneck. Waiting on the encoder averaged 0.6 to 1.2 ms per frame, and the final flush took
  5 to 19 ms. `Page.captureScreenshot` is the main cost at about 75 ms per frame in one tab, probably because of
  software compositing on a VM without a GPU (inferred). Seeking plus the two-rAF settle cost about 23 ms.
- **Projection for 110 s at 30 fps (3,300 frames)**: at 50 to 70 ms per frame, about 3 to 4 minutes. Allow up to
  about 6.5 minutes if the host is busy (115 ms per frame). Real scenes heavier than s01 will be slower.
- Bitrate: on the content tested, the encoder used less than the 4.5 Mbps target: 2.3 Mbps on the selftest and
  1.9 Mbps on s01. `BRMODE=constant` gave the same size, so on this content 4.5 Mbps behaves as a ceiling.
- Encoded bytes differ between two identical runs (seen at PAR=1), so compare decoded frames, never MP4 hashes.

## Tested (2026-11-13)

- `check tools/selftest.html`: all 15 checks pass.
- `check` on a deliberately broken scratch scene failed 8 of 15 checks: empty title, cue past the duration, empty
  cue text, overlapping cues, a 1920x1100 page, `Math.random` in `seek`, a CSS animation, `console.error` and a
  missing image.
- `hash tools/selftest.html 1.5`: IDENTICAL (12f7594f, both times and 500 ms later), and a different hash (5691d5cf)
  at the other time. Two `hash` runs on PORT 9400 and 9401 at the same time were both IDENTICAL.
- `paint`: 120 of 120 shuffled captures showed the seeked frame with `SETTLE=raf`, and 120 of 120 with
  `SETTLE=none`, both JPEG. PNG: 40 of 40.
- `still tools/selftest.html 2.5`: the image shows "t = 2.500", "frame 75" and strip bits for 75.
- `contact tools/selftest.html`: inspected by eye. 12 different tiles, every counter equals its label, and captions
  appear only inside their cue windows.
- `film --scenes` with selftest x8, PAR=3: 960 of 960 frames, 16 keyframes, 32.000 s, 8.79 MB. The VTT has 16 cues
  at the correct offsets (for example scene 2 at 00:00:04.300).
- `STRIP=120 verify.mjs out/selftest-film.mp4`:
  - Every one of the 960 samples was fed to VideoDecoder and all 960 decoded. Timestamps rise, with no decoder error.
  - **960 of 960 decoded frames show the expected frame number.** This is an end-to-end proof of capture order,
    paint and encode with three tabs.
  - The `<video>` element reports 32 s at 1920x1080. The 8-point sheet was inspected and matches.
  - Negative control: STRIP=119 failed as expected, 119 of 240.
- Real scenes: a product scene and `check scenes/s01-example.html` both pass 15 of 15.
- `film` on a one-scene film.json gave 240 frames. `verify.mjs` reported VERIFY OK: 240 of 240 decoded, 8.000 s,
  1920x1080, no audio track. The decoded sheet was inspected.
- Chrome processes and `introvid-*` profiles are gone after normal runs and after the two error paths.

- Audio, on the example scene (2026-11-13): `voice.py` (Kokoro, 2 cues, none late) then `music.py` (synthesized
  bed) then `render.mjs audio` gave an 11.2 s MP4 with 336 video frames and 525 AAC frames at 48 kHz stereo;
  `verify.mjs` VERIFY OK, audio RMS -18.3 dB.

## Not tested

- A full-length (about 3,300 frame) film. Memory use was not measured, but only encoded chunks are kept.
- Ctrl+C during a film (the handler is in place, but it was not run on purpose).
- Playback in players other than Chrome (Edge, Teams, VLC, phones).
- Fonts and images that keep loading after `__ready`. The tools trust the scene's `__ready`.
