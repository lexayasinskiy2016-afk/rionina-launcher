// Собственные ресурс-паки Rionina, офлайн-скин и включение паков/шейдеров в настройках игры.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { encodePng } = require('./png');

const PACK_META = (description) => JSON.stringify({
  pack: {
    pack_format: 34,
    supported_formats: { min_inclusive: 1, max_inclusive: 999 },
    min_format: 1,
    max_format: 999,
    description,
  },
}, null, 2);

// Детерминированный шум, чтобы текстуры выглядели одинаково при каждой генерации
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Мягкая «пастельная» текстура: цвет + лёгкий шум + еле заметная рамка. */
function softTexture(color, seed, { border = 0.06, noise = 0.07, alpha = 255 } = {}) {
  const [r, g, b] = hex(color);
  const rand = rng(seed);
  const px = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      const k = 1 + (rand() - 0.5) * noise * 2 - (edge ? border : 0);
      const i = (y * 16 + x) * 4;
      px[i] = Math.max(0, Math.min(255, r * k));
      px[i + 1] = Math.max(0, Math.min(255, g * k));
      px[i + 2] = Math.max(0, Math.min(255, b * k));
      px[i + 3] = alpha;
    }
  }
  return encodePng(16, 16, px);
}

/** Чистое стекло: прозрачное, с тонкой рамкой и бликом. */
function glassTexture(color = '#ffffff', frameAlpha = 150) {
  const [r, g, b] = hex(color);
  const px = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      const glint = (x + y === 5 || x + y === 6) && x > 1 && y > 1;
      px[i] = r; px[i + 1] = g; px[i + 2] = b;
      px[i + 3] = edge ? frameAlpha : glint ? 70 : color === '#ffffff' ? 0 : 40;
    }
  }
  return encodePng(16, 16, px);
}

const SMOOTH_BLOCKS = {
  stone: '#8f9399', cobblestone: '#7d8187', dirt: '#8a6446', sand: '#e3d6a3', gravel: '#8d8682',
  oak_planks: '#b48a55', spruce_planks: '#7a5a3a', birch_planks: '#d4c189', andesite: '#8e918f',
  diorite: '#d6d6d3', granite: '#a8735f', deepslate: '#4f5156', netherrack: '#7a3434', end_stone: '#e2e3b5',
  snow: '#f7fbff', clay: '#a3a8b8', bricks: '#a2584a', terracotta: '#a06a4f', sandstone_top: '#e0d39f',
};
// Старые (до 1.13) имена текстур
const LEGACY_NAMES = { cobblestone: 'cobblestone', oak_planks: 'planks_oak', spruce_planks: 'planks_spruce', birch_planks: 'planks_birch', andesite: 'stone_andesite', diorite: 'stone_diorite', granite: 'stone_granite', end_stone: 'end_stone', bricks: 'brick', sandstone_top: 'sandstone_top', terracotta: 'hardened_clay' };

const GLASS_COLORS = {
  white: '#f9fffe', orange: '#f9801d', magenta: '#c74ebd', light_blue: '#3ab3da', yellow: '#fed83d', lime: '#80c71f',
  pink: '#f38baa', gray: '#474f52', light_gray: '#9d9d97', cyan: '#169c9c', purple: '#8932b8', blue: '#3c44aa',
  brown: '#835432', green: '#5e7c16', red: '#b02e26', black: '#1d1d21',
};

async function writeFiles(dir, files) {
  for (const [rel, data] of Object.entries(files)) {
    const f = path.join(dir, rel);
    await fsp.mkdir(path.dirname(f), { recursive: true });
    await fsp.writeFile(f, data);
  }
}

const OWN_PACKS = [
  {
    id: 'rionina-smooth',
    name: 'Rionina Smooth',
    description: 'Гладкие пастельные блоки в минималистичном стиле',
    build() {
      const files = { 'pack.mcmeta': PACK_META('§aRionina Smooth §7— гладкие блоки') };
      let seed = 1;
      for (const [name, color] of Object.entries(SMOOTH_BLOCKS)) {
        const png = softTexture(color, seed++);
        files[`assets/minecraft/textures/block/${name}.png`] = png;
        files[`assets/minecraft/textures/blocks/${LEGACY_NAMES[name] || name}.png`] = png;
      }
      return files;
    },
  },
  {
    id: 'rionina-clear-glass',
    name: 'Rionina Clear Glass',
    description: 'Чистое прозрачное стекло с тонкой рамкой — всех цветов',
    build() {
      const files = { 'pack.mcmeta': PACK_META('§bRionina Clear Glass §7— чистое стекло') };
      files['assets/minecraft/textures/block/glass.png'] = glassTexture();
      files['assets/minecraft/textures/blocks/glass.png'] = glassTexture();
      for (const [c, col] of Object.entries(GLASS_COLORS)) {
        const png = glassTexture(col, 200);
        files[`assets/minecraft/textures/block/${c}_stained_glass.png`] = png;
        files[`assets/minecraft/textures/blocks/glass_${c === 'light_gray' ? 'silver' : c}.png`] = png;
      }
      return files;
    },
  },
];

async function installOwnPack(gameDir, packId) {
  const pack = OWN_PACKS.find((p) => p.id === packId);
  if (!pack) throw new Error('Пак не найден');
  const dir = path.join(gameDir, 'resourcepacks', pack.name);
  await fsp.rm(dir, { recursive: true, force: true });
  await writeFiles(dir, pack.build());
  await enableResourcePack(gameDir, pack.name);
  return pack.name;
}

// ───────────── options.txt ─────────────

async function readOptions(gameDir) {
  try { return (await fsp.readFile(path.join(gameDir, 'options.txt'), 'utf8')).split(/\r?\n/); } catch { return []; }
}

/** Добавляет пак в список включённых. name — имя папки/файла в resourcepacks. */
async function enableResourcePack(gameDir, name, { first = false } = {}) {
  const lines = await readOptions(gameDir);
  const idx = lines.findIndex((l) => l.startsWith('resourcePacks:'));
  let list = ['vanilla'];
  if (idx >= 0) {
    try { list = JSON.parse(lines[idx].slice('resourcePacks:'.length)); } catch { /* оставим по умолчанию */ }
  }
  const entry = `file/${name}`;
  list = list.filter((x) => x !== entry && x !== name);
  // В списке Minecraft последний пак — самый приоритетный
  if (first) list.splice(list.indexOf('vanilla') + 1, 0, entry);
  else list.push(entry);
  const line = `resourcePacks:${JSON.stringify(list)}`;
  if (idx >= 0) lines[idx] = line; else lines.push(line);
  await fsp.mkdir(gameDir, { recursive: true });
  await fsp.writeFile(path.join(gameDir, 'options.txt'), lines.filter((l, i) => l || i < lines.length - 1).join('\n') + '\n');
}

/** Включает шейдер в Iris. */
async function enableShader(gameDir, file) {
  const cfg = path.join(gameDir, 'config', 'iris.properties');
  let text = '';
  try { text = await fsp.readFile(cfg, 'utf8'); } catch { /* новый файл */ }
  const props = Object.fromEntries(text.split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  props.shaderPack = file;
  props.enableShaders = 'true';
  await fsp.mkdir(path.dirname(cfg), { recursive: true });
  await fsp.writeFile(cfg, Object.entries(props).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
}

// ───────────── Офлайн-скин ─────────────

const DEFAULT_SKINS = ['alex', 'ari', 'efe', 'kai', 'makena', 'noor', 'steve', 'sunny', 'zuri'];

/**
 * В офлайне игра даёт игроку стандартный скин. Пак Rionina Skin подменяет
 * все стандартные скины вашим — и в одиночной игре вы видите свой скин.
 */
async function writeSkinPack(gameDir, pngBuffer) {
  const name = 'Rionina Skin';
  const dir = path.join(gameDir, 'resourcepacks', name);
  await fsp.rm(dir, { recursive: true, force: true });
  const files = { 'pack.mcmeta': PACK_META('§dRionina Skin §7— ваш скин') };
  for (const s of DEFAULT_SKINS) {
    files[`assets/minecraft/textures/entity/player/wide/${s}.png`] = pngBuffer;
    files[`assets/minecraft/textures/entity/player/slim/${s}.png`] = pngBuffer;
  }
  files['assets/minecraft/textures/entity/steve.png'] = pngBuffer;
  files['assets/minecraft/textures/entity/alex.png'] = pngBuffer;
  files['assets/minecraft/textures/mob/char.png'] = pngBuffer; // очень старые версии
  await writeFiles(dir, files);
  await enableResourcePack(gameDir, name);
}

async function removeSkinPack(gameDir) {
  await fsp.rm(path.join(gameDir, 'resourcepacks', 'Rionina Skin'), { recursive: true, force: true });
}

module.exports = {
  OWN_PACKS: OWN_PACKS.map(({ id, name, description }) => ({ id, name, description })),
  installOwnPack, enableResourcePack, enableShader, writeSkinPack, removeSkinPack,
};
