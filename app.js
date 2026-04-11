/* ════════════════════════════════════════
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ════════════════════════════════════════ */
function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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
  recentPlants: [],
  activeLand: 'grass',
  unlocked: {
    trees: getDefaultUnlocked(),
    lands: getDefaultUnlockedLands()
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
    state = migrate(JSON.parse(saved));
  } catch(e) {
    console.warn('Load error', e);
  }
}

function migrate(saved) {
  if (!saved.version) {
    return {
      version: STATE_VERSION,
      coins: saved.coins || 0,
      sessions: [],
      gardens: {},
      recentPlants: [],
      activeLand: 'grass',
      unlocked: { trees: getDefaultUnlocked(), lands: getDefaultUnlockedLands() }
    };
  }
  saved.version = STATE_VERSION;
  if (!saved.sessions)      saved.sessions      = [];
  if (!saved.gardens)       saved.gardens       = {};
  if (!saved.recentPlants)  saved.recentPlants  = [];
  if (!saved.activeLand)    saved.activeLand    = saved.activeSoil || 'grass';
  if (!saved.unlocked)      saved.unlocked      = { trees: getDefaultUnlocked(), lands: getDefaultUnlockedLands() };
  if (!saved.unlocked.lands) saved.unlocked.lands = saved.unlocked.soils || getDefaultUnlockedLands();
  // clean up old keys
  delete saved.activeSoil;
  delete saved.unlocked.soils;
  return saved;
}

function saveState() {
  localStorage.setItem('forest_v3', JSON.stringify(state));
}

/* ════════════════════════════════════════
   GRID HELPERS
   ════════════════════════════════════════ */
function addToGrid(type, stage, dead = false, date = null) {
  const grid = date ? (state.gardens[date] || getTodayGrid()) : getTodayGrid();
  const free = grid.reduce((acc, cell, i) => { if (!cell) acc.push(i); return acc; }, []);
  if (!free.length) return -1;
  const idx = free[Math.floor(Math.random() * free.length)];
  grid[idx] = { type, stage, dead };
  return idx;
}

function addToRecentPlants(type) {
  state.recentPlants = [type, ...(state.recentPlants || []).filter(t => t !== type)].slice(0, 3);
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
  document.getElementById('dialPlant').setAttribute('href', `sprites/${activePlantType}-${getStage(dialValue)}.png`);
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

const dialTreeBtn = document.getElementById('dialTreeBtn');
dialTreeBtn.addEventListener('pointerdown', e => { e.stopPropagation(); });
dialTreeBtn.addEventListener('click', () => { openPlantPicker(); });

/* ════════════════════════════════════════
   RECENT PLANTS
   ════════════════════════════════════════ */
function renderRecentPlants() {
  const container = document.getElementById('recentPlants');
  if (!container) return;

  let recent = [...(state.recentPlants || [])];
  const defaults = getDefaultUnlocked();
  for (const d of defaults) {
    if (recent.length >= 3) break;
    if (!recent.includes(d)) recent.push(d);
  }
  recent = recent.slice(0, 3);

  container.innerHTML = recent.map(type => {
    const tree = TREES[type];
    if (!tree) return '';
    const isActive = type === activePlantType;
    return `<button class="plant-opt ${isActive ? 'active' : ''}" onclick="selectPlant('${type}')">
      <img src="sprites/${type}-2.png" alt="${tree.name}"
           onerror="this.src='sprites/cedar-2.png'">
      <span>${tree.name}</span>
    </button>`;
  }).join('');
}

function selectPlant(type) {
  activePlantType = type;
  renderRecentPlants();
  document.getElementById('dialPlant').setAttribute('href', `sprites/${activePlantType}-${getStage(dialValue)}.png`);
}

/* ════════════════════════════════════════
   PLANT PICKER POPUP
   ════════════════════════════════════════ */
let pickerTime = 25;
let pickerTag  = 'Work';

function openPlantPicker() {
  pickerTime = dialValue;
  pickerTag  = activeTag;
  document.getElementById('pickerTimeVal').textContent = `${pickerTime} min`;
  renderPickerGrid();
  renderPickerTags();
  document.getElementById('plantPickerOverlay').classList.add('open');
}

function closePlantPicker() {
  document.getElementById('plantPickerOverlay').classList.remove('open');
}

function renderPickerGrid() {
  const grid = document.getElementById('pickerGrid');
  grid.innerHTML = Object.entries(TREES).map(([key, tree]) => {
    const owned      = state.unlocked.trees.includes(key);
    const isSelected = key === activePlantType;
    const price      = !owned ? `<div class="picker-card-price">🪙 ${tree.price}</div>` : '';
    return `
      <div class="picker-card ${isSelected ? 'selected' : ''} ${!owned ? 'locked' : ''}"
           onclick="${owned ? `pickerSelectPlant('${key}')` : `showToast('Buy in shop first')`}">
        <img src="sprites/${key}-2.png" alt="${tree.name}"
             onerror="this.src='sprites/cedar-2.png'">
        <span class="picker-card-name">${tree.name}</span>
        ${price}
      </div>`;
  }).join('');
}

function pickerSelectPlant(type) {
  activePlantType = type;
  renderPickerGrid();
  renderRecentPlants();
  document.getElementById('dialPlant').setAttribute('href', `sprites/${activePlantType}-${getStage(pickerTime)}.png`);
}

function renderPickerTags() {
  const container = document.getElementById('pickerTagsRow');
  const tags = [
    {tag:'Work',emoji:'💼'},{tag:'Study',emoji:'📚'},
    {tag:'Social',emoji:'💬'},{tag:'Rest',emoji:'🛋️'},
    {tag:'Entertainment',emoji:'🎮'},{tag:'Sport',emoji:'🏃'},
    {tag:'Other',emoji:'✨'}
  ];
  container.innerHTML = tags.map(({tag, emoji}) =>
    `<button class="tag-btn ${tag === pickerTag ? 'active' : ''}"
             onclick="pickerSelectTag('${tag}')">${emoji} ${tag}</button>`
  ).join('');
}

function pickerSelectTag(tag) {
  pickerTag  = tag;
  activeTag  = tag;
  document.querySelectorAll('[data-tag]').forEach(b =>
    b.classList.toggle('active', b.dataset.tag === tag));
  renderPickerTags();
}

document.getElementById('plantPickerClose').addEventListener('click', closePlantPicker);
document.getElementById('plantPickerOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('plantPickerOverlay')) closePlantPicker();
});

document.getElementById('timeDown').addEventListener('click', () => {
  pickerTime = Math.max(MIN_MINUTES, pickerTime - STEP_MINUTES);
  document.getElementById('pickerTimeVal').textContent = `${pickerTime} min`;
});
document.getElementById('timeUp').addEventListener('click', () => {
  pickerTime = Math.min(MAX_MINUTES, pickerTime + STEP_MINUTES);
  document.getElementById('pickerTimeVal').textContent = `${pickerTime} min`;
});

document.getElementById('plantPickerStart').addEventListener('click', () => {
  dialValue = pickerTime;
  activeTag = pickerTag;
  updateDial(dialValue);
  closePlantPicker();
  addToRecentPlants(activePlantType);
  startSession();
});

/* ════════════════════════════════════════
   TIMER
   ════════════════════════════════════════ */
let timerInterval = null;
let totalSeconds = 0, remainingSeconds = 0;
let activeTag = 'Work';
let sessionStartedAt = null;
let sessionStartDate = null;

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

startBtn.addEventListener('click', () => {
  activeTag = document.querySelector('[data-tag].active')?.dataset.tag || 'Work';
  addToRecentPlants(activePlantType);
  startSession();
});

function startSession() {
  setStatsCollapsed(true);
  sessionStartedAt = Date.now();
  sessionStartDate = getToday();
  totalSeconds = dialValue * 60;
  remainingSeconds = totalSeconds;
  runningTag.textContent = activeTag;
  updateCountdown();
  updateRing();
  updateQuote(true);
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
}

cancelBtn.addEventListener('click', () => {
  clearInterval(timerInterval);
  document.body.classList.remove('running');
  setStatsCollapsed(false);
  const idx = addToGrid(activePlantType, getStage(dialValue), true, sessionStartDate);
  recordSession(dialValue, false);
  if (idx >= 0) { saveState(); renderGarden(idx); }
  showToast('🍂 Plant withered');
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
  if (completed) showToast(`🌳 Tree planted! +${earned} 🍃`);
}

function recordSession(minutes, completed, earned = 0) {
  state.sessions.push({
    date: sessionStartDate || getToday(),
    startedAt: sessionStartedAt || Date.now(),
    minutes, tag: activeTag,
    type: activePlantType, stage: getStage(minutes),
    coins: earned, completed
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

/* ════════════════════════════════════════
   AMBIENT EFFECTS
   ════════════════════════════════════════ */
function renderEffect() {
  const layer = document.getElementById('effectLayer');
  if (!layer) return;

  const land   = LANDS[state.activeLand || 'grass'];
  const effect = land?.effect;
  if (!effect) { layer.innerHTML = ''; return; }

  const isDark  = document.body.classList.contains('dark');
  const type    = isDark ? effect.dark : effect.light;

  if (type === 'clouds') {
    layer.innerHTML = `
  <div class="cloud" style="width:90px;height:26px;top:18%;
    animation:drift1 38s linear infinite;">
    <div style="position:absolute;border-radius:50%;background:rgba(255,255,255,0.65);
      width:40px;height:40px;top:-18px;left:14px;"></div>
    <div style="position:absolute;border-radius:50%;background:rgba(255,255,255,0.65);
      width:28px;height:28px;top:-12px;left:42px;"></div>
  </div>
  <div class="cloud" style="width:70px;height:20px;top:8%;
    animation:drift2 52s linear infinite;animation-delay:-18s;">
    <div style="position:absolute;border-radius:50%;background:rgba(255,255,255,0.65);
      width:32px;height:32px;top:-14px;left:10px;"></div>
    <div style="position:absolute;border-radius:50%;background:rgba(255,255,255,0.65);
      width:22px;height:22px;top:-9px;left:32px;"></div>
  </div>
  <div class="cloud" style="width:110px;height:28px;top:30%;
    animation:drift3 44s linear infinite;animation-delay:-30s;">
    <div style="position:absolute;border-radius:50%;background:rgba(255,255,255,0.65);
      width:46px;height:46px;top:-22px;left:18px;"></div>
    <div style="position:absolute;border-radius:50%;background:rgba(255,255,255,0.65);
      width:34px;height:34px;top:-15px;left:52px;"></div>
  </div>`;
        
  } else if (type === 'stars') {
    const stars = [
      {s:2, t:'12%', l:'15%', a:'twinkle1', d:'0s',    dur:'5.2s'},
      {s:3, t:'7%',  l:'40%', a:'twinkle2', d:'-2s',   dur:'8.4s'},
      {s:2, t:'20%', l:'62%', a:'twinkle1', d:'-4s',   dur:'6.8s'},
      {s:2, t:'5%',  l:'78%', a:'twinkle3', d:'-1s',   dur:'7.2s'},
      {s:3, t:'25%', l:'88%', a:'twinkle2', d:'-6s',   dur:'9.1s'},
      {s:2, t:'32%', l:'25%', a:'twinkle1', d:'-3s',   dur:'5.8s'},
      {s:2, t:'4%',  l:'55%', a:'twinkle3', d:'-5s',   dur:'6.4s'},
      {s:3, t:'16%', l:'72%', a:'twinkle1', d:'-7s',   dur:'8.7s'},
      {s:2, t:'28%', l:'48%', a:'twinkle2', d:'-1.5s', dur:'7.4s'},
      {s:2, t:'9%',  l:'92%', a:'twinkle3', d:'-4.5s', dur:'9.8s'},
      {s:3, t:'22%', l:'8%',  a:'twinkle1', d:'-2.5s', dur:'6.1s'},
      {s:2, t:'38%', l:'82%', a:'twinkle2', d:'-3.5s', dur:'8.2s'},
    ];
    layer.innerHTML = stars.map(({s,t,l,a,d,dur}) =>
      `<div class="star" style="width:${s}px;height:${s}px;top:${t};left:${l};
        animation:${a} ${dur} ease-in-out infinite;animation-delay:${d};"></div>`
    ).join('');
  } else {
    layer.innerHTML = '';
  }
}

function renderGarden(newIdx = -1) {
  const HW=44, HH=22, D=11, GCX=230, GCY=160, SW=90, SH=115;
  const grid = getTodayGrid();

  const dateEl = document.getElementById('gardenDate');
  if (dateEl) {
    const d = new Date();
    dateEl.textContent = `Today — ${d.getDate()} ${d.toLocaleString('en', {month:'long'})} ${d.getFullYear()}`;
  }

  const alive = grid.filter(c => c && !c.dead).length;
  const dead  = grid.filter(c => c && c.dead).length;
  sessionCount.innerHTML = `<span>🌿 ${alive}</span> <span style="opacity:0.5">🍂 ${dead}</span>`;

  const activeLand = state.activeLand || 'grass';

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

    s += `<image href="land/${activeLand}.png"
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
    const imgX = cx - SW/2;
    const imgY = cy - SH;
    const cls  = idx === newIdx ? 'new-tree' : '';
    const href = plant.dead
      ? `sprites/wilted-${plant.stage}.png`
      : `sprites/${plant.type}-${plant.stage}.png`;
    s += `<ellipse cx="${cx}" cy="${cy}" rx="16" ry="4"
            fill="rgba(0,0,0,0.35)" filter="url(#shadow-blur)"/>`;
    s += `<image href="${href}" x="${imgX}" y="${imgY}"
            width="${SW}" height="${SH}" class="${cls}"/>`;
  }

  s += `</svg>`;
  gardenGrid.innerHTML = s;
  renderEffect();
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
let activeShopTab     = 'trees';

shopBtn.addEventListener('click', () => {
  activeShopTab = 'trees';
  document.getElementById('tabTrees').classList.add('active');
  document.getElementById('tabLand').classList.remove('active');
  renderShop();
  shopOverlay.classList.add('open');
});
shopClose.addEventListener('click', () => shopOverlay.classList.remove('open'));
shopOverlay.addEventListener('click', e => {
  if (e.target === shopOverlay) shopOverlay.classList.remove('open');
});

function switchShopTab(tab) {
  activeShopTab = tab;
  document.getElementById('tabTrees').classList.toggle('active', tab === 'trees');
  document.getElementById('tabLand').classList.toggle('active',  tab === 'land');
  if (tab === 'trees') renderShop();
  else renderLandShop();
}

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

function renderLandShop() {
  shopCoinDisplay.textContent = state.coins;
  shopGrid.innerHTML = Object.entries(LANDS).map(([key, land]) => {
    const owned     = (state.unlocked.lands || []).includes(key);
    const canAfford = state.coins >= land.price;
    const isActive  = (state.activeLand || 'grass') === key;
    const cls       = owned ? (isActive ? 'owned active-soil' : 'owned') : (!canAfford ? 'cant-afford' : '');
    const foot      = owned
      ? `<span class="shop-unlocked">${isActive ? 'Active' : 'Unlocked'}</span>`
      : `<div class="shop-price"><span>🪙</span>${land.price}</div>`;
    return `
      <div class="shop-card ${cls}" onclick="buyLand('${key}')">
        <div class="shop-img">
          <img src="land/${key}.png" alt="${land.name}"
               onerror="this.parentElement.innerHTML='<div class=shop-placeholder></div>'">
        </div>
        <div class="shop-foot">
          <span class="shop-name">${land.name}</span>
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

function buyLand(key) {
  const land = LANDS[key];
  if (!(state.unlocked.lands || []).includes(key)) {
    if (state.coins < land.price) { showToast('🪙 Not enough coins'); return; }
    state.coins -= land.price;
    if (!state.unlocked.lands) state.unlocked.lands = [];
    state.unlocked.lands.push(key);
  }
  state.activeLand = key;
  saveState();
  renderCoins();
  renderLandShop();
  renderGarden();
  showToast(`🌿 ${land.name} selected!`);
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

document.getElementById('exportBtn').addEventListener('click', () => {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `garden-backup-${getToday()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('💾 Data saved!');
});

document.getElementById('importFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      state = migrate(JSON.parse(ev.target.result));
      saveState();
      renderCoins();
      renderGarden();
      renderRecentPlants();
      popupOverlay.classList.remove('open');
      showToast('✅ Data restored!');
    } catch {
      showToast('❌ Invalid file');
    }
  };
  reader.readAsText(file);
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
  renderEffect();
});
if (localStorage.getItem('forest_theme') === 'dark') {
  document.body.classList.add('dark');
  themeToggle.textContent = '☀️';
}

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
  el.textContent = currentQuote.text;
  au.textContent = currentQuote.author ? `— ${currentQuote.author}` : '';
}

/* ════════════════════════════════════════
   СТАТИСТИКА
   ════════════════════════════════════════ */
let activePeriod = 'day';

function switchStatsPeriod(period) {
  activePeriod = period;
  document.querySelectorAll('.stats-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.period === period));
  renderStats();
}

function getDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function calcStreak() {
  const days = new Set(state.sessions.filter(s => s.completed).map(s => s.date));
  let streak = 0;
  const d = new Date();
  if (!days.has(getDateKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(getDateKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function getPeriodSessions(period) {
  const now = new Date();
  if (period === 'day') return state.sessions.filter(s => s.date === getToday());
  if (period === 'week') {
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const mon = new Date(now); mon.setDate(now.getDate() - dow); mon.setHours(0,0,0,0);
    return state.sessions.filter(s => new Date(s.date + 'T00:00:00') >= mon);
  }
  if (period === 'month') return state.sessions.filter(s => s.date.startsWith(getToday().slice(0,7)));
  if (period === 'year')  return state.sessions.filter(s => s.date.startsWith(getToday().slice(0,4)));
  return [];
}

function getPrevPeriodSessions(period) {
  const now = new Date();
  if (period === 'day') {
    const y = new Date(now); y.setDate(now.getDate()-1);
    return state.sessions.filter(s => s.date === getDateKey(y));
  }
  if (period === 'week') {
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const mon = new Date(now); mon.setDate(now.getDate()-dow-7); mon.setHours(0,0,0,0);
    const sun = new Date(mon); sun.setDate(mon.getDate()+7);
    return state.sessions.filter(s => {
      const sd = new Date(s.date+'T00:00:00');
      return sd >= mon && sd < sun;
    });
  }
  if (period === 'month') {
    const p = new Date(now.getFullYear(), now.getMonth()-1, 1);
    const prefix = `${p.getFullYear()}-${String(p.getMonth()+1).padStart(2,'0')}`;
    return state.sessions.filter(s => s.date.startsWith(prefix));
  }
  if (period === 'year') return state.sessions.filter(s => s.date.startsWith(String(now.getFullYear()-1)));
  return [];
}

function getBarBuckets(period, sessions) {
  const now = new Date();
  if (period === 'day') {
    const b = Array(24).fill(0);
    sessions.forEach(s => { if (s.startedAt) b[new Date(s.startedAt).getHours()] += s.minutes; });
    return { values: b, xLabels: ['00:00','06:00','12:00','18:00','23:00'], xAt: [0,6,12,18,23] };
  }
  if (period === 'week') {
    const b = Array(7).fill(0);
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const mon = new Date(now); mon.setDate(now.getDate()-dow); mon.setHours(0,0,0,0);
    sessions.forEach(s => {
      const d = Math.round((new Date(s.date+'T00:00:00') - mon) / 86400000);
      if (d >= 0 && d < 7) b[d] += s.minutes;
    });
    return { values: b, xLabels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], xAt: [0,1,2,3,4,5,6] };
  }
  if (period === 'month') {
    const dim = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const b = Array(dim).fill(0);
    sessions.forEach(s => { const d = parseInt(s.date.slice(8))-1; if (d>=0&&d<dim) b[d]+=s.minutes; });
    const xAt = [], xLabels = [];
    for (let i = 0; i < dim; i += Math.ceil(dim/6)) { xAt.push(i); xLabels.push(String(i+1)); }
    return { values: b, xLabels, xAt };
  }
  if (period === 'year') {
    const b = Array(12).fill(0);
    sessions.forEach(s => { b[parseInt(s.date.slice(5,7))-1] += s.minutes; });
    return { values: b, xLabels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], xAt: [0,1,2,3,4,5,6,7,8,9,10,11] };
  }
}

function svgBarChart(buckets) {
  const { values, xLabels, xAt } = buckets;
  const W=420, H=130, pL=36, pB=22, pR=6, pT=8;
  const plotW=W-pL-pR, plotH=H-pT-pB;
  const n = values.length;
  const maxV = Math.max(...values, 1);
  const maxH = maxV / 60;
  const niceMax = maxH <= 0.5 ? 0.5 : maxH <= 1 ? 1 : maxH <= 2 ? 2 : maxH <= 4 ? 4 : Math.ceil(maxH);
  const niceMaxMin = niceMax * 60;
  const ticks = [0, niceMax / 2, niceMax];
  const bw = Math.max(2, plotW/n - (n > 15 ? 1 : 2));
  const currentHour = new Date().getHours();

  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg">`;
  ticks.forEach(t => {
    const y = (pT + plotH - (t/niceMax)*plotH).toFixed(1);
    const label = t === 0 ? '0' : t < 1 ? `${t*60}m` : `${t}h`;
    s += `<line x1="${pL}" y1="${y}" x2="${W-pR}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 2"/>`;
    s += `<text x="${pL-3}" y="${(+y+3.5).toFixed(1)}" text-anchor="end" fill="var(--muted)" font-size="6.5" font-family="DM Mono,monospace">${label}</text>`;
  });
  values.forEach((v, i) => {
    const bh = v > 0 ? Math.max(3, (v/niceMaxMin)*plotH) : 0;
    const x  = (pL + (i/n)*plotW + (plotW/n - bw)/2).toFixed(1);
    const y  = (pT + plotH - bh).toFixed(1);
    const highlight = activePeriod === 'day' && i === currentHour;
    s += `<rect x="${x}" y="${y}" width="${bw.toFixed(1)}" height="${Math.max(bh,0).toFixed(1)}" rx="2" fill="${v>0?'var(--green)':'var(--panel)'}" opacity="${highlight?1:0.75}"/>`;
  });
  xAt.forEach((idx, li) => {
    const x = (pL + (idx/n)*plotW + (plotW/n)/2).toFixed(1);
    s += `<text x="${x}" y="${H-4}" text-anchor="middle" fill="var(--muted)" font-size="6.5" font-family="DM Mono,monospace">${xLabels[li]}</text>`;
  });
  s += `<line x1="${pL}" y1="${pT+plotH}" x2="${W-pR}" y2="${pT+plotH}" stroke="var(--border)" stroke-width="1"/>`;
  s += `</svg>`;
  return s;
}

const TAG_COLORS = {
  Work:'#4a8c50', Study:'#5b9bd5', Social:'#e8a838',
  Rest:'#a07bc4', Entertainment:'#e06060', Sport:'#5bbda4', Other:'#8a9a8a'
};

function svgDonut(sessions) {
  const tagM = {};
  sessions.forEach(s => { tagM[s.tag] = (tagM[s.tag]||0) + s.minutes; });
  const total = Object.values(tagM).reduce((a,b) => a+b, 0);
  if (!total) return `<div class="stats-no-data">No data</div>`;

  const entries = Object.entries(tagM).sort((a,b) => b[1]-a[1]);
  const CX=70, CY=70, R=44, SW=22;
  const circ = 2 * Math.PI * R;

  let svg = `<svg viewBox="0 0 210 140" width="100%" xmlns="http://www.w3.org/2000/svg">`;
  let cumPct = 0;
  entries.forEach(([tag, mins]) => {
    const pct = mins / total;
    const dash = pct * circ;
    const color = TAG_COLORS[tag] || '#8a9a8a';
    svg += `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${color}" stroke-width="${SW}"
              stroke-dasharray="${dash.toFixed(2)} ${(circ-dash).toFixed(2)}"
              transform="rotate(${(-90+cumPct*360).toFixed(2)}, ${CX}, ${CY})"/>`;
    cumPct += pct;
  });
  const totalH = Math.round(total/60*10)/10;
  svg += `<text x="${CX}" y="${CY-3}" text-anchor="middle" fill="var(--text)" font-size="9" font-family="DM Mono,monospace" font-weight="500">${totalH}h</text>`;
  svg += `<text x="${CX}" y="${CY+9}" text-anchor="middle" fill="var(--muted)" font-size="7" font-family="Nunito,sans-serif">total</text>`;

  let ly = 16;
  entries.slice(0, 5).forEach(([tag, mins]) => {
    const pct = Math.round(mins/total*100);
    const color = TAG_COLORS[tag] || '#8a9a8a';
    svg += `<rect x="148" y="${ly-6}" width="7" height="7" rx="1.5" fill="${color}"/>`;
    svg += `<text x="159" y="${ly+0.5}" fill="var(--text)" font-size="7.5" font-family="Nunito,sans-serif">${tag}</text>`;
    svg += `<text x="208" y="${ly+0.5}" text-anchor="end" fill="var(--muted)" font-size="7" font-family="DM Mono,monospace">${pct}%</text>`;
    ly += 17;
  });
  svg += `</svg>`;
  return svg;
}

function renderFavTrees(sessions) {
  const counts = {};
  sessions.filter(s => s.completed).forEach(s => { counts[s.type] = (counts[s.type]||0)+1; });
  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,4);
  if (!sorted.length) return `<div class="stats-no-data">No data</div>`;
  return sorted.map(([type, count]) => {
    const tree = TREES[type];
    return `<div class="fav-tree-item">
      <img src="sprites/${type}-2.png" alt="${tree?.name||type}" onerror="this.src='sprites/cedar-2.png'">
      <span class="fav-tree-name">${tree?.name||type}</span>
      <span class="fav-tree-count">${count}×</span>
    </div>`;
  }).join('');
}

let statsCollapsed = false;

function toggleStats() {
  statsCollapsed = !statsCollapsed;
  document.getElementById('statsCollapsible').classList.toggle('collapsed', statsCollapsed);
  document.getElementById('statsToggleArrow').style.transform = statsCollapsed ? 'rotate(180deg)' : '';
}

function setStatsCollapsed(val) {
  statsCollapsed = val;
  document.getElementById('statsCollapsible').classList.toggle('collapsed', val);
  document.getElementById('statsToggleArrow').style.transform = val ? 'rotate(180deg)' : '';
}

function renderStats() {
  const sessions     = getPeriodSessions(activePeriod);
  const prevSessions = getPrevPeriodSessions(activePeriod);
  const total     = sessions.reduce((s,x) => s+x.minutes, 0);
  const prevTotal = prevSessions.reduce((s,x) => s+x.minutes, 0);
  const diff = total - prevTotal;
  const pct  = prevTotal > 0 ? Math.round(diff/prevTotal*100) : null;

  const now = new Date();
  const daysElapsed = activePeriod==='week' ? 7
    : activePeriod==='month' ? now.getDate()
    : activePeriod==='year'  ? (Math.ceil((now-new Date(now.getFullYear(),0,1))/86400000)||1)
    : 1;
  const avg = daysElapsed > 1 ? Math.round(total/daysElapsed) : total;

  const buckets  = getBarBuckets(activePeriod, sessions);
  const bestIdx  = buckets.values.indexOf(Math.max(...buckets.values));
  const bestVal  = buckets.values[bestIdx];
  const bestLabels = { day: `${String(bestIdx).padStart(2,'0')}:00`, week: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][bestIdx], month: `Day ${bestIdx+1}`, year: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][bestIdx] };
  const bestLabel = bestLabels[activePeriod];

  const streak = calcStreak();
  const streakEl = document.getElementById('statsStreak');
  streakEl.innerHTML = streak > 0 ? `🔥 ${streak} day${streak>1?'s':''} streak` : '';

  const periodLabel = {day:'yesterday', week:'last week', month:'last month', year:'last year'}[activePeriod];
  const sign = diff >= 0 ? '+' : '';
  const pctStr = pct !== null ? ` (${sign}${pct}%)` : '';

  document.getElementById('statsContent').innerHTML = `
    <div class="analytics-row">
      <div class="analytics-card">
        <div class="analytics-label">Total focus</div>
        <div class="analytics-value">${total} min</div>
        ${prevTotal > 0 || diff !== 0 ? `<div class="analytics-sub ${diff>=0?'pos':'neg'}">${sign}${diff} min vs ${periodLabel}${pctStr}</div>` : ''}
      </div>
      <div class="analytics-card">
        <div class="analytics-label">Daily average</div>
        <div class="analytics-value">${avg} min</div>
      </div>
      ${bestVal > 0 ? `<div class="analytics-card">
        <div class="analytics-label">Best ${activePeriod==='day'?'hour':activePeriod==='year'?'month':'day'}</div>
        <div class="analytics-value">${bestLabel}</div>
        <div class="analytics-sub neutral">${bestVal} min</div>
      </div>` : ''}
    </div>
    <div class="stats-section-label">Focused Time Distribution</div>
    <div class="chart-wrap">${svgBarChart(buckets)}</div>
    <div class="stats-two-col">
      <div>
        <div class="stats-section-label">Tag Distribution</div>
        ${svgDonut(sessions)}
      </div>
      <div>
        <div class="stats-section-label">Favorite Trees</div>
        <div class="fav-trees">${renderFavTrees(sessions)}</div>
      </div>
    </div>`;
}

/* ════════════════════════════════════════
   INIT
   ════════════════════════════════════════ */
loadState();
coinDisplay.textContent = state.coins;
renderGarden();
renderRecentPlants();
updateDial(25);
renderStats();
