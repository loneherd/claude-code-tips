# Video build contract

Fill in the three `<...>` values when you copy this template, then keep the file as the rules every scene obeys.

- Build folder: `<BUILD>` (this folder)
- Product source (read-only): `<SOURCE>` (the repo or checkout whose pages the video shows)
- Script and scene list: `<SCRIPT.md>`

## Layout

```
<BUILD>\
  CONTRACT.md        this file
  SCENE_BRIEF.md     brief handed to each scene-building agent
  film.json          { "fps": 30, "scenes": [...] } in play order
  site-css\          snapshot of the product's real CSS and fonts (copied, never edited) + SOURCES.md
  kit\stage.css      stage, cursor, caption bar
  kit\stage.js       timeline helpers, camera, cursor, captions, boot()
  kit\shell.js/.css  (optional, you write it) builds the product's sidebar and top bar into a scene
  scenes\sNN-name.html   one page per scene
  tools\             capture, encode, mux, voice, music (Node + headless Chrome + Kokoro)
  kokoro\            say.py, requirements.txt, models\ (the voice)
  music\             background music, if any
  out\               stills, contact sheets, MP4, VTT, voice (generated)
```

## Scene contract

A scene is one HTML page that renders a fixed 1920x1080 stage and is a pure function of time.

- The page sets `window.SCENE = { id, title, duration, captions, seek }` and then `window.__ready = true`
  (after fonts and images are loaded).
  - `duration`: seconds.
  - `captions`: `[{ t0, t1, text }]`, times in scene seconds. Text is the narration from the script, verbatim.
  - `seek(t)`: puts every element in the state for time `t`. Calling `seek` with the same `t` twice gives the
    same pixels. Calling it with times in any order works (no state carried between calls).
- No wall-clock animation: no CSS transitions, CSS animations, `setTimeout`, `requestAnimationFrame` loops,
  `Date.now()`, `Math.random()` without a fixed seed, video or GIF. `kit\stage.css` turns transitions and
  animations off globally. All motion is computed in `seek(t)` with the kit's easing helpers.
- All timing numbers sit in one `BEATS` object at the top of the scene script, so retiming to the voice
  track is a matter of editing numbers.
- Opened directly in a browser (no `?render`), the kit shows a scrub bar and play button under the stage,
  scaled to fit the window. With `?render` the page is exactly 1920x1080 with no chrome.
- The stage is the only thing that scrolls or moves. Page background outside the stage is black.

## Look

- Use the product's real CSS from `site-css\` and the real markup shapes from its views, so the video looks
  like the product. Do not restyle the product. One theme for the whole film.
- Page, menu, widget, tab and button names are the product's own, verbatim from the views.
- Badges and status pills: explicit high-contrast foreground and background pairs. Check they are readable.
- A fake mouse cursor (kit) shows every click, drag and hover. Clicks show a short ring.
- Caption bar at the bottom of the stage. Captions are burned into the picture.

## Data rules (hard)

- Every person, machine, ticket, address and number on screen is invented and obviously so:
  "Sample User", "Alex Example", "DEMO-PC-014", ticket "#10001", "example.com". No real user name, host
  name, IP address, email or ticket from the code, tests, seed data or anywhere else.
- No company staff names. The product's name and its page names are fine.
- Hide source credits that the real page prints under live data when the data is invented.
- No secrets. If one turns up while reading the source, report its path and type only, never the value.

## Limits

- Write only inside `<BUILD>`. `<SOURCE>` is read-only for this work.
- No git commits, no push, no network, no installs (no npm, pip, ffmpeg, Puppeteer, Playwright). Node 24 and
  an installed Chrome (path in `CHROME`, default the standard Windows install) are what there is.
- Do not connect to any server, database or live site.
