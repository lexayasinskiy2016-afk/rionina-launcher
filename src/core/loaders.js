// Forge и NeoForge: ставим через их официальные установщики в «тихом» режиме.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const { fetchJson, download } = require('./net');
const { ensureJava } = require('./java');

const FORGE_PROMOS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge';
const NEO_LIST = 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge';
const NEO_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge';

const cmpVer = (a, b) => {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0), pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
  return 0;
};

/** Forge: [{ gameVersion, version }] — рекомендованная (или последняя) версия для каждой Minecraft 1.13+ */
async function forgeVersions() {
  const { promos } = await fetchJson(FORGE_PROMOS);
  const byMc = {};
  for (const [key, ver] of Object.entries(promos)) {
    const [mc, kind] = key.split('-');
    const minor = Number(mc.split('.')[1]);
    if (!(minor >= 13)) continue; // у старых Forge нет тихой установки
    if (!byMc[mc] || kind === 'recommended') byMc[mc] = ver;
  }
  return Object.entries(byMc).map(([gameVersion, version]) => ({ gameVersion, version })).sort((a, b) => cmpVer(a.gameVersion, b.gameVersion));
}

/** Версия NeoForge → версия Minecraft: 21.1.77 → 1.21.1, 20.4.237 → 1.20.4, 21.0.x → 1.21, 26.1.0.5 → 26.1 */
function neoToMc(v) {
  const p = v.split('-')[0].split('.');
  if (Number(p[0]) >= 25) {
    const mc = p.slice(0, -1);
    while (mc.length > 2 && mc[mc.length - 1] === '0') mc.pop();
    return mc.join('.');
  }
  return `1.${p[0]}${p[1] && p[1] !== '0' ? `.${p[1]}` : ''}`;
}

async function neoforgeVersions() {
  const { versions } = await fetchJson(NEO_LIST);
  const byMc = {};
  for (const v of versions) {
    if (/beta|alpha/i.test(v) || v.startsWith('0.')) continue;
    const mc = neoToMc(v);
    if (!byMc[mc] || cmpVer(v, byMc[mc]) < 0) byMc[mc] = v;
  }
  return Object.entries(byMc).map(([gameVersion, version]) => ({ gameVersion, version })).sort((a, b) => cmpVer(a.gameVersion, b.gameVersion));
}

function run(java, args, cwd, onLine) {
  return new Promise((resolve) => {
    const p = spawn(java, args, { cwd, windowsHide: true });
    let out = '';
    const on = (d) => { const s = d.toString(); out += s; s.split(/\r?\n/).forEach((l) => l.trim() && onLine?.(l.trim())); };
    p.stdout.on('data', on);
    p.stderr.on('data', on);
    p.on('close', (code) => resolve({ code, out }));
    p.on('error', (e) => resolve({ code: -1, out: e.message }));
  });
}

/**
 * Ставит Forge/NeoForge поверх версии Minecraft. Возвращает id новой версии
 * (например «1.20.1-forge-47.3.0» или «neoforge-21.1.77»).
 */
async function installLoader(mc, loader, gameVersion, onProgress = () => {}) {
  const list = loader === 'forge' ? await forgeVersions() : await neoforgeVersions();
  const entry = list.find((x) => x.gameVersion === gameVersion);
  if (!entry) throw new Error(`${loader === 'forge' ? 'Forge' : 'NeoForge'} нет для Minecraft ${gameVersion}`);

  // 1. Обычная версия Minecraft под загрузчиком
  if (!(await mc.isInstalled(gameVersion))) await mc.install(gameVersion, onProgress);
  const base = await mc.readVersionJson(gameVersion);
  const java = await ensureJava(mc.root, mc.javaComponent(base), onProgress);

  // 2. Официальный установщик
  const full = loader === 'forge' ? `${gameVersion}-${entry.version}` : entry.version;
  const url = loader === 'forge'
    ? `${FORGE_MAVEN}/${full}/forge-${full}-installer.jar`
    : `${NEO_MAVEN}/${full}/neoforge-${full}-installer.jar`;
  const jar = path.join(mc.root, 'installers', path.basename(url));
  onProgress({ stage: `Загрузка установщика ${loader === 'forge' ? 'Forge' : 'NeoForge'}`, done: 0, total: 1 });
  await download(url, jar);

  // id будущей версии — из install_profile.json установщика
  let newId = null;
  try {
    const prof = JSON.parse(new AdmZip(jar).readAsText('install_profile.json'));
    newId = prof.version || prof.install?.target || null;
  } catch { /* узнаем по папке */ }

  // Установщику нужен файл профилей официального лаунчера
  const profiles = path.join(mc.root, 'launcher_profiles.json');
  if (!fs.existsSync(profiles)) await fsp.writeFile(profiles, JSON.stringify({ profiles: {}, settings: {}, version: 3 }));

  const before = new Set(await fsp.readdir(path.join(mc.root, 'versions')).catch(() => []));
  let step = 0;
  const onLine = () => onProgress({ stage: `Установка ${loader === 'forge' ? 'Forge' : 'NeoForge'} ${entry.version}`, done: Math.min(95, ++step / 6), total: 100 });
  let res = await run(java, ['-jar', jar, '--installClient', mc.root], mc.root, onLine);
  if (res.code !== 0 && /unrecognized|not a recognized|UnrecognizedOption/i.test(res.out)) {
    res = await run(java, ['-jar', jar, '--install-client', mc.root], mc.root, onLine);
  }
  if (res.code !== 0) throw new Error(`Установщик ${loader === 'forge' ? 'Forge' : 'NeoForge'} завершился с ошибкой. ${res.out.split('\n').slice(-3).join(' ').slice(0, 200)}`);

  if (!newId || !fs.existsSync(path.join(mc.root, 'versions', newId))) {
    const after = await fsp.readdir(path.join(mc.root, 'versions'));
    newId = after.find((d) => !before.has(d) && /forge/i.test(d)) || newId;
  }
  if (!newId) throw new Error('Не удалось найти установленную версию загрузчика');

  // 3. Отмечаем как установленную (библиотеки, которых не хватает, докачаются)
  await mc.install(newId, onProgress);
  return newId;
}

module.exports = { forgeVersions, neoforgeVersions, installLoader, neoToMc };
