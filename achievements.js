/* ════════════════════════════════════════
   КАТАЛОГ ДОСТИЖЕНИЙ
   ════════════════════════════════════════ */
const ACHIEVEMENTS = [
  // Прогресс (количество завершённых сессий)
  { id: 'first-seed',      name: 'First Seed',      desc: 'Complete your first session',     group: 'Progress',    check: s => achCompletedCount(s) >= 1 },
  { id: 'sapling',         name: 'Sapling',         desc: 'Complete 10 sessions',            group: 'Progress',    check: s => achCompletedCount(s) >= 10 },
  { id: 'grove-keeper',    name: 'Grove Keeper',    desc: 'Complete 50 sessions',            group: 'Progress',    check: s => achCompletedCount(s) >= 50 },
  { id: 'forest-master',   name: 'Forest Master',   desc: 'Complete 100 sessions',           group: 'Progress',    check: s => achCompletedCount(s) >= 100 },
  { id: 'ancient-druid',   name: 'Ancient Druid',   desc: 'Complete 500 sessions',           group: 'Progress',    check: s => achCompletedCount(s) >= 500 },

  // Время фокусировки
  { id: 'first-hour',      name: 'First Hour',      desc: 'Focus for 1 hour total',          group: 'Time',        check: s => achTotalMins(s) >= 60 },
  { id: 'devoted',         name: 'Devoted',         desc: 'Focus for 100 hours total',       group: 'Time',        check: s => achTotalMins(s) >= 60 * 100 },
  { id: 'centurion',       name: 'Centurion',       desc: 'Focus for 500 hours total',       group: 'Time',        check: s => achTotalMins(s) >= 60 * 500 },

  // Стрики
  { id: 'three-day-bloom', name: 'Three-Day Bloom', desc: '3-day streak',                    group: 'Streaks',     check: s => achLongestStreak(s) >= 3 },
  { id: 'week-of-focus',   name: 'Week of Focus',   desc: '7-day streak',                    group: 'Streaks',     check: s => achLongestStreak(s) >= 7 },
  { id: 'steel-will',      name: 'Steel Will',      desc: '30-day streak',                   group: 'Streaks',     check: s => achLongestStreak(s) >= 30 },
  { id: 'unbreakable',     name: 'Unbreakable',     desc: '100-day streak',                  group: 'Streaks',     check: s => achLongestStreak(s) >= 100 },

  // Длина сессии
  { id: 'deep-focus',      name: 'Deep Focus',      desc: 'Complete a 60-min session',       group: 'Sessions',    check: s => achMaxSession(s) >= 60 },
  { id: 'marathon',        name: 'Marathon',        desc: 'Complete a 120-min session',      group: 'Sessions',    check: s => achMaxSession(s) >= 120 },

  // Сад
  { id: 'full-garden',     name: 'Full Garden',     desc: 'Fill all 25 tiles in one day',    group: 'Garden',      check: (s, st) => achHasFullGarden(st) },
  { id: 'pristine',        name: 'Pristine',        desc: '100 sessions in a row, no fails', group: 'Garden',      check: s => achLongestCompletedRun(s) >= 100 },

  // Разнообразие
  { id: 'botanist',        name: 'Botanist',        desc: 'Plant every tree species',        group: 'Variety',     check: s => achPlantedAllTrees(s) },
  { id: 'tag-explorer',    name: 'Tag Explorer',    desc: 'Use all 7 tags',                  group: 'Variety',     check: s => achUsedAllTags(s) },

  // Время суток
  { id: 'early-bird',      name: 'Early Bird',      desc: 'Finish a session before 07:00',   group: 'Time of Day', check: s => achHasEarlySession(s) },
  { id: 'night-owl',       name: 'Night Owl',       desc: 'Finish a session after 22:00',    group: 'Time of Day', check: s => achHasNightSession(s) },
];

/* ════════════════════════════════════════
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ПРОВЕРОК
   ════════════════════════════════════════ */
function achCompletedCount(sessions) {
  return sessions.filter(s => s.completed).length;
}

function achTotalMins(sessions) {
  return sessions.filter(s => s.completed).reduce((sum, s) => sum + s.minutes, 0);
}

function achMaxSession(sessions) {
  const completed = sessions.filter(s => s.completed);
  return completed.length ? Math.max(...completed.map(s => s.minutes)) : 0;
}

function achLongestStreak(sessions) {
  const days = [...new Set(sessions.filter(s => s.completed).map(s => s.date))].sort();
  if (!days.length) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i-1] + 'T00:00:00');
    const next = new Date(days[i] + 'T00:00:00');
    const diff = Math.round((next - prev) / 86400000);
    if (diff === 1) { cur++; best = Math.max(best, cur); }
    else cur = 1;
  }
  return best;
}

function achLongestCompletedRun(sessions) {
  const sorted = [...sessions].sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  let best = 0, cur = 0;
  for (const s of sorted) {
    if (s.completed) { cur++; best = Math.max(best, cur); }
    else cur = 0;
  }
  return best;
}

function achHasFullGarden(state) {
  if (!state.gardens) return false;
  for (const date in state.gardens) {
    const grid = state.gardens[date];
    if (grid.length === GRID_SIZE && grid.every(c => c && !c.dead)) return true;
  }
  return false;
}

function achPlantedAllTrees(sessions) {
  const planted = new Set(sessions.filter(s => s.completed).map(s => s.type));
  return Object.keys(TREES).every(k => planted.has(k));
}

function achUsedAllTags(sessions) {
  const used = new Set(sessions.filter(s => s.completed).map(s => s.tag));
  return TAGS.every(t => used.has(t.tag));
}

function achHasEarlySession(sessions) {
  return sessions.some(s => {
    if (!s.completed || !s.startedAt) return false;
    return new Date(s.startedAt).getHours() < 7;
  });
}

function achHasNightSession(sessions) {
  return sessions.some(s => {
    if (!s.completed || !s.startedAt) return false;
    return new Date(s.startedAt).getHours() >= 22;
  });
}
