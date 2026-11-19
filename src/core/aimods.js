// ИИ-моды: нейросеть (Google Gemini) придумывает новые предметы — мечи, инструменты, еду,
// броню — с текстурой 16×16, способностями и рецептом. Лаунчер собирает из этого
// набор данных + пакет ресурсов (работают в Minecraft 1.21.4+ без Forge/Fabric).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { encodePng } = require('./png');
const { enableResourcePack } = require('./packs');
const { moderate } = require('./aibuilder');

// ───────────── Версии ─────────────
function parseVer(v) {
  const p = String(v).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  return p[0] >= 25 ? [1, 100 + p[0], p[1] || 0] : [p[0], p[1] || 0, p[2] || 0]; // 26.1 → новее любой 1.21.x
}
const atLeast = (v, min) => {
  const a = parseVer(v), b = parseVer(min);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};
const supported = (v) => atLeast(v, '1.21.4');
const newFormat = (v) => atLeast(v, '1.21.5'); // компоненты как объекты, а не JSON-строки

// ───────────── Вещи, которые можно взять за основу ─────────────
const BASES = {
  sword: ['wooden_sword', 'stone_sword', 'iron_sword', 'golden_sword', 'diamond_sword', 'netherite_sword'],
  axe: ['iron_axe', 'diamond_axe', 'netherite_axe'],
  pickaxe: ['iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'],
  shovel: ['iron_shovel', 'diamond_shovel'],
  bow: ['bow'],
  food: ['apple', 'golden_apple', 'bread', 'cookie', 'cooked_beef', 'carrot', 'melon_slice', 'sweet_berries', 'honey_bottle'],
  helmet: ['iron_helmet', 'diamond_helmet', 'netherite_helmet'],
  chestplate: ['iron_chestplate', 'diamond_chestplate', 'netherite_chestplate'],
  leggings: ['iron_leggings', 'diamond_leggings', 'netherite_leggings'],
  boots: ['iron_boots', 'diamond_boots', 'netherite_boots'],
  item: ['stick', 'emerald', 'diamond', 'amethyst_shard', 'blaze_rod', 'nether_star', 'paper'],
};
const EFFECTS = ['speed', 'slowness', 'haste', 'strength', 'instant_health', 'jump_boost', 'regeneration', 'resistance', 'fire_resistance',
  'water_breathing', 'invisibility', 'night_vision', 'weakness', 'poison', 'wither', 'absorption', 'saturation', 'glowing', 'levitation',
  'luck', 'slow_falling', 'conduit_power', 'dolphins_grace', 'hero_of_the_village', 'darkness'];
const NEGATIVE = new Set(['slowness', 'weakness', 'poison', 'wither', 'glowing', 'levitation', 'darkness']);

const clamp = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
const slug = (s, d = 'item') => (String(s || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || d);
const { censor } = require('./profanity');
const cleanText = (s, max) => censor(String(s || '')).replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
const itemId = (s) => {
  const id = String(s || '').replace(/^minecraft:/, '').toLowerCase();
  return /^[a-z0-9_]{2,40}$/.test(id) ? `minecraft:${id}` : null;
};

// ───────────── Нейросеть ─────────────
const PROMPT = (idea, gameVersion) => `Ты — дизайнер модов Minecraft (Java ${gameVersion}). Игрок хочет мод: «${idea}».
Придумай 1–4 новых предмета. Верни ТОЛЬКО JSON такого вида:
{"ok":true,"name":"название мода по-русски","description":"1 предложение по-русски","items":[{
 "id":"латиница_snake_case","name":"название по-русски","kind":"sword|axe|pickaxe|shovel|bow|food|helmet|chestplate|leggings|boots|item",
 "base":"minecraft:diamond_sword (существующий предмет того же вида)","lore":["строка описания по-русски"],
 "damage":7,"durability":1500,"glint":true,
 "on_hit":{"ignite_seconds":0,"lightning":false,"effects":[{"effect":"poison","seconds":5,"level":1}]},
 "food":{"nutrition":6,"saturation":8,"eat_seconds":1.6,"effects":[{"effect":"speed","seconds":30,"level":1}]},
 "armor":3,"wear_effects":[],
 "recipe":{"pattern":["dbd"," s "," s "],"key":{"d":"minecraft:diamond","b":"minecraft:blaze_powder","s":"minecraft:stick"}},
 "texture":{"palette":{"a":"#rrggbb","b":"#rrggbb"},"pixels":["16 строк по 16 символов; . — прозрачно"]}}]}
Правила: on_hit — только для оружия, food — только для еды, armor — только для брони. Эффекты: ${EFFECTS.join(', ')}.
Значения разумные (урон до 20, уровень эффекта до 3). Текстура — пиксель-арт 16×16 в стиле Minecraft, предмет по диагонали как ванильные мечи.
Рецепт — из ванильных предметов, не дешевле силы предмета.
Если просят читы, 18+, оскорбления или что-то вредное — верни {"ok":false,"reason":"почему нельзя, по-русски"}.`;

async function askGemini(key, idea, gameVersion) {
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastErr;
  for (const model of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT(idea, gameVersion) }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.8 } }),
      signal: AbortSignal.timeout(90000),
    }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '{}';
      return JSON.parse(text.replace(/^```(json)?|```$/g, ''));
    }
    const body = await res.text().catch(() => '');
    if (res.status === 400 || res.status === 403) throw new Error('Ключ нейросети не подходит — проверьте его в «ИИ-сборки» → «Новый мод»');
    if (res.status === 429) throw new Error('Лимит бесплатного ключа на сегодня исчерпан — попробуйте позже');
    lastErr = new Error(`Нейросеть не ответила (${res.status || 'нет связи'}) ${body.slice(0, 80)}`);
  }
  throw lastErr;
}

// ───────────── Проверка и «обрезка» того, что придумала нейросеть ─────────────
function sanitize(spec, gameVersion) {
  if (!spec || spec.ok === false) return { ok: false, reason: cleanText(spec?.reason, 200) || 'Нейросеть отказалась делать такой мод' };
  const items = [];
  const used = new Set();
  for (const raw of (spec.items || []).slice(0, 4)) {
    const kind = BASES[raw.kind] ? raw.kind : 'item';
    const base = itemId(raw.base) && BASES[kind].includes(itemId(raw.base).slice(10)) ? itemId(raw.base) : `minecraft:${BASES[kind][Math.min(BASES[kind].length - 1, 2)]}`;
    let id = slug(raw.id, kind);
    while (used.has(id)) id += '_2';
    used.add(id);
    const effList = (list, maxSec) => (Array.isArray(list) ? list : []).slice(0, 3)
      .map((e) => ({ effect: slug(e.effect).replace(/^minecraft_/, ''), seconds: clamp(e.seconds, 1, maxSec, 10), level: Math.round(clamp(e.level, 1, 3, 1)) }))
      .filter((e) => EFFECTS.includes(e.effect));
    const weapon = ['sword', 'axe', 'pickaxe', 'shovel', 'bow'].includes(kind);
    const armor = ['helmet', 'chestplate', 'leggings', 'boots'].includes(kind);
    const item = {
      id, kind, base,
      name: cleanText(raw.name, 40) || id,
      lore: (Array.isArray(raw.lore) ? raw.lore : []).slice(0, 3).map((l) => cleanText(l, 60)).filter(Boolean),
      glint: !!raw.glint,
      damage: weapon ? clamp(raw.damage, 1, 20, 6) : null,
      durability: weapon || armor ? Math.round(clamp(raw.durability, 50, 4000, 800)) : null,
      onHit: weapon && raw.on_hit ? {
        ignite: clamp(raw.on_hit.ignite_seconds, 0, 10, 0),
        lightning: !!raw.on_hit.lightning,
        effects: effList(raw.on_hit.effects, 15).filter((e) => NEGATIVE.has(e.effect) || e.effect === 'glowing'),
      } : null,
      food: kind === 'food' ? {
        nutrition: Math.round(clamp(raw.food?.nutrition, 1, 20, 4)),
        saturation: clamp(raw.food?.saturation, 0, 20, 4),
        eatSeconds: clamp(raw.food?.eat_seconds, 0.4, 5, 1.6),
        effects: effList(raw.food?.effects, 300),
      } : null,
      armor: armor ? clamp(raw.armor, 1, 10, 3) : null,
      recipe: sanitizeRecipe(raw.recipe),
      texture: sanitizeTexture(raw.texture),
    };
    items.push(item);
  }
  if (!items.length) return { ok: false, reason: 'Нейросеть не придумала ни одного предмета — опишите мод подробнее' };
  const name = cleanText(spec.name, 40) || 'ИИ-мод';
  const description = cleanText(spec.description, 200);
  const verdict = moderate([name, description, ...items.map((i) => `${i.name} ${i.lore.join(' ')}`)].join(' '));
  if (!verdict.ok) return verdict;
  return { ok: true, name, description, gameVersion, items };
}

function sanitizeRecipe(r) {
  const pattern = (Array.isArray(r?.pattern) ? r.pattern : []).slice(0, 3).map((row) => String(row).slice(0, 3).padEnd(3, ' '));
  const key = {};
  for (const [k, v] of Object.entries(r?.key || {})) {
    if (/^[a-zA-Z#]$/.test(k) && itemId(v) && pattern.some((row) => row.includes(k))) key[k] = itemId(v);
  }
  const ok = pattern.length && Object.keys(key).length && pattern.every((row) => [...row].every((c) => c === ' ' || key[c]));
  return ok ? { pattern, key } : { pattern: ['ddd', 'dsd', ' s '], key: { d: 'minecraft:diamond', s: 'minecraft:stick' } };
}

function sanitizeTexture(t) {
  const palette = {};
  for (const [k, v] of Object.entries(t?.palette || {})) if (k.length === 1 && k !== '.' && /^#[0-9a-f]{6}$/i.test(v)) palette[k] = v;
  const rows = (Array.isArray(t?.pixels) ? t.pixels : []).map(String);
  const valid = rows.length === 16 && rows.every((r) => r.length === 16 && [...r].every((c) => c === '.' || c === ' ' || palette[c]));
  return valid ? { palette, pixels: rows } : null;
}

// ───────────── Текстуры ─────────────
// Запасные силуэты, если нейросеть нарисовала криво: # — основной цвет, + — светлый, h — рукоять
const SHAPES = {
  sword: ['..............##', '.............#+#', '............#+#.', '...........#+#..', '..........#+#...', '.........#+#....', '........#+#.....', '.......#+#......', '..#...#+#.......', '..##.#+#........', '...##+#.........', '....h##.........', '...h.##.........', '..h...#.........', '.h..............', 'h...............'],
  food: ['................', '.......hh.......', '........h.......', '....######......', '...#++####......', '..#++######.....', '..#+########....', '..##########....', '..##########....', '..##########....', '...########.....', '...########.....', '....######......', '.....####.......', '................', '................'],
  item: ['................', '.......##.......', '......#++#......', '.....#++###.....', '....#++#####....', '...#++#######...', '...#+########...', '..#############.', '...###########..', '....#########...', '.....#######....', '......#####.....', '.......###......', '........#.......', '................', '................'],
};
SHAPES.axe = SHAPES.sword; SHAPES.pickaxe = SHAPES.sword; SHAPES.shovel = SHAPES.sword; SHAPES.bow = SHAPES.sword;
for (const k of ['helmet', 'chestplate', 'leggings', 'boots']) SHAPES[k] = SHAPES.item;

const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function texturePixels(item) {
  const px = new Uint8Array(16 * 16 * 4);
  let rows, palette;
  if (item.texture) ({ pixels: rows, palette } = item.texture);
  else {
    rows = SHAPES[item.kind] || SHAPES.item;
    const seed = parseInt(crypto.createHash('md5').update(item.id).digest('hex').slice(0, 6), 16);
    const hue = seed % 360;
    const hsl = (l) => { const c = (1 - Math.abs(2 * l - 1)) * 0.7, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = l - c / 2; const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x]; return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join(''); };
    palette = { '#': hsl(0.5), '+': hsl(0.75), h: '#6b4a2b' };
  }
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (!palette[c]) return;
    const [r, g, b] = hexRgb(palette[c]);
    const i = (y * 16 + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  }));
  return px;
}

// ───────────── Сборка набора данных и пакета ресурсов ─────────────
const DATA_FORMAT = 61, RES_FORMAT = 46;
const meta = (format, description) => JSON.stringify({
  pack: { pack_format: format, supported_formats: { min_inclusive: format, max_inclusive: 9999 }, min_format: format, max_format: 9999, description },
}, null, 2);

function buildPack(mod) {
  const ns = `rionina_${slug(mod.id || mod.name, 'mod').slice(0, 20)}`;
  const nf = newFormat(mod.gameVersion);
  const text = (t, color, italic = false) => (nf ? { text: t, color, italic } : JSON.stringify({ text: t, color, italic }));
  const data = { 'pack.mcmeta': meta(DATA_FORMAT, `§b${mod.name} §7— ИИ-мод Rionina`) };
  const res = { 'pack.mcmeta': meta(RES_FORMAT, `§b${mod.name} §7— текстуры`) };
  const recipes = [];

  for (const it of mod.items) {
    const comps = {
      'minecraft:item_name': text(it.name, 'aqua'),
      'minecraft:item_model': `${ns}:${it.id}`,
    };
    if (it.lore.length) comps['minecraft:lore'] = it.lore.map((l) => text(l, 'gray', true));
    if (it.glint) comps['minecraft:enchantment_glint_override'] = true;
    if (it.durability) comps['minecraft:max_damage'] = it.durability;
    const mods = [];
    if (it.damage != null) {
      mods.push({ type: 'minecraft:attack_damage', amount: it.damage - 1, operation: 'add_value', id: `${ns}:${it.id}_damage`, slot: 'mainhand' });
      mods.push({ type: 'minecraft:attack_speed', amount: it.kind === 'axe' ? -3.0 : -2.4, operation: 'add_value', id: `${ns}:${it.id}_speed`, slot: 'mainhand' });
    }
    if (it.armor != null) {
      const slot = { helmet: 'head', chestplate: 'chest', leggings: 'legs', boots: 'feet' }[it.kind];
      mods.push({ type: 'minecraft:armor', amount: it.armor, operation: 'add_value', id: `${ns}:${it.id}_armor`, slot });
    }
    if (mods.length) comps['minecraft:attribute_modifiers'] = nf ? mods : { modifiers: mods };
    if (it.food) {
      comps['minecraft:food'] = { nutrition: it.food.nutrition, saturation: it.food.saturation, can_always_eat: it.food.effects.length > 0 };
      comps['minecraft:consumable'] = {
        consume_seconds: it.food.eatSeconds,
        on_consume_effects: it.food.effects.length ? [{ type: 'minecraft:apply_effects', effects: it.food.effects.map((e) => ({ id: `minecraft:${e.effect}`, duration: e.seconds * 20, amplifier: e.level - 1 })) }] : [],
      };
    }
    // Способности при ударе — через своё зачарование
    if (it.onHit && (it.onHit.ignite || it.onHit.lightning || it.onHit.effects.length)) {
      const post = [];
      if (it.onHit.ignite) post.push({ enchanted: 'attacker', affected: 'victim', effect: { type: 'minecraft:ignite', duration: it.onHit.ignite } });
      for (const e of it.onHit.effects) {
        post.push({ enchanted: 'attacker', affected: 'victim', effect: { type: 'minecraft:apply_mob_effect', to_apply: `minecraft:${e.effect}`, min_duration: e.seconds, max_duration: e.seconds, min_amplifier: e.level - 1, max_amplifier: e.level - 1 } });
      }
      if (it.onHit.lightning) post.push({ enchanted: 'attacker', affected: 'victim', effect: { type: 'minecraft:summon_entity', entity: 'minecraft:lightning_bolt' }, requirements: { condition: 'minecraft:random_chance', chance: 0.25 } });
      data[`data/${ns}/enchantment/${it.id}_power.json`] = JSON.stringify({
        description: { text: it.name, color: 'aqua' },
        supported_items: it.base, weight: 1, max_level: 1,
        min_cost: { base: 1, per_level_above_first: 0 }, max_cost: { base: 1, per_level_above_first: 0 },
        anvil_cost: 1, slots: ['mainhand'], effects: { 'minecraft:post_attack': post },
      }, null, 2);
      comps['minecraft:enchantments'] = nf ? { [`${ns}:${it.id}_power`]: 1 } : { levels: { [`${ns}:${it.id}_power`]: 1 } };
    }
    data[`data/${ns}/recipe/${it.id}.json`] = JSON.stringify({
      type: 'minecraft:crafting_shaped', category: it.kind === 'food' ? 'misc' : 'equipment',
      pattern: it.recipe.pattern, key: it.recipe.key,
      result: { id: it.base, count: 1, components: comps },
    }, null, 2);
    recipes.push(`${ns}:${it.id}`);

    // Модель и текстура
    res[`assets/${ns}/items/${it.id}.json`] = JSON.stringify({ model: { type: 'minecraft:model', model: `${ns}:item/${it.id}` } });
    res[`assets/${ns}/models/item/${it.id}.json`] = JSON.stringify({
      parent: ['sword', 'axe', 'pickaxe', 'shovel'].includes(it.kind) ? 'minecraft:item/handheld' : 'minecraft:item/generated',
      textures: { layer0: `${ns}:item/${it.id}` },
    });
    res[`assets/${ns}/textures/item/${it.id}.png`] = encodePng(16, 16, texturePixels(it));
  }
  // Рецепты сразу появляются в книге рецептов
  data[`data/${ns}/advancement/unlock_recipes.json`] = JSON.stringify({ criteria: { tick: { trigger: 'minecraft:tick' } }, rewards: { recipes } });
  return { ns, data, res };
}

async function writeTree(dir, files) {
  await fsp.rm(dir, { recursive: true, force: true });
  for (const [rel, content] of Object.entries(files)) {
    const f = path.join(dir, rel);
    await fsp.mkdir(path.dirname(f), { recursive: true });
    await fsp.writeFile(f, content);
  }
}

// ───────────── Установка ─────────────
const MODS_DIR = (gameDir) => path.join(gameDir, 'rionina-ai-mods');

async function install(gameDir, mod) {
  const { ns, data, res } = buildPack(mod);
  const dir = path.join(MODS_DIR(gameDir), ns);
  await writeTree(path.join(dir, 'datapack'), data);
  await fsp.writeFile(path.join(dir, 'mod.json'), JSON.stringify({ ...mod, ns, installed: Date.now() }, null, 2));
  const rpName = `ИИ-мод ${ns.replace('rionina_', '')}`;
  await writeTree(path.join(gameDir, 'resourcepacks', rpName), res);
  await enableResourcePack(gameDir, rpName);
  await syncWorlds(gameDir);
  return { ns, resourcePack: rpName };
}

/** Кладёт наборы данных ИИ-модов во все миры (при каждом запуске игры). */
async function syncWorlds(gameDir) {
  let mods = [];
  try { mods = await fsp.readdir(MODS_DIR(gameDir)); } catch { return 0; }
  let worlds = [];
  try { worlds = (await fsp.readdir(path.join(gameDir, 'saves'), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return 0; }
  for (const w of worlds) {
    for (const ns of mods) {
      const src = path.join(MODS_DIR(gameDir), ns, 'datapack');
      if (!fs.existsSync(src)) continue;
      const dest = path.join(gameDir, 'saves', w, 'datapacks', ns);
      await fsp.rm(dest, { recursive: true, force: true });
      await fsp.cp(src, dest, { recursive: true });
    }
  }
  return worlds.length;
}

async function list(gameDir) {
  let dirs = [];
  try { dirs = await fsp.readdir(MODS_DIR(gameDir)); } catch { return []; }
  const out = [];
  for (const d of dirs) {
    try { out.push(JSON.parse(await fsp.readFile(path.join(MODS_DIR(gameDir), d, 'mod.json'), 'utf8'))); } catch { /* пропуск */ }
  }
  return out.sort((a, b) => b.installed - a.installed);
}

async function remove(gameDir, ns) {
  if (!/^rionina_[a-z0-9_]+$/.test(ns)) throw new Error('Неверный мод');
  await fsp.rm(path.join(MODS_DIR(gameDir), ns), { recursive: true, force: true });
  await fsp.rm(path.join(gameDir, 'resourcepacks', `ИИ-мод ${ns.replace('rionina_', '')}`), { recursive: true, force: true });
  try {
    for (const w of await fsp.readdir(path.join(gameDir, 'saves'))) await fsp.rm(path.join(gameDir, 'saves', w, 'datapacks', ns), { recursive: true, force: true });
  } catch { /* нет миров */ }
}

/** Придумать мод: нейросеть → проверка. */
async function create({ key, idea, gameVersion }) {
  idea = String(idea || '').trim();
  if (idea.length < 3) throw new Error('Опишите мод хотя бы парой слов');
  if (!supported(gameVersion)) throw new Error('ИИ-моды работают в Minecraft 1.21.4 и новее');
  const first = moderate(idea);
  if (!first.ok) return first;
  if (!key) throw new Error('Подключите нейросеть: вставьте бесплатный ключ Gemini');
  const spec = await askGemini(key, idea, gameVersion);
  const mod = sanitize(spec, gameVersion);
  if (mod.ok) mod.id = `${slug(mod.items[0].id, 'mod').slice(0, 12)}_${crypto.randomBytes(2).toString('hex')}`;
  return mod;
}

/** Картинка текстуры для предпросмотра в лаунчере (data URL). */
function previewPng(item) {
  return `data:image/png;base64,${encodePng(16, 16, texturePixels(item)).toString('base64')}`;
}

module.exports = { create, install, list, remove, syncWorlds, sanitize, buildPack, previewPng, supported };
