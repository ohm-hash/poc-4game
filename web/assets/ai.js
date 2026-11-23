// AI image generation.
// aiGenerate() calls the Cloudflare Worker (gen-worker/) which calls OpenRouter.
// If the worker is not set or fails, the games fall back to the Canvas mock below
// (stylize / cartoonHead), so a kiosk never gets stuck.

import { makeCanvas, drawCover, seeded, wrapText, loadImage } from './common.js';
import { GEN_API } from './config.js';

export const AI_ON = !!GEN_API;

function photoB64(photo) {
  const s = Math.min(1, 1024 / Math.max(photo.width, photo.height));
  const [c, x] = makeCanvas(Math.round(photo.width * s), Math.round(photo.height * s));
  x.drawImage(photo, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}

/** -> { canvas, url } (url = 24 h share link of the AI image) or null on any failure */
export async function aiGenerate(photo, style, { variant = 0, timeout = 90000 } = {}) {
  if (!GEN_API) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(`${GEN_API}/gen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctl.signal,
      body: JSON.stringify({ style, variant, photo: photoB64(photo) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.image) {
      console.warn('AI generate failed', r.status, j);
      return null;
    }
    const img = await loadImage(`data:${j.mime};base64,${j.image}`);
    const [c, x] = makeCanvas(img.width, img.height);
    x.drawImage(img, 0, 0);
    return { canvas: c, url: j.url };
  } catch (e) {
    console.warn('AI generate error', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

export const THEMES = {
  halloween: { label: 'HALLOWEEN', c1: '#2a0a3d', c2: '#ff7a00', deco: ['🎃', '🦇', '👻', '🕸️', '🌕', '🕷️', '💀', '🧙'], filter: 'contrast(1.1) saturate(1.15)' },
  santa: { label: 'SANTA', c1: '#5c0010', c2: '#ff3b3b', deco: ['🎅', '🎄', '❄️', '🎁', '⭐', '🔔', '⛄', '🦌'], filter: 'saturate(1.2) brightness(1.05)' },
  hero: { label: 'SUPER HERO', c1: '#0a1f7a', c2: '#ff3d00', deco: ['🦸', '⚡', '💥', '🛡️', '🔥', '💪', '🌟', '🚀'], filter: 'contrast(1.25) saturate(1.35)' },
  space: { label: 'SPACE', c1: '#03032a', c2: '#4b23a8', deco: ['👨‍🚀', '🚀', '🪐', '⭐', '🌙', '👽', '☄️', '🛸'], filter: 'saturate(1.1) brightness(1.05)' },
  vampire: { label: 'VAMPIRE', c1: '#070b24', c2: '#3a4a8a', deco: ['🦇', '🌕', '🏰', '🕯️', '🎃', '🕸️', '🥀', '🧛'], filter: 'contrast(1.2) saturate(0.85) brightness(0.95)' },
};

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function emoji(ctx, e, x, y, size, rot = 0, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.font = `${size}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e, 0, 0);
  ctx.restore();
}

export function posterize(ctx, w, h, levels = 8) {
  const d = ctx.getImageData(0, 0, w, h), a = d.data, step = 255 / (levels - 1);
  for (let i = 0; i < a.length; i += 4) {
    a[i] = Math.round(a[i] / step) * step;
    a[i + 1] = Math.round(a[i + 1] / step) * step;
    a[i + 2] = Math.round(a[i + 2] / step) * step;
  }
  ctx.putImageData(d, 0, 0);
}

/**
 * Themed portrait from the player's photo.
 * variant 0..7 gives a visibly different image (badge, colours, frame) — used for memory pairs.
 */
export function stylize(photo, key, { w = 512, h = 512, variant = 0, seed = 1, frame = '#ffd84a', raw = false } = {}) {
  const t = THEMES[key] || THEMES.halloween;
  const r = seeded(seed * 7919 + variant * 104729 + w);
  const [c, ctx] = makeCanvas(w, h);
  const s = Math.min(w, h);

  // raw = photo is already an AI image: only add the variant badge + frame
  if (raw) {
    const zoom = 1 + (variant % 3) * 0.07;
    drawCover(ctx, photo, -(w * (zoom - 1)) / 2, -(h * (zoom - 1)) / 2, w * zoom, h * zoom, 0.45);
    return badgeAndFrame(ctx, t, variant, w, h, s, frame, c);
  }

  // 1) photo, slightly zoomed and colour-shifted per variant
  const zoom = 1 + (variant % 3) * 0.07;
  ctx.filter = `${t.filter} hue-rotate(${((variant * 37) % 50) - 25}deg)`;
  drawCover(ctx, photo, -(w * (zoom - 1)) / 2, -(h * (zoom - 1)) / 2, w * zoom, h * zoom, 0.42);
  ctx.filter = 'none';
  posterize(ctx, w, h, 9);

  // 2) theme colour grade
  ctx.globalCompositeOperation = 'soft-light';
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, t.c2);
  g.addColorStop(1, t.c1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';

  // 3) vignette into the theme colour
  const v = ctx.createRadialGradient(w / 2, h * 0.42, s * 0.28, w / 2, h / 2, Math.hypot(w, h) * 0.55);
  v.addColorStop(0, hexA(t.c1, 0));
  v.addColorStop(1, hexA(t.c1, 0.92));
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);

  // 4) decorations along the edges (away from the face)
  for (let i = 0; i < 7; i++) {
    const e = t.deco[(variant + i * 3) % t.deco.length];
    const size = s * (0.07 + r() * 0.06);
    const edge = (r() * 4) | 0, m = size * 0.7, along = r();
    const x = edge === 0 || edge === 2 ? m + along * (w - 2 * m) : edge === 1 ? w - m : m;
    const y = edge === 1 || edge === 3 ? m + along * (h - 2 * m) : edge === 0 ? m : h - m;
    emoji(ctx, e, x, y, size, (r() - 0.5) * 0.7, 0.9);
  }
  return badgeAndFrame(ctx, t, variant, w, h, s, frame, c);
}

function badgeAndFrame(ctx, t, variant, w, h, s, frame, c) {
  // 5) big variant badge — makes each memory pair easy to tell apart
  const bs = s * 0.26;
  ctx.save();
  ctx.shadowColor = '#000a';
  ctx.shadowBlur = s * 0.04;
  emoji(ctx, t.deco[variant % t.deco.length], w - bs * 0.6, h - bs * 0.6, bs, -0.15);
  ctx.restore();

  // 6) frame
  const lw = s * 0.03;
  ctx.lineWidth = lw;
  ctx.strokeStyle = frame;
  ctx.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
  return c;
}

/** Chibi head for the catch game: circular, punchy colours, outline. */
export function cartoonHead(photo, size = 320, { raw = false } = {}) {
  const [c, ctx] = makeCanvas(size, size);
  const iw = photo.width, ih = photo.height, side = Math.min(iw, ih) * (raw ? 0.82 : 0.72);
  const focus = raw ? 0.45 : 0.42;
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#ffe0b8';
  ctx.fillRect(0, 0, size, size);
  if (!raw) ctx.filter = 'saturate(1.5) contrast(1.15) brightness(1.08)';
  ctx.drawImage(photo, (iw - side) / 2, Math.max(0, Math.min(ih - side, ih * focus - side / 2)), side, side, 0, 0, size, size);
  ctx.filter = 'none';
  ctx.restore();
  if (!raw) posterize(ctx, size, size, 6);
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#5a2a00';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
  ctx.stroke();
  return c;
}

/** Printable souvenir card: title, framed image, text lines, date. */
export function souvenir({ image, title, lines = [], c1 = '#ffa31a', c2 = '#b33c00', imgH = 520 }) {
  const W = 600, H = 900;
  const [c, x] = makeCanvas(W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#ffffff22';
  for (let i = 0; i < 40; i++) {
    x.beginPath();
    x.arc((i * 137) % W, (i * 251) % H, 3, 0, 7);
    x.fill();
  }
  x.textAlign = 'center';
  x.fillStyle = '#fff';
  x.font = '800 54px Kanit, sans-serif';
  x.lineWidth = 10;
  x.strokeStyle = '#7a2500';
  x.strokeText(title, W / 2, 80);
  x.fillText(title, W / 2, 80);

  const iy = 120;
  x.fillStyle = '#fff';
  x.fillRect(32, iy - 8, W - 64, imgH + 16);
  drawCover(x, image, 40, iy, W - 80, imgH, 0.5);

  let y = iy + imgH + 60;
  x.fillStyle = '#fff';
  for (const [i, line] of lines.entries()) {
    x.font = i === 0 ? '800 36px Kanit, sans-serif' : '400 26px Kanit, sans-serif';
    y = wrapText(x, line, W / 2, y, W - 80, i === 0 ? 44 : 34);
  }
  x.font = '400 20px Kanit, sans-serif';
  x.fillStyle = '#ffffffcc';
  x.fillText(new Date().toLocaleDateString('th-TH', { dateStyle: 'long' }), W / 2, H - 28);
  return c;
}
