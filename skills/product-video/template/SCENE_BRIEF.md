# Brief for scene builders

Hand this file to each scene-building agent together with: its scene number(s), its own PORT (one per agent,
for example 9401, 9402, ...), and the filled-in paths from `CONTRACT.md`.

You are building one or two scenes of a short product video. Each scene is an HTML page that is a pure
function of time; a tool captures it frame by frame in headless Chrome. Platform: Windows, Git Bash. Nothing
may be installed. Work from the build folder named in `CONTRACT.md` (called `build\` below).

## Read first, fully

1. `build\CONTRACT.md`: scene contract, look, data rules, hard limits. Obey it exactly.
2. `build\kit\README.md`: the kit API, scene skeleton and gotchas.
3. `build\scenes\s01-*.html`: the reference scene the lead built first, so the look is settled.
4. Your scene's row in the script (the scene table), and whatever notes say where the feature lives in the
   source.

## How to build it

- The product source is a read-only checkout (path in `CONTRACT.md`). Find the real view for your page and
  copy its markup shapes and class names, so the scene looks like the real page. Page, tab, button, widget and
  field names are verbatim from the views. If a name in the script differs from the code, follow the code and
  report it.
- Link the page's own stylesheet the way its view does. Inline `<style>` blocks in a view are not in
  `site-css\`; copy what you need into the scene.
- Fill it with invented, obviously fake data (see the data rules). Never copy seed or test data.
- Use the shell builder for the sidebar and top bar, if the build has one. Do not edit anything under `kit\`, `tools\`, `site-css\`
  or another scene's file. If the kit lacks something, do it inside your scene and say so in your report.
- Narration for your scene goes in `CAPTIONS`, verbatim from the script, split into cues of at most two lines.
  The joined cue text must equal the script line exactly. Time each cue to sit with the action it describes,
  and leave each cue at least as long as the line takes to say (about 2.6 words per second at the default
  voice speed, plus 0.3 s).
- Scene length: the script's time span for your scene. All timing numbers in `BEATS`.

## Direction

- Every scene opens and closes on the full shell with the camera at zoom 1 (first and last 0.3 s), so scenes
  cut together like page changes. The page content can fade in over the first 0.3 s.
- End the scene in a state the next scene can plausibly start from (panels closed, menus closed), unless the
  script says the next scene continues the action.
- The video is shown well below full size, and real site text is small at 1920 wide. So after the opening,
  move the camera in (about 1.4x to 2x) on wherever the action is, and follow the action. Viewers must be able
  to read the labels the narration mentions. Two to four camera moves per scene, each held long enough to read.
- The cursor does everything a person would do: moves, clicks (with ring), drags, types. One action at a time,
  with a short pause after each so it can be followed. No action faster than a person could do it.
- Do not show every step of a repetitive action (for example clicking Next five times). Show it once, or cut
  straight to the result.
- Show the result of each action (the card lands in its new place, the widget appears, the tab content
  changes). State changes are computed from `t`, never by real event handlers.
- Calm and deliberate. No bounce, no spin, no confetti. Nothing clipped, nothing overlapping, nothing readable
  below `Stage.SAFE_BOTTOM`. Badges and pills need explicit readable foreground and background pairs.
- Use a ring or spotlight sparingly to point at the one thing the narration names.

## Check your own work (required)

From `build\`, using the PORT given in your task:

```
PORT=<port> node tools/render.mjs check   scenes/<file>.html
PORT=<port> node tools/render.mjs hash    scenes/<file>.html <t>      (at three different times)
PORT=<port> node tools/render.mjs contact scenes/<file>.html 16
PORT=<port> node tools/render.mjs still   scenes/<file>.html <t> out/check-<id>/<name>.png
```

Write stills only under `build\out\check-<id>\`. Open the contact sheet and at least six full-size stills with
the Read tool and look at them properly: text readable when zoomed, nothing under the caption bar, cursor on
the thing it is clicking, drag ends where the card lands, no leftover state when seeking backwards. Fix what
is wrong and look again. Do not report a check as passed unless you ran it and read the output.

`hash` can print DIFFERENT by a few pixels right after a large seek (Chrome finishes text raster up to about
a second late). Re-run with `SETTLE_MS=1000`; if that is IDENTICAL, the scene is fine.

## Report back (short)

Files created; the source views you based the scene on; any name where script and code differ; anything you
invented that is not in the real page (and why); what you looked at and fixed; what you could not verify.
Label anything inferred as inferred.
