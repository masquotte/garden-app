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
  snow: {
    name: "Snow",
    price: 400,
    default: false,
    effect: {
      light: 'snow',
      dark:  'snow-dark'
    }
  },
};

function getDefaultUnlockedLands() {
  return Object.keys(LANDS).filter(k => LANDS[k].default);
}