// Моды, шейдеры и ресурс-паки с Modrinth (modrinth.com) + установка Fabric.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { download } = require('./net');

const API = 'https://api.modrinth.com/v2';
const FABRIC = 'https://meta.fabricmc.net/v2';
const UA = 'RioninaLauncher/1.2 (minecraft launcher)';

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Modrinth: HTTP ${res.status}`);
  return res.json();
}

const TYPE_DIR = { mod: 'mods', shader: 'shaderpacks', resourcepack: 'resourcepacks' };

/** Поиск. type: mod | shader | resourcepack */
async function search({ type, query = '', gameVersion, loader = 'fabric', offset = 0, limit = 24, sort = 'downloads' }) {
  const facets = [[`project_type:${type}`]];
  if (gameVersion) facets.push([`versions:${gameVersion}`]);
  if (type === 'mod') facets.push([`categories:${loader || 'fabric'}`]);
  const url = `${API}/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(JSON.stringify(facets))}&index=${sort}&offset=${offset}&limit=${limit}`;
  const data = await get(url);
  return {
    total: data.total_hits,
    hits: data.hits.map((h) => ({
      id: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      author: h.author,
      icon: h.icon_url,
      downloads: h.downloads,
      gallery: h.featured_gallery || h.gallery?.[0] || null,
      categories: h.display_categories || h.categories,
    })),
  };
}

async function bestVersion(projectId, type, gameVersion, loader = 'fabric') {
  const loaders = type === 'mod' ? [loader || 'fabric'] : type === 'shader' ? ['iris', 'optifine'] : ['minecraft'];
  const params = `loaders=${encodeURIComponent(JSON.stringify(loaders))}${gameVersion ? `&game_versions=${encodeURIComponent(JSON.stringify([gameVersion]))}` : ''}`;
  let list = await get(`${API}/project/${projectId}/version?${params}`);
  if (!list.length && type !== 'mod' && gameVersion) list = await get(`${API}/project/${projectId}/version?loaders=${encodeURIComponent(JSON.stringify(loaders))}`);
  if (!list.length) throw new Error(`Нет версии для Minecraft ${gameVersion || ''}`);
  return list.find((v) => v.version_type === 'release') || list[0];
}

/**
 * Устанавливает проект и (для модов) все обязательные зависимости.
 * Возвращает список установленных файлов.
 */
async function installProject({ projectId, type, gameVersion, gameDir, loader = 'fabric' }, seen = new Set()) {
  if (seen.has(projectId)) return [];
  seen.add(projectId);
  const ver = await bestVersion(projectId, type, gameVersion, loader);
  const file = ver.files.find((f) => f.primary) || ver.files[0];
  const dir = path.join(gameDir, TYPE_DIR[type]);
  await fsp.mkdir(dir, { recursive: true });
  await download(file.url, path.join(dir, file.filename), { sha1: file.hashes?.sha1, size: file.size });
  await writeMeta(dir, file.filename, { projectId: ver.project_id, versionId: ver.id, name: ver.name });
  const out = [file.filename];
  if (type === 'mod') {
    for (const dep of ver.dependencies || []) {
      if (dep.dependency_type !== 'required' || !dep.project_id) continue;
      if (await hasProject(dir, dep.project_id)) continue;
      out.push(...(await installProject({ projectId: dep.project_id, type: 'mod', gameVersion, gameDir, loader }, seen)));
    }
  }
  return out;
}

// slug → настоящий id проекта
const idCache = new Map();
async function projectIdOf(slugOrId) {
  if (!idCache.has(slugOrId)) idCache.set(slugOrId, (await get(`${API}/project/${encodeURIComponent(slugOrId)}`)).id);
  return idCache.get(slugOrId);
}

// Небольшая база: какой файл к какому проекту относится
async function readMeta(dir) {
  try { return JSON.parse(await fsp.readFile(path.join(dir, '.rionina.json'), 'utf8')); } catch { return {}; }
}
async function writeMeta(dir, filename, info) {
  const meta = await readMeta(dir);
  for (const [f, m] of Object.entries(meta)) if (m.projectId === info.projectId && f !== filename) {
    delete meta[f];
    await fsp.rm(path.join(dir, f), { force: true, recursive: true }); // старая версия
  }
  meta[filename] = info;
  await fsp.writeFile(path.join(dir, '.rionina.json'), JSON.stringify(meta, null, 2));
}
async function hasProject(dir, projectId) {
  const meta = await readMeta(dir);
  return Object.entries(meta).some(([f, m]) => m.projectId === projectId && fs.existsSync(path.join(dir, f)));
}

async function listInstalled(gameDir, type) {
  const dir = path.join(gameDir, TYPE_DIR[type]);
  let files = [];
  try { files = await fsp.readdir(dir); } catch { return []; }
  const meta = await readMeta(dir);
  return files
    .filter((f) => !f.startsWith('.') && (type !== 'mod' || f.endsWith('.jar') || f.endsWith('.jar.disabled')))
    .map((f) => ({ file: f, projectId: meta[f]?.projectId || null, enabled: !f.endsWith('.disabled') }));
}

async function removeFile(gameDir, type, file) {
  const dir = path.join(gameDir, TYPE_DIR[type]);
  if (file.includes('/') || file.includes('\\') || file.startsWith('.')) throw new Error('Некорректное имя');
  await fsp.rm(path.join(dir, file), { force: true, recursive: true });
  const meta = await readMeta(dir);
  delete meta[file];
  await fsp.writeFile(path.join(dir, '.rionina.json'), JSON.stringify(meta, null, 2)).catch(() => {});
}

// ───────────── Fabric ─────────────

async function fabricGameVersions() {
  const list = await get(`${FABRIC}/versions/game`);
  return list.filter((v) => v.stable).map((v) => v.version);
}

/** Создаёт версию «fabric-loader-x-<mc>» в папке versions и возвращает её id. */
async function createFabricProfile(versionsDir, gameVersion) {
  const loaders = await get(`${FABRIC}/versions/loader/${encodeURIComponent(gameVersion)}`);
  if (!loaders.length) throw new Error(`Fabric не поддерживает ${gameVersion}`);
  const loader = (loaders.find((l) => l.loader.stable) || loaders[0]).loader.version;
  const json = await get(`${FABRIC}/versions/loader/${encodeURIComponent(gameVersion)}/${loader}/profile/json`);
  const dir = path.join(versionsDir, json.id);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, `${json.id}.json`), JSON.stringify(json, null, 2));
  return json.id;
}

module.exports = { search, installProject, listInstalled, removeFile, fabricGameVersions, createFabricProfile, hasProject, projectIdOf, TYPE_DIR };
