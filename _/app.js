/* ════════════════════════════════════════
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ════════════════════════════════════════ */
function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function calcCoins(minutes) {
  const COIN_TABLE = [
    [10,3],[15,4],[25,9],[30,10],[35,11],
    [45,13],[50,14],[60,21],[80,25],[100,34],[120,43]
  ];
  for (const [m,c] of COIN_TABLE) if (m === minutes) return c;
  for (let i = 0; i < COIN_TABLE.length - 1; i++) {
    const [m0,c0] = COIN_TABLE[i], [m1,c1] = COIN_TABLE[i+1];
    if (minutes > m0 && minutes < m1)
      return Math.round(c0 + (minutes-m0)/(m1-m0) * (c1-c0));
  }
  return 0;
}

function getStage(minutes) {
  if (minutes <= 25) return 1;
  if (minutes <= 60) return 2;
  return 3;
}

/* ════════════════════════════════════════
   STATE
   ════════════════════════════════════════ */
const STATE_VERSION = 3;

let state = {
  version: STATE_VERSION,
  coins: 0,
  sessions: [],
  gardens: {},
  unlocked: {
    trees: getDefaultUnlocked(),
    soils: ['default']
  }
};

function getTodayGrid() {
  const today = getToday();
  if (!state.gardens[today]) {
    state.gardens[today] = Array(GRID_SIZE).fill(null);
  }
  return state.gardens[today];
}

function loadState() {
  try {
    const saved = localStorage.getItem('forest_v3');
    if (!saved) return;
    const parsed = JSON.parse(saved);
    state = migrate(parsed);
  } catch(e) {
    console.warn('Ошибка загрузки, начинаем заново', e);
  }
}

function migrate(saved) {
  if (!saved.version) {
    return {
      version: STATE_VERSION,
      coins: saved.coins || 0,
      sessions: [],
      gardens: {},
      unlocked: {
        trees: getDefaultUnlocked(),
        soils: ['default']
      }
    };
  }
  saved.version = STATE_VERSION;
  if (!saved.sessions) saved.sessions = [];
  if (!saved.gardens)  saved.gardens  = {};
  if (!saved.unlocked) saved.unlocked = { trees: getDefaultUnlocked(), soils: ['default'] };
  return saved;
}

function saveState() {
  localStorage.setItem('forest_v3', JSON.stringify(state));
}

/* ════════════════════════════════════════
   GRID HELPERS
   ════════════════════════════════════════ */
function addToGrid(type, stage, dead = false) {
  const grid = getTodayGrid();
  const free = grid.reduce((acc, cell, i) => { if (!cell) acc.push(i); return acc; }, []);
  if (!free.length) return -1;
  const idx = free[Math.floor(Math.random() * free.length)];
  grid[idx] = { type, stage, dead };
  return idx;
}

/* ════════════════════════════════════════
   DIAL
   ════════════════════════════════════════ */
const CX = 100, CY = 100, R = 80;
const START_ANG = 150, SWEEP = 240;

let dialValue = 25;
let isDragging = false;
let activePlantType = 'cedar';

function angToXY(deg) {
  const r = deg * Math.PI / 180;
  return { x: CX + R * Math.cos(r), y: CY + R * Math.sin(r) };
}
function valToAng(v) {
  return START_ANG + (v - MIN_MINUTES) / (MAX_MINUTES - MIN_MINUTES) * SWEEP;
}

function updateDial(val) {
  dialValue = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(val / STEP_MINUTES) * STEP_MINUTES));

  const ang = valToAng(dialValue);
  const hp  = angToXY(ang);
  const sp  = angToXY(START_ANG);
  const sw  = ang - START_ANG;
  const la  = sw > 180 ? 1 : 0;

  document.getElementById('dialHandle').setAttribute('cx', hp.x.toFixed(1));
  document.getElementById('dialHandle').setAttribute('cy', hp.y.toFixed(1));

  const prog = document.getElementById('dialProgress');
  if (sw <= 0) {
    prog.setAttribute('d', '');
  } else {
    prog.setAttribute('d',
      `M ${sp.x.toFixed(1)} ${sp.y.toFixed(1)} A ${R} ${R} 0 ${la} 1 ${hp.x.toFixed(1)} ${hp.y.toFixed(1)}`);
  }
  document.getElementById('dialValueText').textContent = `${dialValue} min`;

  const stage = getStage(dialValue);
  document.getElementById('dialPlant').setAttribute('href', `sprites/${activePlantType}-${stage}.png`);
}

function ptrToValue(clientX, clientY) {
  const rect = document.getElementById('dialSvg').getBoundingClientRect();
  const px = (clientX - rect.left) * (200 / rect.width);
  const py = (clientY - rect.top)  * (200 / rect.height);
  let ang = Math.atan2(py - CY, px - CX) * 180 / Math.PI;
  if (ang < 0) ang += 360;
  let sw = (ang - START_ANG + 360) % 360;
  if (sw > SWEEP) sw = (sw - SWEEP < (360 - SWEEP) / 2) ? SWEEP : 0;
  return MIN_MINUTES + (sw / SWEEP) * (MAX_MINUTES - MIN_MINUTES);
}

const dialSvg = document.getElementById('dialSvg');
dialSvg.addEventListener('pointerdown', e => {
  isDragging = true;
  dialSvg.setPointerCapture(e.pointerId);
  updateDial(ptrToValue(e.clientX, e.clientY));
});
dialSvg.addEventListener('pointermove', e => {
  if (isDragging) updateDial(ptrToValue(e.clientX, e.clientY));
});
dialSvg.addEventListener('pointerup', () => { isDragging = false; });

/* ════════════════════════════════════════
   TIMER
   ════════════════════════════════════════ */
let timerInterval = null;
let totalSeconds = 0, remainingSeconds = 0;
let activeTag = 'Work';

const CIRCUMFERENCE = 2 * Math.PI * 78;

const startBtn     = document.getElementById('startBtn');
const cancelBtn    = document.getElementById('cancelBtn');
const countdown    = document.getElementById('countdown');
const runningTag   = document.getElementById('runningTag');
const ringProgress = document.getElementById('ringProgress');
const coinDisplay  = document.getElementById('coinDisplay');
const coinBadge    = document.getElementById('coinBadge');
const gardenGrid   = document.getElementById('gardenGrid');
const sessionCount = document.getElementById('sessionCount');
const toast        = document.getElementById('toast');
const tagBtns      = document.querySelectorAll('.tag-btn');

tagBtns.forEach(btn => btn.addEventListener('click', () => {
  tagBtns.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeTag = btn.dataset.tag;
}));

const plantOpts = document.querySelectorAll('.plant-opt');
plantOpts.forEach(btn => btn.addEventListener('click', () => {
  plantOpts.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activePlantType = btn.dataset.plant;
  document.getElementById('dialPlant').setAttribute('href',
    `sprites/${activePlantType}-${getStage(dialValue)}.png`);
}));

startBtn.addEventListener('click', () => {
  updateQuote(true);
  totalSeconds = dialValue * 60;
  remainingSeconds = totalSeconds;
  activeTag = document.querySelector('.tag-btn.active').dataset.tag;
  runningTag.textContent = activeTag;
  updateCountdown();
  updateRing();
  document.body.classList.add('running');
  timerInterval = setInterval(() => {
    remainingSeconds--;
    updateCountdown();
    updateRing();
    updateQuote();
    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      finishSession(dialValue, true);
    }
  }, 1000);
});

cancelBtn.addEventListener('click', () => {
  clearInterval(timerInterval);
  document.body.classList.remove('running');
  const idx = addToGrid(activePlantType, getStage(dialValue), true);
  recordSession(dialValue, false);
  if (idx >= 0) { saveState(); renderGarden(idx); }
  showToast('🍂 Растение засохло');
});

function finishSession(minutes, completed) {
  document.body.classList.remove('running');
  const earned = completed ? calcCoins(minutes) : 0;
  if (earned > 0) state.coins += earned;
  const idx = addToGrid(activePlantType, getStage(minutes), !completed);
  recordSession(minutes, completed, earned);
  saveState();
  renderCoins(completed);
  renderGarden(idx);
  if (completed) showToast(`🌳 Дерево посажено! +${earned} 🍃`);
}

function recordSession(minutes, completed, earned = 0) {
  state.sessions.push({
    date:      getToday(),
    minutes,
    tag:       activeTag,
    type:      activePlantType,
    stage:     getStage(minutes),
    coins:     earned,
    completed
  });
}

function updateCountdown() {
  const m = Math.floor(remainingSeconds / 60), s = remainingSeconds % 60;
  countdown.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function updateRing() {
  ringProgress.style.strokeDashoffset = CIRCUMFERENCE * (1 - remainingSeconds / totalSeconds);
}

/* ════════════════════════════════════════
   RENDER
   ════════════════════════════════════════ */
function renderCoins(animate = false) {
  coinDisplay.textContent = state.coins;
  if (animate) {
    coinBadge.classList.remove('earning');
    void coinBadge.offsetWidth;
    coinBadge.classList.add('earning');
  }
}

function renderGarden(newIdx = -1) {
  const HW=44, HH=22, D=11, GCX=230, GCY=160, SW=90, SH=115;
  const grid = getTodayGrid();

  // Дата
  const dateEl = document.getElementById('gardenDate');
  if (dateEl) {
    const d = new Date();
    dateEl.textContent = `Today — ${d.getDate()} ${d.toLocaleString('en', {month:'long'})} ${d.getFullYear()}`;
  }

  // Счётчик
  const alive = grid.filter(c => c && !c.dead).length;
  const dead  = grid.filter(c => c && c.dead).length;
  sessionCount.innerHTML = `<span>🌿 ${alive}</span> <span style="opacity:0.5">🍂 ${dead}</span>`;

  const activeSoil = state.activeSoil || 'grass';

  const cells = [];
  for (let r=0; r<GRID_COLS; r++)
    for (let c=0; c<GRID_COLS; c++)
      cells.push({r, c, idx: r*GRID_COLS+c});
  cells.sort((a,b) => (a.r+a.c) - (b.r+b.c));

  let defs = `<defs>
    <filter id="shadow-blur" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="3"/>
    </filter>`;

  for (const {r, c, idx} of cells) {
    const cx = GCX + (c-r)*HW, cy = GCY + (r+c)*HH;
    const tp={x:cx,y:cy-HH}, rp={x:cx+HW,y:cy}, bp={x:cx,y:cy+HH}, lp={x:cx-HW,y:cy};
    defs += `<clipPath id="clip-${idx}">
      <polygon points="${tp.x},${tp.y} ${rp.x},${rp.y} ${bp.x},${bp.y} ${lp.x},${lp.y}"/>
    </clipPath>`;
  }
  defs += `</defs>`;

  let s = `<svg width="100%" viewBox="0 0 460 380" xmlns="http://www.w3.org/2000/svg">${defs}`;

  const sprites = [];

  for (const {r, c, idx} of cells) {
    const cx = GCX + (c-r)*HW, cy = GCY + (r+c)*HH;
    const tp={x:cx,y:cy-HH}, rp={x:cx+HW,y:cy}, bp={x:cx,y:cy+HH}, lp={x:cx-HW,y:cy};
    const plant = grid[idx];

    s += `<image href="land/${activeSoil}.png"
            x="${cx-HW}" y="${cy-HH}" width="${HW*2}" height="${HH*2}"
            clip-path="url(#clip-${idx})"
            preserveAspectRatio="xMidYMid slice"/>`;

    s += `<polygon points="${rp.x},${rp.y} ${bp.x},${bp.y} ${bp.x},${bp.y+D} ${rp.x},${rp.y+D}"
            fill="#3a6128"/>`;
    s += `<polygon points="${lp.x},${lp.y} ${bp.x},${bp.y} ${bp.x},${bp.y+D} ${lp.x},${lp.y+D}"
            fill="#2a4a1c"/>`;

    if (plant) sprites.push({idx, cx, cy, plant});
  }

  sprites.sort((a,b) =>
    (Math.floor(a.idx/GRID_COLS)+a.idx%GRID_COLS) -
    (Math.floor(b.idx/GRID_COLS)+b.idx%GRID_COLS));

  for (const {idx, cx, cy, plant} of sprites) {
    const imgX = cx - SW/2, imgY = cy - SH + HH/2;
    const cls  = idx === newIdx ? 'new-tree' : '';
    const href = plant.dead
      ? `sprites/wilted-${plant.stage}.png`
      : `sprites/${plant.type}-${plant.stage}.png`;
    s += `<ellipse cx="${cx}" cy="${cy + HH*0.5}" rx="16" ry="4"
            fill="rgba(0,0,0,0.4)" filter="url(#shadow-blur)"/>`;
    s += `<image href="${href}" x="${imgX}" y="${imgY}"
            width="${SW}" height="${SH}" class="${cls}"/>`;
  }

  s += `</svg>`;
  gardenGrid.innerHTML = s;
}

/* ════════════════════════════════════════
   TOAST
   ════════════════════════════════════════ */
let toastTimeout;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ════════════════════════════════════════
   МАГАЗИН
   ════════════════════════════════════════ */
const shopBtn         = document.getElementById('shopBtn');
const shopOverlay     = document.getElementById('shopOverlay');
const shopClose       = document.getElementById('shopClose');
const shopGrid        = document.getElementById('shopGrid');
const shopCoinDisplay = document.getElementById('shopCoinDisplay');

shopBtn.addEventListener('click', () => { renderShop(); shopOverlay.classList.add('open'); });
shopClose.addEventListener('click', () => shopOverlay.classList.remove('open'));
shopOverlay.addEventListener('click', e => {
  if (e.target === shopOverlay) shopOverlay.classList.remove('open');
});

function renderShop() {
  shopCoinDisplay.textContent = state.coins;
  shopGrid.innerHTML = Object.entries(TREES).map(([key, tree]) => {
    const owned     = state.unlocked.trees.includes(key);
    const canAfford = state.coins >= tree.price;
    const cls       = owned ? 'owned' : (!canAfford ? 'cant-afford' : '');
    const foot      = owned
      ? `<span class="shop-unlocked">Unlocked</span>`
      : `<div class="shop-price"><span>🪙</span>${tree.price}</div>`;
    return `
      <div class="shop-card ${cls}" onclick="buyTree('${key}')">
        <div class="shop-img">
          <img src="sprites/${key}-2.png" alt="${tree.name}"
               onerror="this.parentElement.innerHTML='<div class=shop-placeholder></div>'">
        </div>
        <div class="shop-foot">
          <span class="shop-name">${tree.name}</span>
          ${foot}
        </div>
      </div>`;
  }).join('');
}

function buyTree(key) {
  if (state.unlocked.trees.includes(key)) return;
  const tree = TREES[key];
  if (state.coins < tree.price) { showToast('🪙 Not enough coins'); return; }
  state.coins -= tree.price;
  state.unlocked.trees.push(key);
  saveState();
  renderCoins();
  renderShop();
  showToast(`🌳 ${tree.name} unlocked!`);
}

/* ════════════════════════════════════════
   НАСТРОЙКИ
   ════════════════════════════════════════ */
const settingsBtn  = document.getElementById('settingsBtn');
const popupOverlay = document.getElementById('popupOverlay');
const popupClose   = document.getElementById('popupClose');

settingsBtn.addEventListener('click', () => popupOverlay.classList.add('open'));
popupClose.addEventListener('click',  () => popupOverlay.classList.remove('open'));
popupOverlay.addEventListener('click', e => {
  if (e.target === popupOverlay) popupOverlay.classList.remove('open');
});

/* ════════════════════════════════════════
   ТЕМА
   ════════════════════════════════════════ */
const themeToggle = document.getElementById('themeToggle');
themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  const dark = document.body.classList.contains('dark');
  themeToggle.textContent = dark ? '☀️' : '🌙';
  localStorage.setItem('forest_theme', dark ? 'dark' : 'light');
});
if (localStorage.getItem('forest_theme') === 'dark') {
  document.body.classList.add('dark');
  themeToggle.textContent = '☀️';
}

/* ════════════════════════════════════════
   ЭКСПОРТ / ИМПОРТ
   ════════════════════════════════════════ */
document.getElementById('exportBtn').addEventListener('click', () => {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `forest-backup-${getToday()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('💾 Backup saved!');
});

document.getElementById('importFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const parsed = JSON.parse(ev.target.result);
      state = migrate(parsed);
      saveState();
      renderCoins();
      renderGarden();
      popupOverlay.classList.remove('open');
      showToast('✅ Data restored!');
    } catch {
      showToast('❌ Invalid file');
    }
  };
  reader.readAsText(file);
});

/* ════════════════════════════════════════
   ЦИТАТЫ
   ════════════════════════════════════════ */
let currentQuote = null;
let lastQuoteTime = 0;

function getQuote() {
  const available = currentQuote
    ? QUOTES.filter(q => q.text !== currentQuote.text)
    : QUOTES;
  return available[Math.floor(Math.random() * available.length)];
}

function updateQuote(force = false) {
  const now = Date.now();
  if (!force && now - lastQuoteTime < 15 * 60 * 1000) return;
  currentQuote = getQuote();
  lastQuoteTime = now;
  const el = document.getElementById('quoteText');
  const au = document.getElementById('quoteAuthor');
  if (!el) return;
  el.textContent = `"${currentQuote.text}"`;
  au.textContent = currentQuote.author ? `— ${currentQuote.author}` : '';
}

/* ════════════════════════════════════════
   INIT
   ════════════════════════════════════════ */
loadState();
coinDisplay.textContent = state.coins;
renderGarden();
updateDial(25);