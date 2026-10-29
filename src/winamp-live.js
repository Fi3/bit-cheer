// A live, clickable Winamp main window on each deck, drawn from the loaded skin's own sheets.
// Positions follow the classic Winamp 2 layout (275 × 116).
const SAFE_IMAGE = /^data:image\/(?:png|jpeg|bmp|webp);base64,[a-zA-Z0-9+/=]+$/;

// Where each button lives on the window, and its sprite in CBUTTONS.BMP.
const BUTTONS = {
  prev: { x: 16, y: 88, w: 23, h: 18, sx: 0 },
  play: { x: 39, y: 88, w: 23, h: 18, sx: 23 },
  pause: { x: 62, y: 88, w: 23, h: 18, sx: 46 },
  stop: { x: 85, y: 88, w: 23, h: 18, sx: 69 },
  next: { x: 108, y: 88, w: 22, h: 18, sx: 92 },
  eject: { x: 136, y: 89, w: 22, h: 16, sx: 114 },
};
const VOLUME = { x: 107, y: 57, w: 68, h: 13 };
const POSBAR = { x: 16, y: 72, w: 248, h: 10 };

// TEXT.BMP glyph positions: [row, column], 5 × 6 pixels each.
const FONT = {};
'abcdefghijklmnopqrstuvwxyz'.split('').forEach((c, i) => { FONT[c] = [0, i]; });
Object.assign(FONT, { '"': [0, 26], '@': [0, 27], ' ': [0, 30] });
'0123456789'.split('').forEach((c, i) => { FONT[c] = [1, i]; });
Object.assign(FONT, { '…': [1, 10], '.': [1, 11], ':': [1, 12], '(': [1, 13], ')': [1, 14], '-': [1, 15], "'": [1, 16], '!': [1, 17], '_': [1, 18], '+': [1, 19], '\\': [1, 20], '/': [1, 21], '[': [1, 22], ']': [1, 23], '^': [1, 24], '&': [1, 25], '%': [1, 26], ',': [1, 27], '=': [1, 28], '$': [1, 29], '#': [1, 30], '?': [2, 3], '*': [2, 4], '·': [1, 11] });

export function createWinampLive({ engine, seek, remote }) {
  let skin = null, images = {}, viscolor = [];
  const pressed = new Map(); // canvas -> button name
  const bars = [new Float32Array(19), new Float32Array(19)];

  function setSkin(custom) {
    skin = null; images = {}; viscolor = [];
    const sheets = custom?.sheets;
    if (!sheets || typeof sheets !== 'object' || !SAFE_IMAGE.test(sheets.main || '')) {
      document.documentElement.dataset.winampLive = '';
      return;
    }
    skin = custom;
    for (const [name, url] of Object.entries(sheets)) {
      if (typeof url !== 'string' || !SAFE_IMAGE.test(url)) continue;
      const img = new Image(); img.src = url; images[name] = img;
    }
    viscolor = Array.isArray(custom.viscolor) ? custom.viscolor.filter(c => /^#[0-9a-f]{6}$/i.test(c)) : [];
    document.documentElement.dataset.winampLive = 'on';
  }

  const ready = name => images[name]?.complete && images[name].naturalWidth > 0;
  function sprite(ctx, name, sx, sy, w, h, dx, dy) {
    const img = images[name];
    if (!ready(name) || sx + w > img.naturalWidth || sy + h > img.naturalHeight) return false;
    ctx.drawImage(img, sx, sy, w, h, dx, dy, w, h);
    return true;
  }
  function text(ctx, str, x, y, maxWidth, offset = 0) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, maxWidth, 6); ctx.clip();
    const chars = [...str.toLowerCase()];
    for (let i = 0; i < chars.length; i++) {
      const pos = FONT[chars[i]] || FONT[' '];
      const dx = x + i * 5 - offset;
      if (dx > x + maxWidth || dx < x - 5) continue;
      sprite(ctx, 'text', pos[1] * 5, pos[0] * 6, 5, 6, dx, y);
    }
    ctx.restore();
  }
  function digit(ctx, n, x, y) {
    if (!sprite(ctx, 'numbers', n * 9, 0, 9, 13, x, y)) sprite(ctx, 'nums_ex', n * 9, 0, 9, 13, x, y);
  }

  function draw(canvas, now) {
    const deck = Number(canvas.parentElement?.dataset.deck);
    const state = engine.state[deck];
    if (!skin || !state || !ready('main')) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(images.main, 0, 0);
    sprite(ctx, 'titlebar', 27, 0, 275, 14, 0, 0);

    // Play / pause / stop indicator.
    const stopped = !state.playing && state.position < 0.05;
    sprite(ctx, 'playpaus', state.playing ? 0 : stopped ? 18 : 9, 0, 9, 9, 26, 28);

    // Time, minutes and seconds.
    const t = Math.max(0, Math.floor(state.position || 0));
    const m = Math.min(99, Math.floor(t / 60)), s = t % 60;
    [[Math.floor(m / 10), 48], [m % 10, 60], [Math.floor(s / 10), 78], [s % 10, 90]].forEach(([n, x]) => digit(ctx, n, x, 26));

    // Scrolling track title.
    const duration = Math.max(0, Math.floor(state.duration || 0));
    const title = `${deck + 1}. ${state.name || 'bit.cheer'} (${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')})  ***  `;
    const width = title.length * 5;
    const offset = width > 154 ? Math.floor(now / 45) % width : 0;
    text(ctx, title + title, 111, 27, 154, offset);

    // BPM shows in the kbps slot; pitch % in the kHz slot.
    const bpm = Math.round((state.bpm || 0) * (1 + (state.pitch || 0) / 100));
    text(ctx, String(Math.min(999, bpm)).padStart(3, ' '), 111, 43, 15);
    text(ctx, String(Math.min(99, Math.round(Math.abs(state.pitch || 0)))).padStart(2, '0'), 156, 43, 10);
    sprite(ctx, 'monoster', 0, 0, 29, 12, 212, 41);
    sprite(ctx, 'monoster', 29, 12, 27, 12, 239, 41);

    // Little spectrum analyser, in the skin's own colors.
    const bg = viscolor[0] || '#000000';
    ctx.fillStyle = bg; ctx.fillRect(24, 43, 76, 16);
    const level = state.playing ? Math.min(1, (state.peak || 0) * 2.2) : 0;
    const band = bars[deck];
    for (let i = 0; i < band.length; i++) {
      const wobble = 0.55 + 0.45 * Math.sin(now / (110 + i * 13) + i * 1.7) * Math.cos(now / 170 + i);
      const target = level * (0.35 + 0.65 * Math.abs(wobble)) * (1 - i / 40);
      band[i] = Math.max(target, band[i] - 0.04);
      const h = Math.round(band[i] * 16);
      for (let r = 0; r < h; r++) {
        ctx.fillStyle = viscolor[Math.min(17, 17 - r)] || '#00ff00';
        ctx.fillRect(24 + i * 4, 58 - r, 3, 1);
      }
    }

    // Volume (live) and balance (centred).
    const volume = deckVolume(deck);
    const frame = Math.round(volume * 27);
    sprite(ctx, 'volume', 0, frame * 15, 68, 13, VOLUME.x, VOLUME.y);
    const volDown = pressed.get(canvas) === 'volume';
    sprite(ctx, 'volume', volDown ? 0 : 15, 422, 14, 11, VOLUME.x + Math.round(volume * (VOLUME.w - 14)), 58);
    sprite(ctx, 'balance', 9, 0, 38, 13, 177, 57);
    sprite(ctx, 'balance', 15, 422, 14, 11, 189, 58);
    sprite(ctx, 'shufrep', 0, 61, 23, 12, 219, 58);
    sprite(ctx, 'shufrep', 23, 61, 23, 12, 242, 58);

    // Seek bar follows playback.
    const progress = state.duration ? Math.min(1, (state.position || 0) / state.duration) : 0;
    if (sprite(ctx, 'posbar', 0, 0, 248, 10, POSBAR.x, POSBAR.y)) {
      sprite(ctx, 'posbar', pressed.get(canvas) === 'seek' ? 278 : 248, 0, 29, 10, POSBAR.x + Math.round(progress * (POSBAR.w - 29)), POSBAR.y);
    }

    // Transport buttons, pressed while held.
    for (const [name, b] of Object.entries(BUTTONS)) {
      const down = pressed.get(canvas) === name;
      sprite(ctx, 'cbuttons', b.sx, down ? b.h : 0, b.w, b.h, b.x, b.y);
    }
    sprite(ctx, 'shufrep', 28, 0, 47, 15, 164, 89);
    sprite(ctx, 'shufrep', 0, 0, 28, 15, 210, 89);
  }

  function deckVolume(deck) {
    const input = document.querySelector(`.deck[data-deck="${deck}"] .deck-volume-row input[type=range]`);
    const v = input ? Number(input.value) : engine.state[deck]?.volume;
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8;
  }

  function point(canvas, event) {
    const r = canvas.getBoundingClientRect();
    return { x: (event.clientX - r.left) * 275 / r.width, y: (event.clientY - r.top) * 116 / r.height };
  }
  const inside = (p, b) => p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h;
  function hit(p) {
    for (const [name, b] of Object.entries(BUTTONS)) if (inside(p, b)) return name;
    if (inside(p, { x: VOLUME.x, y: VOLUME.y - 2, w: VOLUME.w, h: VOLUME.h + 4 })) return 'volume';
    if (inside(p, { x: POSBAR.x, y: POSBAR.y - 2, w: POSBAR.w, h: POSBAR.h + 4 })) return 'seek';
    return null;
  }
  function slide(canvas, deck, kind, p) {
    if (kind === 'volume') remote(deck, 'volume', Math.max(0, Math.min(1, (p.x - VOLUME.x - 7) / (VOLUME.w - 14))));
    if (kind === 'seek') seek(deck, Math.max(0, Math.min(1, (p.x - POSBAR.x - 14) / (POSBAR.w - 29))));
  }

  document.addEventListener('pointerdown', event => {
    const canvas = event.target.closest?.('.winamp-live canvas');
    if (!canvas || !skin) return;
    const deck = Number(canvas.parentElement.dataset.deck), p = point(canvas, event), name = hit(p);
    if (!name) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    pressed.set(canvas, name);
    slide(canvas, deck, name, p);
    const move = e => slide(canvas, deck, name, point(canvas, e));
    const up = e => {
      canvas.removeEventListener('pointermove', move);
      pressed.delete(canvas);
      if (name in BUTTONS && hit(point(canvas, e)) === name) {
        const playing = engine.state[deck]?.playing;
        if (name === 'play' && !playing) remote(deck, 'play');
        else if (name === 'pause' && playing) remote(deck, 'play');
        else if (name === 'stop') remote(deck, 'stop');
        else if (name !== 'play' && name !== 'pause') remote(deck, name);
      }
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up, { once: true });
    canvas.addEventListener('pointercancel', () => { canvas.removeEventListener('pointermove', move); pressed.delete(canvas); }, { once: true });
  });

  function frame(now) {
    if (skin) for (const canvas of document.querySelectorAll('.winamp-live canvas')) draw(canvas, now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { setSkin };
}
