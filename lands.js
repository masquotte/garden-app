/* ════════════════════════════════════════
   КАТАЛОГ ЗЕМЛИ
   ════════════════════════════════════════ */
const LANDS = {
  grass: {
    name: "Grass",
    price: 0,
    default: true,
    effect: {
      light: 'clouds',
      dark:  'stars'
    }
  },
};

function getDefaultUnlockedLands() {
  return Object.keys(LANDS).filter(k => LANDS[k].default);
}