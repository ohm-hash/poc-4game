/* POC 4 Game · AI photo generator + file share (Cloudflare Worker)
 *
 * Holds the OpenRouter API key so the public game pages never see it.
 *   POST /gen     {style, variant, photo}  photo = base64 JPEG (data: prefix optional)
 *                 -> {id, mime, image, url}  image = base64 of the generated picture
 *   POST /upload  raw body (image/png|jpeg, video/webm|mp4), max 20 MB
 *                 -> {id, url}   used for the "scan QR to download" screens
 *   GET  /f/:id   -> the stored file (kept 24 h)
 *
 * Secrets / bindings (see README.md):
 *   OPENROUTER_API_KEY secret
 *   GEN                KV namespace (files + daily counters)
 *   DAILY_LIMIT        var, max AI generations per day (default 150)
 *   UPLOAD_LIMIT       var, max uploads per day (default 400)
 *   ALLOWED_ORIGINS    var, comma list of page origins allowed to POST
 *   MODEL              var, OpenRouter image model id
 */

const BASE =
  'Keep the face, skin tone, hairstyle, glasses and overall likeness of the person in the photo clearly recognizable. ' +
  'Bright, high-quality illustration, vivid colors, soft lighting. No text, no letters, no logos, no national flags, no watermark. Family-friendly. ';

// Memory Match asks for several variants of one theme — each gets a different pose/scene so pairs look distinct.
const POSES = [
  'smiling and waving at the camera',
  'laughing and holding a themed prop',
  'close-up portrait with a playful wink',
  'jumping with excitement, dynamic pose',
  'giving a thumbs up',
  'peeking from the side, curious expression',
  'arms crossed, confident hero pose',
  'surprised expression, hands on cheeks',
];

const STYLES = {
  halloween: { ratio: '1:1', prompt: 'Stylized 3D animated-movie character in a cute Halloween costume (witch hat or cape), glowing jack-o-lanterns, friendly bats, purple-orange night sky with a full moon.' },
  santa: { ratio: '1:1', prompt: 'Stylized 3D animated-movie character wearing a red Santa hat and cozy Christmas outfit, snowy village, decorated Christmas tree, gifts and warm lights.' },
  hero: { ratio: '1:1', prompt: 'Stylized 3D animated-movie superhero with a colorful suit, flowing cape and a mask on the forehead (face visible), comic-book city skyline, energy sparks.' },
  space: { ratio: '1:1', prompt: 'Stylized 3D animated-movie astronaut in a cute white space suit with the helmet visor open (face visible), floating among colorful planets, stars and a small rocket.' },
  vampire: { ratio: '4:3', prompt: 'Stylized 3D animated-movie friendly vampire with a black and red high-collar cape, standing in front of a spooky castle under a big full moon, with MANY small detailed objects around: pumpkins, candles, bats, gravestones, lanterns, cobwebs, potion bottles, a black cat. Wide landscape composition, character on the right half.' },
  chibi: { ratio: '1:1', prompt: 'Cute chibi 2D cartoon sticker of the person: big head, head and shoulders only, big sparkling eyes, happy open smile, wearing an orange hoodie, thick clean outlines, flat cel shading, plain light cream background, centered face.' },
  fortune: { ratio: '4:3', prompt: 'Funny romantic vacation selfie on a sunny Greek-island seaside with white houses and blue sea. Next to the person is their mysterious future partner whose face is completely hidden behind a big pink heart-shaped balloon. Floating hearts, playful comedic mood, photo-realistic but slightly stylized.' },
};

const MAX_UPLOAD = 20 * 1024 * 1024;
const UPLOAD_TYPES = ['image/png', 'image/jpeg', 'video/webm', 'video/mp4'];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': okOrigin ? origin : allowed[0] || '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    const fileUrl = (id) => `${url.origin}/f/${id}`;

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // ---- serve a stored file to anyone (the QR is scanned on a phone) ----
    const m = url.pathname.match(/^\/f\/([a-z0-9]{12,40})$/);
    if (req.method === 'GET' && m) {
      const { value, metadata } = await env.GEN.getWithMetadata('f:' + m[1], { type: 'arrayBuffer' });
      if (!value) return new Response('ลิงก์หมดอายุแล้ว (เก็บไว้ 24 ชั่วโมง)', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      return new Response(value, {
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': metadata?.mime || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' },
      });
    }

    if (req.method === 'GET' && url.pathname === '/') {
      return json({ ok: true, service: 'poc-4game-gen', ai: !!env.OPENROUTER_API_KEY, model: env.MODEL });
    }
    if (req.method !== 'POST') return json({ error: 'not_found' }, 404);
    if (!okOrigin) return json({ error: 'origin_not_allowed' }, 403);

    const day = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10); // Thai date
    async function underCap(kind, limit) {
      const key = `count:${kind}:${day}`;
      const used = +(await env.GEN.get(key)) || 0;
      if (used >= limit) return false;
      await env.GEN.put(key, String(used + 1), { expirationTtl: 3 * 86400 });
      return true;
    }
    async function save(bytes, mime, meta = {}) {
      const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
      await env.GEN.put('f:' + id, bytes, { expirationTtl: 86400, metadata: { mime, ...meta } });
      return id;
    }

    // ---- upload a finished souvenir / video for the QR ----
    if (url.pathname === '/upload') {
      const mime = (req.headers.get('Content-Type') || '').split(';')[0].trim();
      if (!UPLOAD_TYPES.includes(mime)) return json({ error: 'bad_type' }, 415);
      if (+(req.headers.get('Content-Length') || 0) > MAX_UPLOAD) return json({ error: 'too_large' }, 413);
      const buf = await req.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > MAX_UPLOAD) return json({ error: 'too_large' }, 413);
      if (!(await underCap('upload', +(env.UPLOAD_LIMIT || 400)))) return json({ error: 'daily_limit' }, 429);
      const id = await save(buf, mime, { kind: 'upload' });
      return json({ id, url: fileUrl(id) });
    }

    if (url.pathname !== '/gen') return json({ error: 'not_found' }, 404);
    if (!env.OPENROUTER_API_KEY) return json({ error: 'not_configured' }, 503);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
    const style = STYLES[body?.style] ? body.style : null;
    const variant = Math.max(0, Math.min(POSES.length - 1, body?.variant | 0));
    const photo = typeof body?.photo === 'string' ? body.photo.replace(/^data:image\/\w+;base64,/, '') : '';
    if (!style || !photo) return json({ error: 'bad_request' }, 400);
    if (photo.length > 1_500_000) return json({ error: 'photo_too_large' }, 413);
    if (!(await underCap('gen', +(env.DAILY_LIMIT || 150)))) return json({ error: 'daily_limit' }, 429);

    const s = STYLES[style];
    const pose = ['halloween', 'santa', 'hero', 'space'].includes(style) ? ` The character is ${POSES[variant]}.` : '';
    const reqBase = {
      model: env.MODEL,
      prompt: BASE + s.prompt + pose,
      input_references: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + photo } }],
      n: 1,
    };
    // Some models reject quality/format/ratio options, so retry with fewer.
    const tries = [{ aspect_ratio: s.ratio, quality: env.QUALITY || 'medium', output_format: 'jpeg' }, { aspect_ratio: s.ratio }, {}];
    let r, detail = '';
    for (const extra of tries) {
      r = await fetch('https://openrouter.ai/api/v1/images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + env.OPENROUTER_API_KEY,
          'HTTP-Referer': 'https://ohm-hash.github.io/poc-4game/',
          'X-Title': 'POC 4 Game',
        },
        body: JSON.stringify({ ...reqBase, ...extra }),
      });
      if (r.ok) break;
      detail = (await r.text()).slice(0, 300);
      if (r.status !== 400 && r.status !== 422) break; // auth/credit/rate errors: retrying won't help
    }
    if (!r.ok) return json({ error: 'openrouter_error', status: r.status, detail }, 502);
    const out = await r.json();
    const img = out?.data?.[0];
    if (!img?.b64_json) return json({ error: 'no_image', reason: out?.error?.message || 'unknown' }, 502);
    const mime = img.media_type || 'image/png';
    const id = await save(Uint8Array.from(atob(img.b64_json), (c) => c.charCodeAt(0)), mime, { kind: 'gen', style });
    return json({ id, mime, image: img.b64_json, url: fileUrl(id) });
  },
};
