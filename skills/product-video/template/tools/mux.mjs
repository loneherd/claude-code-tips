// Minimal MP4 (ISO BMFF) writer: one H.264 track and an optional AAC track. No dependencies.
// The audio track is optional (video-only files work) and the video timescale follows the frame rate.
// moov is written before mdat ("fast start"). Samples are interleaved by time; every sample is its own chunk; offsets use co64.
//
//   writeMp4(path, {
//     video: { width, height, fps, desc: <avcC bytes>, samples: [{ data, ts /* microseconds */, key }] },
//     audio: { sampleRate, channels, desc: <AudioSpecificConfig or null>, samples: [{ data, ts }] }   // optional
//   })
import { writeFileSync } from 'node:fs';

const u8 = n => Buffer.from([n & 255]);
const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };
const str = s => Buffer.from(s, 'latin1');
const box = (type, ...parts) => { const body = Buffer.concat(parts.flat()); return Buffer.concat([u32(body.length + 8), str(type), body]); };
const full = (type, version, flags, ...parts) => box(type, u8(version), u8(flags >> 16), u8(flags >> 8), u8(flags), ...parts);
const MATRIX = Buffer.concat([u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000)]);

function esds(asc) {
  const desc = (tag, body) => Buffer.concat([u8(tag), u8(0x80), u8(0x80), u8(0x80), u8(body.length), body]);
  const dsi = desc(5, asc);
  const dcd = desc(4, Buffer.concat([u8(0x40), u8(0x15), Buffer.from([0, 0x18, 0]), u32(192000), u32(192000), dsi]));
  const es = desc(3, Buffer.concat([u16(2), u8(0), dcd, desc(6, u8(2))]));
  return full('esds', 0, 0, es);
}

function trak(t, offsets) {
  const isV = t.kind === 'video';
  const n = t.samples.length;
  const stsd = isV
    ? full('stsd', 0, 0, u32(1), box('avc1', Buffer.alloc(6), u16(1), Buffer.alloc(16), u16(t.width), u16(t.height),
        u32(0x480000), u32(0x480000), u32(0), u16(1), Buffer.alloc(32), u16(0x18), u16(0xffff), box('avcC', t.desc)))
    : full('stsd', 0, 0, u32(1), box('mp4a', Buffer.alloc(6), u16(1), Buffer.alloc(8), u16(t.channels), u16(16), u16(0), u16(0),
        u32(t.sampleRate * 65536), esds(t.desc)));
  const runs = []; for (const s of t.samples) { const l = runs[runs.length - 1]; if (l && l[1] === s.dur) l[0]++; else runs.push([1, s.dur]); }
  const stts = full('stts', 0, 0, u32(runs.length), ...runs.map(([c, d]) => Buffer.concat([u32(c), u32(d)])));
  const stsc = full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1));
  const stsz = full('stsz', 0, 0, u32(0), u32(n), ...t.samples.map(s => u32(s.data.length)));
  const co64 = full('co64', 0, 0, u32(n), ...offsets.map(o => u64(o)));
  const extra = isV ? [full('stss', 0, 0, u32(t.samples.filter(s => s.key).length), ...t.samples.map((s, i) => s.key ? u32(i + 1) : null).filter(Boolean))] : [];
  const stbl = box('stbl', stsd, stts, stsc, stsz, co64, ...extra);
  const dinf = box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1)));
  const minf = box('minf', isV ? full('vmhd', 0, 1, Buffer.alloc(8)) : full('smhd', 0, 0, Buffer.alloc(4)), dinf, stbl);
  const hdlr = full('hdlr', 0, 0, u32(0), str(isV ? 'vide' : 'soun'), Buffer.alloc(12), str(isV ? 'VideoHandler\0' : 'SoundHandler\0'));
  const mdhd = full('mdhd', 0, 0, u32(0), u32(0), u32(t.timescale), u32(t.duration), u16(0x55c4), u16(0));
  const tkhd = full('tkhd', 0, 3, u32(0), u32(0), u32(t.id), u32(0), u32(t.movieDuration), Buffer.alloc(8), u16(0), u16(isV ? 0 : 1),
    u16(isV ? 0 : 0x100), u16(0), MATRIX, u32(isV ? t.width * 65536 : 0), u32(isV ? t.height * 65536 : 0));
  return box('trak', tkhd, box('mdia', mdhd, hdlr, minf));
}

export function writeMp4(path, { video, audio }) {
  const fps = video.fps || 30;
  const vts = 90000, vdur = Math.round(vts / fps);          // 90 kHz: exact for 24, 25, 30, 50, 60 fps
  for (let i = 1; i < video.samples.length; i++) if (video.samples[i].ts < video.samples[i - 1].ts) throw new Error('video samples out of order: B-frames need ctts, not supported');
  const V = { kind: 'video', id: 1, width: video.width, height: video.height, desc: video.desc, timescale: vts,
    samples: video.samples.map(s => ({ data: s.data, key: s.key, dur: vdur, t: s.ts / 1e6 })) };
  const tracks = [V];
  let A = null;
  if (audio && audio.samples && audio.samples.length) {
    const asc = audio.desc && audio.desc.length ? audio.desc : Buffer.from([0x11, 0x90]);   // AAC-LC 48 kHz stereo
    A = { kind: 'audio', id: 2, channels: audio.channels, sampleRate: audio.sampleRate, desc: asc, timescale: audio.sampleRate,
      samples: audio.samples.map(s => ({ data: s.data, dur: 1024, t: s.ts / 1e6 })) };
    tracks.push(A);
  }
  for (const t of tracks) { t.duration = t.samples.reduce((a, s) => a + s.dur, 0); t.movieDuration = Math.round(t.duration / t.timescale * 1000); }
  const order = tracks.flatMap((tr, k) => tr.samples.map((s, i) => ({ s, tr: k, i }))).sort((a, b) => a.s.t - b.s.t || a.tr - b.tr);
  const build = offs => {
    const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(Math.max(...tracks.map(t => t.movieDuration))), u32(0x10000), u16(0x100),
      Buffer.alloc(10), MATRIX, Buffer.alloc(24), u32(tracks.length + 1));
    return box('moov', mvhd, ...tracks.map((t, k) => trak(t, offs[k])));
  };
  const ftyp = box('ftyp', str('isom'), u32(0x200), str('isom'), str('iso2'), str('avc1'), str('mp41'));
  const zero = tracks.map(t => new Array(t.samples.length).fill(0));
  const moovSize = build(zero).length;
  const mdatSize = order.reduce((a, o) => a + o.s.data.length, 0);
  const large = mdatSize + 8 > 0xffffffff;
  let off = ftyp.length + moovSize + (large ? 16 : 8);
  const offs = zero.map(z => z.slice());
  for (const o of order) { offs[o.tr][o.i] = off; off += o.s.data.length; }
  const moov = build(offs);
  if (moov.length !== moovSize) throw new Error('moov size changed');
  const mdatHdr = large ? Buffer.concat([u32(1), str('mdat'), u64(mdatSize + 16)]) : Buffer.concat([u32(mdatSize + 8), str('mdat')]);
  writeFileSync(path, Buffer.concat([ftyp, moov, mdatHdr, ...order.map(o => o.s.data)]));
  return { videoFrames: V.samples.length, audioPackets: A ? A.samples.length : 0, keyframes: V.samples.filter(s => s.key).length,
           seconds: +(V.duration / vts).toFixed(3), bytes: off };
}
