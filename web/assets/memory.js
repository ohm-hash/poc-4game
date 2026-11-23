import { $, $$, showScreen, sleep, shuffle, fmtTime, sfx, Countdown, photoCapture, makeQR, pocLink, downloadCanvas, animate, confetti } from './common.js';
import { THEMES, stylize, souvenir } from './ai.js';

const PAIRS = 8, TIME = 90;
const FRAMES = ['#ffd84a', '#ff4d6d', '#4dd2ff', '#7dff7a', '#ffffff', '#b46bff', '#ff9d00', '#00e0b0'];
let photo = null, theme = 'halloween', seed = 1, images = [], game = null, fav = 0;

const cam = photoCapture($('#cap'), {
  onPhoto: (c) => {
    photo = c;
    seed = Date.now() % 100000;
    buildThemes();
    showScreen('s-theme');
  },
});
cam.start();

function buildThemes() {
  const grid = $('#themeGrid');
  grid.innerHTML = '';
  for (const key of ['halloween', 'santa', 'hero', 'space']) {
    const b = document.createElement('button');
    b.className = 'theme-card' + (key === theme ? ' sel' : '');
    b.appendChild(stylize(photo, key, { w: 300, h: 360, seed }));
    const l = document.createElement('span');
    l.textContent = THEMES[key].label;
    b.appendChild(l);
    b.onclick = () => {
      theme = key;
      $$('.theme-card').forEach((x) => x.classList.toggle('sel', x === b));
      sfx('tap');
    };
    grid.appendChild(b);
  }
}

$('#retake').onclick = () => { showScreen('s-capture'); cam.start(); };
$('#toGen').onclick = generate;

async function generate() {
  sfx('tap');
  showScreen('s-gen');
  images = [];
  const grid = $('#genGrid');
  grid.innerHTML = '<div class="gen-slot"></div>'.repeat(PAIRS);
  $('#genCount').textContent = `0 / ${PAIRS}`;
  for (let i = 0; i < PAIRS; i++) {
    await animate(420, (p) => { $('#genBar').style.width = `${((i + p) / PAIRS) * 100}%`; });
    const c = stylize(photo, theme, { w: 360, h: 360, variant: i, seed, frame: FRAMES[i] });
    images.push({ canvas: c, url: c.toDataURL('image/jpeg', 0.85) });
    grid.children[i].innerHTML = `<img src="${images[i].url}" alt="">`;
    grid.children[i].classList.add('done');
    $('#genCount').textContent = `${i + 1} / ${PAIRS}`;
    sfx('tap');
  }
  await sleep(600);
  startGame();
}

function startGame() {
  showScreen('s-game');
  const deck = shuffle([...Array(PAIRS).keys(), ...Array(PAIRS).keys()]);
  const board = $('#board');
  board.innerHTML = '';
  game = { first: null, lock: false, pairs: 0, score: 0, combo: 0, over: false };
  const back = THEMES[theme].deco[0];
  for (const id of deck) {
    const el = document.createElement('button');
    el.className = 'mcard';
    el.dataset.id = id;
    el.innerHTML = `<div class="inner"><div class="face back">${back}</div><div class="face front"><img src="${images[id].url}" alt=""></div></div>`;
    el.onclick = () => flip(el);
    board.appendChild(el);
  }
  updateHud();
  game.timer = new Countdown(TIME, (t) => { $('#hTime').textContent = fmtTime(t); }, () => end(false));
  game.timer.start();
}

function flip(el) {
  if (game.over || game.lock || el.classList.contains('flipped')) return;
  el.classList.add('flipped');
  sfx('tap');
  if (!game.first) { game.first = el; return; }
  const a = game.first, b = el;
  game.first = null;
  if (a.dataset.id === b.dataset.id) {
    game.pairs++;
    game.combo++;
    game.score += 100 + (game.combo - 1) * 50; // combo bonus for consecutive matches
    setTimeout(() => { a.classList.add('matched'); b.classList.add('matched'); sfx('good'); }, 300);
    updateHud();
    if (game.pairs === PAIRS) {
      game.timer.stop();
      game.over = true;
      setTimeout(() => end(true), 900);
    }
  } else {
    game.combo = 0;
    game.lock = true;
    setTimeout(() => { a.classList.remove('flipped'); b.classList.remove('flipped'); game.lock = false; }, 850);
  }
}

function updateHud() {
  $('#hPairs').textContent = `${game.pairs} / ${PAIRS}`;
  $('#hScore').textContent = game.score;
}

function end(win) {
  if (game.ended) return;
  game.ended = game.over = true;
  game.timer.stop();
  if (win) game.score += Math.ceil(game.timer.left) * 10; // time bonus
  $('#rTitle').textContent = win ? '🏆 ยินดีด้วย!' : '⏰ หมดเวลา!';
  $('#rSub').textContent = win ? 'คุณจับคู่ครบทุกคู่แล้ว' : `จับได้ ${game.pairs} คู่ — เก่งมาก! รับรูปกลับบ้านได้เลย`;
  $('#rTime').textContent = fmtTime(game.timer.used);
  $('#rPairs').textContent = `${game.pairs} / ${PAIRS}`;
  $('#rScore').textContent = game.score;
  buildCarousel();
  makeQR($('#qr'), pocLink('memory'));
  showScreen('s-result');
  if (win) { sfx('win'); confetti($('.stage')); }
}

function buildCarousel() {
  const car = $('#carousel'), dots = $('#dots');
  car.innerHTML = images.map((im, i) => `<img src="${im.url}" data-i="${i}" alt="">`).join('');
  dots.innerHTML = '<i></i>'.repeat(images.length);
  const select = (i) => {
    fav = i;
    $$('img', car).forEach((im, j) => im.classList.toggle('sel', j === i));
    $$('i', dots).forEach((d, j) => d.classList.toggle('on', j === i));
  };
  select(0);
  car.scrollLeft = 0;
  car.onscroll = () => {
    const mid = car.scrollLeft + car.clientWidth / 2;
    let best = 0, bd = Infinity;
    $$('img', car).forEach((im, j) => {
      const d = Math.abs(im.offsetLeft + im.offsetWidth / 2 - mid);
      if (d < bd) { bd = d; best = j; }
    });
    if (best !== fav) select(best);
  };
  car.onclick = (e) => {
    if (e.target.tagName === 'IMG') e.target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };
}

$('#dl').onclick = () => {
  const card = souvenir({
    image: images[fav].canvas,
    title: 'MEMORY MATCH',
    lines: [`คะแนน ${game.score}`, `จับคู่ได้ ${game.pairs}/${PAIRS} คู่ • Theme ${THEMES[theme].label}`],
  });
  downloadCanvas(card, 'memory-match.png');
};
$('#again').onclick = () => { showScreen('s-capture'); cam.start(); };
