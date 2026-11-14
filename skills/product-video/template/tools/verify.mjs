// Decode check for an MP4 written by render.mjs, in headless Chrome.
//   node tools/verify.mjs [file.mp4]          default out\intro-animatic.mp4
// 1. Parses the MP4 in Node (tracks, sample table) and feeds every video sample to Chrome's VideoDecoder:
//    counts decoded frames, checks timestamps rise, reports decoder errors.
// 2. Opens the file in a <video> element: duration and size as the browser sees them, plus a sheet of decoded frames
//    at 8 evenly spaced times -> out\<name>_decoded.png.
// 3. Audio track: decoded with decodeAudioData if present; otherwise reported as video only.
// STRIP=<frames per scene> (selftest films only): reads the selftest's frame-number strip from EVERY decoded frame
// and checks it equals (frame index mod that number).
// Env PORT (default 9371). Chrome is always killed and its temp profile removed.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), OUTDIR = join(dirname(HERE), 'out');
const file = resolve(process.argv[2] || join(OUTDIR, 'intro-animatic.mp4'));
const PORT = +(process.env.PORT || 9371), sleep = ms => new Promise(r => setTimeout(r, ms));
const STRIP = +(process.env.STRIP || 0);

// ---------- MP4 parse ----------
const buf = readFileSync(file);
function boxes(b, s, e) { const out = []; while (s + 8 <= e) { let size = b.readUInt32BE(s), hdr = 8; const type = b.toString('latin1', s + 4, s + 8);
  if (size === 1) { size = Number(b.readBigUInt64BE(s + 8)); hdr = 16; } else if (size === 0) size = e - s;
  out.push({ type, s, e: s + size, d: s + hdr }); s += size; } return out; }
const child = (b, bx, type) => boxes(b, bx.d, bx.e).find(x => x.type === type);
const path = (b, bx, ...types) => types.reduce((x, t) => x && child(b, x, t), bx);
const top = boxes(buf, 0, buf.length), moov = top.find(x => x.type === 'moov');
if (!moov) throw new Error('no moov box');
const tracks = boxes(buf, moov.d, moov.e).filter(x => x.type === 'trak').map(trak => {
  const mdia = child(buf, trak, 'mdia'), hdlr = child(buf, mdia, 'hdlr'), mdhd = child(buf, mdia, 'mdhd');
  const kind = buf.toString('latin1', hdlr.d + 8, hdlr.d + 12);
  const v = buf[mdhd.d], timescale = buf.readUInt32BE(mdhd.d + (v ? 20 : 12)), duration = v ? Number(buf.readBigUInt64BE(mdhd.d + 24)) : buf.readUInt32BE(mdhd.d + 16);
  const stbl = path(buf, mdia, 'minf', 'stbl'), stsd = child(buf, stbl, 'stsd');
  const entry = boxes(buf, stsd.d + 8, stsd.e)[0];
  const stsz = child(buf, stbl, 'stsz'), fixed = buf.readUInt32BE(stsz.d + 4), n = buf.readUInt32BE(stsz.d + 8);
  const sizes = Array.from({ length: n }, (_, i) => fixed || buf.readUInt32BE(stsz.d + 12 + 4 * i));
  const co = child(buf, stbl, 'co64') || child(buf, stbl, 'stco'), nc = buf.readUInt32BE(co.d + 4);
  const chunkOff = Array.from({ length: nc }, (_, i) => co.type === 'co64' ? Number(buf.readBigUInt64BE(co.d + 8 + 8 * i)) : buf.readUInt32BE(co.d + 8 + 4 * i));
  const stsc = child(buf, stbl, 'stsc'), ns = buf.readUInt32BE(stsc.d + 4);
  const sc = Array.from({ length: ns }, (_, i) => ({ first: buf.readUInt32BE(stsc.d + 8 + 12 * i), per: buf.readUInt32BE(stsc.d + 12 + 12 * i) }));
  const offsets = []; let si = 0;
  for (let c = 0; c < nc; c++) { const run = sc.filter(r => r.first <= c + 1).pop(); let o = chunkOff[c]; for (let k = 0; k < run.per && si < n; k++, si++) { offsets.push(o); o += sizes[si]; } }
  const stts = child(buf, stbl, 'stts'), nt = buf.readUInt32BE(stts.d + 4), ts = []; let t = 0;
  for (let i = 0; i < nt; i++) { const c = buf.readUInt32BE(stts.d + 8 + 8 * i), d = buf.readUInt32BE(stts.d + 12 + 8 * i); for (let k = 0; k < c; k++) { ts.push(t); t += d; } }
  const stss = child(buf, stbl, 'stss'); const keys = new Set(stss ? Array.from({ length: buf.readUInt32BE(stss.d + 4) }, (_, i) => buf.readUInt32BE(stss.d + 8 + 4 * i) - 1) : []);
  const tr = { kind, timescale, duration, n, entry: entry.type, sizes, offsets, ts, keys };
  if (entry.type === 'avc1') { tr.width = buf.readUInt16BE(entry.d + 24); tr.height = buf.readUInt16BE(entry.d + 26); const avcC = boxes(buf, entry.d + 78, entry.e).find(x => x.type === 'avcC'); tr.avcC = buf.subarray(avcC.d, avcC.e); }
  return tr;
});
const V = tracks.find(t => t.kind === 'vide'), A = tracks.find(t => t.kind === 'soun');
if (!V) throw new Error('no video track');
const codec = 'avc1.' + [...V.avcC.subarray(1, 4)].map(x => x.toString(16).padStart(2, '0')).join('');
console.log(`file ${file}  ${(buf.length / 1048576).toFixed(2)} MB`);
console.log(`parsed: video ${V.entry} ${codec} ${V.width}x${V.height}, ${V.n} samples, ${(V.duration / V.timescale).toFixed(3)} s, ${V.keys.size} keyframes; ` +
  (A ? `audio ${A.entry}, ${A.n} packets, ${(A.duration / A.timescale).toFixed(3)} s` : 'no audio track (video only)'));

// ---------- Chrome ----------
const ud = mkdtempSync(join(tmpdir(), 'introvid-verify-'));
const proc = spawn(process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${ud}`,
  '--no-first-run', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', pathToFileURL(join(HERE, 'encode.html')).href], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => { if (cleaned) return; cleaned = true; try { proc.kill(); } catch {} for (let i = 0; i < 20; i++) { try { rmSync(ud, { recursive: true, force: true }); break; } catch { const t = Date.now() + 250; while (Date.now() < t); } } };
process.on('exit', cleanup);
for (const s of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(s, () => { cleanup(); process.exit(130); });

let ws, id = 0; const pend = new Map();
const ev = expr => new Promise((r, j) => { const i = ++id; pend.set(i, d => d.result?.exceptionDetails ? j(new Error(d.result.exceptionDetails.exception?.description || d.result.exceptionDetails.text)) : r(d.result?.result?.value));
  ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true, timeout: 600000 } })); });
try {
  for (let i = 0; i < 80 && !ws; i++) { try { const t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page' && t.url.includes('encode.html')); if (t) { const s = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r, j) => { s.onopen = r; s.onerror = j; }); ws = s; } } catch {} if (!ws) await sleep(250); }
  if (!ws) throw new Error('could not reach Chrome on port ' + PORT);
  ws.onmessage = m => { const d = JSON.parse(m.data); const f = pend.get(d.id); if (f) { pend.delete(d.id); f(d); } };
  for (let i = 0; i < 60 && !(await ev('!!window.__ready')); i++) await sleep(100);

  // 1. full decode
  await ev(`(() => { window.__dec = { n: 0, ts: [], err: null, strip: [] };
    const D = window.__dec, cv = new OffscreenCanvas(${V.width}, ${V.height}), g = cv.getContext('2d', { willReadFrequently: true });
    window.__vd = new VideoDecoder({ output: f => { D.n++; D.ts.push(f.timestamp);
        if (${STRIP}) { g.drawImage(f, 0, 0); let v = 0; for (let b = 0; b < 16; b++) { const p = g.getImageData(40 + b * 24 + 12, 1012, 1, 1).data; if (p[0] > 128) v |= 1 << b; } D.strip.push(v); }
        f.close(); }, error: e => { D.err = String(e); } });
    const bin = atob(${JSON.stringify(V.avcC.toString('base64'))}), desc = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) desc[i] = bin.charCodeAt(i);
    __vd.configure({ codec: ${JSON.stringify(codec)}, codedWidth: ${V.width}, codedHeight: ${V.height}, description: desc });
    window.__feed = list => { for (const s of list) { const b = atob(s.d), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
        __vd.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: s.ts, data: u })); }
      return new Promise(r => { const w = () => __vd.decodeQueueSize > 8 ? setTimeout(w, 2) : r(D.n); w(); }); };
    return true; })()`);
  const t0 = Date.now();
  for (let i = 0; i < V.n; i += 60) {
    const list = []; for (let k = i; k < Math.min(V.n, i + 60); k++)
      list.push({ d: buf.subarray(V.offsets[k], V.offsets[k] + V.sizes[k]).toString('base64'), ts: Math.round(V.ts[k] * 1e6 / V.timescale), key: V.keys.has(k) });
    await ev(`__feed(${JSON.stringify(list)})`);
  }
  const dec = JSON.parse(await ev(`(async () => { await __vd.flush(); const D = __dec; let mono = true; for (let i = 1; i < D.ts.length; i++) if (D.ts[i] <= D.ts[i - 1]) mono = false;
    return JSON.stringify({ decoded: D.n, mono, firstTs: D.ts[0], lastTs: D.ts[D.ts.length - 1], err: D.err, strip: D.strip }); })()`));
  console.log(`decode: ${dec.decoded}/${V.n} frames decoded in ${((Date.now() - t0) / 1000).toFixed(1)} s, timestamps rising: ${dec.mono}, first ${dec.firstTs} us, last ${dec.lastTs} us, decoder error: ${dec.err || 'none'}`);
  let ok = dec.decoded === V.n && dec.mono && !dec.err;
  if (STRIP) {
    const bad = dec.strip.map((v, i) => [i, v]).filter(([i, v]) => v !== i % STRIP);
    console.log(`strip: ${dec.strip.length - bad.length}/${dec.strip.length} decoded frames show the expected frame number` + (bad.length ? '; first mismatches ' + bad.slice(0, 8).map(([i, v]) => `#${i}=${v}`).join(' ') : ''));
    ok = ok && bad.length === 0;
  }

  // 2. <video> element view
  const meta = JSON.parse(await ev(`new Promise(res => { const v = document.createElement('video'); v.id = 'v'; v.muted = true; v.src = ${JSON.stringify(pathToFileURL(file).href)}; document.body.appendChild(v);
    const go = () => res(JSON.stringify({ duration: v.duration, w: v.videoWidth, h: v.videoHeight, err: v.error && v.error.message }));
    v.onloadedmetadata = go; v.onerror = () => res(JSON.stringify({ err: v.error && v.error.message })); })`));
  console.log('video element:', JSON.stringify(meta));
  ok = ok && !meta.err && meta.w === V.width && meta.h === V.height;
  const dur = meta.duration || V.duration / V.timescale, times = Array.from({ length: 8 }, (_, i) => +(0.05 + i * (dur - 0.15) / 7).toFixed(2));
  const sheet = await ev(`(async () => { const v = document.getElementById('v'), tw = 480, th = 270, c = document.createElement('canvas'); c.width = tw * 4; c.height = th * 2; const g = c.getContext('2d');
    const ts = ${JSON.stringify(times)};
    for (let i = 0; i < ts.length; i++) { await new Promise(r => { v.onseeked = r; v.currentTime = ts[i]; }); g.drawImage(v, (i % 4) * tw, Math.floor(i / 4) * th, tw, th);
      g.fillStyle = '#000'; g.fillRect((i % 4) * tw, Math.floor(i / 4) * th, 190, 26); g.fillStyle = '#ffd400'; g.font = '16px Consolas'; g.fillText(ts[i] + ' s (decoded)', (i % 4) * tw + 8, Math.floor(i / 4) * th + 18); }
    return c.toDataURL('image/png'); })()`);
  const sheetPath = join(OUTDIR, basename(file, '.mp4') + '_decoded.png');
  writeFileSync(sheetPath, Buffer.from(sheet.split(',')[1], 'base64')); console.log('wrote', sheetPath, 'at', times.join(', '), 's');

  // 3. audio
  if (A) {
    const au = await ev(`(async () => { const ab = await (await fetch(${JSON.stringify(pathToFileURL(file).href)})).arrayBuffer(); const ac = new OfflineAudioContext(2, 48000, 48000);
      const b = await ac.decodeAudioData(ab); const d = b.getChannelData(0); let s = 0, pk = 0; for (let i = 0; i < d.length; i++) { s += d[i] * d[i]; pk = Math.max(pk, Math.abs(d[i])); }
      return JSON.stringify({ duration: b.duration, channels: b.numberOfChannels, rmsDb: +(10 * Math.log10(s / d.length)).toFixed(1), peak: +pk.toFixed(3) }); })()`);
    console.log('audio:', au);
  } else console.log('audio: none (video-only file)');
  console.log(ok ? 'VERIFY OK' : 'VERIFY FAILED'); if (!ok) process.exitCode = 1;
} catch (e) { console.error('ERROR', e.message); process.exitCode = 1; }
finally { try { ws?.close(); } catch {} await sleep(300); cleanup(); }
