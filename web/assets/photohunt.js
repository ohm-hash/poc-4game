import { $, $$, showScreen, sleep, shuffle, rand, pick, fmtTime, sfx, Countdown, photoCapture, makeCanvas, drawCover, shareQR, downloadCanvas, confetti, progressWhile, toast, animate } from './common.js';
import { stylize, emoji, souvenir, aiGenerate, AI_ON } from './ai.js';

const W = 600, H = 450, N = 8, TIME = 90, R = 30;
const STICKERS = ['🎃', '🦇', '🌕', '🕷️', '👻', '⭐', '🕯️', '🍬', '💀', '🥀'];
let photo, portrait, imgA, imgB, diffs = [], found = 0, timer, over = true, seed = 1;

const cam = photoCapture($('#cap'), { round: true, hint: 'มองกล้อง แล้วกดปุ่มถ่ายรูป 📸', onPhoto: (c) => { photo = c; generate(); } });

$('#start').onclick = () => { sfx('tap'); showScreen('s-capture'); cam.start(); };

async function generate() {
  showScreen('s-gen');
  seed = Date.now() % 100000;
  // blurred mock preview while the AI works
  const mock = stylize(photo, 'vampire', { w: 480, h: 600, seed });
  mock.style.filter = 'blur(16px) brightness(.5)';
  $('#genPreview').replaceChildren(mock);
  const bar = (p) => {
    $('#genBar').style.width = `${p * 100}%`;
    $('#genPct').textContent = `${Math.round(p * 100)}%`;
    mock.style.filter = `blur(${(1 - p) * 16}px) brightness(${0.5 + p * 0.5})`;
  };
  const ai = AI_ON ? await progressWhile(aiGenerate(photo, 'vampire'), bar, 18000) : (await animate(3200, bar), null);
  if (AI_ON && !ai) toast('AI ไม่ตอบ — ใช้ภาพจำลองแทน');
  let scene;
  if (ai) {
    portrait = ai.canvas;
    const [c, x] = makeCanvas(W, H);
    drawCover(x, ai.canvas, 0, 0, W, H, 0.5);
    scene = c;
    const show = ai.canvas.cloneNode();
    show.getContext('2d').drawImage(ai.canvas, 0, 0);
    $('#genPreview').replaceChildren(show);
  } else {
    portrait = mock;
    portrait.style.filter = '';
    scene = stylize(photo, 'vampire', { w: W, h: H, seed });
  }
  build(scene);
  sfx('good');
  await sleep(900);
  play();
}

// Soft-edged patch copied from `src` at p, transformed by `fx` — so the edit has no hard circle edge.
function patch(dx, src, p, fx) {
  const S = R * 2;
  const [t, tx] = makeCanvas(S, S);
  tx.save();
  fx(tx, S);
  tx.drawImage(src, p.x - R, p.y - R, S, S, 0, 0, S, S);
  tx.restore();
  tx.globalCompositeOperation = 'destination-in';
  const g = tx.createRadialGradient(R, R, R * 0.55, R, R, R);
  g.addColorStop(0, '#000');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  tx.fillStyle = g;
  tx.fillRect(0, 0, S, S);
  dx.drawImage(t, p.x - R, p.y - R);
}

// mean per-pixel RGB difference inside the inner part of the circle at p
function visibleChange(ax, bx, p) {
  const s = Math.round(R * 1.2), x0 = Math.round(p.x - s / 2), y0 = Math.round(p.y - s / 2);
  const A = ax.getImageData(x0, y0, s, s).data, B = bx.getImageData(x0, y0, s, s).data;
  let sum = 0;
  for (let i = 0; i < A.length; i += 4) sum += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
  return sum / (A.length / 4);
}

function build(scene) {
  const [a, ax] = makeCanvas(W, H);
  ax.drawImage(scene, 0, 0);
  // shared decorations (same in both pictures) to make the search harder
  for (let i = 0; i < 6; i++) emoji(ax, pick(STICKERS), rand(30, W - 30), rand(30, H - 30), rand(26, 40), rand(-0.5, 0.5), 0.95);
  const [b, bx] = makeCanvas(W, H);
  bx.drawImage(a, 0, 0);

  const pts = [];
  for (let i = 0; i < N; i++) {
    let p, tries = 0;
    do {
      p = { x: rand(R + 8, W - R - 8), y: rand(R + 8, H - R - 8) };
      tries++;
    } while (tries < 300 && pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < R * 2.6));
    pts.push(p);
  }
  const types = shuffle(['add', 'add', 'missing', 'swap', 'color', 'flip', 'dark', 'color']);
  diffs = pts.map((p, i) => {
    const type = types[i];
    if (type === 'add') emoji(bx, pick(STICKERS), p.x, p.y, R * 1.4, rand(-0.4, 0.4));
    else if (type === 'missing') emoji(ax, pick(STICKERS), p.x, p.y, R * 1.4, rand(-0.4, 0.4));
    else if (type === 'swap') {
      const [e1, e2] = shuffle([...STICKERS]);
      emoji(ax, e1, p.x, p.y, R * 1.4);
      emoji(bx, e2, p.x, p.y, R * 1.4);
    } else if (type === 'color') patch(bx, a, p, (t) => { t.filter = `hue-rotate(${rand(120, 220)}deg) saturate(2)`; });
    else if (type === 'flip') patch(bx, a, p, (t, S) => { t.translate(0, S); t.scale(1, -1); });
    else if (type === 'dark') patch(bx, a, p, (t) => { t.filter = 'brightness(0.35)'; });
    // A colour/flip/darken edit on a flat or dark area can be invisible — fall back to a sticker.
    if (visibleChange(ax, bx, p) < 30) {
      emoji(bx, pick(STICKERS), p.x, p.y, R * 1.4, rand(-0.4, 0.4));
      return { ...p, type: 'add', found: false };
    }
    return { ...p, type, found: false };
  });
  imgA = a;
  imgB = b;
}

function play() {
  showScreen('s-play');
  found = 0;
  over = false;
  for (const [wrap, img] of [[$('#picA'), imgA], [$('#picB'), imgB]]) {
    $$('canvas, .mk', wrap).forEach((n) => n.remove());
    wrap.prepend(img);
  }
  updateFound();
  timer = new Countdown(TIME, (t) => { $('#pTime').textContent = fmtTime(t); }, () => finish(false));
  timer.start();
}

function marker(d, cls = '') {
  for (const wrap of [$('#picA'), $('#picB')]) {
    const m = document.createElement('div');
    m.className = `mk ${cls}`;
    m.style.left = `${(d.x / W) * 100}%`;
    m.style.top = `${(d.y / H) * 100}%`;
    m.style.width = `${((R * 2.4) / W) * 100}%`;
    if (cls === 'miss') m.textContent = '✕';
    wrap.appendChild(m);
    if (cls) setTimeout(() => m.remove(), cls === 'hint' ? 2100 : 900);
  }
}

function updateFound() { $('#pFound').textContent = `${found}/${N}`; }

for (const wrap of [$('#picA'), $('#picB')]) {
  wrap.addEventListener('pointerdown', (e) => {
    if (over) return;
    const r = wrap.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    const hit = diffs.find((d) => !d.found && Math.hypot(d.x - x, d.y - y) < R * 1.7);
    if (hit) {
      hit.found = true;
      found++;
      marker(hit);
      sfx('good');
      updateFound();
      if (found === N) {
        timer.stop();
        over = true;
        setTimeout(() => finish(true), 700);
      }
    } else if (!diffs.some((d) => d.found && Math.hypot(d.x - x, d.y - y) < R * 1.7)) {
      marker({ x, y }, 'miss');
      timer.penalty(3);
      sfx('bad');
    }
  });
}

$('#hintBtn').onclick = () => {
  if (over) return;
  const d = diffs.find((x) => !x.found);
  if (!d) return;
  timer.penalty(10);
  marker(d, 'hint');
  sfx('tap');
};

let score = 0;
function finish(win) {
  over = true;
  timer.stop();
  const used = timer.used;
  score = found * 100 + (win ? Math.ceil(timer.left) * 10 : 0);
  const stars = win ? (used <= 60 ? 3 : 2) : found >= 4 ? 1 : 0;
  $('#rTitle').textContent = win ? 'WELL DONE!' : 'TIME UP!';
  $('#rSub').textContent = win ? 'คุณเก่งมาก!' : `หาเจอ ${found} จุด — เกือบแล้ว!`;
  $('#rTime').textContent = fmtTime(used);
  $('#rFound').textContent = `${found}/${N}`;
  $('#rStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  showScreen('s-result');
  animate(900, (p) => { $('#rScore').textContent = Math.round(score * p); });
  if (win) { sfx('win'); confetti($('.stage')); }
}

$('#toSave').onclick = () => {
  sfx('tap');
  const c = portrait.cloneNode();
  c.getContext('2d').drawImage(portrait, 0, 0);
  c.className = 'shot';
  $('#saveImg').replaceChildren(c);
  shareQR($('#qr'), $('#s-save .poc-note'), makeCard(), 'photohunt');
  showScreen('s-save');
};
const makeCard = () => souvenir({
  image: portrait, title: 'PHOTOHUNT', lines: [`คะแนน ${score}`, `หาจุดต่างเจอ ${found}/${N} จุด`],
  c1: '#3a4a8a', c2: '#0b1030', imgH: Math.min(560, Math.round((520 * portrait.height) / portrait.width)),
});
$('#dl').onclick = () => downloadCanvas(makeCard(), 'photohunt.png');
$('#home').onclick = () => showScreen('s-home');
