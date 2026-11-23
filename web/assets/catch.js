import { $, showScreen, sleep, rand, sfx, photoCapture, makeCanvas, roundRect, shareQR, downloadCanvas, downloadBlob, animate, confetti, drawCover, progressWhile, toast } from './common.js';
import { cartoonHead, emoji, aiGenerate, AI_ON } from './ai.js';

const GW = 540, GH = 960, DURATION = 45, HEARTS = 3;
const GROUND = GH - 70;            // feet line of the character
const BASKET_Y = GROUND - 132;     // top rim of the basket
const ITEMS = {
  egg: { pts: 10, r: 26, w: 52 },
  gold: { pts: 50, r: 28, w: 8 },
  gift: { pts: 30, r: 30, w: 18 },
  bomb: { pts: 0, r: 30, w: 22 },
};

let photo, head, S, rec = null, chunks = [], videoBlob = null, videoURL = null, posterCanvas = null;
const cv = $('#game'), ctx = cv.getContext('2d');
const bg = makeBackground();

// ---------------- flow ----------------
const cam = photoCapture($('#cap'), { hint: 'หน้าตรง ยิ้มกว้างๆ 😄', onPhoto: (c) => { photo = c; generate(); } });
const toCam = () => { sfx('tap'); showScreen('s-capture'); cam.start(); };
$('#toCam').onclick = toCam;
$('#startSample').onclick = toCam;

async function generate() {
  showScreen('s-gen');
  $('#go').disabled = true;
  const thumb = makeCanvas(300, 300)[0];
  drawCover(thumb.getContext('2d'), photo, 0, 0, 300, 300, 0.42);
  thumb.style.width = '100%';
  $('#genPhoto').replaceChildren(thumb);
  head = cartoonHead(photo, 240);
  const gc = $('#genChar'), gx = gc.getContext('2d');
  const bar = (p) => {
    $('#genBar').style.width = `${p * 100}%`;
    $('#genPct').textContent = `${Math.round(p * 100)}%`;
    drawPreview(gx, gc.width, gc.height, Math.min(p, 0.6));
  };
  if (AI_ON) {
    const ai = await progressWhile(aiGenerate(photo, 'chibi'), bar, 15000);
    if (ai) head = cartoonHead(ai.canvas, 240, { raw: true });
    else toast('AI ไม่ตอบ — ใช้ตัวละครจำลองแทน');
  } else await animate(2600, bar);
  await animate(400, (p) => drawPreview(gx, gc.width, gc.height, 0.6 + p * 0.4));
  sfx('good');
  $('#go').disabled = false;
}

function drawPreview(x, w, h, p = 1) {
  x.clearRect(0, 0, w, h);
  x.fillStyle = '#fff3dc';
  x.fillRect(0, 0, w, h);
  x.save();
  x.globalAlpha = p;
  x.filter = `blur(${(1 - p) * 10}px)`;
  x.translate(w / 2, h - 20);
  x.scale(1.25, 1.25);
  drawCharacter(x, 0, 0, 0);
  x.restore();
  if (p >= 1) for (let i = 0; i < 5; i++) emoji(x, '✨', 30 + ((i * 67) % (w - 60)), 30 + ((i * 97) % 140), 22);
}

$('#go').onclick = () => { sfx('tap'); startGame(); };

// ---------------- drawing ----------------
function makeBackground() {
  const [c, x] = makeCanvas(GW, GH);
  const sky = x.createLinearGradient(0, 0, 0, GH);
  sky.addColorStop(0, '#47b8ff');
  sky.addColorStop(0.6, '#bfe9ff');
  x.fillStyle = sky;
  x.fillRect(0, 0, GW, GH);
  x.fillStyle = '#fff6b0';
  x.beginPath(); x.arc(440, 200, 50, 0, 7); x.fill();
  x.fillStyle = '#ffffffdd';
  for (const [cx, cy, s] of [[90, 260, 1], [330, 330, 0.8], [480, 420, 0.6]]) {
    x.beginPath();
    x.arc(cx, cy, 30 * s, 0, 7); x.arc(cx + 34 * s, cy - 14 * s, 38 * s, 0, 7); x.arc(cx + 72 * s, cy, 30 * s, 0, 7);
    x.fill();
  }
  // hills
  x.fillStyle = '#7ccf4f';
  x.beginPath(); x.ellipse(120, GH - 260, 260, 120, 0, Math.PI, 0); x.fill();
  x.fillStyle = '#5fb83a';
  x.beginPath(); x.ellipse(460, GH - 250, 280, 140, 0, Math.PI, 0); x.fill();
  // barn
  x.fillStyle = '#d6342c'; x.fillRect(40, GH - 380, 110, 90);
  x.fillStyle = '#8f1f1a';
  x.beginPath(); x.moveTo(30, GH - 380); x.lineTo(95, GH - 430); x.lineTo(160, GH - 380); x.fill();
  x.strokeStyle = '#fff'; x.lineWidth = 5; x.strokeRect(75, GH - 350, 40, 60);
  x.beginPath(); x.moveTo(75, GH - 350); x.lineTo(115, GH - 290); x.moveTo(115, GH - 350); x.lineTo(75, GH - 290); x.stroke();
  // trees
  for (const tx of [210, 420]) {
    x.fillStyle = '#7a4a22'; x.fillRect(tx - 8, GH - 360, 16, 60);
    x.fillStyle = '#3f9e2e'; x.beginPath(); x.arc(tx, GH - 375, 40, 0, 7); x.fill();
  }
  // grass
  x.fillStyle = '#4fae2f';
  x.fillRect(0, GH - 300, GW, 300);
  x.fillStyle = '#5cc23a';
  for (let i = 0; i < 70; i++) {
    const gx = (i * 53) % GW, gy = GH - 290 + ((i * 37) % 280);
    x.beginPath(); x.moveTo(gx, gy); x.lineTo(gx + 5, gy - 14); x.lineTo(gx + 10, gy); x.fill();
  }
  // fence
  x.fillStyle = '#f1e3c4';
  x.fillRect(0, GH - 300, GW, 10);
  x.fillRect(0, GH - 276, GW, 10);
  for (let fx = 10; fx < GW; fx += 46) x.fillRect(fx, GH - 320, 12, 60);
  return c;
}

function drawCharacter(x, px, gy, bob) {
  const y = gy + bob;
  x.save();
  x.lineJoin = 'round';
  // legs + shoes
  x.fillStyle = '#2d4a8a';
  roundRect(x, px - 30, y - 72, 24, 62, 8); x.fill();
  roundRect(x, px + 6, y - 72, 24, 62, 8); x.fill();
  x.fillStyle = '#fff';
  x.beginPath(); x.ellipse(px - 20, y - 8, 20, 10, 0, 0, 7); x.ellipse(px + 20, y - 8, 20, 10, 0, 0, 7); x.fill();
  // hoodie
  x.fillStyle = '#f5a623';
  x.strokeStyle = '#b86f00';
  x.lineWidth = 4;
  roundRect(x, px - 48, y - 160, 96, 96, 28); x.fill(); x.stroke();
  x.strokeStyle = '#fff';
  x.lineWidth = 3;
  x.beginPath(); x.moveTo(px - 10, y - 152); x.lineTo(px - 12, y - 125); x.moveTo(px + 10, y - 152); x.lineTo(px + 12, y - 125); x.stroke();
  // head
  x.drawImage(head, px - 64, y - 290, 128, 128);
  // basket
  const bt = y - 132;
  x.fillStyle = '#c98a3c';
  x.strokeStyle = '#7a4a14';
  x.lineWidth = 4;
  x.beginPath();
  x.moveTo(px - 70, bt); x.lineTo(px + 70, bt); x.lineTo(px + 52, bt + 56); x.lineTo(px - 52, bt + 56); x.closePath();
  x.fill(); x.stroke();
  x.strokeStyle = '#a66a25';
  x.lineWidth = 3;
  for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(px - 70 + i * 4.5, bt + i * 14); x.lineTo(px + 70 - i * 4.5, bt + i * 14); x.stroke(); }
  for (let i = -3; i <= 3; i++) { x.beginPath(); x.moveTo(px + i * 19, bt); x.lineTo(px + i * 14, bt + 56); x.stroke(); }
  x.fillStyle = '#8a5418';
  x.beginPath(); x.ellipse(px, bt, 70, 13, 0, 0, 7); x.fill();
  x.fillStyle = '#5c3510';
  x.beginPath(); x.ellipse(px, bt + 2, 58, 8, 0, 0, 7); x.fill();
  // hands
  x.fillStyle = '#f0b98f';
  x.beginPath(); x.arc(px - 70, bt + 10, 12, 0, 7); x.arc(px + 70, bt + 10, 12, 0, 7); x.fill();
  x.restore();
}

function drawItem(x, it) {
  x.save();
  x.translate(it.x, it.y);
  x.rotate(it.rot);
  if (it.type === 'egg' || it.type === 'gold') {
    const g = x.createRadialGradient(-8, -10, 4, 0, 0, it.r * 1.1);
    if (it.type === 'egg') { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e9dcc0'); }
    else { g.addColorStop(0, '#fff7b0'); g.addColorStop(1, '#ffae00'); }
    x.fillStyle = g;
    x.strokeStyle = it.type === 'egg' ? '#c8b48a' : '#c77d00';
    x.lineWidth = 3;
    x.beginPath(); x.ellipse(0, 0, it.r * 0.78, it.r, 0, 0, 7); x.fill(); x.stroke();
    if (it.type === 'gold') emoji(x, '✨', 16, -18, 20);
  } else {
    emoji(x, it.type === 'gift' ? '🎁' : '💣', 0, 0, it.r * 2);
  }
  x.restore();
}

function panel(x, px, py, w, h) {
  x.fillStyle = '#0d2a6bcc';
  roundRect(x, px, py, w, h, 16);
  x.fill();
  x.strokeStyle = '#ffffff55';
  x.lineWidth = 2;
  x.stroke();
}

function drawHud(x) {
  x.save();
  x.textAlign = 'left';
  x.textBaseline = 'top';
  panel(x, 16, 16, 150, 78);
  x.fillStyle = '#ffd84a'; x.font = '600 20px Kanit, sans-serif'; x.fillText('⏱ เวลา', 30, 22);
  x.fillStyle = '#fff'; x.font = '800 36px Kanit, sans-serif';
  const left = Math.max(0, Math.ceil(DURATION - S.t));
  x.fillText(`00:${String(left).padStart(2, '0')}`, 30, 46);
  panel(x, GW - 176, 16, 160, 78);
  x.textAlign = 'right';
  x.fillStyle = '#ffd84a'; x.font = '600 20px Kanit, sans-serif'; x.fillText('คะแนน', GW - 30, 22);
  x.fillStyle = '#fff'; x.font = '800 36px Kanit, sans-serif'; x.fillText(String(S.score), GW - 30, 46);
  if (S.combo >= 2) {
    panel(x, GW - 136, 102, 120, 66);
    x.fillStyle = '#ffd84a'; x.font = '600 18px Kanit, sans-serif'; x.fillText('คอมโบ', GW - 30, 106);
    x.fillStyle = '#fff'; x.font = '800 30px Kanit, sans-serif'; x.fillText(`x${S.combo}`, GW - 30, 128);
  }
  panel(x, 16, 104, 56, 150);
  for (let i = 0; i < HEARTS; i++) emoji(x, i < S.hearts ? '❤️' : '🩶', 44, 132 + i * 44, 32);
  x.restore();
}

function render() {
  ctx.save();
  if (S.shake > 0) ctx.translate(rand(-8, 8) * S.shake, rand(-8, 8) * S.shake);
  ctx.drawImage(bg, 0, 0);
  for (const it of S.items) drawItem(ctx, it);
  drawCharacter(ctx, S.px, GROUND, Math.sin(S.t * 12) * (Math.abs(S.vx) > 30 ? 3 : 1));
  for (const f of S.floats) {
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.fillStyle = f.color;
    ctx.strokeStyle = '#0008';
    ctx.lineWidth = 5;
    ctx.font = '800 34px Kanit, sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  drawHud(ctx);
  if (S.phase === 'count' || S.phase === 'end') {
    const txt = S.phase === 'end' ? (S.hearts <= 0 ? 'GAME OVER' : 'หมดเวลา!') : S.countLeft > 0 ? String(Math.ceil(S.countLeft)) : 'GO!';
    ctx.fillStyle = '#0006';
    ctx.fillRect(0, 0, GW, GH);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${S.phase === 'end' ? 80 : 150}px Kanit, sans-serif`;
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#a33a00';
    ctx.fillStyle = '#ffd84a';
    ctx.strokeText(txt, GW / 2, GH / 2 - 60);
    ctx.fillText(txt, GW / 2, GH / 2 - 60);
    if (S.phase === 'count') {
      ctx.font = '600 30px Kanit, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText('ลากนิ้วซ้าย-ขวา เพื่อรับของ • หลบ 💣', GW / 2, GH / 2 + 60);
    }
  }
}

// ---------------- game loop ----------------
function pickType() {
  let r = Math.random() * Object.values(ITEMS).reduce((a, b) => a + b.w, 0);
  for (const [k, v] of Object.entries(ITEMS)) if ((r -= v.w) < 0) return k;
  return 'egg';
}

function startGame() {
  S = { phase: 'count', countLeft: 3, t: 0, px: GW / 2, tx: GW / 2, vx: 0, items: [], floats: [], score: 0, combo: 0, maxCombo: 0, hearts: HEARTS, spawn: 0, shake: 0, eggs: 0, gifts: 0, last: performance.now(), lastCount: 4 };
  showScreen('s-play');
  startRec();
  requestAnimationFrame(loop);
}

function loop(now) {
  const dt = Math.min(0.05, (now - S.last) / 1000);
  S.last = now;
  if (S.phase === 'count') {
    S.countLeft -= dt;
    if (Math.ceil(S.countLeft) !== S.lastCount) { S.lastCount = Math.ceil(S.countLeft); sfx(S.countLeft > 0 ? 'tap' : 'good'); }
    if (S.countLeft <= -0.5) S.phase = 'play';
  } else if (S.phase === 'play') update(dt);
  // player follows the finger smoothly
  const prev = S.px;
  S.px += (S.tx - S.px) * Math.min(1, dt * 14);
  S.vx = (S.px - prev) / Math.max(dt, 0.001);
  S.shake = Math.max(0, S.shake - dt * 2);
  for (const f of S.floats) { f.y -= 60 * dt; f.life -= dt * 1.2; }
  S.floats = S.floats.filter((f) => f.life > 0);
  render();
  if (S.phase !== 'done') requestAnimationFrame(loop);
}

function update(dt) {
  S.t += dt;
  S.spawn -= dt;
  if (S.spawn <= 0) {
    const type = pickType(), d = ITEMS[type];
    S.items.push({ type, x: rand(50, GW - 50), y: -40, vy: 230 + S.t * 7 + rand(0, 90), r: d.r, rot: rand(-0.4, 0.4), vr: rand(-2, 2) });
    S.spawn = Math.max(0.32, 0.85 - S.t * 0.012);
  }
  for (const it of S.items) {
    it.y += it.vy * dt;
    it.rot += it.vr * dt;
    if (!it.done && it.y + it.r * 0.6 >= BASKET_Y && it.y - it.r < BASKET_Y + 24 && Math.abs(it.x - S.px) < 70) {
      it.done = true;
      catchItem(it);
    } else if (!it.done && it.y > GH + 40) {
      it.done = true;
      if (it.type !== 'bomb') S.combo = 0; // missed a good item
    }
  }
  S.items = S.items.filter((it) => !it.done);
  if (S.t >= DURATION || S.hearts <= 0) endGame();
}

function catchItem(it) {
  if (it.type === 'bomb') {
    S.hearts--;
    S.combo = 0;
    S.shake = 1;
    S.floats.push({ text: '💥 -1 ❤️', x: it.x, y: BASKET_Y - 40, life: 1.2, color: '#ff4d4d' });
    sfx('bad');
    return;
  }
  S.combo++;
  S.maxCombo = Math.max(S.maxCombo, S.combo);
  const mult = 1 + Math.floor(S.combo / 5);
  const pts = ITEMS[it.type].pts * mult;
  S.score += pts;
  if (it.type === 'gift') S.gifts++; else S.eggs++;
  S.floats.push({ text: `+${pts}`, x: it.x, y: BASKET_Y - 30, life: 1, color: it.type === 'gold' ? '#ffd84a' : '#fff' });
  sfx(it.type === 'gold' ? 'coin' : 'good');
}

async function endGame() {
  S.phase = 'end';
  sfx('win');
  await sleep(1300);
  S.phase = 'done';
  await stopRec();
  showScore();
}

// ---------------- input ----------------
function pointerTo(e) {
  const r = cv.getBoundingClientRect();
  // canvas is drawn with object-fit-like stretch: width maps 1:1 to GW
  S && (S.tx = Math.max(60, Math.min(GW - 60, ((e.clientX - r.left) / r.width) * GW)));
}
cv.addEventListener('pointerdown', pointerTo);
cv.addEventListener('pointermove', pointerTo);
window.addEventListener('keydown', (e) => {
  if (!S || S.phase === 'done') return;
  if (e.key === 'ArrowLeft') S.tx = Math.max(60, S.tx - 70);
  if (e.key === 'ArrowRight') S.tx = Math.min(GW - 60, S.tx + 70);
});

// ---------------- video recording ----------------
function startRec() {
  chunks = [];
  videoBlob = null;
  rec = null;
  if (!cv.captureStream || !window.MediaRecorder) return;
  const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
  try {
    rec = new MediaRecorder(cv.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 1_500_000 } : undefined);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start(250);
  } catch {
    rec = null;
  }
}
function stopRec() {
  return new Promise((res) => {
    if (!rec || rec.state === 'inactive') return res(null);
    rec.onstop = () => {
      videoBlob = chunks.length ? new Blob(chunks, { type: rec.mimeType || 'video/webm' }) : null;
      res(videoBlob);
    };
    rec.stop();
  });
}

// ---------------- results ----------------
function showScore() {
  showScreen('s-score');
  $('#stEgg').textContent = S.eggs;
  $('#stGift').textContent = S.gifts;
  $('#stCombo').textContent = `x${S.maxCombo}`;
  const sc = $('#scoreChar');
  drawPreview(sc.getContext('2d'), sc.width, sc.height, 1);
  animate(1200, (p) => { $('#sScore').textContent = Math.round(S.score * p); });
  confetti($('.stage'));
}

$('#toVideo').onclick = () => {
  sfx('tap');
  const v = $('#replay');
  if (videoURL) URL.revokeObjectURL(videoURL);
  videoURL = videoBlob ? URL.createObjectURL(videoBlob) : null;
  v.hidden = !videoURL;
  $('#noVideo').hidden = !!videoURL;
  if (videoURL) { v.src = videoURL; v.play().catch(() => {}); }
  showScreen('s-video');
};

$('#toShare').onclick = () => {
  sfx('tap');
  $('#replay').pause();
  posterCanvas = makePoster();
  posterCanvas.className = 'shot';
  $('#poster').replaceChildren(posterCanvas);
  shareQR($('#qr'), $('#s-share .poc-note'), videoBlob || posterCanvas, 'catch');
  $('#qrLabel').innerHTML = videoBlob ? 'สแกนเพื่อรับวิดีโอ' : 'สแกนเพื่อรับภาพ';
  $('#dlVideo').disabled = !videoBlob;
  showScreen('s-share');
};

function makePoster() {
  const [c, x] = makeCanvas(600, 800);
  x.drawImage(bg, 0, 160, GW, 800, 0, 0, 600, 800);
  x.fillStyle = '#0002';
  x.fillRect(0, 0, 600, 800);
  x.save();
  x.translate(300, 760);
  x.scale(1.7, 1.7);
  drawCharacter(x, 0, 0, 0);
  x.restore();
  for (let i = 0; i < 6; i++) emoji(x, ['🥚', '🎁', '✨'][i % 3], 60 + ((i * 97) % 480), 260 + ((i * 53) % 120), 40, rand(-0.4, 0.4));
  x.textAlign = 'center';
  x.lineJoin = 'round';
  x.font = '800 80px Kanit, sans-serif';
  x.lineWidth = 14;
  x.strokeStyle = '#1e3a9a';
  x.fillStyle = '#ffd84a';
  x.strokeText('รับของไข่ตก!', 300, 110);
  x.fillText('รับของไข่ตก!', 300, 110);
  x.fillStyle = '#1e3fb8';
  roundRect(x, 190, 135, 220, 44, 10);
  x.fill();
  x.fillStyle = '#fff';
  x.font = '800 italic 26px Kanit, sans-serif';
  x.fillText('CATCH & WIN', 300, 166);
  x.fillStyle = '#fff8e6';
  roundRect(x, 200, 195, 200, 70, 18);
  x.fill();
  x.fillStyle = '#8a2a00';
  x.font = '800 40px Kanit, sans-serif';
  x.fillText(`${S.score} คะแนน`, 300, 245);
  return c;
}

$('#dlPoster').onclick = () => posterCanvas && downloadCanvas(posterCanvas, 'catch-and-win.png');
$('#dlVideo').onclick = () => videoBlob && downloadBlob(videoBlob, `catch-and-win.${videoBlob.type.includes('mp4') ? 'mp4' : 'webm'}`);
$('#again').onclick = () => { sfx('tap'); showScreen('s-start'); };

