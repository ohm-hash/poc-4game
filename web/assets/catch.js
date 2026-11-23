import { $, $$, showScreen, sleep, rand, sfx, photoCapture, makeCanvas, roundRect, shareQR, downloadCanvas, downloadBlob, animate, confetti, drawCover, progressWhile, toast, loadImage } from './common.js';
import { cartoonHead, emoji, aiGenerate, AI_ON, cutout } from './ai.js';

const GW = 540, GH = 960, DURATION = 45, HEARTS = 3;

// Each theme changes the AI outfit (worker style catch_<key>), the background and the falling items.
// items[0] = common, items[1] = rare golden, items[2] = bonus. `draw` items are painted, others are emoji.
const THEMES = {
  farm: {
    label: 'FARM', hazard: '💣',
    items: [{ draw: 'egg', pts: 10, r: 26, w: 52 }, { draw: 'gold', pts: 50, r: 28, w: 8 }, { e: '🎁', pts: 30, r: 30, w: 18 }],
    icons: ['🥚', '🎁'],
  },
  xmas: {
    label: 'CHRISTMAS', hazard: '💣',
    items: [{ e: '🎁', pts: 10, r: 28, w: 52 }, { e: '⭐', pts: 50, r: 28, w: 8 }, { e: '🍪', pts: 30, r: 28, w: 18 }],
    icons: ['🎁', '🍪'],
  },
  space: {
    label: 'SPACE', hazard: '☄️',
    items: [{ e: '⭐', pts: 10, r: 26, w: 52 }, { e: '💎', pts: 50, r: 28, w: 8 }, { e: '🪐', pts: 30, r: 30, w: 18 }],
    icons: ['⭐', '🪐'],
  },
  sea: {
    label: 'UNDER THE SEA', hazard: '🪼',
    items: [{ e: '🐚', pts: 10, r: 26, w: 52 }, { e: '💎', pts: 50, r: 28, w: 8 }, { e: '🐠', pts: 30, r: 30, w: 18 }],
    icons: ['🐚', '🐠'],
  },
};
const HAZARD = { r: 30, w: 22 };

let theme = 'farm', photo, hero, bg, S, rec = null, chunks = [], videoBlob = null, videoURL = null, posterCanvas = null;
const cv = $('#game'), ctx = cv.getContext('2d');
const bgCache = {}, sampleCache = {};

// ---------------- assets ----------------
async function themeBg(key) {
  if (bgCache[key]) return bgCache[key];
  const [c, x] = makeCanvas(GW, GH);
  try {
    drawCover(x, await loadImage(`assets/themes/catch-bg-${key}.jpg`), 0, 0, GW, GH, 0.5);
  } catch {
    x.drawImage(drawnFarm(), 0, 0);
  }
  return (bgCache[key] = c);
}
async function sampleSprite(key) {
  if (!sampleCache[key]) sampleCache[key] = cutout(await loadImage(`assets/themes/catch-${key}.jpg`), 520);
  return sampleCache[key];
}

// The player: a full-body AI sprite (preferred) or the drawn fallback character with the AI/photo head.
function spriteHero(sprite) {
  const h = 340, w = (sprite.width * h) / sprite.height;
  return {
    ground: GH - 36, h,
    draw: (x, px, gy, bob) => x.drawImage(sprite, px - w / 2, gy - h + bob, w, h),
    zone: (gy) => [gy - h * 0.6, gy - h * 0.44], // the basket is held at chest height (~40-56% down the figure)
    halfW: Math.min(w * 0.42, 85),
    sprite,
  };
}
function drawnHero(head) {
  return {
    ground: GH - 70, h: 290,
    draw: (x, px, gy, bob) => drawCharacter(x, head, px, gy, bob),
    zone: (gy) => [gy - 132, gy - 108],
    halfW: 70,
  };
}

/** background + character, for the theme cards, the AI screen, the score screen and the poster */
function scene(w, h, bgCanvas, draw, charH) {
  const [c, x] = makeCanvas(w, h);
  drawCover(x, bgCanvas, 0, 0, w, h, 1);
  draw(x, w / 2, h - h * 0.04, charH);
  return c;
}
const drawSprite = (sprite) => (x, cx, gy, ch) => {
  const cw = (sprite.width * ch) / sprite.height;
  x.drawImage(sprite, cx - cw / 2, gy - ch, cw, ch);
};

// ---------------- flow ----------------
const cam = photoCapture($('#cap'), { hint: 'หน้าตรง ยิ้มกว้างๆ 😄', onPhoto: (c) => { photo = c; buildThemes(); showScreen('s-theme'); } });
const toCam = () => { sfx('tap'); showScreen('s-capture'); cam.start(); };
$('#toCam').onclick = toCam;
$('#startSample').onclick = toCam;

(async () => { // start screen: sample character on the farm
  const c = scene(360, 480, await themeBg('farm'), drawSprite(await sampleSprite('farm')), 400);
  $('#heroSample').replaceChildren(c);
})();

async function buildThemes() {
  const grid = $('#themeGrid');
  grid.innerHTML = '';
  for (const key of Object.keys(THEMES)) {
    const b = document.createElement('button');
    b.className = 'theme-card' + (key === theme ? ' sel' : '');
    b.innerHTML = `<span>${THEMES[key].label}</span>`;
    b.onclick = () => {
      theme = key;
      $$('.theme-card').forEach((x) => x.classList.toggle('sel', x === b));
      sfx('tap');
    };
    grid.appendChild(b);
    themeBg(key).then(async (bgc) => b.prepend(scene(300, 400, bgc, drawSprite(await sampleSprite(key)), 330)));
  }
}
$('#retake').onclick = () => { showScreen('s-capture'); cam.start(); };
$('#toGen').onclick = () => { sfx('tap'); generate(); };

async function generate() {
  showScreen('s-gen');
  $('#go').disabled = true;
  const thumb = makeCanvas(300, 300)[0];
  drawCover(thumb.getContext('2d'), photo, 0, 0, 300, 300, 0.42);
  thumb.style.width = '100%';
  $('#genPhoto').replaceChildren(thumb);
  bg = await themeBg(theme);
  const gc = $('#genChar'), gx = gc.getContext('2d');
  hero = drawnHero(cartoonHead(photo, 240));
  const preview = (p) => {
    $('#genBar').style.width = `${p * 100}%`;
    $('#genPct').textContent = `${Math.round(p * 100)}%`;
    gx.clearRect(0, 0, gc.width, gc.height);
    gx.globalAlpha = 0.35 + p * 0.3;
    drawCover(gx, bg, 0, 0, gc.width, gc.height, 1);
    gx.globalAlpha = 1;
  };
  let sprite = null;
  if (AI_ON) {
    const ai = await progressWhile(aiGenerate(photo, `catch_${theme}`), preview, 18000);
    if (ai) sprite = cutout(ai.canvas, 640);
    else toast('AI ไม่ตอบ — ใช้ตัวละครจำลองแทน');
  } else await animate(2600, preview);
  hero = sprite ? spriteHero(sprite) : hero;
  const art = heroScene(gc.width, gc.height);
  await animate(500, (p) => {
    gx.clearRect(0, 0, gc.width, gc.height);
    gx.globalAlpha = p;
    gx.drawImage(art, 0, 0);
    gx.globalAlpha = 1;
  });
  sfx('good');
  $('#go').disabled = false;
}

/** the current hero on the current background */
function heroScene(w, h) {
  if (hero.sprite) return scene(w, h, bg, drawSprite(hero.sprite), h * 0.86);
  return scene(w, h, bg, (x, cx, gy) => {
    x.save();
    x.translate(cx, gy);
    x.scale(1.25, 1.25);
    hero.draw(x, 0, 0, 0);
    x.restore();
  }, 0);
}

$('#go').onclick = () => { sfx('tap'); startGame(); };

// ---------------- drawing ----------------
function drawnFarm() { // fallback background if the image cannot load
  const [c, x] = makeCanvas(GW, GH);
  const sky = x.createLinearGradient(0, 0, 0, GH);
  sky.addColorStop(0, '#47b8ff');
  sky.addColorStop(0.6, '#bfe9ff');
  x.fillStyle = sky;
  x.fillRect(0, 0, GW, GH);
  x.fillStyle = '#4fae2f';
  x.fillRect(0, GH - 300, GW, 300);
  return c;
}

// fallback character (AI failed): drawn body + round head from the photo
function drawCharacter(x, head, px, gy, bob) {
  const y = gy + bob;
  x.save();
  x.lineJoin = 'round';
  x.fillStyle = '#2d4a8a';
  roundRect(x, px - 30, y - 72, 24, 62, 8); x.fill();
  roundRect(x, px + 6, y - 72, 24, 62, 8); x.fill();
  x.fillStyle = '#fff';
  x.beginPath(); x.ellipse(px - 20, y - 8, 20, 10, 0, 0, 7); x.ellipse(px + 20, y - 8, 20, 10, 0, 0, 7); x.fill();
  x.fillStyle = '#f5a623';
  x.strokeStyle = '#b86f00';
  x.lineWidth = 4;
  roundRect(x, px - 48, y - 160, 96, 96, 28); x.fill(); x.stroke();
  x.drawImage(head, px - 64, y - 290, 128, 128);
  const bt = y - 132;
  x.fillStyle = '#c98a3c';
  x.strokeStyle = '#7a4a14';
  x.beginPath();
  x.moveTo(px - 70, bt); x.lineTo(px + 70, bt); x.lineTo(px + 52, bt + 56); x.lineTo(px - 52, bt + 56); x.closePath();
  x.fill(); x.stroke();
  x.fillStyle = '#8a5418';
  x.beginPath(); x.ellipse(px, bt, 70, 13, 0, 0, 7); x.fill();
  x.fillStyle = '#f0b98f';
  x.beginPath(); x.arc(px - 70, bt + 10, 12, 0, 7); x.arc(px + 70, bt + 10, 12, 0, 7); x.fill();
  x.restore();
}

function drawItem(x, it) {
  x.save();
  x.translate(it.x, it.y);
  x.rotate(it.rot);
  if (it.def.draw) {
    const gold = it.def.draw === 'gold';
    const g = x.createRadialGradient(-8, -10, 4, 0, 0, it.r * 1.1);
    g.addColorStop(0, gold ? '#fff7b0' : '#ffffff');
    g.addColorStop(1, gold ? '#ffae00' : '#e9dcc0');
    x.fillStyle = g;
    x.strokeStyle = gold ? '#c77d00' : '#c8b48a';
    x.lineWidth = 3;
    x.beginPath(); x.ellipse(0, 0, it.r * 0.78, it.r, 0, 0, 7); x.fill(); x.stroke();
    if (gold) emoji(x, '✨', 16, -18, 20);
  } else {
    if (it.kind === 1) { // rare item: golden glow
      x.shadowColor = '#ffd84a';
      x.shadowBlur = 24;
    }
    emoji(x, it.def.e, 0, 0, it.r * 2);
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
  hero.draw(ctx, S.px, hero.ground, Math.sin(S.t * 12) * (Math.abs(S.vx) > 30 ? 4 : 1.5));
  for (const it of S.items) drawItem(ctx, it); // items in front, so they visibly drop into the basket
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
      ctx.fillText(`ลากนิ้วซ้าย-ขวา เพื่อรับของ • หลบ ${THEMES[theme].hazard}`, GW / 2, GH / 2 + 60);
    }
  }
}

// ---------------- game loop ----------------
function spawnItem() {
  const t = THEMES[theme];
  const pool = [...t.items.map((d, i) => ({ def: d, kind: i, w: d.w, r: d.r })), { def: { e: t.hazard }, kind: -1, w: HAZARD.w, r: HAZARD.r }];
  let roll = Math.random() * pool.reduce((s, p) => s + p.w, 0);
  const p = pool.find((q) => (roll -= q.w) < 0) || pool[0];
  S.items.push({ def: p.def, kind: p.kind, x: rand(50, GW - 50), y: -40, vy: 230 + S.t * 7 + rand(0, 90), r: p.r, rot: rand(-0.4, 0.4), vr: rand(-2, 2) });
}

function startGame() {
  S = { phase: 'count', countLeft: 3, t: 0, px: GW / 2, tx: GW / 2, vx: 0, items: [], floats: [], score: 0, combo: 0, maxCombo: 0, hearts: HEARTS, spawn: 0, shake: 0, nA: 0, nB: 0, last: performance.now(), lastCount: 4 };
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
    spawnItem();
    S.spawn = Math.max(0.32, 0.85 - S.t * 0.012);
  }
  const [zTop, zBottom] = hero.zone(hero.ground);
  for (const it of S.items) {
    it.y += it.vy * dt;
    it.rot += it.vr * dt;
    if (!it.done && it.y + it.r * 0.6 >= zTop && it.y - it.r < zBottom && Math.abs(it.x - S.px) < hero.halfW) {
      it.done = true;
      catchItem(it, zTop);
    } else if (!it.done && it.y > GH + 40) {
      it.done = true;
      if (it.kind >= 0) S.combo = 0; // missed a good item
    }
  }
  S.items = S.items.filter((it) => !it.done);
  if (S.t >= DURATION || S.hearts <= 0) endGame();
}

function catchItem(it, zTop) {
  if (it.kind < 0) {
    S.hearts--;
    S.combo = 0;
    S.shake = 1;
    S.floats.push({ text: '💥 -1 ❤️', x: it.x, y: zTop - 40, life: 1.2, color: '#ff4d4d' });
    sfx('bad');
    return;
  }
  S.combo++;
  S.maxCombo = Math.max(S.maxCombo, S.combo);
  const pts = it.def.pts * (1 + Math.floor(S.combo / 5));
  S.score += pts;
  if (it.kind === 2) S.nB++; else S.nA++;
  S.floats.push({ text: `+${pts}`, x: it.x, y: zTop - 30, life: 1, color: it.kind === 1 ? '#ffd84a' : '#fff' });
  sfx(it.kind === 1 ? 'coin' : 'good');
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
  if (S) S.tx = Math.max(60, Math.min(GW - 60, ((e.clientX - r.left) / r.width) * GW));
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
  const t = THEMES[theme];
  $('#lblA').textContent = t.icons[0];
  $('#lblB').textContent = t.icons[1];
  $('#stA').textContent = S.nA;
  $('#stB').textContent = S.nB;
  $('#stCombo').textContent = `x${S.maxCombo}`;
  $('#scoreChar').replaceChildren(heroScene(300, 380));
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
  const c = heroScene(600, 800);
  const x = c.getContext('2d');
  const t = THEMES[theme];
  for (let i = 0; i < 6; i++) emoji(x, [t.icons[0], t.icons[1], '✨'][i % 3], 50 + ((i * 97) % 500), 300 + ((i * 53) % 90), 40, rand(-0.4, 0.4));
  x.textAlign = 'center';
  x.lineJoin = 'round';
  x.font = '800 80px Kanit, sans-serif';
  x.lineWidth = 14;
  x.strokeStyle = '#1e3a9a';
  x.fillStyle = '#ffd84a';
  x.strokeText('รับของไข่ตก!', 300, 100);
  x.fillText('รับของไข่ตก!', 300, 100);
  x.fillStyle = '#1e3fb8';
  roundRect(x, 190, 125, 220, 44, 10);
  x.fill();
  x.fillStyle = '#fff';
  x.font = '800 italic 26px Kanit, sans-serif';
  x.fillText('CATCH & WIN', 300, 156);
  x.fillStyle = '#fff8e6';
  roundRect(x, 190, 182, 220, 64, 18);
  x.fill();
  x.fillStyle = '#8a2a00';
  x.font = '800 38px Kanit, sans-serif';
  x.fillText(`${S.score} คะแนน`, 300, 228);
  return c;
}

$('#dlPoster').onclick = () => posterCanvas && downloadCanvas(posterCanvas, 'catch-and-win.png');
$('#dlVideo').onclick = () => videoBlob && downloadBlob(videoBlob, `catch-and-win.${videoBlob.type.includes('mp4') ? 'mp4' : 'webm'}`);
// Same character and theme again. A new player starts from the Home button.
$('#again').onclick = () => { sfx('tap'); startGame(); };
