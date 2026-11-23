// Shared helpers for all 4 games: screens, camera, timers, QR, downloads, sound.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const fmtTime = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// deterministic PRNG (mulberry32)
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function showScreen(id) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

export function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

// Draw `img` to fill the box (like object-fit: cover). focusY = where the face usually is.
export function drawCover(ctx, img, x, y, w, h, focusY = 0.45) {
  const iw = img.videoWidth || img.width, ih = img.videoHeight || img.height;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s, sh = h / s;
  const sx = (iw - sw) / 2;
  const sy = Math.min(Math.max(0, ih * focusY - sh / 2), ih - sh);
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

export function animate(ms, cb) {
  return new Promise((res) => {
    const t0 = performance.now();
    const f = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      cb(p);
      p < 1 ? requestAnimationFrame(f) : res();
    };
    requestAnimationFrame(f);
  });
}

export class Countdown {
  constructor(sec, onTick, onEnd) {
    this.total = sec; this.left = sec; this.onTick = onTick; this.onEnd = onEnd;
  }
  start() {
    this.last = performance.now();
    this.onTick?.(this.left);
    this.id = setInterval(() => {
      const now = performance.now();
      this.left -= (now - this.last) / 1000;
      this.last = now;
      if (this.left <= 0) {
        this.left = 0; this.stop(); this.onTick?.(0); this.onEnd?.();
      } else this.onTick?.(this.left);
    }, 100);
  }
  stop() { clearInterval(this.id); }
  penalty(s) { this.left = Math.max(0.05, this.left - s); }
  get used() { return this.total - this.left; }
}

// ---------- sound (tiny WebAudio beeps, no asset files) ----------
let actx;
export function sfx(type = 'tap') {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const P = { tap: [620, 0.06, 'sine'], good: [880, 0.18, 'triangle'], bad: [170, 0.28, 'sawtooth'], win: [660, 0.6, 'triangle'], shutter: [1400, 0.05, 'square'], coin: [1250, 0.1, 'square'] };
    const [f, d, w] = P[type] || P.tap;
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.type = w;
    o.frequency.setValueAtTime(f, t);
    if (type === 'good' || type === 'win' || type === 'coin') o.frequency.exponentialRampToValueAtTime(f * 1.6, t + d);
    if (type === 'bad') o.frequency.exponentialRampToValueAtTime(f * 0.6, t + d);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g).connect(actx.destination);
    o.start(t); o.stop(t + d);
  } catch { /* audio not available */ }
}

export function confetti(container, n = 70) {
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#ffd84a', '#ff4d6d', '#4dd2ff', '#7dff7a', '#ffffff', '#b46bff'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = pick(colors);
    p.style.animationDuration = `${rand(1.6, 3.2)}s`;
    p.style.animationDelay = `${rand(0, 0.8)}s`;
    box.appendChild(p);
  }
  container.appendChild(box);
  setTimeout(() => box.remove(), 4500);
}

export function toast(text, container = $('.stage')) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  container.appendChild(t);
  setTimeout(() => t.remove(), 1700);
}

// ---------- QR / download ----------
// POC: there is no backend, so the QR is a placeholder link. In production the image/video
// is uploaded and the QR points to its real download URL.
export function pocLink(kind) {
  return `https://example.com/poc-4game/${kind}/${Math.random().toString(36).slice(2, 10)}`;
}
export function makeQR(el, text) {
  el.innerHTML = '';
  if (window.QRCode) {
    new window.QRCode(el, { text, width: 256, height: 256, correctLevel: window.QRCode.CorrectLevel.M });
  } else {
    el.style.color = '#000';
    el.textContent = 'QR';
  }
}
/**
 * Upload a souvenir (canvas or Blob) to the worker and show a QR that downloads it.
 * Falls back to a placeholder QR when there is no worker / the upload fails.
 */
export async function shareQR(qrEl, noteEl, source, kind) {
  const { GEN_API } = await import('./config.js');
  qrEl.innerHTML = '<div style="color:#8a2a00;font-size:.75em;display:grid;place-items:center;height:100%;text-align:center">กำลังสร้าง QR...</div>';
  let url = null;
  if (GEN_API) {
    try {
      const blob = source instanceof Blob ? source : await new Promise((r) => source.toBlob(r, 'image/jpeg', 0.9));
      const r = await fetch(`${GEN_API}/upload`, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
      const j = await r.json();
      if (r.ok) url = j.url;
      else console.warn('upload failed', r.status, j);
    } catch (e) {
      console.warn('upload error', e);
    }
  }
  makeQR(qrEl, url || pocLink(kind));
  if (noteEl) {
    noteEl.textContent = url
      ? 'สแกนแล้วกดค้างที่ไฟล์เพื่อบันทึก • ลิงก์ใช้ได้ 24 ชั่วโมง'
      : 'POC: QR เป็นลิงก์จำลอง (อัปโหลดไม่ได้) — ใช้ปุ่มดาวน์โหลดแทน';
  }
  return url;
}

/** Ease a progress bar toward 95% while `promise` runs, then fill it. Resolves with the promise's value. */
export async function progressWhile(promise, onP, expectedMs = 20000) {
  let done = false;
  promise.then(() => { done = true; }, () => { done = true; });
  const t0 = performance.now();
  while (!done) {
    onP(0.95 * (1 - Math.exp(-(performance.now() - t0) / expectedMs)));
    await sleep(120);
  }
  onP(1);
  return promise;
}

export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
export function downloadCanvas(canvas, name) {
  canvas.toBlob((b) => downloadBlob(b, name), 'image/png');
}

// ---------- camera widget ----------
export function photoCapture(container, { onPhoto, round = false, hint = '' } = {}) {
  container.classList.add('capture');
  container.innerHTML = `
    <div class="cam ${round ? 'round' : ''}">
      <video playsinline muted autoplay></video>
      <div class="cam-guide"></div>
      <div class="cam-msg" hidden></div>
      <div class="cam-count"></div>
      <div class="cam-flash"></div>
    </div>
    ${hint ? `<p class="hint">${hint}</p>` : ''}
    <div class="cam-actions">
      <label class="btn ghost sm">🖼️ อัปโหลด<input type="file" accept="image/*" hidden></label>
      <button class="shutter" type="button" aria-label="ถ่ายรูป"></button>
      <button class="btn ghost sm cam-sample" type="button">🧑 รูปตัวอย่าง</button>
    </div>`;
  const video = $('video', container), msg = $('.cam-msg', container);
  const count = $('.cam-count', container), flash = $('.cam-flash', container);
  let stream = null, busy = false;

  const showMsg = (h) => { msg.innerHTML = h; msg.hidden = false; };
  function stop() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  }
  async function start() {
    msg.hidden = true;
    busy = false;
    if (stream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      showMsg('เบราว์เซอร์นี้เปิดกล้องไม่ได้<br>กรุณาอัปโหลดรูป หรือใช้รูปตัวอย่าง');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      video.srcObject = stream;
      await video.play().catch(() => {});
    } catch {
      showMsg('เปิดกล้องไม่ได้<br>กรุณาอัปโหลดรูป หรือใช้รูปตัวอย่าง');
    }
  }
  function done(canvas) {
    stop();
    onPhoto?.(canvas);
  }

  $('.shutter', container).onclick = async () => {
    if (busy) return;
    if (!stream || !video.videoWidth) {
      showMsg('ยังไม่มีภาพจากกล้อง<br>กรุณาอัปโหลดรูป หรือใช้รูปตัวอย่าง');
      return;
    }
    busy = true;
    for (const n of [3, 2, 1]) {
      count.textContent = n;
      count.classList.remove('pop'); void count.offsetWidth; count.classList.add('pop');
      sfx('tap');
      await sleep(800);
    }
    count.textContent = '';
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    sfx('shutter');
    const [c, ctx] = makeCanvas(video.videoWidth, video.videoHeight);
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1); // selfie mirror, same as the preview
    ctx.drawImage(video, 0, 0);
    await sleep(250);
    done(c);
  };
  $('input[type=file]', container).onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const img = await loadImage(URL.createObjectURL(f));
    const s = Math.min(1, 1280 / Math.max(img.width, img.height));
    const [c, ctx] = makeCanvas(Math.round(img.width * s), Math.round(img.height * s));
    ctx.drawImage(img, 0, 0, c.width, c.height);
    e.target.value = '';
    done(c);
  };
  $('.cam-sample', container).onclick = () => done(sampleFace());
  return { start, stop };
}

// A drawn placeholder portrait so the games can be demoed without a camera.
export function sampleFace() {
  const [c, x] = makeCanvas(720, 960);
  const g = x.createLinearGradient(0, 0, 0, 960);
  g.addColorStop(0, '#f3e3cf'); g.addColorStop(1, '#d9bfa3');
  x.fillStyle = g; x.fillRect(0, 0, 720, 960);
  // shoulders / shirt
  x.fillStyle = '#7a4a2a';
  x.beginPath(); x.ellipse(360, 980, 330, 230, 0, Math.PI, 0); x.fill();
  x.fillStyle = '#f4efe6';
  x.beginPath(); x.moveTo(300, 760); x.lineTo(420, 760); x.lineTo(360, 860); x.fill();
  // neck
  x.fillStyle = '#e0a57c'; x.fillRect(318, 600, 84, 170);
  // ears
  x.beginPath(); x.ellipse(222, 450, 28, 44, 0, 0, 7); x.ellipse(498, 450, 28, 44, 0, 0, 7); x.fill();
  // face
  x.fillStyle = '#f0b98f';
  x.beginPath(); x.ellipse(360, 430, 140, 180, 0, 0, Math.PI * 2); x.fill();
  // hair
  x.fillStyle = '#3a2416';
  x.beginPath();
  x.moveTo(215, 420); x.quadraticCurveTo(200, 230, 360, 220); x.quadraticCurveTo(530, 220, 505, 420);
  x.quadraticCurveTo(490, 320, 420, 300); x.quadraticCurveTo(360, 350, 280, 310); x.quadraticCurveTo(230, 340, 215, 420);
  x.fill();
  // brows, eyes
  x.strokeStyle = '#3a2416'; x.lineWidth = 10; x.lineCap = 'round';
  x.beginPath(); x.moveTo(290, 375); x.quadraticCurveTo(315, 362, 340, 372); x.stroke();
  x.beginPath(); x.moveTo(380, 372); x.quadraticCurveTo(405, 362, 430, 375); x.stroke();
  x.fillStyle = '#2a1a10';
  x.beginPath(); x.ellipse(315, 415, 13, 16, 0, 0, 7); x.ellipse(405, 415, 13, 16, 0, 0, 7); x.fill();
  x.fillStyle = '#fff';
  x.beginPath(); x.arc(320, 410, 4, 0, 7); x.arc(410, 410, 4, 0, 7); x.fill();
  // nose, smile, cheeks
  x.strokeStyle = '#c98060'; x.lineWidth = 6;
  x.beginPath(); x.moveTo(360, 430); x.quadraticCurveTo(350, 470, 365, 478); x.stroke();
  x.fillStyle = '#a8423a';
  x.beginPath(); x.moveTo(305, 512); x.quadraticCurveTo(360, 575, 415, 512); x.quadraticCurveTo(360, 530, 305, 512); x.fill();
  x.fillStyle = '#ff8a8a55';
  x.beginPath(); x.ellipse(275, 480, 28, 16, 0, 0, 7); x.ellipse(445, 480, 28, 16, 0, 0, 7); x.fill();
  return c;
}

// Wrap Thai text (no spaces) using word segmentation when available.
export function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = 'Segmenter' in Intl
    ? [...new Intl.Segmenter('th', { granularity: 'word' }).segment(text)].map((s) => s.segment)
    : [...text];
  let line = '';
  for (const w of words) {
    const test = line + w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = w.trimStart();
      y += lineH;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineH;
}
