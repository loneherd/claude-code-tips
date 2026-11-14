// Capture DOM scenes (CONTRACT.md) in headless Chrome over the DevTools protocol and encode them with WebCodecs.
// Node's built-in WebSocket and fetch only; nothing to install. Run from build\ (paths also resolve against build\).
//
//   node tools/render.mjs still   <scene.html> <t> [out.png]     one 1920x1080 frame
//   node tools/render.mjs contact <scene.html> [n]               contact sheet, n evenly spaced frames (default 12); TIMES=a,b,c overrides
//   node tools/render.mjs hash    <scene.html> <t>               determinism: capture, seek elsewhere, seek back, capture again
//   node tools/render.mjs check   <scene.html>                   contract check, pass/fail list
//   node tools/render.mjs paint   <scene.html> [n]               selftest only: reads the frame-number strip back from n shuffled captures
//   node tools/render.mjs film    [--scenes a,b]                 every frame of film.json (or the listed scenes) -> out\intro-animatic.mp4 + .vtt
//
// Env: PORT (DevTools port, default 9361; use a different one per parallel run), FPS (overrides film.json),
//      FMT=jpeg|png (film frame transport, default jpeg), Q (jpeg quality, default 92), SETTLE=raf|none (default raf),
//      VBR (bits per second, default 4500000), BRMODE=variable|constant (default variable), OUT (film output base name, default intro-animatic),
//      PAR (film: scene tabs capturing in parallel, default min(3, cores - 1); scenes are pure functions of t, so any tab can take any frame).
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir, availableParallelism } from 'node:os';
import { join, resolve, dirname, basename, isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { writeMp4 } from './mux.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD = dirname(HERE), OUTDIR = join(BUILD, 'out');
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';   // or Edge, or a Linux/macOS Chrome path
const PORT = +(process.env.PORT || 9361);
const W = 1920, H = 1080;
const SETTLE = process.env.SETTLE || 'raf';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [mode, ...args] = process.argv.slice(2);
mkdirSync(OUTDIR, { recursive: true });

function scenePath(p) {
  if (!p) throw new Error('scene path missing');
  for (const c of isAbsolute(p) ? [p] : [resolve(process.cwd(), p), resolve(BUILD, p)]) if (existsSync(c)) return c;
  throw new Error('scene not found: ' + p);
}

// ---------- Chrome lifetime: always killed, profile always removed ----------
let proc = null, ud = null, cleaned = false, closing = false;
function cleanup() {
  if (cleaned) return; cleaned = true;
  try { proc?.kill(); } catch {}
  if (ud) { for (let i = 0; i < 20; i++) { try { rmSync(ud, { recursive: true, force: true }); break; } catch { const t = Date.now() + 250; while (Date.now() < t); } } }
}
process.on('exit', cleanup);
for (const s of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(s, () => { console.error('interrupted'); cleanup(); process.exit(130); });

// ---------- minimal CDP client with flat sessions ----------
let ws, nextId = 0; const pending = new Map(), listeners = [];
async function launch() {
  ud = mkdtempSync(join(tmpdir(), 'introvid-'));
  proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${ud}`, '--no-first-run', '--no-default-browser-check',
    '--allow-file-access-from-files', '--hide-scrollbars', '--force-color-profile=srgb', '--force-device-scale-factor=1',
    `--window-size=${W},${H}`, '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    ...(process.env.CHROME_FLAGS ? process.env.CHROME_FLAGS.split(/\s+/).filter(Boolean) : []),
    'about:blank'], { stdio: 'ignore' });
  proc.on('exit', c => { if (!cleaned && !closing) console.error('chrome exited early, code', c); });
  for (let i = 0; i < 80 && !ws; i++) {
    try {
      const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      const s = new WebSocket(v.webSocketDebuggerUrl); await new Promise((r, j) => { s.onopen = r; s.onerror = j; }); ws = s;
    } catch { await sleep(250); }
  }
  if (!ws) throw new Error(`could not reach Chrome on port ${PORT} (another run on the same PORT?)`);
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.j(new Error(d.method + ' ' + JSON.stringify(d.error))) : p.r(d.result); }
    else if (d.method) for (const l of listeners) l(d);
  };
  ws.onclose = () => { for (const p of pending.values()) p.j(new Error('DevTools connection closed')); pending.clear(); };
}
const send = (method, params = {}, sessionId) => new Promise((r, j) => {
  const id = ++nextId; pending.set(id, { r, j: e => j(new Error(method + ': ' + e.message)) });
  ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
});
async function ev(sid, expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 600_000 }, sid);
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'exception').slice(0, 1500));
  return r.result?.value;
}
async function newTab() {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });   // own window: never a hidden background tab
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false, screenWidth: W, screenHeight: H }, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  return sessionId;
}
async function waitFor(sid, expr, ms, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await ev(sid, `!!(${expr})`)) return; } catch {} await sleep(100); }
  throw new Error(`timed out after ${ms} ms waiting for ${what}`);
}

// ---------- the scene tab ----------
let SC = null; const problems = [];   // console errors, exceptions, failed loads seen in the scene tab
async function sceneTab() {
  const sid = await newTab();
  if (!SC) SC = sid;
  await send('Network.enable', {}, sid);
  await send('Log.enable', {}, sid);
  const reqUrl = new Map();
  listeners.push(d => {
    if (d.sessionId !== sid) return;
    if (d.method === 'Runtime.exceptionThrown') problems.push('exception: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).split('\n')[0]);
    else if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'assert'))
      problems.push('console.' + d.params.type + ': ' + d.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') problems.push('log: ' + d.params.entry.text.slice(0, 300) + (d.params.entry.url ? ' ' + d.params.entry.url : ''));
    else if (d.method === 'Network.requestWillBeSent') reqUrl.set(d.params.requestId, d.params.request.url);
    else if (d.method === 'Network.loadingFailed' && !d.params.canceled) problems.push('load failed: ' + (reqUrl.get(d.params.requestId) || '?') + ' ' + d.params.errorText);
    else if (d.method === 'Network.responseReceived' && d.params.response.status >= 400) problems.push(`HTTP ${d.params.response.status}: ${d.params.response.url}`);
  });
  return sid;
}
async function loadScene(file, sid = SC) {
  if (sid === SC) problems.length = 0;
  const url = pathToFileURL(file).href + '?render';
  const nav = await send('Page.navigate', { url }, sid);
  if (nav.errorText) throw new Error('navigate failed: ' + nav.errorText);
  await waitFor(sid, 'window.__ready === true', 30_000, 'window.__ready in ' + basename(file));
  const info = await ev(sid,`JSON.stringify(window.SCENE ? { id: SCENE.id, title: SCENE.title, duration: SCENE.duration, captions: SCENE.captions, seekType: typeof SCENE.seek } : null)`);
  const s = JSON.parse(info);
  if (!s) throw new Error('window.SCENE missing in ' + basename(file));
  return s;
}
// seek, then make sure the change is painted before the screenshot.
// 'raf' waits two animation frames (style, layout, paint and commit done); 'none' relies on captureScreenshot alone.
async function seekPaint(t, sid = SC) {
  if (SETTLE === 'none') return ev(sid, `void SCENE.seek(${t})`);
  // SETTLE_MS: extra wait after the two animation frames, for pages Chrome is still rastering (zoomed, shadow-heavy).
  const extra = +(process.env.SETTLE_MS || 0);
  return ev(sid, `(SCENE.seek(${t}), new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => ${extra} ? setTimeout(r, ${extra}) : r()))))`);
}
async function shot(fmt = 'png', quality, sid = SC) {
  const p = { format: fmt, captureBeyondViewport: false, fromSurface: true, optimizeForSpeed: true };
  if (fmt === 'jpeg') p.quality = quality ?? 92;
  return (await send('Page.captureScreenshot', p, sid)).data;
}

// ---------- the workbench tab (tools/encode.html, file:// so WebCodecs is available) ----------
let WB = null;
async function workbench() {
  WB = await newTab();
  await send('Page.navigate', { url: pathToFileURL(join(HERE, 'encode.html')).href }, WB);
  await waitFor(WB, 'window.__ready === true', 15_000, 'encode.html');
}
const wb = (fn, ...a) => ev(WB, `${fn}(${a.map(x => JSON.stringify(x)).join(',')})`);
const savePng = (dataUrlOrB64, out) => { writeFileSync(out, Buffer.from(dataUrlOrB64.replace(/^data:[^,]*,/, ''), 'base64')); console.log('wrote', out); };
const fmtT = t => (+t).toFixed(3).replace(/\.?0+$/, '') || '0';
const vttTime = s => { const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, ss = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; };

// ---------- modes ----------
async function modeStill(file, t, out) {
  if (t === undefined || isNaN(+t)) throw new Error('usage: still <scene.html> <t> [out.png]');
  await workbench(); await sceneTab(); const s = await loadScene(scenePath(file));
  await seekPaint(+t);
  savePng(await shot('png'), resolve(out || join(OUTDIR, `still_${s.id}_${fmtT(t)}.png`)));
}

async function modeContact(file, n) {
  await workbench(); await sceneTab(); const s = await loadScene(scenePath(file));
  const fps = 30, last = Math.max(0, s.duration - 1 / fps);
  n = Math.max(1, +(n || 12));
  const times = process.env.TIMES ? process.env.TIMES.split(',').map(Number) : Array.from({ length: n }, (_, i) => n === 1 ? 0 : +(last * i / (n - 1)).toFixed(3));
  const tiles = [];
  for (const t of times) { await seekPaint(t); tiles.push({ data: await shot('jpeg', 90), mime: 'image/jpeg', label: `${s.id}  t=${fmtT(t)} s` }); }
  const big = !!process.env.TIMES && times.length <= 6;
  const out = resolve(args[2] || join(OUTDIR, `contact_${s.id}.png`));
  savePng(await wb('__contact', tiles, big ? 2 : 4, big ? 900 : 480), out);
  console.log('times', times.join(', '));
}

async function modeHash(file, t) {
  if (t === undefined || isNaN(+t)) throw new Error('usage: hash <scene.html> <t>');
  t = +t;
  await workbench(); await sceneTab(); const s = await loadScene(scenePath(file));
  const other = t < s.duration / 2 ? s.duration * 0.9 : s.duration * 0.1;
  await seekPaint(t); const a = await wb('__pixhash', await shot('png'), 'image/png');
  await seekPaint(other); const b0 = await wb('__pixhash', await shot('png'), 'image/png');
  await seekPaint(t); const b = await wb('__pixhash', await shot('png'), 'image/png');
  await sleep(500); const c = await wb('__pixhash', await shot('png'), 'image/png');   // no re-seek: catches wall-clock motion
  console.log(`t=${t}  first ${a}  after seek ${fmtT(other)} (${b0.split(' ')[0]}) and back ${b}  +500ms ${c}`);
  const ok = a === b && b === c && b0 !== a;
  console.log(ok ? 'IDENTICAL' : 'DIFFERENT', b0 === a ? '(warning: the other time rendered the same pixels, so the test proves little)' : '');
  if (!(a === b && b === c)) process.exitCode = 1;
}

async function modeCheck(file) {
  const res = []; const add = (ok, what) => res.push([ok, what]);
  await workbench(); await sceneTab();
  let s;
  try { s = await loadScene(scenePath(file)); add(true, 'loads and sets window.__ready = true'); }
  catch (e) { add(false, e.message); return report(res); }
  add(typeof s.id === 'string' && s.id.length > 0, `SCENE.id is a non-empty string (${JSON.stringify(s.id)})`);
  add(typeof s.title === 'string' && s.title.length > 0, `SCENE.title is a non-empty string (${JSON.stringify(s.title)})`);
  add(typeof s.duration === 'number' && isFinite(s.duration) && s.duration > 0, `SCENE.duration > 0 (${s.duration})`);
  add(s.seekType === 'function', 'SCENE.seek is a function');
  const caps = s.captions;
  if (!Array.isArray(caps)) add(false, 'SCENE.captions is an array');
  else {
    const bad = [];
    caps.forEach((c, i) => {
      if (!c || typeof c.t0 !== 'number' || typeof c.t1 !== 'number' || !isFinite(c.t0) || !isFinite(c.t1)) bad.push(`#${i} t0/t1 not numbers`);
      else { if (c.t0 < 0 || c.t1 > s.duration + 1e-9) bad.push(`#${i} [${c.t0}, ${c.t1}] outside 0..${s.duration}`); if (!(c.t1 > c.t0)) bad.push(`#${i} t1 <= t0`); }
      if (!c || typeof c.text !== 'string' || !c.text.trim()) bad.push(`#${i} text empty`);
      if (i > 0 && c && caps[i - 1] && c.t0 < caps[i - 1].t1 - 1e-9) bad.push(`#${i} overlaps #${i - 1}`);
    });
    add(bad.length === 0, `captions well formed, ordered, inside the duration (${caps.length} cue${caps.length === 1 ? '' : 's'})` + (bad.length ? ': ' + bad.join('; ') : ''));
  }
  // seek at several times, any order
  const seekErr = [];
  for (const t of [s.duration, 0, s.duration / 2, s.duration / 3, s.duration - 1 / 30]) { try { await seekPaint(t); } catch (e) { seekErr.push(`seek(${fmtT(t)}): ${e.message.split('\n')[0]}`); } }
  add(seekErr.length === 0, 'seek() runs at 0, 1/3, 1/2, end and in any order' + (seekErr.length ? ': ' + seekErr.join('; ') : ''));
  const geo = JSON.parse(await ev(SC, `JSON.stringify((() => { const d = document.documentElement, st = document.querySelector('#stage, .stage, [data-stage]');
    const r = st && st.getBoundingClientRect();
    return { iw: innerWidth, ih: innerHeight, sw: d.scrollWidth, sh: d.scrollHeight, dpr: devicePixelRatio,
             stage: r ? { sel: st.id ? '#' + st.id : '.' + [...st.classList].join('.'), x: r.x, y: r.y, w: r.width, h: r.height } : null }; })())`));
  add(geo.iw === W && geo.ih === H && geo.dpr === 1, `viewport ${geo.iw}x${geo.ih} at dpr ${geo.dpr}`);
  add(geo.sw === W && geo.sh === H, `page is exactly ${W}x${H}, no overflow (scroll size ${geo.sw}x${geo.sh})`);
  if (geo.stage) add(geo.stage.x === 0 && geo.stage.y === 0 && geo.stage.w === W && geo.stage.h === H, `stage element ${geo.stage.sel} at ${geo.stage.x},${geo.stage.y} size ${geo.stage.w}x${geo.stage.h}`);
  else add(false, 'stage element found (looked for #stage, .stage, [data-stage])');
  const shotSize = JSON.parse(JSON.stringify(await wb('__pixhash', await shot('png'), 'image/png'))).split(' ')[1];
  add(shotSize === `${W}x${H}`, `screenshot is ${shotSize}`);
  // determinism: same t after other seeks, and no change with wall-clock time
  const tm = s.duration / 2;
  await seekPaint(tm); const h1 = await wb('__pixhash', await shot('png'), 'image/png');
  await seekPaint(0); await seekPaint(s.duration); await seekPaint(tm); const h2 = await wb('__pixhash', await shot('png'), 'image/png');
  await sleep(600); const h3 = await wb('__pixhash', await shot('png'), 'image/png');
  add(h1 === h2, `same pixels at t=${fmtT(tm)} after seeking elsewhere and back`);
  add(h2 === h3, 'no change after 600 ms without a seek (no wall-clock motion)');
  const anims = await ev(SC, `document.getAnimations().length`);
  add(anims === 0, `no running CSS animations or transitions (${anims})`);
  add(problems.length === 0, 'no console errors, exceptions or failed loads' + (problems.length ? ':\n      ' + [...new Set(problems)].slice(0, 12).join('\n      ') : ''));
  report(res);
  function report(r) {
    for (const [ok, what] of r) console.log((ok ? 'PASS ' : 'FAIL ') + what);
    const f = r.filter(x => !x[0]).length; console.log(f ? `${f} FAILED of ${r.length}` : `ALL ${r.length} PASSED`); if (f) process.exitCode = 1;
  }
}

// Selftest-only proof that every capture shows the frame that was just seeked: shuffled frame order, strip read back.
async function modePaint(file, n) {
  await workbench(); await sceneTab(); const s = await loadScene(scenePath(file));
  const fps = 30, total = Math.round(s.duration * fps); n = Math.min(+(n || 60), total);
  const fr = Array.from({ length: total }, (_, i) => i); for (let i = fr.length - 1; i > 0; i--) { const j = (i * 7919 + 13) % (i + 1); [fr[i], fr[j]] = [fr[j], fr[i]]; }
  const fmt = process.env.FMT || 'jpeg', mime = 'image/' + fmt;
  let bad = 0;
  for (const f of fr.slice(0, n)) {
    await seekPaint(f / fps); const got = await wb('__readStrip', await shot(fmt, 92), mime, 40, 1000, 24, 16);
    if (got !== f) { bad++; console.log(`frame ${f}: strip reads ${got}`); }
  }
  console.log(`paint check (SETTLE=${SETTLE}, ${fmt}): ${n - bad}/${n} captures showed the seeked frame`); if (bad) process.exitCode = 1;
}

async function modeFilm() {
  const fj = JSON.parse(readFileSync(join(BUILD, 'film.json'), 'utf8'));
  const fps = +(process.env.FPS || fj.fps || 30);
  const i = args.indexOf('--scenes');
  const list = i >= 0 ? args[i + 1].split(',').map(x => x.trim()).filter(Boolean) : fj.scenes;
  if (!list || !list.length) throw new Error('no scenes: film.json "scenes" is empty and no --scenes given');
  const files = list.map(scenePath);
  const fmt = process.env.FMT || 'jpeg', mime = 'image/' + fmt, q = +(process.env.Q || 92);
  const base = process.env.OUT || 'intro-animatic';
  await workbench(); await sceneTab();
  const PAR = Math.max(1, +(process.env.PAR || Math.min(3, availableParallelism() - 1))), tabs = [SC];
  for (let k = 1; k < PAR; k++) tabs.push(await sceneTab());
  // load every scene once up front: durations, captions, and failure before the long run
  const scenes = [];
  for (const f of files) { const s = await loadScene(f); if (!(s.duration > 0)) throw new Error(basename(f) + ': duration must be > 0'); scenes.push({ file: f, ...s, frames: Math.round(s.duration * fps) }); }
  const total = scenes.reduce((a, s) => a + s.frames, 0);
  console.log(`film: ${scenes.length} scene(s), ${total} frames at ${fps} fps (${(total / fps).toFixed(2)} s), transport ${fmt}${fmt === 'jpeg' ? ' q' + q : ''}, settle ${SETTLE}`);
  console.log(await wb('__init', { width: W, height: H, fps, bitrate: +(process.env.VBR || 4.5e6), bitrateMode: process.env.BRMODE || 'variable', keyEvery: fps * 2, codec: 'avc1.640028' }));
  const T0 = Date.now(); let done = 0, tCap = 0, tEnc = 0, cur = '';
  const timer = setInterval(() => { const el = (Date.now() - T0) / 1000; console.log(`  ${done}/${total} frames (${(100 * done / total).toFixed(0)}%), ${el.toFixed(0)} s, ${(el * 1000 / Math.max(1, done)).toFixed(1)} ms/frame, scene ${cur}`); }, 20_000);
  const inflight = []; let g = 0;
  const vtt = ['WEBVTT', ''];
  try {
    for (const s of scenes) {
      cur = s.id;
      await Promise.all(tabs.map(sid => loadScene(s.file, sid)));
      const off = g / fps;
      for (const c of s.captions || []) vtt.push(`${vttTime(off + c.t0)} --> ${vttTime(off + Math.min(c.t1, s.duration))}`, c.text, '');
      // PAR tabs hold the same scene; each captures one frame of the batch in parallel, then the batch is encoded in order
      for (let n0 = 0; n0 < s.frames; n0 += tabs.length) {
        const a = Date.now(), k = Math.min(tabs.length, s.frames - n0);
        const datas = await Promise.all(tabs.slice(0, k).map(async (sid, j) => { await seekPaint((n0 + j) / fps, sid); return shot(fmt, q, sid); }));
        const b = Date.now(); tCap += b - a;
        // the encode page chains __frame calls in order, so send the batch without waiting; keep at most ~2 batches queued
        for (const data of datas) { const gi = g++; inflight.push(wb('__frame', data, mime, gi).then(() => { done++; })); }
        while (inflight.length > 2 * tabs.length) await inflight.shift();
        tEnc += Date.now() - b;
      }
      if (problems.length) console.log(`  warning in ${s.id}: ` + [...new Set(problems)].slice(0, 5).join(' | '));
    }
    await Promise.all(inflight);
  } finally { clearInterval(timer); }
  const tF = Date.now(); const fin = JSON.parse(await wb('__finish')); const flushMs = Date.now() - tF;
  if (fin.err) throw new Error('encoder: ' + fin.err);
  const meta = JSON.parse(await ev(WB, '__meta()'));
  const v = []; for (let k = 0; k < meta.nv; k += 150) for (const x of JSON.parse(await ev(WB, `__take(${k}, 150)`))) v.push({ data: Buffer.from(x.d, 'base64'), ts: x.ts, key: x.key });
  await ev(WB, '__release()');
  const mp4 = join(OUTDIR, base + '.mp4');
  const info = writeMp4(mp4, { video: { width: W, height: H, fps, desc: Buffer.from(meta.vdesc, 'base64'), samples: v } });
  writeFileSync(join(OUTDIR, base + '.vtt'), vtt.join('\n'));
  // keep the encoded video so "audio" mode can add or replace the narration without capturing frames again
  writeFileSync(join(OUTDIR, base + '.vcache.json'), JSON.stringify({ width: W, height: H, fps, vdesc: meta.vdesc, v: v.map(x => ({ ts: x.ts, key: x.key, d: x.data.toString('base64') })) }));
  const wall = (Date.now() - T0) / 1000;
  console.log('wrote', mp4); console.log('wrote', join(OUTDIR, base + '.vtt'));
  console.log(`frames ${info.videoFrames} (expected ${total}), keyframes ${info.keyframes}, duration ${info.seconds} s, size ${(statSync(mp4).size / 1048576).toFixed(2)} MB` +
    ` (${(statSync(mp4).size * 8 / info.seconds / 1e6).toFixed(2)} Mbps)`);
  console.log(`time ${wall.toFixed(1)} s total = ${(wall * 1000 / total).toFixed(1)} ms/frame; seek+capture ${(tCap / total).toFixed(1)} ms/frame (${PAR} tab${PAR > 1 ? 's' : ''}), waiting on encoder ${(tEnc / total).toFixed(1)} ms/frame, final flush ${flushMs} ms`);
  if (info.videoFrames !== total) { console.error('FRAME COUNT MISMATCH'); process.exitCode = 1; }
}

// audio <track.wav> [out.mp4]: encode a 16-bit PCM WAV to AAC in Chrome and mux it with the cached video of the last film.
async function modeAudio(wavArg, outArg) {
  const base = process.env.OUT || 'intro-animatic';
  const cache = JSON.parse(readFileSync(join(OUTDIR, base + '.vcache.json'), 'utf8'));
  const wav = readFileSync(resolve(wavArg || join(OUTDIR, 'voice', 'track.wav')));
  if (wav.toString('latin1', 0, 4) !== 'RIFF' || wav.readUInt16LE(20) !== 1 || wav.readUInt16LE(34) !== 16) throw new Error('need a 16-bit PCM WAV');
  const ch = wav.readUInt16LE(22), sr = wav.readUInt32LE(24);
  let p = 12; while (wav.toString('latin1', p, p + 4) !== 'data') p += 8 + wav.readUInt32LE(p + 4);
  const pcm = wav.subarray(p + 8, p + 8 + wav.readUInt32LE(p + 4));
  await workbench();
  for (let i = 0; i < pcm.length; i += 3_000_000) await wb('__audioPcm', pcm.subarray(i, Math.min(pcm.length, i + 3_000_000)).toString('base64'));
  const r = JSON.parse(await wb('__audioEncode', sr, ch, +(process.env.ABR || 128000)));
  if (r.err) throw new Error('audio encoder: ' + r.err);
  const a = []; for (let k = 0; k < r.chunks; k += 400) for (const x of JSON.parse(await ev(WB, `__audioTake(${k}, 400)`))) a.push({ data: Buffer.from(x.d, 'base64'), ts: x.ts });
  const mp4 = resolve(outArg || join(OUTDIR, 'intro-voiced.mp4'));
  const info = writeMp4(mp4, {
    video: { width: cache.width, height: cache.height, fps: cache.fps, desc: Buffer.from(cache.vdesc, 'base64'), samples: cache.v.map(x => ({ data: Buffer.from(x.d, 'base64'), ts: x.ts, key: x.key })) },
    audio: { sampleRate: sr, channels: ch, desc: r.desc ? Buffer.from(r.desc, 'base64') : null, samples: a } });
  console.log('wrote', mp4, JSON.stringify(info), `audio ${r.seconds.toFixed(2)} s, ${a.length} AAC frames, ${sr} Hz x${ch}, size ${(statSync(mp4).size / 1048576).toFixed(2)} MB`);
}

// decode <music.mp3|m4a|mp4|wav> <out.wav>: decode with Chrome to a 48 kHz stereo 16-bit WAV (no ffmpeg)
async function modeDecode(inArg, outArg) {
  const src = readFileSync(resolve(inArg));
  await workbench();
  for (let i = 0; i < src.length; i += 3_000_000) await wb('__decPart', src.subarray(i, Math.min(src.length, i + 3_000_000)).toString('base64'));
  const r = JSON.parse(await wb('__decRun')); const parts = [];
  for (let i = 0; i < r.bytes; i += 3_000_000) parts.push(Buffer.from(await ev(WB, `__decTake(${i}, 3000000)`), 'base64'));
  const pcm = Buffer.concat(parts), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(48000, 24); h.writeUInt32LE(48000 * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  writeFileSync(resolve(outArg), Buffer.concat([h, pcm]));
  console.log('wrote', resolve(outArg), `${r.seconds.toFixed(2)} s, source ${r.channels} ch`);
}

try {
  if (!['still', 'contact', 'hash', 'check', 'paint', 'film', 'audio', 'decode'].includes(mode)) {
    console.log('usage: node tools/render.mjs still <scene> <t> [out.png] | contact <scene> [n] | hash <scene> <t> | check <scene> | paint <scene> [n] | film [--scenes a,b]');
    process.exitCode = 2;
  } else {
    await launch();
    if (mode === 'still') await modeStill(args[0], args[1], args[2]);
    else if (mode === 'contact') await modeContact(args[0], args[1]);
    else if (mode === 'hash') await modeHash(args[0], args[1]);
    else if (mode === 'check') await modeCheck(args[0]);
    else if (mode === 'paint') await modePaint(args[0], args[1]);
    else if (mode === 'film') await modeFilm();
    else if (mode === 'audio') await modeAudio(args[0], args[1]);
    else if (mode === 'decode') await modeDecode(args[0], args[1]);
  }
} catch (e) { console.error('ERROR', e.message); process.exitCode = 1; }
finally {
  closing = true;
  if (ws && ws.readyState === 1) { try { await Promise.race([send('Browser.close'), sleep(2000)]); } catch {} }   // orderly exit first
  try { ws?.close(); } catch {} await sleep(300); cleanup();
}
