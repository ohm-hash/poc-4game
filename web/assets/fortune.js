import { $, $$, showScreen, sleep, pick, rand, sfx, photoCapture, makeCanvas, drawCover, roundRect, shareQR, downloadCanvas, confetti, wrapText, toast } from './common.js';
import { emoji, aiGenerate, AI_ON } from './ai.js';

export const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const SHORT = ['มกรา', 'กุมภา', 'มีนา', 'เมษา', 'พฤษภา', 'มิถุนา', 'กรกฎา', 'สิงหา', 'กันยา', 'ตุลา', 'พฤศจิกา', 'ธันวา'];
const ABBR = ['ม.ค', 'ก.พ', 'มี.ค', 'เม.ย', 'พ.ค', 'มิ.ย', 'ก.ค', 'ส.ค', 'ก.ย', 'ต.ค', 'พ.ย', 'ธ.ค'];
const EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "15 มีนาคม 2540", "๑๕ มี.ค. ๔๐", "15/3/1997" → { day, month, yearBE } or null */
export function parseThaiDate(raw) {
  if (!raw) return null;
  const s = raw.replace(/[๐-๙]/g, (ch) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(ch)).toLowerCase();
  let day, month, year;
  const m = s.match(/(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2,4})/);
  if (m) {
    [day, month, year] = [+m[1], +m[2], +m[3]];
  } else {
    month = SHORT.findIndex((n) => s.includes(n)) + 1
      || ABBR.findIndex((n) => s.includes(n)) + 1
      || EN.findIndex((n) => s.includes(n)) + 1;
    const nums = (s.match(/\d+/g) || []).map(Number);
    day = nums.find((n) => n >= 1 && n <= 31);
    year = nums.find((n) => n >= 1900) ?? nums.filter((n) => n !== day).find((n) => n < 100);
  }
  if (!day || !month || day > 31 || month > 12) return null;
  let yearBE = null;
  if (year != null) yearBE = year < 100 ? 2500 + year : year < 2400 ? year + 543 : year;
  return { day, month, yearBE };
}
const fmtDate = (d) => `${d.day} ${MONTHS[d.month - 1]}${d.yearBE ? ` ${d.yearBE}` : ''}`;

// ---------------- flow ----------------
let lastAi = null, photo = null, birth = null, fortune = null, resultCanvas = null, listening = null;

$$('[data-back]').forEach((b) => { b.onclick = () => { stopListening(); showScreen(b.dataset.back); if (b.dataset.back === 's-photo') cam.start(); }; });
$('#begin').onclick = () => { sfx('tap'); showScreen('s-photo'); cam.start(); };
const cam = photoCapture($('#cap'), {
  round: true,
  hint: 'ทิปส์: ถ่ายให้เห็นหน้าชัดๆ ยิ้มหน่อย จะได้ดวงดีๆ น้า~ 😜',
  onPhoto: (c) => { photo = c; openVoice(); },
});

// ---------------- voice ----------------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

function openVoice() {
  birth = null;
  $('#heard').textContent = '—';
  $('#ok').disabled = true;
  $('#manual').hidden = true;
  $('#micHint').textContent = SR ? 'แตะไมค์แล้วพูดได้เลย' : 'เบราว์เซอร์นี้ไม่รองรับการฟังเสียง — เลือกวันเกิดเองด้านล่าง';
  if (!SR) showManual();
  showScreen('s-voice');
}

function setBirth(d) {
  birth = d;
  $('#heard').textContent = `${fmtDate(d)} ✅`;
  $('#ok').disabled = false;
  sfx('good');
}

function stopListening() {
  try { listening?.abort(); } catch { /* already stopped */ }
  listening = null;
  $('#mic').classList.remove('listening');
}

function listen() {
  if (!SR) { showManual(); return; }
  stopListening();
  const rec = new SR();
  listening = rec;
  rec.lang = 'th-TH';
  rec.interimResults = true;
  rec.maxAlternatives = 3;
  let finals = [];
  $('#mic').classList.add('listening');
  $('#micHint').textContent = 'กำลังฟัง... 👂';
  $('#heard').textContent = '...';
  rec.onresult = (e) => {
    let txt = '';
    for (const r of e.results) txt += r[0].transcript;
    $('#heard').textContent = txt;
    const last = e.results[e.results.length - 1];
    if (last.isFinal) finals = [...last].map((a) => a.transcript).concat(txt);
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      $('#micHint').textContent = 'ไม่ได้รับสิทธิ์ใช้ไมโครโฟน — เลือกวันเกิดเองได้เลย';
      showManual();
    } else if (e.error === 'network') {
      $('#micHint').textContent = 'ระบบฟังเสียงต้องใช้อินเทอร์เน็ต — เลือกวันเกิดเองได้เลย';
      showManual();
    }
  };
  rec.onend = () => {
    if (listening !== rec) return;
    $('#mic').classList.remove('listening');
    listening = null;
    const d = finals.map(parseThaiDate).find(Boolean);
    if (d) {
      setBirth(d);
      $('#micHint').textContent = 'ถ้าไม่ถูก กด "พูดใหม่" ได้นะ';
    } else if (finals.length) {
      $('#micHint').textContent = 'AI ฟังไม่ออก 😅 ลองพูดใหม่ช้าๆ เช่น "15 มีนาคม 2540"';
      sfx('bad');
    } else if (!$('#manual').hidden) {
      /* error already handled */
    } else {
      $('#micHint').textContent = 'ไม่ได้ยินเสียงเลย ลองแตะไมค์อีกครั้งนะ';
      $('#heard').textContent = '—';
    }
  };
  rec.start();
}
$('#mic').onclick = listen;
$('#again').onclick = listen;
$('#typeIt').onclick = showManual;

function showManual() {
  const m = $('#manual');
  if (!m.hidden) return;
  m.hidden = false;
  $('#mDay').innerHTML = Array.from({ length: 31 }, (_, i) => `<option>${i + 1}</option>`).join('');
  $('#mMonth').innerHTML = MONTHS.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('');
  const thisYear = new Date().getFullYear() + 543;
  $('#mYear').innerHTML = Array.from({ length: 90 }, (_, i) => thisYear - i).map((y) => `<option ${y === 2540 ? 'selected' : ''}>${y}</option>`).join('');
  const sync = () => setBirth({ day: +$('#mDay').value, month: +$('#mMonth').value, yearBE: +$('#mYear').value });
  ['#mDay', '#mMonth', '#mYear'].forEach((s) => { $(s).onchange = sync; });
  if (!birth) { $('#mDay').value = '15'; $('#mMonth').value = '3'; }
  sync();
}

$('#ok').onclick = () => { stopListening(); sfx('tap'); process(); };

// ---------------- fortune generation ----------------
const ZODIAC = [
  // [month, first day of the sign that starts in this month, that sign]
  [1, 20, 'กุมภ์'], [2, 19, 'มีน'], [3, 21, 'เมษ'], [4, 20, 'พฤษภ'], [5, 21, 'เมถุน'], [6, 21, 'กรกฎ'],
  [7, 23, 'สิงห์'], [8, 23, 'กันย์'], [9, 23, 'ตุลย์'], [10, 23, 'พิจิก'], [11, 22, 'ธนู'], [12, 22, 'มังกร'],
];
function zodiac(d, m) {
  const [, start, name] = ZODIAC[m - 1];
  return d >= start ? name : ZODIAC[(m + 10) % 12][2];
}
const HEADLINES = ['คุณกำลังจะมีแฟน!', 'เนื้อคู่กำลังเดินทางมาหาคุณ!', 'ปีนี้ดวงความรักพุ่งแรง!', 'มีคนแอบชอบคุณอยู่นะ!', 'คุณจะได้เจอรักแท้ (อีกแล้ว)!'];
const PARTNERS = ['ชาวต่างชาติ 😍', 'คนที่ยืนอยู่ข้างๆ คุณตอนนี้ 👀', 'เจ้าของร้านหมูกระทะ 🥓', 'ไรเดอร์ส่งของประจำ 🛵', 'คนที่ทักแชทผิดคน 💬', 'เพื่อนสมัยประถม 🎒', 'ทาสแมวเหมือนกัน 🐱', 'โปรแกรมเมอร์ที่ไม่เคยนอน 💻'];
const DETAILS = [
  'เขาจะเข้ามาแบบไม่ทันตั้งตัว มาพร้อมรอยยิ้มและไอศกรีม (หรือพิซซ่า) 🍦🍕',
  'ระวังจะตกหลุมรักตอนกำลังกินข้าวมันไก่ อย่าลืมเช็ดปากก่อนนะ 🍗',
  'เจอกันครั้งแรกจะเขินจนพูดไม่ออก แต่ครั้งที่สองจะพูดไม่หยุดเลย 😆',
  'ดวงบอกว่าให้ตอบแชทเร็วขึ้นอีกนิด เนื้อคู่รออ่านอยู่ 📱',
  'ความรักจะมาพร้อมโปรโมชั่น 1 แถม 1 คุ้มสุดๆ 🛍️',
  'จะได้เจอกันในวันที่ฝนตก และคุณดันลืมพกร่ม ☔',
];
const LUCKY = ['ชานมไข่มุก 🧋', 'สีส้มแสด 🧡', 'หมูปิ้ง 🍢', 'ถุงเท้าคู่โปรด 🧦', 'เลข 9 ✨', 'แมวส้ม 🐈'];

function makeFortune(b) {
  return {
    head: pick(HEADLINES),
    partner: pick(PARTNERS),
    detail: pick(DETAILS),
    zodiac: zodiac(b.day, b.month),
    love: Math.round(rand(72, 99)),
    lucky: pick(LUCKY),
  };
}

async function process(reuse = false) {
  showScreen('s-process');
  const items = $$('#check div');
  items.forEach((d) => d.classList.remove('on', 'ok'));
  fortune = makeFortune(birth);
  // resolves null when AI is off or fails; "ทำนายอีกครั้ง" reuses the same picture with a new fortune
  const aiJob = reuse ? Promise.resolve(lastAi) : aiGenerate(photo, 'fortune');
  const t0 = performance.now();
  let stop = false;
  (async () => { // progress: steady for the checklist, then creeps toward 99% while the AI finishes
    while (!stop) {
      const t = performance.now() - t0;
      const p = t < 3800 ? (t / 3800) * 0.8 : 0.8 + 0.19 * (1 - Math.exp(-(t - 3800) / 12000));
      $('#pBar').style.width = `${p * 100}%`;
      $('#pPct').textContent = `${Math.round(p * 100)}%`;
      await sleep(120);
    }
  })();
  for (const [i, d] of items.entries()) {
    d.classList.add('on');
    await sleep(950);
    if (i === items.length - 1) await aiJob; // last step ("making it funny") waits for the AI picture
    d.classList.add('ok');
    sfx('tap');
  }
  const ai = await aiJob;
  lastAi = ai;
  stop = true;
  $('#pBar').style.width = '100%';
  $('#pPct').textContent = '100%';
  if (!ai && AI_ON && !reuse) toast('AI ไม่ตอบ — ใช้ภาพจำลองแทน');
  await sleep(300);
  resultCanvas = drawResult(ai?.canvas);
  showResult();
}

// photo of the player + a mystery "future partner" silhouette on a holiday backdrop
function drawResult(aiImage) {
  const W = 640, H = 440;
  const [c, x] = makeCanvas(W, H);
  if (aiImage) {
    drawCover(x, aiImage, 0, 0, W, H, 0.5);
    for (const [hx, hy, s] of [[40, 40, 40], [600, 50, 34], [590, 400, 40]]) emoji(x, '💗', hx, hy, s, rand(-0.3, 0.3));
    return c;
  }
  const sky = x.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#7fd3ff');
  sky.addColorStop(0.6, '#e8f7ff');
  sky.addColorStop(0.6, '#f6dca4');
  sky.addColorStop(1, '#e9c07a');
  x.fillStyle = sky;
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#3aa0d8';
  x.fillRect(0, H * 0.55, W, H * 0.06);
  x.fillStyle = '#fff6b0';
  x.beginPath(); x.arc(540, 70, 40, 0, 7); x.fill();
  // player photo
  x.save();
  roundRect(x, 40, 40, 300, 360, 30);
  x.clip();
  x.filter = 'saturate(1.2) brightness(1.05)';
  drawCover(x, photo, 40, 40, 300, 360, 0.42);
  x.restore();
  x.lineWidth = 8;
  x.strokeStyle = '#fff';
  roundRect(x, 40, 40, 300, 360, 30);
  x.stroke();
  // mystery partner
  x.fillStyle = '#5a1a9add';
  x.beginPath(); x.arc(470, 190, 70, 0, 7); x.fill();
  x.beginPath(); x.ellipse(470, 400, 120, 140, 0, Math.PI, 0); x.fill();
  x.fillStyle = '#fff';
  x.font = '800 90px Kanit, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('?', 470, 195);
  x.font = '600 24px Kanit, sans-serif';
  x.fillStyle = '#5a1a9a';
  x.fillText('เนื้อคู่ของคุณ', 470, 92);
  for (const [hx, hy, s] of [[360, 70, 46], [600, 170, 38], [380, 330, 40], [585, 340, 30], [70, 380, 34]]) emoji(x, '💗', hx, hy, s, rand(-0.3, 0.3));
  return c;
}

function showResult() {
  $('#rHead').textContent = fortune.head;
  $('#rPartner').textContent = `และเป็น... ${fortune.partner}`;
  $('#rDetail').textContent = fortune.detail;
  $('#rZodiac').textContent = fortune.zodiac;
  $('#rLove').textContent = `${fortune.love}%`;
  $('#rLucky').textContent = fortune.lucky;
  const view = resultCanvas.cloneNode();
  view.getContext('2d').drawImage(resultCanvas, 0, 0);
  view.className = 'shot';
  $('#rImg').replaceChildren(view);
  shareQR($('#qr'), $('.poc-note'), souvenirCard(), 'fortune');
  showScreen('s-result');
  sfx('win');
  confetti($('.stage'));
}

function souvenirCard() {
  const W = 640, H = 1000;
  const [c, x] = makeCanvas(W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#ffa31a');
  g.addColorStop(1, '#b33c00');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.textAlign = 'center';
  x.fillStyle = '#fff';
  x.font = '600 28px Kanit, sans-serif';
  x.fillText('💗 ดวงความรักของคุณ วันนี้คือ... 💗', W / 2, 60);
  x.font = '800 46px Kanit, sans-serif';
  x.fillStyle = '#fff8e6';
  x.fillText(fortune.head, W / 2, 125);
  x.font = '800 34px Kanit, sans-serif';
  x.fillStyle = '#ffe36b';
  x.fillText(`และเป็น... ${fortune.partner}`, W / 2, 178);
  x.drawImage(resultCanvas, 0, 210, W, (W / resultCanvas.width) * resultCanvas.height);
  let y = 210 + (W / resultCanvas.width) * resultCanvas.height + 60;
  x.fillStyle = '#fff';
  x.font = '400 28px Kanit, sans-serif';
  y = wrapText(x, fortune.detail, W / 2, y, W - 80, 40);
  x.font = '600 26px Kanit, sans-serif';
  x.fillText(`ราศี${fortune.zodiac} • ความปัง ${fortune.love}% • นำโชค: ${fortune.lucky}`, W / 2, y + 20);
  x.font = '400 22px Kanit, sans-serif';
  x.fillStyle = '#ffffffcc';
  x.fillText(`วันเกิด ${fmtDate(birth)} • เปิดดวงแบบขำๆ กับ AI`, W / 2, H - 40);
  return c;
}

$('#dl').onclick = () => downloadCanvas(souvenirCard(), 'fortune.png');
// Same photo + birthday + AI picture, new fortune text. A new player starts from the Home button.
$('#restart').onclick = () => { sfx('tap'); process(true); };
