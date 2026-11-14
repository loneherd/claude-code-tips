# Stage kit

Read `..\CONTRACT.md` first. This page is the kit API. `..\tools\selftest.html` is a minimal working scene.

## Files

| File | What it is |
|---|---|
| `stage.css` | 1920x1080 stage, transition kill switch, cursor, rings, caption bar, preview player |
| `stage.js` | `window.Stage`: timeline maths, tweens, camera, cursor, typing, rings, captions, `boot()`, player |
| `shell.js` + `shell.css` | optional, you write them: a `Shell.build()` that draws your product's sidebar and top bar with its real classes, so every scene shares the same frame |

## Scene skeleton

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>s02 Dashboard - product video</title>
<!-- the product's CSS, in the order its layout loads it, from the site-css snapshot -->
<link rel="stylesheet" href="../site-css/css/site.css">
<!-- kit last -->
<link rel="stylesheet" href="../kit/stage.css">
<style>/* scene-only styles */</style>
</head>
<body>
<div id="stage"><div id="world">
  <div class="card" id="card">...real markup copied from the product's view, invented data...
    <button id="start" class="btn">Start</button></div>
</div></div>
<script src="../kit/stage.js"></script>
<script>
var BEATS = { click: 1.2, open: [1.3, 2.0], end: 6 };          // ALL timing numbers here
var CAPTIONS = [{ t0: 0.3, t1: 5.8, text: 'Narration, verbatim from the script.' }];

var anim = Stage.anim([{ el: '#card', t: [0.2, 0.9], from: { opacity: 0, y: 16 }, to: { opacity: 1, y: 0 }, ease: 'out' }]);
var cur = Stage.cursor([{ t: 0.5, x: 1400, y: 700 }, { t: BEATS.click, el: '#start', click: true }]);

function seek(t) {
  anim(t);                       // 1. state and layout, from t alone
  Stage.camera(t, []);           // 2. camera
  Stage.ring(t, '#start', { t0: 2, t1: 4 });   // 3. overlays
  cur(t);                        // 4. cursor LAST (it measures what 1-3 produced)
}
Stage.boot({ id: 's02', title: 'Dashboard', duration: BEATS.end, captions: CAPTIONS, seek: seek });
</script>
</body>
</html>
```

## URL switches

| URL | Result |
|---|---|
| `scene.html` | preview player: the scene in a scaled 1920x1080 iframe, Play/Pause, scrub bar, time, Captions toggle. Space plays, arrow keys step 1 frame (Shift: 1 s), Home rewinds |
| `scene.html?render` | exactly the 1920x1080 stage, nothing else (what `tools\render.mjs` captures) |
| `&t=3.5` | seek to 3.5 s before `window.__ready` (stills, and the player's start time) |
| `&captions=0` | caption bar off |


## Stage API (`window.Stage`)

Maths: `clamp(x, a=0, b=1)`, `lerp(a, b, p)`, `prog(t, t0, t1)` -> 0..1,
`ease.linear | in | out | inOut | soft` (`soft` = critically damped spring, no overshoot),
`keys(t, [[t, v], [t, v, 'out'], ...])` piecewise number, `window01(t, in0, in1, out0, out1)` rise-and-fall 0..1.

`anim(specs)` -> `apply(t)`. Spec: `{ el, t: [t0, t1], from: {...}, to: {...}, ease }`. Props `x, y, scale, scaleX,
scaleY, rotate` (they OWN the element's transform), `opacity`, or any CSS property in camelCase (numbers become px,
except opacity, zIndex, fontWeight, flexGrow, lineHeight). A segment with no `from` starts where the previous segment
on that prop ended. Before the first segment the prop holds its first `from`; after the last, its last `to`.

`fade(t, el, { in: [t0, t1], out: [t2, t3], dx, dy, ease })` opacity in and out with a slide from dx/dy.
`setTransform(el, { x, y, scale, rotate })`.

`camera(t, keys)`: keys `{ t, zoom, x, y }` (world point placed at the stage centre) or `{ t, el, zoom | 'fit', pad }`.
Eased between keys; zoom moves in log space; clamped so the world edge never shows (so `x: 0, y: 0` means "anchor the
top-left corner"). Only `#world` is transformed; cursor and captions are not zoomed.

`ring(t, el, { t0, t1, fade=.35, pad=6, radius=12, key })` blue highlight ring;
`spot(t, el, {...})` same window, dims everything else. Both live in `#fx` inside the world, so they follow the camera.

`type(t, el, text, { t0, cps=13, caret=true, caretUntil })` types into an input/textarea (value) or any element
(textContent) and draws its own caret (solid while typing, blinks twice a second after). Returns 0..1.

`cursor(waypoints, { showAt, hideAt, fade })` -> `move(t)` returning `{ x, y, pressed, visible }`. Waypoint:
`{ t, x, y }` (stage px) or `{ t, el, dx, dy }` (element centre, measured at seek time), plus `dur` (travel time that
ends at `t`; default from distance, 0.5-1.3 s), `click: true` (press + expanding ring at `t`), `down: true` / `up: true`
(press and hold between them; drag paths are straight, others bow gently), `ease`, `straight`.

`rect(el)` stage-space box (what the viewer sees, camera included), `worldRect(el)` layout box (camera ignored),
`center(el, dx, dy)` stage-space centre. `W`, `H`, `SAFE_BOTTOM` (900), `RENDER`, `stage`, `world`, `fx`, `hud`.

`boot({ id, title, duration, captions, seek })` sets `window.SCENE` (its `seek` wraps yours and also drives
captions), waits for every font face the page declares and every `<img>`, seeks twice to the start
time, then sets `window.__ready = true`.

## Gotchas

1. **Call every helper on every seek, unconditionally.** They set their full state from `t` (hiding themselves
   outside their window). Skipping a call when "nothing changes" leaves stale state when someone scrubs backwards.
   Same for your own DOM: write `el.classList.toggle('x', t > 2)`, never `if (t > 2) el.classList.add('x')`.
2. **Order in `seek`: state, camera, overlays, cursor.** Cursor element waypoints are measured in stage space at seek
   time, so they must run after the camera and after anything that moves the target.
3. **`anim`/`fade`/`setTransform` own `transform`.** Do not tween x/y on an element whose CSS already uses transform;
   wrap it and tween the wrapper.
4. **No site JavaScript.** The product's scripts and frameworks are not loaded. Dropdowns show with the `show` class,
   tabs by setting `aria-selected` / classes yourself.
5. **Never put `will-change: transform` on `#world` or a zoomed element.** Chrome then rasterises once and scales
   the bitmap, so text blurs under the camera. Without it the zoomed frames stay sharp.
6. **Native carets blink on a wall clock**; the kit turns them off in the stage. Use `Stage.type` for a caret.
7. **Hover styles never fire** in a capture. Show a hover state with a class or inline style.
8. **Captions: two lines max** (34 px, 1380 px wide, roughly 130 characters). Split narration into several cues; the
    joined cue texts must equal the script line exactly. Cues less than 0.35 s apart share the bar without a flicker.
9. **Keep everything the viewer must read above `Stage.SAFE_BOTTOM` (900).** A two-line caption bar starts at about
    y 916, a one-line bar at about y 961. With the camera zoomed, check in stage space.
10. **Fill the page before `Stage.boot`** (boot waits for images and seeks right away). If you append to
    `Stage.world` yourself, insert before `Stage.fx` so rings stay on top.
11. **Badges and pills:** set explicit foreground and background pairs and check the contrast in a still; do not rely
    on a tint token that may be too light for small bold text.
12. **Data:** every name, host, ticket and address invented and obviously so ("Sample User", "Alex Example",
    "DEMO-PC-014", "#10001", "example.com"). Never copy seed data from the repo.
13. **Inline `<style>` blocks in the product's templates are not in `site-css`.** Copy what the page needs into the scene.
14. **Site CSS may colour `body` with high specificity.** Anything you add outside `#stage` needs explicit colours.
15. **Responsive breakpoints:** the player renders the scene in a 1920x1080 iframe so media queries always see desktop width. Never preview by opening `?render` in a narrow window.

## Checking your scene

From `build\` (give each parallel run its own `PORT`):

```
set PORT=9480   (Git Bash: PORT=9480 node ...)
node tools/render.mjs check   scenes/sNN-name.html          contract checks, pass/fail
node tools/render.mjs hash    scenes/sNN-name.html 4        same pixels after seeking away and back
node tools/render.mjs contact scenes/sNN-name.html 12        contact sheet (TIMES=0.5,2,4 for exact times)
node tools/render.mjs still   scenes/sNN-name.html 3.5 out/kit-check/x.png
```

Open the stills and look at them: zoomed text, caption overlap, badge contrast, clipped labels.
