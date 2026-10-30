// A live, clickable Winamp main window on each deck, drawn from the loaded skin's own sheets.
// Positions follow the classic Winamp 2 layout (275 × 116); CSS scales it by whole pixels.
import { TEXT_GLYPHS } from './pixel-font.js';
import { KIT_VERSION } from './skin-kit.js';

const PNG_DATA = /^data:image\/png;base64,[a-zA-Z0-9+/=]+$/;
// Stored sheets are PNG data; the look settings hand over finer copies as blob URLs of this page.
const SAFE_IMAGE = { test: v => typeof v === 'string' && (PNG_DATA.test(v) || (v.startsWith(`blob:${location.origin}/`) && /^blob:[^\s"'()\\]+$/.test(v))) };
const HEX = /^#[0-9a-f]{6}$/i;

// Where each button lives on the window, and its sprite in CBUTTONS.BMP.
const BUTTONS = {
  prev: { x: 16, y: 88, w: 23, h: 18, sx: 0 },
  play: { x: 39, y: 88, w: 23, h: 18, sx: 23 },
  pause: { x: 62, y: 88, w: 23, h: 18, sx: 46 },
  stop: { x: 85, y: 88, w: 23, h: 18, sx: 69 },
  next: { x: 108, y: 88, w: 22, h: 18, sx: 92 },
  eject: { x: 136, y: 89, w: 22, h: 16, sx: 114 },
};
const TOGGLES = {
  shuffle: { x: 164, y: 89, w: 47, h: 15 },
  repeat: { x: 210, y: 89, w: 28, h: 15 },
};
const VOLUME = { x: 107, y: 57, w: 68, h: 13 };
const BALANCE = { x: 177, y: 57, w: 38, h: 13 };
const SHADE = { x: 254, y: 3, w: 9, h: 9 }; // the title bar's shade button (Winamp's windowshade)
// Folded to its bar, the window keeps Winamp's mini transport and position bar (painted by the skin).
const SHADE_BUTTONS = {
  prev: { x: 169, y: 2, w: 7, h: 10 }, play: { x: 176, y: 2, w: 10, h: 10 }, pause: { x: 186, y: 2, w: 10, h: 10 },
  stop: { x: 196, y: 2, w: 9, h: 10 }, next: { x: 205, y: 2, w: 10, h: 10 }, eject: { x: 215, y: 2, w: 10, h: 10 },
};
const SHADE_SEEK = { x: 226, y: 4, w: 17, h: 7 };
const POSBAR = { x: 16, y: 72, w: 248, h: 10 };
const VIS = { x: 24, y: 43, w: 76, h: 16 };
const TIME = { x: 36, y: 26, w: 63, h: 13 };
const VIS_MODES = ['bars', 'scope', 'off'];
const reduceMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

export function createWinampLive({ engine, seek, remote, deckState }) {
  let kit = null, images = {}, vis = [], mask = null, scale = 1;
  const pressed = new Map(); // canvas -> control name
  const peaks = [new Float32Array(19), new Float32Array(19)], bars = [new Float32Array(19), new Float32Array(19)];
  const freq = new Uint8Array(128), wave = new Uint8Array(256);
  let visMode = 'bars', remaining = false, lastDeck = 0;
  try { visMode = VIS_MODES.includes(localStorage.getItem('bit-cheer-vis')) ? localStorage.getItem('bit-cheer-vis') : 'bars'; remaining = localStorage.getItem('bit-cheer-time') === 'remaining'; } catch {}
  // Windowshade: a deck's main window folded to its title bar (the page lays it out from data-main-shaded).
  const shaded = new Set();
  try { for (const d of (localStorage.getItem('bit-cheer-main-shade') || '').split(' ')) if (d === 'a' || d === 'b') shaded.add(d); } catch {}
  const isShaded = deck => shaded.has(deck ? 'b' : 'a');
  const showShade = () => { document.documentElement.dataset.mainShaded = [...shaded].join(' '); };
  showShade();

  // scale: how many image pixels make one skin pixel (4 for the HD look, whose sheets are 4× finer).
  function setSkin(custom, sheetScale = 1) {
    kit = null; images = {}; vis = []; mask = null; grid = null; patches = null; scale = [1, 2, 3, 4].includes(sheetScale) ? sheetScale : 1;
    const sheets = custom?.kit?.sheets;
    if (custom?.kit?.version !== KIT_VERSION || !sheets || typeof sheets !== 'object' || !SAFE_IMAGE.test(sheets.main || '')) {
      document.documentElement.dataset.winampLive = '';
      return;
    }
    kit = custom.kit;
    for (const [name, src] of Object.entries(sheets)) {
      if (typeof src !== 'string' || !SAFE_IMAGE.test(src)) continue;
      const img = new Image(); img.src = src; images[name] = img;
    }
    vis = Array.isArray(kit.vis) ? kit.vis.map(c => HEX.test(c) ? c : '#00ff00') : [];
    mask = regionMask(kit.region);
    document.documentElement.dataset.winampLive = 'on';
  }

  // region.txt polygons become a mask that cuts the window into its real shape.
  function regionMask(polygons) {
    if (!Array.isArray(polygons) || !polygons.length) return null;
    const c = document.createElement('canvas'); c.width = 275; c.height = 116;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#000';
    for (const poly of polygons) {
      if (!Array.isArray(poly) || poly.length < 6) continue;
      ctx.beginPath(); ctx.moveTo(poly[0], poly[1]);
      for (let i = 2; i + 1 < poly.length; i += 2) ctx.lineTo(poly[i], poly[i + 1]);
      ctx.closePath(); ctx.fill();
    }
    return c;
  }

  const ready = name => images[name]?.complete && images[name].naturalWidth > 0;
  function sprite(ctx, name, sx, sy, w, h, dx, dy) {
    const img = images[name];
    if (!ready(name)) return false;
    const iw = img.naturalWidth / scale, ih = img.naturalHeight / scale;
    if (sx >= iw || sy >= ih) return false;
    const cw = Math.min(w, iw - sx), ch = Math.min(h, ih - sy);
    ctx.drawImage(img, sx * scale, sy * scale, cw * scale, ch * scale, dx, dy, cw, ch);
    return true;
  }
  function text(ctx, str, x, y, maxWidth, offset = 0) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, maxWidth, 6); ctx.clip();
    const chars = [...str];
    for (let i = 0; i < chars.length; i++) {
      const dx = x + i * 5 - offset;
      if (dx > x + maxWidth || dx < x - 5) continue;
      const pos = TEXT_GLYPHS[chars[i]] || TEXT_GLYPHS[chars[i].toLowerCase()] || TEXT_GLYPHS[' '];
      sprite(ctx, 'text', pos[1] * 5, pos[0] * 6, 5, 6, dx, y);
    }
    ctx.restore();
  }
  // Winamp's title bar carries options, minimize, shade and close buttons, painted into the strip itself.
  // Only shade does something here, so the other three are painted over: each row of a button blends
  // from the strip's pixel just left of it to the one just right of it, which hides it on stripes,
  // gradients and pictures alike. Made once per skin, at the sheet's own resolution.
  let patches = null;
  function titlePatches() {
    if (patches || !ready('titlebar')) return patches;
    const img = images.titlebar, W = img.naturalWidth, H = img.naturalHeight, n = 9 * scale;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const src = g.getImageData(0, 0, W, H).data;
    patches = {};
    for (const stripY of [0, 15, 29, 42]) {
      patches[stripY] = [6, 244, 264].map(x => {
        const left = (27 + x) * scale - 1, right = (27 + x + 9) * scale, top = (stripY + 3) * scale;
        if (right >= W || top + n > H) return null;
        const patch = document.createElement('canvas'); patch.width = n; patch.height = n;
        const pg = patch.getContext('2d'), out = pg.createImageData(n, n);
        for (let j = 0; j < n; j++) {
          const a = ((top + j) * W + left) * 4, b = ((top + j) * W + right) * 4;
          for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; for (let k = 0; k < 4; k++) out.data[(j * n + i) * 4 + k] = src[a + k] * (1 - t) + src[b + k] * t; }
        }
        pg.putImageData(out, 0, 0);
        return { x, patch };
      });
    }
    return patches;
  }
  function titleStrip(ctx, canvas, stripY, shadeButtonY) {
    if (!sprite(ctx, 'titlebar', 27, stripY, 275, 14, 0, 0)) return false;
    for (const p of titlePatches()?.[stripY] || []) if (p) ctx.drawImage(p.patch, p.x, 3, 9, 9);
    sprite(ctx, 'titlebar', pressed.get(canvas) === 'shade' ? 9 : 0, shadeButtonY, 9, 9, SHADE.x, SHADE.y);
    return true;
  }
  function digit(ctx, n, x, y) {
    if (!sprite(ctx, 'numbers', n * 9, 0, 9, 13, x, y)) sprite(ctx, 'nums_ex', n * 9, 0, 9, 13, x, y);
  }

  // The analyser's dotted background, drawn once per skin.
  let grid = null;
  function visGrid() {
    if (grid) return grid;
    grid = document.createElement('canvas'); grid.width = VIS.w; grid.height = VIS.h;
    const g = grid.getContext('2d');
    g.fillStyle = vis[0] || '#000'; g.fillRect(0, 0, VIS.w, VIS.h);
    g.fillStyle = vis[1] || '#222';
    for (let y = 1; y < VIS.h; y += 2) for (let x = 1; x < VIS.w; x += 2) g.fillRect(x, y, 1, 1);
    return grid;
  }
  function visualizer(ctx, deck, playing) {
    const analyser = engine.analysers?.[deck];
    ctx.drawImage(visGrid(), VIS.x, VIS.y);
    if (visMode === 'off') return;
    if (visMode === 'scope') {
      if (!analyser || !playing) return;
      analyser.getByteTimeDomainData(wave);
      let last = null;
      for (let x = 0; x < VIS.w; x++) {
        const v = (wave[Math.floor(x * wave.length / VIS.w)] - 128) / 128, y = Math.max(0, Math.min(15, Math.round(7.5 - v * 9)));
        const strength = Math.min(4, Math.floor(Math.abs(v) * 8));
        ctx.fillStyle = vis[18 + 4 - strength] || '#fff';
        const top = last === null ? y : Math.min(y, last), bottom = last === null ? y : Math.max(y, last);
        ctx.fillRect(VIS.x + x, VIS.y + top, 1, bottom - top + 1); last = y;
      }
      return;
    }
    const band = bars[deck], peak = peaks[deck];
    if (analyser && playing) analyser.getByteFrequencyData(freq); else freq.fill(0);
    for (let i = 0; i < 19; i++) {
      // Roughly logarithmic bands, like Winamp's analyser.
      const lo = Math.floor(1.5 * 1.27 ** i), hi = Math.max(lo + 1, Math.floor(1.5 * 1.27 ** (i + 1)));
      let sum = 0; for (let k = lo; k < Math.min(hi, freq.length); k++) sum = Math.max(sum, freq[k]);
      const target = Math.min(1, (sum / 255) ** 1.4 * 1.15);
      band[i] = Math.max(target, band[i] - 0.06);
      peak[i] = Math.max(band[i], peak[i] - 0.012);
      const h = Math.round(band[i] * 16);
      for (let r = 0; r < h; r++) { ctx.fillStyle = vis[2 + 15 - Math.min(15, Math.round(r * 15 / 15))] || '#0f0'; ctx.fillRect(VIS.x + i * 4, VIS.y + 15 - r, 3, 1); }
      const p = Math.round(peak[i] * 16);
      if (p > 0) { ctx.fillStyle = vis[23] || '#fff'; ctx.fillRect(VIS.x + i * 4, VIS.y + 15 - Math.min(15, p), 3, 1); }
    }
  }

  function draw(canvas, now) {
    const deck = Number(canvas.parentElement?.dataset.deck);
    const state = engine.state[deck];
    if (!kit || !state || !ready('main')) return;
    const extra = cachedState(deck, now);
    // The canvas holds the window at the sheets' resolution; everything below draws in skin pixels.
    const shade = isShaded(deck), height = shade ? 14 : 116;
    if (canvas.width !== 275 * scale || canvas.height !== height * scale) { canvas.width = 275 * scale; canvas.height = height * scale; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, 275, height);
    // Like Winamp, one window is always the focused one: the deck touched last (A at first).
    const playing = !!state.playing, focused = deck === lastDeck || pressed.has(canvas);
    if (shade) {
      // Windowshade: the skin's shade bar (or its title bar when it has none) with Winamp's time and
      // position bar on it; its mini transport is painted by the skin and works like the big one.
      if (!titleStrip(ctx, canvas, focused ? 29 : 42, 27)) titleStrip(ctx, canvas, focused ? 0 : 15, 18);
      const duration = Math.max(0, state.duration || 0), position = Math.max(0, state.position || 0), stopped = !playing && position < 0.05;
      if (!stopped) {
        const t = Math.floor(remaining ? Math.max(0, duration - position) : position), m = Math.min(99, Math.floor(t / 60)), sec = t % 60;
        if (remaining) text(ctx, '-', 125, 4, 5);
        text(ctx, String(m).padStart(2, '0'), 130, 4, 10); text(ctx, String(sec).padStart(2, '0'), 145, 4, 10);
      }
      sprite(ctx, 'titlebar', 0, 36, 17, 7, SHADE_SEEK.x, SHADE_SEEK.y);
      if (duration && !stopped) {
        const at = Math.round(Math.min(1, position / duration) * (SHADE_SEEK.w - 3));
        sprite(ctx, 'titlebar', at === 0 ? 17 : at === SHADE_SEEK.w - 3 ? 23 : 20, 36, 3, 7, SHADE_SEEK.x + at, SHADE_SEEK.y);
      }
      return;
    }
    sprite(ctx, 'main', 0, 0, 275, 116, 0, 0);
    // The title strip with its one working button (shade). No clutter bar: its options do nothing here.
    titleStrip(ctx, canvas, focused ? 0 : 15, 18);

    // Play / pause / stop indicator and the little "working" light.
    const stopped = !playing && (state.position || 0) < 0.05;
    sprite(ctx, 'playpaus', playing ? 0 : stopped ? 18 : 9, 0, 9, 9, 26, 28);
    if (images.playpaus?.naturalWidth >= 42 * scale) sprite(ctx, 'playpaus', playing ? 39 : 36, 0, 3, 9, 24, 28);

    // Time: elapsed, or remaining with a minus sign.
    const duration = Math.max(0, state.duration || 0), position = Math.max(0, state.position || 0);
    const t = Math.floor(remaining ? Math.max(0, duration - position) : position);
    const m = Math.min(99, Math.floor(t / 60)), s = t % 60;
    // Like Winamp, a stopped window shows no time and a paused one blinks it.
    const blinkOff = !playing && !stopped && !reduceMotion.matches && Math.floor(now / 500) % 2 === 1;
    if (!stopped && !blinkOff) {
      if (remaining) { if (!sprite(ctx, 'nums_ex', 99, 0, 9, 13, 36, 26)) sprite(ctx, 'numbers', 20, 6, 5, 1, 38, 32); }
      [[Math.floor(m / 10), 48], [m % 10, 60], [Math.floor(s / 10), 78], [s % 10, 90]].forEach(([n, x]) => digit(ctx, n, x, 26));
    }

    // Scrolling track title, one character at a time like the original.
    const d = Math.floor(duration);
    const p = state.pitch || 0, pitchLabel = Math.abs(p) >= 0.05 ? ` ${p > 0 ? '+' : '-'}${Math.abs(p).toFixed(1)}%` : '';
    const title = `${deck + 1}. ${state.name || 'bit.cheer'} (${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')})${pitchLabel}  ***  `;
    const width = title.length * 5;
    const offset = width > 154 && !reduceMotion.matches ? (Math.floor(now / 200) * 5) % width : 0;
    text(ctx, width > 154 ? title + title : title, 111, 27, 154, offset);

    // BPM in the kbps slot, pitch in the kHz slot.
    const bpm = Math.round((state.bpm || 0) * (1 + (state.pitch || 0) / 100));
    const pitch = state.pitch || 0, pitchText = Math.abs(pitch) < 9.5 ? (pitch < -0.05 ? '-' : '+') + Math.round(Math.abs(pitch)) : String(Math.min(99, Math.round(Math.abs(pitch))));
    text(ctx, extra.hideBpm ? '---' : String(Math.min(999, bpm)).padStart(3, ' '), 111, 43, 15);
    text(ctx, pitchText, 156, 43, 10);
    // Winamp: MONO at x212 (27 wide), STEREO at x239 (29 wide); the decks play stereo.
    sprite(ctx, 'monoster', 29, 12, 27, 12, 212, 41);
    sprite(ctx, 'monoster', 0, playing ? 0 : 12, 29, 12, 239, 41);

    visualizer(ctx, deck, playing);

    // Volume and balance, both live.
    const volume = deckVolume(deck), balance = Math.max(-1, Math.min(1, engine.balances?.[deck] || 0));
    sprite(ctx, 'volume', 0, Math.round(volume * 27) * 15, 68, 13, VOLUME.x, VOLUME.y);
    sprite(ctx, 'volume', pressed.get(canvas) === 'volume' ? 0 : 15, 422, 14, 11, VOLUME.x + Math.round(volume * (VOLUME.w - 14)), 58);
    sprite(ctx, 'balance', 9, Math.round(Math.abs(balance) * 27) * 15, 38, 13, BALANCE.x, BALANCE.y);
    sprite(ctx, 'balance', pressed.get(canvas) === 'balance' ? 0 : 15, 422, 14, 11, BALANCE.x + Math.round((balance + 1) / 2 * (BALANCE.w - 14)), 58);
    sprite(ctx, 'shufrep', 0, extra.eq ? 73 : 61, 23, 12, 219, 58);
    sprite(ctx, 'shufrep', 23, extra.pl ? 73 : 61, 23, 12, 242, 58);

    // Seek bar follows playback.
    const progress = duration ? Math.min(1, position / duration) : 0;
    if (sprite(ctx, 'posbar', 0, 0, 248, 10, POSBAR.x, POSBAR.y) && duration && !stopped) {
      sprite(ctx, 'posbar', pressed.get(canvas) === 'seek' ? 278 : 248, 0, 29, 10, POSBAR.x + Math.round(progress * (POSBAR.w - 29)), POSBAR.y);
    }

    // Transport buttons, pressed while held.
    for (const [name, b] of Object.entries(BUTTONS)) sprite(ctx, 'cbuttons', b.sx, pressed.get(canvas) === name ? b.h : 0, b.w, b.h, b.x, b.y);
    const shuffleDown = pressed.get(canvas) === 'shuffle', repeatDown = pressed.get(canvas) === 'repeat';
    sprite(ctx, 'shufrep', 28, shuffleDown ? 15 : 0, 47, 15, TOGGLES.shuffle.x, TOGGLES.shuffle.y);
    sprite(ctx, 'shufrep', 0, (extra.loop ? 30 : 0) + (repeatDown ? 15 : 0), 28, 15, TOGGLES.repeat.x, TOGGLES.repeat.y);

    if (mask) { ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mask, 0, 0); ctx.globalCompositeOperation = 'source-over'; }
  }

  // Page state the window mirrors (loop, EQ, PL, volume) changes rarely: read it a few times a second.
  const stateCache = [{ at: -1 }, { at: -1 }];
  function cachedState(deck, now) {
    const entry = stateCache[deck];
    if (now - entry.at > 200 || (pressed.size && [...pressed.keys()].some(c => c.isConnected))) {
      const input = document.querySelector(`.deck[data-deck="${deck}"] .deck-volume-row input[type=range]`);
      const v = input ? Number(input.value) : engine.volumes?.[deck];
      Object.assign(entry, deckState?.(deck) || {}, { volume: Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8, at: now });
    }
    return entry;
  }
  const deckVolume = deck => stateCache[deck]?.volume ?? 0.8;

  function point(canvas, event, shade = false) {
    const r = canvas.getBoundingClientRect();
    return { x: (event.clientX - r.left) * 275 / r.width, y: (event.clientY - r.top) * (shade ? 14 : 116) / r.height };
  }
  const inside = (p, b) => p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h;
  function hit(p, shade = false) {
    if (inside(p, { x: SHADE.x - 1, y: SHADE.y - 1, w: SHADE.w + 2, h: SHADE.h + 2 })) return 'shade';
    if (shade) {
      for (const [name, b] of Object.entries(SHADE_BUTTONS)) if (inside(p, b)) return name;
      return inside(p, SHADE_SEEK) ? 'seek' : null;
    }
    for (const [name, b] of Object.entries(BUTTONS)) if (inside(p, b)) return name;
    for (const [name, b] of Object.entries(TOGGLES)) if (inside(p, b)) return name;
    if (inside(p, { x: VOLUME.x, y: VOLUME.y - 2, w: VOLUME.w, h: VOLUME.h + 4 })) return 'volume';
    if (inside(p, { x: BALANCE.x, y: BALANCE.y - 2, w: BALANCE.w, h: BALANCE.h + 4 })) return 'balance';
    if (inside(p, { x: POSBAR.x, y: POSBAR.y - 2, w: POSBAR.w, h: POSBAR.h + 4 })) return 'seek';
    if (inside(p, VIS)) return 'vis';
    if (inside(p, TIME)) return 'time';
    if (inside(p, { x: 219, y: 58, w: 23, h: 12 })) return 'eq';
    if (inside(p, { x: 242, y: 58, w: 23, h: 12 })) return 'pl';
    return null;
  }
  function slide(deck, kind, p, shade = false) {
    if (kind === 'seek' && shade) { seek(deck, Math.max(0, Math.min(1, (p.x - SHADE_SEEK.x - 1.5) / (SHADE_SEEK.w - 3)))); return; }
    if (kind === 'volume') remote(deck, 'volume', Math.max(0, Math.min(1, (p.x - VOLUME.x - 7) / (VOLUME.w - 14))));
    if (kind === 'seek') seek(deck, Math.max(0, Math.min(1, (p.x - POSBAR.x - 14) / (POSBAR.w - 29))));
    // Balance pans the deck; like Winamp's, it snaps to the middle.
    if (kind === 'balance') { const v = Math.max(-1, Math.min(1, ((p.x - BALANCE.x - 7) / (BALANCE.w - 14)) * 2 - 1)); remote(deck, 'balance', Math.abs(v) < 0.1 ? 0 : v); }
  }
  const save = (key, value) => { try { localStorage.setItem(key, value); } catch {} };

  document.addEventListener('pointerdown', event => {
    const canvas = event.target.closest?.('.winamp-live canvas');
    if (!canvas || !kit) return;
    const deck = Number(canvas.parentElement.dataset.deck), shade = isShaded(deck), p = point(canvas, event, shade), name = hit(p, shade);
    lastDeck = deck === 1 ? 1 : 0;
    if (!name) return;
    event.preventDefault();
    if (name === 'vis') { visMode = VIS_MODES[(VIS_MODES.indexOf(visMode) + 1) % VIS_MODES.length]; save('bit-cheer-vis', visMode); return; }
    if (name === 'time') { remaining = !remaining; save('bit-cheer-time', remaining ? 'remaining' : 'elapsed'); return; }
    const id = event.pointerId, press = new AbortController(), listen = { signal: press.signal };
    try { canvas.setPointerCapture(id); } catch { /* the pointer is already gone */ }
    pressed.set(canvas, name);
    slide(deck, name, p, shade);
    const end = () => { press.abort(); pressed.delete(canvas); };
    canvas.addEventListener('pointermove', e => { if (e.pointerId === id) slide(deck, name, point(canvas, e, shade), shade); }, listen);
    canvas.addEventListener('pointerup', e => {
      if (e.pointerId !== id) return;
      end();
      if (hit(point(canvas, e, shade), shade) !== name) return;
      const playing = engine.state[deck]?.playing;
      if (name === 'shade') { const l = deck ? 'b' : 'a'; if (shaded.has(l)) shaded.delete(l); else shaded.add(l); showShade(); save('bit-cheer-main-shade', [...shaded].join(' ')); }
      else if (name === 'play') { if (!playing) remote(deck, 'play'); }
      else if (name === 'pause') { if (playing) remote(deck, 'play'); }
      else if (name in BUTTONS || name in TOGGLES || name === 'eq' || name === 'pl') remote(deck, name);
    }, listen);
    canvas.addEventListener('pointercancel', e => { if (e.pointerId === id) end(); }, listen);
    canvas.addEventListener('lostpointercapture', e => { if (e.pointerId === id) end(); }, listen);
  });

  let last = 0;
  function frame(now) {
    if (kit && !document.hidden && now - last > 30) { last = now; for (const canvas of document.querySelectorAll('.winamp-live canvas')) draw(canvas, now); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { setSkin };
}
