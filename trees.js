/* ════════════════════════════════════════
   КОНСТАНТЫ
   ════════════════════════════════════════ */
const GRID_SIZE    = 25;
const GRID_COLS    = 5;
const MIN_MINUTES  = 10;
const MAX_MINUTES  = 120;
const STEP_MINUTES = 5;

/* ════════════════════════════════════════
   КАТАЛОГ ДЕРЕВЬЕВ
   ════════════════════════════════════════ */
const TREES = {
  cedar:      { name: "Cedar",          price: 0,    stages: 3, default: true  },
  flowertree: { name: "Flower Tree",    price: 0,    stages: 3, default: true  },
  treehouse:  { name: "Treehouse",      price: 0,    stages: 3, default: true  },
  sakura:     { name: "Sakura",         price: 600,  stages: 3, default: false },
  jacaranda:  { name: "Jacaranda",      price: 600,  stages: 3, default: false },
  lilac:      { name: "Common Lilac",   price: 700,  stages: 3, default: false },
  whitelilac: { name: "White Lilac",    price: 700,  stages: 3, default: false },
  maidens:    { name: "Maiden's Blush", price: 900,  stages: 3, default: false },
  madamerose: { name: "Madame Rose",    price: 1100, stages: 3, default: false },
};

function getDefaultUnlocked() {
  return Object.keys(TREES).filter(k => TREES[k].default);
}
