import './mobile-gate.css';

const MESSAGES = [
  'Connecting at 9.6 kbps…',
  'Negotiating WAP gateway…',
  'Asking Nokia for permission…',
  'Rendering 2 turntables on 84×48 pixels…',
  'Out of memory. Please delete some SMS.',
];

const NOPES = [
  'Nope. Still a phone.',
  'Clicking harder won’t turn it into a PC.',
  'Have you tried a beige tower?',
  'Error 3310: thumbs are not a crossfader.',
  'OK OK, there is a secret button below ↓',
];

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
const HIGH_KEY = 'bit-cheer-snake-high';

export function showMobileGate(root, onBypass) {
  document.documentElement.classList.add('mobile-gated');
  root.innerHTML = `
    <div class="mg-stage">
      <div class="mg-window" role="alertdialog" aria-labelledby="mg-title" aria-describedby="mg-body">
        <div class="mg-titlebar">
          <span class="mg-title-icon">b.</span>
          <span id="mg-title">bit.cheer.exe — Fatal Pocket Error</span>
          <span class="mg-title-buttons" aria-hidden="true"><i>_</i><i>□</i><i>×</i></span>
        </div>
        <div class="mg-marquee" aria-hidden="true"><span>★ BEST VIEWED ON A PC @ 1024×768 ★ NETSCAPE NAVIGATOR 4 RECOMMENDED ★ DO NOT UNPLUG THE MODEM ★ BEST VIEWED ON A PC @ 1024×768 ★</span></div>
        <div class="mg-content">
          <div class="mg-phone" role="button" tabindex="0" aria-label="Play Snake">
            <div class="mg-antenna"></div>
            <div class="mg-screen">
              <div class="mg-signal"><span>▂▃▅▇ <b>WAP</b></span><span class="mg-score"></span></div>
              <canvas class="mg-snake" width="84" height="48"></canvas>
            </div>
            <div class="mg-keys">${KEYS.map(k => `<button type="button" tabindex="-1" data-key="${k}">${k}</button>`).join('')}</div>
          </div>
          <div class="mg-text">
            <h1>Hey, time traveler! <span class="mg-blink">_</span></h1>
            <p id="mg-body">
              This app is from <b>early 2000</b>. Back then “mobile” meant a brick with
              <em>Snake</em> on it, not a DJ booth. Two decks, a crossfader and a pitch
              fader just don’t fit next to your thumbs.
            </p>
            <p class="mg-cta">Fire up your <b>PC</b> (beige tower, CRT, the works) and come back. We’ll keep the decks warm.</p>
            <div class="mg-progress" aria-hidden="true"><div class="mg-bar"></div></div>
          </div>
        </div>
        <p class="mg-status" aria-live="polite">${MESSAGES[0]}</p>
        <div class="mg-actions">
          <button type="button" class="mg-btn mg-play">Play Snake</button>
          <button type="button" class="mg-btn mg-ok">OK, I’ll get my PC</button>
          <button type="button" class="mg-btn mg-bypass" hidden>Load anyway (no refunds)</button>
        </div>
      </div>
      <p class="mg-footer">© 2000 bit.cheer · This page is Y2K compliant</p>
    </div>`;

  const status = root.querySelector('.mg-status');
  const win = root.querySelector('.mg-window');
  const bypass = root.querySelector('.mg-bypass');
  const playBtn = root.querySelector('.mg-play');
  const phone = root.querySelector('.mg-phone');

  let msg = 0;
  const statusTimer = setInterval(() => {
    if (win.classList.contains('mg-playing')) return;
    msg = (msg + 1) % MESSAGES.length;
    status.textContent = MESSAGES[msg];
  }, 2200);

  const snake = createSnake({
    canvas: root.querySelector('.mg-snake'),
    scoreEl: root.querySelector('.mg-score'),
    onStatus: (text) => { status.textContent = text; },
  });

  const enterGame = () => {
    win.classList.add('mg-playing');
    playBtn.textContent = 'Back to the message';
    snake.start();
  };
  const exitGame = () => {
    win.classList.remove('mg-playing');
    playBtn.textContent = 'Play Snake';
    snake.autopilot();
    status.textContent = MESSAGES[msg];
  };

  playBtn.addEventListener('click', () => (snake.playing() || win.classList.contains('mg-playing') ? exitGame() : enterGame()));
  phone.addEventListener('click', (e) => {
    if (!win.classList.contains('mg-playing')) enterGame();
    else if (!e.target.closest('[data-key]') && !snake.playing()) snake.start();
  });
  phone.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !win.classList.contains('mg-playing')) { e.preventDefault(); enterGame(); }
  });

  // Keypad: 2/4/6/8 steer, 5 (re)starts.
  const keyDirs = { 2: 'up', 4: 'left', 6: 'right', 8: 'down' };
  root.querySelectorAll('[data-key]').forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!win.classList.contains('mg-playing')) return;
      const k = btn.dataset.key;
      if (keyDirs[k]) snake.steer(keyDirs[k]);
      else if (k === '5' && !snake.playing()) snake.start();
      navigator.vibrate?.(8);
    });
  });

  // Swipes on the phone steer too.
  let touchStart = null;
  phone.addEventListener('touchstart', (e) => { touchStart = e.touches[0]; }, { passive: true });
  phone.addEventListener('touchmove', (e) => {
    if (!touchStart || !win.classList.contains('mg-playing')) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - touchStart.clientX, dy = t.clientY - touchStart.clientY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    snake.steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    touchStart = t;
  }, { passive: false });

  // Keyboard, for the desktop preview (?mobile=1).
  const onKey = (e) => {
    if (!win.classList.contains('mg-playing')) return;
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', 2: 'up', 8: 'down', 4: 'left', 6: 'right' };
    if (map[e.key]) { e.preventDefault(); snake.steer(map[e.key]); }
    else if ((e.key === ' ' || e.key === '5' || e.key === 'Enter') && !snake.playing()) { e.preventDefault(); snake.start(); }
    else if (e.key === 'Escape') exitGame();
  };
  addEventListener('keydown', onKey);

  let nope = 0;
  root.querySelector('.mg-ok').addEventListener('click', () => {
    if (win.classList.contains('mg-playing')) exitGame();
    status.textContent = NOPES[Math.min(nope, NOPES.length - 1)];
    nope++;
    win.classList.remove('mg-shake');
    void win.offsetWidth; // restart the animation
    win.classList.add('mg-shake');
    if (nope >= NOPES.length) bypass.hidden = false;
  });
  bypass.addEventListener('click', () => {
    clearInterval(statusTimer);
    removeEventListener('keydown', onKey);
    snake.stop();
    onBypass();
  });
}

// Snake on an 84×48 Nokia-style screen. Plays itself until you take over.
function createSnake({ canvas, scoreEl, onStatus }) {
  const ctx = canvas.getContext('2d');
  const cell = 4, cols = canvas.width / cell, rows = canvas.height / cell;
  const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  const INK = '#1e2b0c', LCD = '#9bbc0f';
  let mode = 'auto'; // 'auto' | 'play' | 'over'
  let snake, dir, queue, food, score, timer;
  let high = 0;
  try { high = Number(localStorage.getItem(HIGH_KEY)) || 0; } catch {}

  const place = () => {
    let f;
    do f = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
    while (snake.some(s => s.x === f.x && s.y === f.y));
    return f;
  };
  const blocked = (p) => p.x < 0 || p.y < 0 || p.x >= cols || p.y >= rows || snake.some(s => s.x === p.x && s.y === p.y);
  const reset = () => {
    snake = [{ x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }];
    dir = DIRS.right;
    queue = [];
    food = place();
    score = 0;
  };

  const speed = () => (mode === 'play' ? Math.max(60, 150 - score * 4) : 110);
  const schedule = () => { clearTimeout(timer); timer = setTimeout(tick, speed()); };

  const autopilotDir = () => {
    const head = snake[0];
    const options = [dir, { x: dir.y, y: -dir.x }, { x: -dir.y, y: dir.x }]
      .map(d => ({ d, p: { x: head.x + d.x, y: head.y + d.y } }))
      .filter(o => !blocked(o.p))
      .sort((a, b) => (Math.abs(a.p.x - food.x) + Math.abs(a.p.y - food.y)) - (Math.abs(b.p.x - food.x) + Math.abs(b.p.y - food.y)));
    return options[0]?.d;
  };

  const tick = () => {
    if (mode === 'over') return;
    if (mode === 'auto') {
      const d = autopilotDir();
      if (!d || snake.length > 40) { reset(); draw(); return schedule(); }
      dir = d;
    } else if (queue.length) {
      dir = queue.shift();
    }
    const next = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (blocked(next)) return gameOver();
    snake.unshift(next);
    if (next.x === food.x && next.y === food.y) {
      food = place();
      if (mode === 'play') { score++; navigator.vibrate?.(15); }
    } else snake.pop();
    draw();
    schedule();
  };

  const gameOver = () => {
    if (mode === 'auto') { reset(); draw(); return schedule(); }
    mode = 'over';
    const best = score > high;
    if (best) { high = score; try { localStorage.setItem(HIGH_KEY, String(high)); } catch {} }
    navigator.vibrate?.([60, 40, 60]);
    let flashes = 0;
    const flash = setInterval(() => {
      draw(flashes % 2 === 0);
      if (++flashes >= 6) { clearInterval(flash); drawGameOver(best); }
    }, 120);
    onStatus(best ? `NEW HIGH SCORE: ${score}! Still no DJ decks though.` : `Game over. Score ${score} · best ${high}. Tap the phone or press 5 to retry.`);
  };

  const draw = (hideSnake = false) => {
    ctx.fillStyle = LCD;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = INK;
    if (!hideSnake) snake.forEach(s => ctx.fillRect(s.x * cell, s.y * cell, cell - 1, cell - 1));
    ctx.fillRect(food.x * cell + 1, food.y * cell + 1, 2, 2);
    scoreEl.textContent = mode === 'auto' ? (high ? `HI ${high}` : '') : String(score).padStart(4, '0');
  };

  const drawGameOver = (best) => {
    ctx.fillStyle = LCD;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(best ? 'HIGH SCORE!' : 'GAME OVER', 42, 16);
    ctx.font = '8px monospace';
    ctx.fillText(`SCORE ${score}`, 42, 28);
    ctx.fillText('PRESS 5', 42, 40);
  };

  reset();
  draw();
  schedule();

  return {
    playing: () => mode === 'play',
    start() {
      mode = 'play';
      reset();
      draw();
      onStatus('Snake! Swipe or use 2 4 6 8. Don’t eat yourself.');
      schedule();
    },
    autopilot() {
      mode = 'auto';
      reset();
      draw();
      schedule();
    },
    steer(name) {
      if (mode !== 'play') return;
      const d = DIRS[name];
      const last = queue[queue.length - 1] || dir;
      if (d.x === -last.x && d.y === -last.y) return; // no instant U-turns
      if (d === last || queue.length >= 3) return;
      queue.push(d);
    },
    stop() { clearTimeout(timer); mode = 'over'; },
  };
}
