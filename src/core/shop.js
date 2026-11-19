// Каталог магазина и набор «на сегодня» — тот же, что на сервере Rionina.
const CATALOG = {
  lightning: 'epic', fire: 'rare', snow: 'common', hearts: 'common', sparkles: 'rare', rainbow: 'epic', bubbles: 'common',
  portal: 'epic', matrix: 'rare', aura: 'legendary', confetti: 'common', galaxy: 'legendary',
  fire_lord: 'epic', ice_queen: 'epic', gold_knight: 'legendary', galaxy_skin: 'legendary', neon: 'rare', emerald: 'rare', shadow: 'rare', samurai: 'rare',
  cape_rionina: 'rare', cape_night: 'common', cape_forest: 'common', cape_love: 'common', cape_storm: 'epic', cape_fire: 'epic', cape_star: 'rare', cape_king: 'legendary',
};
const PRICES = { common: 150, rare: 400, epic: 900, legendary: 2000 };
const dayIndex = (t) => Math.floor((t + 3 * 3600e3) / 864e5);

function shopToday(day = dayIndex(Date.now())) {
  const ids = Object.keys(CATALOG).sort();
  let seed = day * 2654435761 % 4294967296;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = [];
  while (pick.length < 6) { const id = ids[Math.floor(rnd() * ids.length)]; if (!pick.includes(id)) pick.push(id); }
  return pick;
}
const priceFor = (pro, id) => Math.round(PRICES[CATALOG[id]] * (pro ? 0.8 : 1));

module.exports = { CATALOG, PRICES, shopToday, priceFor, dayIndex };
