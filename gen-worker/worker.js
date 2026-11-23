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
  xmastown: { ratio: '4:3', prompt: 'Stylized 3D animated-movie character in a cozy red winter outfit and Santa hat, standing in a snowy Christmas town square at night, with MANY small detailed objects around: wrapped gifts, toy soldiers, candy canes, snowmen, ornaments, lanterns, reindeer, gingerbread cookies, a decorated tree. Wide landscape composition, character on the right half.' },
  pirate: { ratio: '4:3', prompt: 'Stylized 3D animated-movie friendly pirate captain with a tricorn hat and red coat, standing on a sunny tropical treasure island beach, with MANY small detailed objects around: treasure chests, gold coins, a parrot, palm trees, barrels, a pirate ship, seashells, a map, crabs, a telescope. Wide landscape composition, character on the right half.' },
  candy: { ratio: '4:3', prompt: 'Stylized 3D animated-movie character in a colorful candy-themed outfit, standing in a magical candy land, with MANY small detailed objects around: lollipops, cupcakes, donuts, gummy bears, ice-cream cones, macarons, candy houses, chocolate rivers, sprinkles. Wide landscape composition, character on the right half.' },
  // Catch & Win: full-body character, cut out in the browser (white background -> transparent)
  catch_farm: { ratio: '3:4', catch: 'a wide woven straw basket', outfit: 'farmer outfit: straw hat, denim overalls, checked shirt and boots' },
  catch_xmas: { ratio: '3:4', catch: 'a big open red Santa sack', outfit: 'cozy red Christmas outfit with a Santa hat and a striped scarf' },
  catch_space: { ratio: '3:4', catch: 'a wide glowing open space basket', outfit: 'cute white astronaut suit, no helmet so the face is visible' },
  catch_sea: { ratio: '3:4', catch: 'a big open seashell-shaped basket', outfit: 'colorful beach outfit with a snorkel mask pushed up on the forehead' },
  chibi: { ratio: '1:1', prompt: 'Cute chibi 2D cartoon sticker of the person: big head, head and shoulders only, big sparkling eyes, happy open smile, wearing an orange hoodie, thick clean outlines, flat cel shading, plain light cream background, centered face.' },
  fortune: { ratio: '4:3', prompt: 'Funny romantic vacation selfie on a sunny Greek-island seaside with white houses and blue sea. Next to the person is their mysterious future partner whose face is completely hidden behind a big pink heart-shaped balloon. Floating hearts, playful comedic mood, photo-realistic but slightly stylized.' },
};

// ---- เปิดดวงแบบขำๆ: the fortune text is written live by a text+vision model ----
// topic -> what to predict, what the 2nd line ("partner" field) means, and how to picture it
const FORTUNE_TOPICS = {
  love: { th: 'ดวงความรัก', sub: 'เนื้อคู่จะเป็นใคร/แบบไหน', scene: 'a funny romantic moment with a future partner whose face is completely hidden (behind a big heart balloon, a bouquet, or turned away)' },
  work: { th: 'ดวงการงาน/การเรียน', sub: 'ตำแหน่งหรืองานในฝันแบบฮาๆ', scene: 'a funny career-success moment (office, stage, studio, classroom or any fitting workplace)' },
  money: { th: 'ดวงการเงิน', sub: 'เงินก้อนโตจะมาจากไหน แบบฮาๆ', scene: 'a funny getting-rich moment (money, gold coins, treasure, shopping, piggy banks)' },
  luck: { th: 'ดวงโชคลาภ', sub: 'โชคจะมาในรูปแบบไหน แบบฮาๆ', scene: 'a funny super-lucky moment (four-leaf clovers, shooting stars, lucky cats, confetti, prizes)' },
};
const fortuneSystem = (t) => `คุณคือหมอดูสายฮาประจำบูธเกมในงานอีเวนต์ ทำนาย "${t.th}" ให้ผู้เล่นแบบขำๆ อบอุ่น เป็นกันเอง
กติกา:
- ใช้ภาษาไทยสนุกๆ แบบวัยรุ่น มี emoji ได้นิดหน่อย ทุกคนอ่านแล้วต้องยิ้ม ห้ามเศร้าหรือน่ากลัว
- ดูรูปแล้วหยิบรายละเอียดเชิงบวกที่เห็นชัดมาเล่นได้ 1 อย่าง เช่น รอยยิ้ม สีเสื้อ แว่นตา ทรงผม ท่าทาง
- ห้ามล้อเลียนหรือพูดถึง รูปร่าง น้ำหนัก ผิว อายุ เชื้อชาติ ศาสนา สุขภาพ หรือเรื่องอ่อนไหว ห้ามเดาเพศหรือรสนิยม ใช้คำกลางๆ เช่น "เขา" "คนนั้น"
- ใช้ราศีที่ให้มาเป็นส่วนหนึ่งของมุกได้
- ทุกครั้งให้แต่งใหม่ไม่ซ้ำเดิม
ตอบเป็น JSON อย่างเดียว ไม่มีข้อความอื่น ตามรูปแบบนี้:
{"head":"หัวข้อสั้นๆ ลงท้ายด้วย ! ไม่เกิน 30 ตัวอักษร","partner":"${t.sub} พร้อม emoji 1 ตัว ไม่เกิน 35 ตัวอักษร","detail":"คำทำนายตลกๆ 1-2 ประโยค ไม่เกิน 130 ตัวอักษร","love":ตัวเลข 60-99,"lucky":"สิ่งนำโชค พร้อม emoji ไม่เกิน 22 ตัวอักษร","scene":"ENGLISH, one or two sentences: describe one funny, bright picture of the player (call them 'the person') that shows exactly this fortune: ${t.scene}. Concrete setting, props and action. Family-friendly, no text or logos in the picture."}`;

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
    // OpenRouter image call with the player's photo as reference -> {mime, b64} or {error}
    async function makeImage(prompt, photo, ratio) {
      const reqBase = {
        model: env.MODEL,
        prompt,
        input_references: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + photo } }],
        n: 1,
      };
      // Some models reject quality/format/ratio options, so retry with fewer.
      const tries = [{ aspect_ratio: ratio, quality: env.QUALITY || 'medium', output_format: 'jpeg' }, { aspect_ratio: ratio }, {}];
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
      if (!r.ok) return { error: 'openrouter_error', status: r.status, detail };
      const out = await r.json();
      const img = out?.data?.[0];
      if (!img?.b64_json) return { error: 'no_image', reason: out?.error?.message || 'unknown' };
      return { mime: img.media_type || 'image/png', b64: img.b64_json };
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

    // ---- live fortune: photo + birthday + topic -> text {head, partner, detail, love, lucky}
    //      + a picture drawn from the scene the text model wrote (so picture and fortune match) ----
    if (url.pathname === '/fortune') {
      if (!env.OPENROUTER_API_KEY) return json({ error: 'not_configured' }, 503);
      let b;
      try { b = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
      const photo = typeof b?.photo === 'string' ? b.photo.replace(/^data:image\/\w+;base64,/, '') : '';
      const day = b?.day | 0, month = b?.month | 0;
      if (!photo || day < 1 || day > 31 || month < 1 || month > 12) return json({ error: 'bad_request' }, 400);
      if (photo.length > 1_500_000) return json({ error: 'photo_too_large' }, 413);
      if (!(await underCap('fortune', +(env.FORTUNE_LIMIT || 300)))) return json({ error: 'daily_limit' }, 429);
      const topicKey = FORTUNE_TOPICS[b?.topic] ? b.topic : 'love';
      const topic = FORTUNE_TOPICS[topicKey];
      const zodiac = String(b?.zodiac || '').slice(0, 20);
      const year = b?.yearBE | 0;
      const userText = `ผู้เล่นเกิดวันที่ ${day} เดือน ${month}${year ? ` ปี พ.ศ. ${year}` : ''} ราศี${zodiac} ช่วยทำนาย${topic.th}แบบขำๆ จากรูปนี้หน่อย`;
      const base = {
        model: env.TEXT_MODEL || 'anthropic/claude-opus-5.5',
        max_tokens: 4000,
        messages: [
          { role: 'system', content: fortuneSystem(topic) },
          { role: 'user', content: [
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + photo } },
            { type: 'text', text: userText },
          ] },
        ],
      };
      let r, detail = '';
      for (const extra of [{ reasoning: { effort: 'low' } }, {}]) { // fall back if the provider rejects the option
        r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + env.OPENROUTER_API_KEY,
            'HTTP-Referer': 'https://ohm-hash.github.io/poc-4game/',
            'X-Title': 'POC 4 Game',
          },
          body: JSON.stringify({ ...base, ...extra }),
        });
        if (r.ok) break;
        detail = (await r.text()).slice(0, 300);
        if (r.status !== 400 && r.status !== 422) break;
      }
      if (!r.ok) return json({ error: 'openrouter_error', status: r.status, detail }, 502);
      const out = await r.json();
      const text = out?.choices?.[0]?.message?.content || '';
      const m = String(text).match(/\{[\s\S]*\}/);
      let f;
      try { f = JSON.parse(m ? m[0] : ''); } catch { return json({ error: 'bad_model_output', text: String(text).slice(0, 200) }, 502); }
      const s = (v, n) => String(v ?? '').trim().slice(0, n);
      const fortune = { head: s(f.head, 60), partner: s(f.partner, 70), detail: s(f.detail, 220), love: Math.max(60, Math.min(99, f.love | 0 || 88)), lucky: s(f.lucky, 40) };
      if (!fortune.head || !fortune.detail) return json({ error: 'bad_model_output' }, 502);
      fortune.topic = topicKey;
      // the picture: same reference photo, scene written by the text model
      const scene = s(f.scene, 500) || topic.scene;
      if (await underCap('gen', +(env.DAILY_LIMIT || 150))) {
        const img = await makeImage(
          BASE + `Funny, bright stylized 3D animated-movie illustration of the person. Scene: ${scene}` +
            (topicKey === 'love' ? ' Any romantic partner must have their face completely hidden.' : ''),
          photo, '4:3');
        if (!img.error) {
          const id = await save(Uint8Array.from(atob(img.b64), (c) => c.charCodeAt(0)), img.mime, { kind: 'fortune', topic: topicKey });
          Object.assign(fortune, { mime: img.mime, image: img.b64, url: fileUrl(id) });
        } else fortune.imageError = img.error;
      } else fortune.imageError = 'daily_limit';
      return json(fortune);
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
    const prompt = s.catch
      ? 'Full-body cute chibi 3D cartoon character of the person in the photo (big head, small body), keep their face, skin tone and hairstyle recognizable. ' +
        `Wearing a ${s.outfit}. Standing and facing the camera, the whole body visible from head to shoes, ` +
        `holding ${s.catch} in front of their chest with both hands, its open top facing up, ready to catch falling things. ` +
        'Natural body proportions with normal-length arms, happy excited expression. ' +
        'Isolated on a plain pure white background: no ground, no shadow, no scenery, no other objects, no border, no text, no logos, no flags or patches.'
      : BASE + s.prompt + pose;
    const img = await makeImage(prompt, photo, s.ratio);
    if (img.error) return json(img, 502);
    const id = await save(Uint8Array.from(atob(img.b64), (c) => c.charCodeAt(0)), img.mime, { kind: 'gen', style });
    return json({ id, mime: img.mime, image: img.b64, url: fileUrl(id) });
  },
};
