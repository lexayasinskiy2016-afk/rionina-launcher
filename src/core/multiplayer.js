// Игра с друзьями «как в Роблоксе»: мир открывается через e4mc (без настройки роутера),
// адрес публикуется друзьям, а их лаунчер сам ставит нужную версию и подключается.
const path = require('path');
const modrinth = require('./modrinth');

const MODS = {
  fabricApi: 'P7dR8mSH',
  e4mc: 'qANg5Jrr', // открывает мир по сети для всех
  offlineLan: 'pimmstPB', // позволяет зайти друзьям с аккаунтами Rionina (без лицензии)
};
// Pro: моды на производительность (больше FPS, быстрее загрузка, меньше памяти)
const PERF_MODS = { sodium: 'AANobbMI', lithium: 'gvQqBUqZ', ferritecore: 'uXXizFIs', immediatelyfast: '5ZwdcRci', modernfix: 'nmDcB62a' };
const SERVICE_MODS = new Set(Object.values(MODS));

// Выданный адрес вида word-word.us.e4mc.link (служебные broker./ingress. — одно слово, их пропускаем)
const E4MC_RE = /\b([a-z0-9-]+\.[a-z0-9-]+(?:\.[a-z0-9-]+)*\.e4mc\.link)\b/i;

/** Находит или создаёт сборку Fabric для версии игры и ставит её. */
async function ensureFabricBuild(mc, gameVersion, onProgress) {
  const installed = await mc.listInstalled();
  let build = installed.find((v) => v.loader === 'fabric' && v.gameVersion === gameVersion);
  if (!build) {
    const id = await modrinth.createFabricProfile(path.join(mc.root, 'versions'), gameVersion);
    build = { id };
  }
  if (!(await mc.isInstalled(build.id))) await mc.install(build.id, onProgress);
  return build.id;
}

async function installMods(mc, versionId, gameVersion, ids, { optional = false } = {}) {
  const gameDir = await mc.gameDir(versionId);
  const done = [];
  for (const id of ids) {
    try {
      if (await modrinth.hasProject(path.join(gameDir, 'mods'), id)) continue;
      await modrinth.installProject({ projectId: id, type: 'mod', gameVersion, gameDir });
      done.push(id);
    } catch (e) {
      if (!optional) throw e;
    }
  }
  return done;
}

/** Готовит сборку для хоста: Fabric + Fabric API + e4mc + OfflineLAN. */
async function prepareHost(mc, gameVersion, { pro } = {}, onProgress) {
  const versionId = await ensureFabricBuild(mc, gameVersion, onProgress);
  onProgress?.({ stage: 'Ставим моды для игры с друзьями', done: 0, total: 1 });
  await installMods(mc, versionId, gameVersion, [MODS.fabricApi, MODS.e4mc]);
  await installMods(mc, versionId, gameVersion, [MODS.offlineLan], { optional: true });
  if (pro) await installMods(mc, versionId, gameVersion, Object.values(PERF_MODS), { optional: true });
  return versionId;
}

/** Список модов сборки (id проектов Modrinth) — чтобы друзья поставили такие же. */
async function modList(mc, versionId) {
  const gameDir = await mc.gameDir(versionId);
  const list = await modrinth.listInstalled(gameDir, 'mod');
  return list.filter((m) => m.enabled && m.projectId && !SERVICE_MODS.has(m.projectId)).map((m) => m.projectId);
}

/** Готовит игру у друга: та же версия и те же моды. Возвращает id версии для запуска. */
async function prepareJoin(mc, shared, { pro } = {}, onProgress) {
  if (shared.loader !== 'fabric' && !shared.mods?.length) {
    if (!(await mc.isInstalled(shared.gameVersion))) await mc.install(shared.gameVersion, onProgress);
    return shared.gameVersion;
  }
  const versionId = await ensureFabricBuild(mc, shared.gameVersion, onProgress);
  await installMods(mc, versionId, shared.gameVersion, [MODS.fabricApi]);
  await installMods(mc, versionId, shared.gameVersion, shared.mods || [], { optional: true });
  if (pro) await installMods(mc, versionId, shared.gameVersion, Object.values(PERF_MODS), { optional: true });
  return versionId;
}

/** Ставит Pro-ускорение в сборку Fabric. */
async function boostBuild(mc, versionId) {
  const v = (await mc.listInstalled()).find((x) => x.id === versionId);
  if (!v || v.loader !== 'fabric') throw new Error('Ускорение работает в сборках Fabric');
  return installMods(mc, versionId, v.gameVersion, [MODS.fabricApi, ...Object.values(PERF_MODS)], { optional: true });
}

function findAddress(line) {
  const m = E4MC_RE.exec(line);
  return m ? m[1].toLowerCase() : null;
}

module.exports = { prepareHost, prepareJoin, modList, boostBuild, findAddress, ensureFabricBuild, PERF_MODS, MODS };
