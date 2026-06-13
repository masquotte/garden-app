/* ════════════════════════════════════════
   КОНСТАНТЫ
   ════════════════════════════════════════ */
const GRID_SIZE    = 25;
const GRID_COLS    = 5;
const MIN_MINUTES  = 10;
const MAX_MINUTES  = 120;
const STEP_MINUTES = 5;

/* ════════════════════════════════════════
   ТЕГИ — единственный источник правды
   ════════════════════════════════════════ */
const TAGS = [
  { tag: 'Work',          emoji: '💼', color: '#4a8c50' },
  { tag: 'Study',         emoji: '📚', color: '#5b9bd5' },
  { tag: 'Read',          emoji: '📖', color: '#7aafcf' },
  { tag: 'Social',        emoji: '💬', color: '#e8a838' },
  { tag: 'Rest',          emoji: '🛋️', color: '#a07bc4' },
  { tag: 'Entertainment', emoji: '🎮', color: '#e06060' },
  { tag: 'Sport',         emoji: '🏃', color: '#5bbda4' },
  { tag: 'Other',         emoji: '✨', color: '#8a9a8a' },
];

/* ════════════════════════════════════════
   КАТАЛОГ ДЕРЕВЬЕВ
   ════════════════════════════════════════ */
const TREES = {
  cedar:      { name: "Cedar",          price: 0,    stages: 3, default: true  },
  flowertree: { name: "Flower Tree",    price: 0,    stages: 3, default: true  },
  treehouse:  { name: "Treehouse",      price: 0,    stages: 3, default: true  },
  sakura:     { name: "Sakura",         price: 600,  stages: 3, default: false },
  jacaranda:  { name: "Jacaranda",      price: 600,  stages: 3, default: false },
  corgi:      { name: "Corgi Tree",     price: 800,  stages: 3, default: false },
  lilac:      { name: "Common Lilac",   price: 700,  stages: 3, default: false },
  whitelilac: { name: "White Lilac",    price: 700,  stages: 3, default: false },
  maidens:    { name: "Maiden's Blush", price: 900,  stages: 3, default: false },
  madamerose: { name: "Madame Rose",    price: 1100, stages: 3, default: false },
};

function getDefaultUnlocked() {
  return Object.keys(TREES).filter(k => TREES[k].default);
}
