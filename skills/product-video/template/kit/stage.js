/* Product video: stage kit. See kit/README.md for the API and a scene skeleton.
   Load at the END of <body>, after the scene markup and before the scene script.
   Everything here is deterministic: no timers, no Date, no random. The one exception is the preview player
   (only when the URL has no ?render), which runs a requestAnimationFrame loop OUTSIDE the stage. */
(function () {
  'use strict';
  var W = 1920, H = 1080;
  var params = new URLSearchParams(location.search);
  var RENDER = params.has('render');
  var EMBED = params.has('embed');           // render page inside the preview player's iframe
  var T_PARAM = params.has('t') ? parseFloat(params.get('t')) : null;
  var html = document.documentElement;

  /* ------------------------------------------------------------------ math */
  function clamp(x, a, b) { if (a === undefined) { a = 0; b = 1; } return Math.min(b, Math.max(a, x)); }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function prog(t, t0, t1) { if (t1 <= t0) return t >= t1 ? 1 : 0; return clamp((t - t0) / (t1 - t0), 0, 1); }
  var SOFT_K = 7, SOFT_N = 1 - (1 + SOFT_K) * Math.exp(-SOFT_K);
  var ease = {
    linear: function (p) { return p; },
    in: function (p) { return p * p * p; },
    out: function (p) { return 1 - Math.pow(1 - p, 3); },
    inOut: function (p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; },
    /* Critically damped spring, normalised to land exactly on 1 at p = 1. Never overshoots (no bounce). */
    soft: function (p) { return (1 - (1 + SOFT_K * p) * Math.exp(-SOFT_K * p)) / SOFT_N; }
  };
  function easeFn(e) { return typeof e === 'function' ? e : (ease[e || 'inOut'] || ease.inOut); }
  /* Piecewise keyframes for any number: keys = [[t, value], [t, value, 'out'], ...]. The ease on a key shapes the
     segment that ends at it. Before the first key: first value. After the last: last value. */
  function keys(t, ks) {
    if (t <= ks[0][0]) return ks[0][1];
    for (var i = 1; i < ks.length; i++) {
      if (t < ks[i][0]) {
        var a = ks[i - 1], b = ks[i];
        return lerp(a[1], b[1], easeFn(b[2])(prog(t, a[0], b[0])));
      }
    }
    return ks[ks.length - 1][1];
  }
  /* 0..1 that rises over [inT0,inT1] and falls over [outT0,outT1]. */
  function window01(t, inT0, inT1, outT0, outT1, e) {
    var f = easeFn(e || 'inOut');
    var up = f(prog(t, inT0, inT1));
    var down = outT0 === undefined ? 1 : 1 - f(prog(t, outT0, outT1));
    return Math.min(up, down);
  }

  /* ------------------------------------------------------------------ DOM layers */
  function $(s, root) { return typeof s === 'string' ? (root || document).querySelector(s) : s; }
  var stage = document.getElementById('stage');
  if (!stage) { stage = document.createElement('div'); stage.id = 'stage'; document.body.appendChild(stage); }
  var world = document.getElementById('world');
  if (!world) {
    world = document.createElement('div'); world.id = 'world';
    while (stage.firstChild) world.appendChild(stage.firstChild);
    stage.appendChild(world);
  }
  var fx = document.createElement('div'); fx.id = 'fx'; world.appendChild(fx);
  var hud = document.createElement('div'); hud.id = 'hud'; stage.appendChild(hud);
  var capWrap = document.createElement('div'); capWrap.id = 'caption';
  var capBox = document.createElement('div'); capBox.className = 'stg-cap'; capWrap.appendChild(capBox);
  stage.appendChild(capWrap);
  document.body.classList.add('stage-page');
  if (!RENDER) document.body.classList.add('stage-player');
  /* fx must stay the last child of world so rings sit on top of scene content. Scenes that append to world after
     load should call Stage.world.appendChild(...) BEFORE boot, or use Stage.content (a slot) - see README. */

  /* ------------------------------------------------------------------ coordinates */
  function scaleOf(el) { var r = el.getBoundingClientRect(); return el.offsetWidth ? r.width / el.offsetWidth : 1; }
  function rectIn(el, container) {
    el = $(el);
    var c = container.getBoundingClientRect(), r = el.getBoundingClientRect(), s = scaleOf(container);
    return { x: (r.left - c.left) / s, y: (r.top - c.top) / s, w: r.width / s, h: r.height / s };
  }
  /* Stage space = what the viewer sees (includes camera zoom). World space = layout space (ignores camera). */
  function rect(el) { return rectIn(el, stage); }
  function worldRect(el) { return rectIn(el, world); }
  function center(el, dx, dy) { var r = rect(el); return { x: r.x + r.w / 2 + (dx || 0), y: r.y + r.h / 2 + (dy || 0) }; }

  /* ------------------------------------------------------------------ declarative tweens */
  var UNITLESS = { opacity: 1, zIndex: 1, fontWeight: 1, flexGrow: 1, lineHeight: 1 };
  var TRANSFORM = { x: 1, y: 1, scale: 1, scaleX: 1, scaleY: 1, rotate: 1 };
  var DEFAULTS = { opacity: 1, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0 };
  /* anim([{ el, t: [t0, t1], from: {prop: v}, to: {prop: v}, ease }]) returns apply(t).
     Props: x, y (px), scale, scaleX, scaleY, rotate (deg), opacity, or any CSS property in camelCase (numbers get px
     unless unitless). A segment without `from` starts from where the previous segment on that prop ended. Every tracked
     prop is written on every call, so apply(t) is stateless. x/y/scale/rotate OWN the element's transform. */
  function anim(specs) {
    var resolved = null;
    function build() {
      var byEl = new Map();
      specs.forEach(function (s) {
        var el = $(s.el);
        if (!el) throw new Error('Stage.anim: no element for ' + s.el);
        if (!byEl.has(el)) byEl.set(el, {});
        var props = byEl.get(el);
        var names = Object.keys(Object.assign({}, s.from || {}, s.to || {}));
        names.forEach(function (n) {
          (props[n] = props[n] || []).push({ t0: s.t[0], t1: s.t[1], from: s.from && n in s.from ? s.from[n] : undefined,
            to: s.to && n in s.to ? s.to[n] : undefined, ease: easeFn(s.ease) });
        });
      });
      byEl.forEach(function (props) {
        Object.keys(props).forEach(function (n) {
          var segs = props[n].sort(function (a, b) { return a.t0 - b.t0; });
          var prev = segs[0].from !== undefined ? segs[0].from : (n in DEFAULTS ? DEFAULTS[n] : 0);
          segs.forEach(function (sg) {
            if (sg.from === undefined) sg.from = prev;
            if (sg.to === undefined) sg.to = sg.from;
            prev = sg.to;
          });
        });
      });
      return byEl;
    }
    function valueAt(segs, t) {
      var v = segs[0].from;
      for (var i = 0; i < segs.length; i++) {
        var sg = segs[i];
        if (t < sg.t0) break;
        if (t >= sg.t1) { v = sg.to; continue; }
        return lerp(sg.from, sg.to, sg.ease(prog(t, sg.t0, sg.t1)));
      }
      return v;
    }
    return function apply(t) {
      if (!resolved) resolved = build();
      resolved.forEach(function (props, el) {
        var tf = null;
        Object.keys(props).forEach(function (n) {
          var v = valueAt(props[n], t);
          if (TRANSFORM[n]) { tf = tf || {}; tf[n] = v; }
          else el.style[n] = UNITLESS[n] ? String(v) : v + 'px';
        });
        if (tf) setTransform(el, tf);
      });
    };
  }
  function setTransform(el, o) {
    var s = '';
    if (o.x || o.y) s += 'translate(' + (o.x || 0) + 'px,' + (o.y || 0) + 'px) ';
    if (o.scale !== undefined && o.scale !== 1) s += 'scale(' + o.scale + ') ';
    if ((o.scaleX !== undefined && o.scaleX !== 1) || (o.scaleY !== undefined && o.scaleY !== 1))
      s += 'scale(' + (o.scaleX === undefined ? 1 : o.scaleX) + ',' + (o.scaleY === undefined ? 1 : o.scaleY) + ') ';
    if (o.rotate) s += 'rotate(' + o.rotate + 'deg)';
    el.style.transform = s.trim();
  }
  /* fade(t, el, { in: [t0, t1], out: [t2, t3], dx, dy, ease }): opacity 0->1->0 with an optional slide. dx/dy is
     where it comes FROM (and returns to on the way out). Owns opacity and transform. */
  function fade(t, el, o) {
    el = $(el);
    var f = easeFn(o.ease || 'out');
    var pin = o.in ? f(prog(t, o.in[0], o.in[1])) : 1;
    var pout = o.out ? easeFn('inOut')(prog(t, o.out[0], o.out[1])) : 0;
    el.style.opacity = String(Math.min(pin, 1 - pout));
    var k = (1 - pin) + pout;
    setTransform(el, { x: (o.dx || 0) * k, y: (o.dy || 0) * k });
    return pin * (1 - pout);
  }

  /* ------------------------------------------------------------------ camera */
  /* camera(t, keys): keys = [{ t, zoom, x, y }] or [{ t, el, zoom | 'fit', pad }]. x/y is the world point placed at
     the stage centre. Moves between keys with easeInOut (or key.ease). Clamped so the world edge never shows.
     Call it BEFORE anything that measures stage coordinates (cursor, Stage.center). */
  var cam = { z: 1, x: W / 2, y: H / 2 };
  function camKey(k) {
    var z = k.zoom === undefined ? 1 : k.zoom, x = k.x, y = k.y;
    if (k.el) {
      var r = worldRect(k.el), pad = k.pad === undefined ? 40 : k.pad;
      if (z === 'fit') z = Math.min(W / (r.w + 2 * pad), (SAFE_BOTTOM) / (r.h + 2 * pad));
      x = r.x + r.w / 2; y = r.y + r.h / 2;
    }
    if (x === undefined) x = W / 2; if (y === undefined) y = H / 2;
    /* clamp each key first: interpolating between two valid keys never shows the world edge */
    var hw = W / 2 / z, hh = H / 2 / z;
    x = z <= 1 ? W / 2 : clamp(x, hw, W - hw);
    y = z <= 1 ? H / 2 : clamp(y, hh, H - hh);
    return { z: z, x: x, y: y };
  }
  function camera(t, ks) {
    var c;
    if (!ks || !ks.length) c = { z: 1, x: W / 2, y: H / 2 };
    else if (t <= ks[0].t) c = camKey(ks[0]);
    else if (t >= ks[ks.length - 1].t) c = camKey(ks[ks.length - 1]);
    else {
      for (var i = 1; i < ks.length; i++) if (t < ks[i].t) {
        var a = camKey(ks[i - 1]), b = camKey(ks[i]);
        var p = easeFn(ks[i].ease || 'inOut')(prog(t, ks[i - 1].t, ks[i].t));
        /* zoom interpolates in log space so it feels even; the focus point follows linearly */
        c = { z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), p)), x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) };
        break;
      }
    }
    var hw = W / 2 / c.z, hh = H / 2 / c.z;
    c.x = c.z <= 1 ? W / 2 : clamp(c.x, hw, W - hw);
    c.y = c.z <= 1 ? H / 2 : clamp(c.y, hh, H - hh);
    cam = c;
    world.style.transform = (c.z === 1) ? '' :
      'translate(' + (W / 2 - c.x * c.z) + 'px,' + (H / 2 - c.y * c.z) + 'px) scale(' + c.z + ')';
    return c;
  }

  /* ------------------------------------------------------------------ highlight ring / spotlight */
  var fxEls = new Map(), overlayIds = 0;
  function fxEl(key, cls) {
    var e = fxEls.get(key);
    if (!e) { e = document.createElement('div'); e.className = cls; fx.appendChild(e); fxEls.set(key, e); }
    return e;
  }
  /* ring(t, el, { t0, t1, fade, pad, radius, key }) - a calm blue ring around el, fading in at t0 and out at t1.
     spot(t, el, {...}) - the same window but dims everything else. Call both on EVERY seek (they hide themselves). */
  function overlay(cls, t, el, o) {
    o = o || {};
    var key;
    if (o.key) key = cls + '|' + o.key;
    else if (typeof el === 'string') key = cls + '|' + el;
    else { if (!el.__stgId) el.__stgId = ++overlayIds; key = cls + '|#' + el.__stgId; }
    el = $(el);
    var e = fxEl(key, cls);
    var f = o.fade === undefined ? 0.35 : o.fade;
    var op = window01(t, o.t0, o.t0 + f, o.t1 === undefined ? undefined : o.t1 - f, o.t1);
    if (op <= 0) { e.style.opacity = '0'; e.hidden = true; return 0; }
    e.hidden = false;
    var r = worldRect(el), pad = o.pad === undefined ? 6 : o.pad;
    var grow = (1 - easeFn('out')(prog(t, o.t0, o.t0 + f * 1.4))) * 10;   // settles in from slightly larger
    var p = pad + grow;
    e.style.left = (r.x - p) + 'px'; e.style.top = (r.y - p) + 'px';
    e.style.width = (r.w + 2 * p) + 'px'; e.style.height = (r.h + 2 * p) + 'px';
    e.style.borderRadius = (o.radius === undefined ? 12 : o.radius) + 'px';
    e.style.opacity = String(op);
    return op;
  }
  function ring(t, el, o) { return overlay('stg-ring', t, el, o); }
  function spot(t, el, o) { return overlay('stg-spot', t, el, o); }

  /* ------------------------------------------------------------------ typing */
  var measureCtx = document.createElement('canvas').getContext('2d');
  var carets = new WeakMap();
  /* type(t, el, text, { t0, cps, caret, caretUntil }) - types text into an <input>/<textarea> (value) or any element
     (textContent) at cps characters per second from t0. Draws its own caret (solid while typing, blinks 2x/s after).
     Returns progress 0..1. */
  function type(t, el, text, o) {
    el = $(el); o = o || {};
    var cps = o.cps || 13, t0 = o.t0 || 0;
    var n = t < t0 ? 0 : Math.min(text.length, Math.floor((t - t0) * cps + 1e-6));
    var s = text.slice(0, n);
    var isInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
    var tDone = t0 + text.length / cps;
    var showCaret = o.caret !== false && t >= t0 && (o.caretUntil === undefined || t < o.caretUntil) &&
      (t < tDone || Math.floor((t - tDone) * 2) % 2 === 0);
    if (isInput) {
      el.value = s;
      var c = carets.get(el);
      if (!c) {
        c = document.createElement('span'); c.className = 'stg-caret';
        var par = el.parentElement;
        if (getComputedStyle(par).position === 'static') par.style.position = 'relative';
        par.appendChild(c); carets.set(el, c);
      }
      var cs = getComputedStyle(el);
      measureCtx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      var fs = parseFloat(cs.fontSize), lh = Math.round(fs * 1.3);
      var x = el.offsetLeft + el.clientLeft + parseFloat(cs.paddingLeft) + measureCtx.measureText(s).width;
      c.style.left = Math.round(x) + 'px';
      c.style.top = Math.round(el.offsetTop + (el.offsetHeight - lh) / 2) + 'px';
      c.style.height = lh + 'px';
      c.style.color = cs.color;
      c.hidden = !showCaret;
    } else {
      el.textContent = s;
      if (showCaret) {
        var k = document.createElement('span');
        k.className = 'stg-caret';
        k.style.cssText = 'position:relative;display:inline-block;height:1.1em;vertical-align:-0.15em;margin-left:1px;';
        el.appendChild(k);
      }
    }
    return text.length ? n / text.length : 1;
  }

  /* ------------------------------------------------------------------ cursor */
  var CURSOR_SVG = '<svg viewBox="0 0 17 21" aria-hidden="true"><path d="M1.5 1.2 L1.5 16.6 L5.4 12.9 L8.1 19.2 L10.9 18 L8.3 11.9 L13.9 11.9 Z" ' +
    'fill="#ffffff" stroke="#11171d" stroke-width="1.35" stroke-linejoin="round"/></svg>';
  /* cursor(waypoints, { showAt, hideAt, fade }) returns move(t) -> { x, y, pressed }.
     waypoint: { t, x, y } or { t, el, dx, dy } (element centre in stage space, measured at seek time),
       plus optional dur (seconds of travel that END at t; default from distance), click: true (ring + press at t),
       down: true (press and hold from t), up: true (release at t). The cursor rests at a waypoint until it must
       leave for the next one. The path bows gently (quadratic curve), eased in and out. */
  var cursorCount = 0;
  function cursor(wps, opts) {
    opts = opts || {};
    var id = cursorCount++;
    var el = document.createElement('div'); el.className = 'stg-cursor'; el.dataset.cursor = id;
    var press = document.createElement('div'); press.className = 'stg-press'; el.appendChild(press);
    el.insertAdjacentHTML('beforeend', CURSOR_SVG);
    hud.appendChild(el);
    var svg = el.querySelector('svg');
    var list = wps.slice().sort(function (a, b) { return a.t - b.t; });
    var rings = [];
    list.forEach(function (w) { if (w.click) { var r = document.createElement('div'); r.className = 'stg-click'; hud.insertBefore(r, el); rings.push({ w: w, el: r }); } });
    function pt(w) { if (w.el) return center(w.el, w.dx, w.dy); return { x: w.x, y: w.y }; }
    function posAt(t) {
      if (t <= list[0].t) return pt(list[0]);
      for (var i = 1; i < list.length; i++) {
        var b = list[i];
        if (t < b.t) {
          var a = list[i - 1], pa = pt(a), pb = pt(b);
          var dx = pb.x - pa.x, dy = pb.y - pa.y, dist = Math.sqrt(dx * dx + dy * dy);
          var dur = b.dur !== undefined ? b.dur : clamp(0.4 + dist / 1300, 0.5, 1.3);
          dur = Math.min(dur, b.t - a.t);
          var start = b.t - dur;
          if (t <= start) return pa;
          var p = easeFn(b.ease || 'inOut')(prog(t, start, b.t));
          if (dist < 1) return pa;
          /* control point: midpoint pushed sideways by 10% of the distance (always the same side -> calm arcs) */
          var bow = b.straight || isDragging(a.t + 1e-6) ? 0 : 0.10;
          var cx = (pa.x + pb.x) / 2 - dy / dist * dist * bow, cy = (pa.y + pb.y) / 2 + dx / dist * dist * bow;
          var u = 1 - p;
          return { x: u * u * pa.x + 2 * u * p * cx + p * p * pb.x, y: u * u * pa.y + 2 * u * p * cy + p * p * pb.y };
        }
      }
      return pt(list[list.length - 1]);
    }
    function isDragging(t) {
      var down = false;
      for (var i = 0; i < list.length; i++) {
        if (list[i].t > t) break;
        if (list[i].down) down = true;
        if (list[i].up) down = false;
      }
      return down;
    }
    function pressedAt(t) {
      if (isDragging(t)) return true;
      for (var i = 0; i < list.length; i++) if (list[i].click && t >= list[i].t - 0.07 && t < list[i].t + 0.14) return true;
      return false;
    }
    return function move(t) {
      var vis = 1;
      if (opts.showAt !== undefined) vis = Math.min(vis, prog(t, opts.showAt, opts.showAt + (opts.fade || 0.3)));
      if (opts.hideAt !== undefined) vis = Math.min(vis, 1 - prog(t, opts.hideAt, opts.hideAt + (opts.fade || 0.3)));
      var p = posAt(t), pressed = pressedAt(t);
      /* Whole pixels only: Chrome keeps a moved layer's raster at the sub-pixel phase it was first drawn at, so a
         fractional offset gives slightly different pixels depending on which time was seeked before. */
      el.style.transform = 'translate(' + Math.round(p.x) + 'px,' + Math.round(p.y) + 'px)';
      el.style.opacity = String(vis);
      el.hidden = vis <= 0;
      svg.style.transform = pressed ? 'scale(0.86)' : '';
      press.style.opacity = pressed && vis > 0 ? '1' : '0';
      rings.forEach(function (r) {
        var q = prog(t, r.w.t, r.w.t + 0.5);
        if (q <= 0 || q >= 1 || vis <= 0) { r.el.style.opacity = '0'; return; }
        var c = pt(r.w), s = 0.35 + 0.9 * easeFn('out')(q);
        r.el.style.left = c.x + 'px'; r.el.style.top = c.y + 'px';
        r.el.style.transform = 'scale(' + s + ')';
        r.el.style.opacity = String(0.8 * (1 - q));
      });
      return { x: p.x, y: p.y, pressed: pressed, visible: vis };
    };
  }

  /* ------------------------------------------------------------------ captions */
  var SAFE_BOTTOM = 900;  // stage y: keep anything the viewer must see above this; the caption bar lives below
  var captionsOn = params.get('captions') !== '0';
  var GAP = 0.35;         // captions closer than this share the bar (no flicker between them)
  function updateCaptions(t, caps) {
    if (!captionsOn || !caps || !caps.length) { capWrap.hidden = true; return; }
    var cur = null, i;
    for (i = 0; i < caps.length; i++) if (t >= caps[i].t0 && t < caps[i].t1) { cur = i; break; }
    if (cur === null) {   // in a short gap between two captions: keep showing the previous one
      for (i = 0; i < caps.length - 1; i++) if (t >= caps[i].t1 && t < caps[i + 1].t0 && caps[i + 1].t0 - caps[i].t1 < GAP) { cur = i; break; }
    }
    if (cur === null) { capWrap.hidden = true; return; }
    var c = caps[cur], prev = caps[cur - 1], next = caps[cur + 1];
    var fadeIn = !(prev && c.t0 - prev.t1 < GAP), fadeOut = !(next && next.t0 - c.t1 < GAP);
    var op = 1;
    if (fadeIn) op = Math.min(op, prog(t, c.t0, c.t0 + 0.25));
    if (fadeOut) op = Math.min(op, 1 - prog(t, c.t1 - 0.25, c.t1));
    if (capBox.textContent !== c.text) capBox.textContent = c.text;
    capWrap.hidden = op <= 0;
    capWrap.style.opacity = String(op);
  }

  /* ------------------------------------------------------------------ assets */
  function assets() {
    var loads = [];
    if (document.fonts && document.fonts.load) {
      // Load every font face the scene uses (the product's own fonts from site-css), so the first frame is final.
      document.fonts.forEach(function (f) { loads.push(f.load().catch(function () {})); });
    }
    Array.prototype.forEach.call(document.images, function (img) {
      loads.push(img.complete ? (img.decode ? img.decode().catch(function () {}) : Promise.resolve())
        : new Promise(function (res) { img.addEventListener('load', res, { once: true }); img.addEventListener('error', res, { once: true }); }));
    });
    return Promise.all(loads).then(function () { return document.fonts ? document.fonts.ready : null; });
  }

  /* ------------------------------------------------------------------ boot + player */
  function boot(cfg) {
    if (!cfg || typeof cfg.seek !== 'function' || !(cfg.duration > 0)) throw new Error('Stage.boot needs { id, title, duration, captions, seek }');
    var caps = (cfg.captions || []).slice().sort(function (a, b) { return a.t0 - b.t0; });
    var SCENE = {
      id: cfg.id, title: cfg.title, duration: cfg.duration, captions: caps,
      seek: function (t) {
        t = clamp(+t || 0, 0, cfg.duration);
        cfg.seek(t);
        updateCaptions(t, caps);
        SCENE.t = t;
      }
    };
    window.SCENE = SCENE;
    if (!RENDER) buildPlayer(SCENE);
    return assets().then(function () {
      var t = T_PARAM !== null ? T_PARAM : 0;
      SCENE.seek(t);
      SCENE.seek(t);   // second pass: measurements taken after the first layout with final fonts
      window.__ready = true;
      if (EMBED && window.parent !== window) {
        window.addEventListener('message', function (e) {
          var d = e.data || {};
          if (d.type === 'stage-seek') SCENE.seek(d.t);
          if (d.type === 'stage-captions') { captionsOn = !!d.on; SCENE.seek(SCENE.t || 0); }
        });
        window.parent.postMessage({ type: 'stage-ready', duration: cfg.duration, title: cfg.title, id: cfg.id }, '*');
      }
    });
  }

  function buildPlayer(SCENE) {
    var q = new URLSearchParams(location.search); q.set('render', ''); q.set('embed', ''); q.delete('t');
    var startT = T_PARAM !== null ? T_PARAM : 0;
    var root = document.createElement('div'); root.className = 'stg-player';
    root.innerHTML = '<div class="stg-view"><iframe title="scene"></iframe></div>' +
      '<div class="stg-bar"><button type="button" data-play>Play</button>' +
      '<input type="range" min="0" step="0.001" value="0" aria-label="Scene time">' +
      '<span class="stg-time">0.00 / 0.00</span>' +
      '<label><input type="checkbox" data-cap checked> Captions</label>' +
      '<span class="stg-title"></span></div>';
    document.body.appendChild(root);
    var view = root.querySelector('.stg-view'), frame = root.querySelector('iframe');
    var btn = root.querySelector('[data-play]'), range = root.querySelector('input[type=range]');
    var time = root.querySelector('.stg-time'), cap = root.querySelector('[data-cap]');
    root.querySelector('.stg-title').textContent = (SCENE.id ? SCENE.id + '  ' : '') + (SCENE.title || '');
    cap.checked = params.get('captions') !== '0';
    range.max = String(SCENE.duration);
    var cur = startT, playing = false, ready = false, last = 0, raf = 0;
    function fit() {
      var vw = view.clientWidth, vh = view.clientHeight, s = Math.min(vw / W, vh / H);
      frame.style.transform = 'translate(' + ((vw - W * s) / 2) + 'px,' + ((vh - H * s) / 2) + 'px) scale(' + s + ')';
    }
    function show(t) {
      cur = clamp(t, 0, SCENE.duration);
      range.value = String(cur);
      time.textContent = cur.toFixed(2) + ' / ' + SCENE.duration.toFixed(2) + ' s';
      if (ready) frame.contentWindow.postMessage({ type: 'stage-seek', t: cur }, '*');
    }
    function loop(now) {
      if (!playing) return;
      var dt = (now - last) / 1000; last = now;
      var t = cur + dt;
      if (t >= SCENE.duration) { t = SCENE.duration; setPlaying(false); }
      show(t);
      if (playing) raf = requestAnimationFrame(loop);
    }
    function setPlaying(on) {
      playing = on; btn.textContent = on ? 'Pause' : 'Play';
      if (on) { if (cur >= SCENE.duration) cur = 0; last = performance.now(); raf = requestAnimationFrame(loop); }
      else cancelAnimationFrame(raf);
    }
    btn.addEventListener('click', function () { setPlaying(!playing); });
    range.addEventListener('input', function () { setPlaying(false); show(parseFloat(range.value)); });
    cap.addEventListener('change', function () { if (ready) frame.contentWindow.postMessage({ type: 'stage-captions', on: cap.checked }, '*'); });
    window.addEventListener('keydown', function (e) {
      if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
      else if (e.key === 'ArrowRight') { setPlaying(false); show(cur + (e.shiftKey ? 1 : 1 / 30)); }
      else if (e.key === 'ArrowLeft') { setPlaying(false); show(cur - (e.shiftKey ? 1 : 1 / 30)); }
      else if (e.key === 'Home') { setPlaying(false); show(0); }
    });
    window.addEventListener('message', function (e) {
      if (e.source !== frame.contentWindow || !e.data || e.data.type !== 'stage-ready') return;
      ready = true;
      frame.contentWindow.postMessage({ type: 'stage-captions', on: cap.checked }, '*');
      show(cur);
    });
    window.addEventListener('resize', fit);
    frame.src = location.pathname + '?' + q.toString().replace(/=(&|$)/g, '$1');
    fit(); show(startT);
  }

  window.Stage = {
    W: W, H: H, SAFE_BOTTOM: SAFE_BOTTOM, RENDER: RENDER,
    stage: stage, world: world, fx: fx, hud: hud,
    clamp: clamp, lerp: lerp, prog: prog, ease: ease, keys: keys, window01: window01,
    anim: anim, fade: fade, setTransform: setTransform,
    rect: rect, worldRect: worldRect, center: center,
    camera: camera, ring: ring, spot: spot, type: type, cursor: cursor,
    boot: boot, $: $
  };
})();
