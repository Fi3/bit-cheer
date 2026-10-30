// A live, clickable Winamp main window on each deck, drawn from the loaded skin's own sheets.
// Positions follow the classic Winamp 2 layout (275 × 116); CSS scales it by whole pixels.
import { TEXT_GLYPHS } from './pixel-font.js';
import { KIT_VERSION } from './skin-kit.js';

const SAFE_IMAGE = /^data:image\/png;base64,[a-zA-Z0-9+/=]+$/;
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
const POSBAR = { x: 16, y: 72, w: 248, h: 10 };
const VIS = { x: 24, y: 43, w: 76, h: 16 };
const TIME = { x: 36, y: 26, w: 63, h: 13 };
const VIS_MODES = ['bars', 'scope', 'off'];
const reduceMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

export function createWinampLive({ engine, seek, remote, deckState }) {
  let kit = null, images = {}, vis = [], mask = null;
  const pressed = new Map(); // canvas -> control name
  const peaks = [new Float32Array(19), new Float32Array(19)], bars = [new Float32Array(19), new Float32Array(19)];
  const freq = new Uint8Array(128), wave = new Uint8Array(256);
  let visMode = 'bars', remaining = false, lastDeck = 0;
  try { visMode = VIS_MODES.includes(localStorage.getItem('bit-cheer-vis')) ? localStorage.getItem('bit-cheer-vis') : 'bars'; remaining = localStorage.getItem('bit-cheer-time') === 'remaining'; } catch {}

  function setSkin(custom) {
    kit = null; images = {}; vis = []; mask = null; grid = null;
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
    if (!ready(name) || sx >= img.naturalWidth || sy >= img.naturalHeight) return false;
    const cw = Math.min(w, img.naturalWidth - sx), ch = Math.min(h, img.naturalHeight - sy);
    ctx.drawImage(img, sx, sy, cw, ch, dx, dy, cw, ch);
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
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, 275, 116);
    ctx.drawImage(images.main, 0, 0);
    // Like Winamp, one window is always the focused one: the deck touched last (A at first).
    const playing = !!state.playing, focused = deck === lastDeck || pressed.has(canvas);
    sprite(ctx, 'titlebar', 27, focused ? 0 : 15, 275, 14, 0, 0);
    // Window buttons sit on top of the title strip, as Winamp and Webamp draw them.
    sprite(ctx, 'titlebar', 0, 0, 9, 9, 6, 3); sprite(ctx, 'titlebar', 9, 0, 9, 9, 244, 3);
    sprite(ctx, 'titlebar', 0, 18, 9, 9, 254, 3); sprite(ctx, 'titlebar', 18, 0, 9, 9, 264, 3);
    sprite(ctx, 'titlebar', 304, 0, 8, 43, 10, 22); // clutter bar

    // Play / pause / stop indicator and the little "working" light.
    const stopped = !playing && (state.position || 0) < 0.05;
    sprite(ctx, 'playpaus', playing ? 0 : stopped ? 18 : 9, 0, 9, 9, 26, 28);
    if (images.playpaus?.naturalWidth >= 42) sprite(ctx, 'playpaus', playing ? 39 : 36, 0, 3, 9, 24, 28);

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

    // Volume (live) and balance (centred).
    const volume = deckVolume(deck);
    sprite(ctx, 'volume', 0, Math.round(volume * 27) * 15, 68, 13, VOLUME.x, VOLUME.y);
    sprite(ctx, 'volume', pressed.get(canvas) === 'volume' ? 0 : 15, 422, 14, 11, VOLUME.x + Math.round(volume * (VOLUME.w - 14)), 58);
    sprite(ctx, 'balance', 9, 0, 38, 13, 177, 57);
    sprite(ctx, 'balance', 15, 422, 14, 11, 189, 58);
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

  function point(canvas, event) {
    const r = canvas.getBoundingClientRect();
    return { x: (event.clientX - r.left) * 275 / r.width, y: (event.clientY - r.top) * 116 / r.height };
  }
  const inside = (p, b) => p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h;
  function hit(p) {
    for (const [name, b] of Object.entries(BUTTONS)) if (inside(p, b)) return name;
    for (const [name, b] of Object.entries(TOGGLES)) if (inside(p, b)) return name;
    if (inside(p, { x: VOLUME.x, y: VOLUME.y - 2, w: VOLUME.w, h: VOLUME.h + 4 })) return 'volume';
    if (inside(p, { x: POSBAR.x, y: POSBAR.y - 2, w: POSBAR.w, h: POSBAR.h + 4 })) return 'seek';
    if (inside(p, VIS)) return 'vis';
    if (inside(p, TIME)) return 'time';
    if (inside(p, { x: 219, y: 58, w: 23, h: 12 })) return 'eq';
    if (inside(p, { x: 242, y: 58, w: 23, h: 12 })) return 'pl';
    return null;
  }
  function slide(deck, kind, p) {
    if (kind === 'volume') remote(deck, 'volume', Math.max(0, Math.min(1, (p.x - VOLUME.x - 7) / (VOLUME.w - 14))));
    if (kind === 'seek') seek(deck, Math.max(0, Math.min(1, (p.x - POSBAR.x - 14) / (POSBAR.w - 29))));
  }
  const save = (key, value) => { try { localStorage.setItem(key, value); } catch {} };

  document.addEventListener('pointerdown', event => {
    const canvas = event.target.closest?.('.winamp-live canvas');
    if (!canvas || !kit) return;
    const deck = Number(canvas.parentElement.dataset.deck), p = point(canvas, event), name = hit(p);
    lastDeck = deck === 1 ? 1 : 0;
    if (!name) return;
    event.preventDefault();
    if (name === 'vis') { visMode = VIS_MODES[(VIS_MODES.indexOf(visMode) + 1) % VIS_MODES.length]; save('bit-cheer-vis', visMode); return; }
    if (name === 'time') { remaining = !remaining; save('bit-cheer-time', remaining ? 'remaining' : 'elapsed'); return; }
    const id = event.pointerId, press = new AbortController(), listen = { signal: press.signal };
    try { canvas.setPointerCapture(id); } catch { /* the pointer is already gone */ }
    pressed.set(canvas, name);
    slide(deck, name, p);
    const end = () => { press.abort(); pressed.delete(canvas); };
    canvas.addEventListener('pointermove', e => { if (e.pointerId === id) slide(deck, name, point(canvas, e)); }, listen);
    canvas.addEventListener('pointerup', e => {
      if (e.pointerId !== id) return;
      end();
      if (hit(point(canvas, e)) !== name) return;
      const playing = engine.state[deck]?.playing;
      if (name === 'play') { if (!playing) remote(deck, 'play'); }
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
