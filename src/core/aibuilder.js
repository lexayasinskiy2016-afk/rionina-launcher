// ИИ-сборщик: описываете словами — получаете сборку модов с Modrinth.
// Если на сервере Rionina подключена нейросеть (Gemini) — запросы придумывает она,
// иначе работает встроенный помощник по темам.
const modrinth = require('./modrinth');

const API = 'https://api.modrinth.com/v2';
const UA = 'RioninaLauncher/1.4 (minecraft launcher)';

// Темы: слова в описании → что искать на Modrinth
const THEMES = [
  { re: /граф|красив|шейдер|shader|graphic|realis|реалист/i, label: 'Красивая графика', slugs: ['sodium', 'iris'], forge: ['embeddium', 'oculus'] },
  { re: /fps|фпс|лаг|оптимиз|слаб|быстр|perform/i, label: 'Больше FPS', slugs: ['sodium', 'lithium', 'ferrite-core', 'modernfix', 'immediatelyfast'], forge: ['embeddium', 'ferrite-core', 'modernfix'] },
  { re: /техн|механ|завод|автомат|create|машин|tech/i, label: 'Техника', slugs: ['create', 'create-fabric'], category: 'technology' },
  { re: /маги|волшеб|заклин|magic|spell/i, label: 'Магия', category: 'magic' },
  { re: /дракон|dragon/i, label: 'Драконы', queries: ['dragons'] },
  { re: /карт|minimap|map|навигац/i, label: 'Карта', slugs: ['xaeros-minimap', 'xaeros-world-map'] },
  { re: /покемон|pokemon|cobblemon/i, label: 'Покемоны', slugs: ['cobblemon'] },
  { re: /ед[аыу]|ферм|кулинар|готов|farm|food|cook/i, label: 'Еда и фермы', slugs: ['farmers-delight'], category: 'food' },
  { re: /стро|декор|мебел|дом|build|decor|furniture/i, label: 'Строительство и декор', category: 'decoration' },
  { re: /выжив|survival|хардкор|hardcore/i, label: 'Выживание', slugs: ['appleskin', 'waystones'] },
  { re: /приключ|данж|подземел|босс|adventure|dungeon|boss/i, label: 'Приключения', slugs: ['yungs-better-dungeons'], category: 'adventure' },
  { re: /моб|монстр|животн|звер|mob|monster|animal/i, label: 'Новые мобы', category: 'mobs' },
  { re: /биом|мир|генерац|природ|terrain|biome|world/i, label: 'Новые миры', slugs: ['terralith'], category: 'worldgen' },
  { re: /космос|ракет|планет|space|rocket/i, label: 'Космос', queries: ['ad astra'] },
  { re: /оруж|меч|пушк|weapon|sword|gun/i, label: 'Оружие', queries: ['weapons'] },
  { re: /рюкзак|инвентар|backpack|storage|хранен/i, label: 'Хранение', category: 'storage' },
  { re: /друз|мультиплеер|сервер|вместе|friends|multiplayer/i, label: 'Игра с друзьями', slugs: ['simple-voice-chat'] },
];
const BASE = { fabric: ['fabric-api'], forge: [], neoforge: [] };

const BLOCKED = /(?<![\p{L}\p{N}])(x-?ray|икс-?рей|kill ?aura|aimbot|аимбот|автоклик\p{L}*|dupe|дюп|cheats?|hacks?|читы|чит|читер|взлом|nsfw|porn\p{L}*|порн\p{L}*|sex|секс\p{L}*)(?![\p{L}\p{N}])|18\+/iu;

function moderate(text) {
  if (BLOCKED.test(text)) return { ok: false, reason: 'Такие сборки нельзя: читы, взлом и контент 18+ запрещены правилами Rionina' };
  return { ok: true };
}

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Modrinth: HTTP ${res.status}`);
  return res.json();
}

async function projectInfo(slug) {
  try {
    const p = await get(`${API}/project/${encodeURIComponent(slug)}`);
    return { id: p.id, slug: p.slug, title: p.title, icon: p.icon_url, description: p.description, loaders: p.loaders, versions: p.game_versions };
  } catch {
    return null;
  }
}

async function searchTop({ query = '', category, gameVersion, loader, limit = 3 }) {
  const facets = [['project_type:mod'], [`categories:${loader}`]];
  if (gameVersion) facets.push([`versions:${gameVersion}`]);
  if (category) facets.push([`categories:${category}`]);
  const data = await get(`${API}/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(JSON.stringify(facets))}&index=${query ? 'relevance' : 'downloads'}&limit=${limit * 3}`);
  // Служебные библиотеки и аддоны к чужим модам пропускаем — в сборку они придут сами как зависимости
  return data.hits
    .filter((h) => !(h.categories || []).includes('library') && !/addon|аддон|compat|connector|patch/i.test(`${h.title} ${h.slug}`))
    .slice(0, limit)
    .map((h) => ({ id: h.project_id, slug: h.slug, title: h.title, icon: h.icon_url, description: h.description }));
}

/**
 * Строит план сборки. ai — ответ нейросети сервера ({ name, description, queries }) или null.
 * Возвращает { ok, reason?, name, description, themes, mods: [{ id, slug, title, icon, description, why }] }
 */
async function plan({ prompt, gameVersion, loader }, ai = null) {
  prompt = String(prompt || '').trim();
  if (prompt.length < 3) throw new Error('Опишите сборку хотя бы парой слов');
  const verdict = moderate(prompt);
  if (!verdict.ok) return verdict;
  if (ai && ai.ok === false) return { ok: false, reason: ai.reason || 'Нейросеть отклонила запрос' };

  const mods = new Map();
  const add = (m, why) => { if (m && !mods.has(m.id) && mods.size < 40) mods.set(m.id, { ...m, why }); };
  const themes = [];

  for (const slug of BASE[loader] || []) add(await projectInfo(slug), 'Нужен для работы модов');

  if (ai?.queries?.length) {
    themes.push('Подобрано нейросетью');
    for (const q of ai.queries) for (const m of await searchTop({ query: q, gameVersion, loader, limit: 2 }).catch(() => [])) add(m, `Запрос «${q}»`);
  } else {
    for (const t of THEMES) {
      if (!t.re.test(prompt)) continue;
      themes.push(t.label);
      const slugs = loader === 'fabric' ? t.slugs : t.forge || t.slugs;
      for (const slug of slugs || []) {
        const info = await projectInfo(slug);
        if (info && info.loaders.includes(loader) && (!gameVersion || info.versions.includes(gameVersion))) add(info, t.label);
      }
      for (const q of t.queries || []) for (const m of await searchTop({ query: q, gameVersion, loader, limit: 2 }).catch(() => [])) add(m, t.label);
      if (t.category) for (const m of await searchTop({ category: t.category, gameVersion, loader, limit: 3 }).catch(() => [])) add(m, t.label);
    }
    if (!themes.length) {
      // Тема не распознана — ищем прямо по словам
      themes.push('Поиск по описанию');
      const words = prompt.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter((w) => w.length > 3).slice(0, 3);
      for (const w of words) for (const m of await searchTop({ query: w, gameVersion, loader, limit: 3 }).catch(() => [])) add(m, `По слову «${w}»`);
    }
  }

  const list = [...mods.values()];
  // Проверяем и найденные моды
  const check = moderate(list.map((m) => `${m.title} ${m.slug}`).join(' '));
  const clean = check.ok ? list : list.filter((m) => moderate(`${m.title} ${m.slug}`).ok);
  if (clean.filter((m) => !(BASE[loader] || []).includes(m.slug)).length === 0) {
    return { ok: false, reason: 'Не нашлось модов под это описание и версию — попробуйте другие слова или версию' };
  }
  const name = ai?.name || `Rionina: ${themes.slice(0, 2).join(' + ')}`;
  const description = ai?.description || `Сборка на ${loader === 'fabric' ? 'Fabric' : loader === 'forge' ? 'Forge' : 'NeoForge'} ${gameVersion}: ${themes.join(', ').toLowerCase()}.`;
  return { ok: true, name: name.slice(0, 48), description, themes, mods: clean };
}

/** Ставит моды плана в сборку. Возвращает число установленных модов. */
async function installPlan({ mods, gameVersion, loader, gameDir }, onProgress) {
  let done = 0;
  const failed = [];
  for (const m of mods) {
    onProgress?.({ stage: `Установка: ${m.title}`, done, total: mods.length });
    try {
      await modrinth.installProject({ projectId: m.id, type: 'mod', gameVersion, gameDir, loader });
    } catch {
      failed.push(m.title);
    }
    done++;
  }
  onProgress?.({ stage: 'Готово', done, total: mods.length });
  return { installed: mods.length - failed.length, failed };
}

module.exports = { plan, installPlan, moderate };
