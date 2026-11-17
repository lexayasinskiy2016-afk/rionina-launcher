// Список версий, установка и запуск Minecraft: Java Edition (от rd-132211 до последней).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const { fetchJson, download, pool } = require('./net');
const { OS_NAME, ARCH_BITS, CP_SEP, allowed } = require('./platform');
const { ensureJava } = require('./java');

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const RESOURCES_URL = 'https://resources.download.minecraft.net';
const LIBRARIES_URL = 'https://libraries.minecraft.net';
const MARKER = '.rionina-installed';

class Minecraft {
  constructor(root) {
    this.root = root;
    this.manifest = null;
  }

  dirs() {
    const r = this.root;
    return {
      versions: path.join(r, 'versions'),
      libraries: path.join(r, 'libraries'),
      assets: path.join(r, 'assets'),
    };
  }

  // ───────────── Версии ─────────────

  async getManifest(force = false) {
    const cacheFile = path.join(this.root, 'version_manifest_v2.json');
    if (this.manifest && !force) return this.manifest;
    try {
      this.manifest = await fetchJson(MANIFEST_URL);
      await fsp.mkdir(this.root, { recursive: true });
      await fsp.writeFile(cacheFile, JSON.stringify(this.manifest));
    } catch (e) {
      // Нет интернета — показываем последний сохранённый список
      if (fs.existsSync(cacheFile)) this.manifest = JSON.parse(await fsp.readFile(cacheFile, 'utf8'));
      else throw e;
    }
    return this.manifest;
  }

  async listInstalled() {
    const { versions } = this.dirs();
    let names = [];
    try { names = await fsp.readdir(versions); } catch { return []; }
    const out = [];
    for (const id of names) {
      const dir = path.join(versions, id);
      if (!fs.existsSync(path.join(dir, MARKER))) continue;
      try {
        const json = JSON.parse(await fsp.readFile(path.join(dir, `${id}.json`), 'utf8'));
        const st = await fsp.stat(path.join(dir, MARKER));
        out.push({ id, type: json.type, releaseTime: json.releaseTime, installedAt: st.mtimeMs });
      } catch { /* повреждённая версия — пропускаем */ }
    }
    return out.sort((a, b) => b.installedAt - a.installedAt);
  }

  async removeVersion(id) {
    await fsp.rm(path.join(this.dirs().versions, id), { recursive: true, force: true });
  }

  async readVersionJson(id) {
    const file = path.join(this.dirs().versions, id, `${id}.json`);
    if (fs.existsSync(file)) return JSON.parse(await fsp.readFile(file, 'utf8'));
    const manifest = await this.getManifest();
    const meta = manifest.versions.find((v) => v.id === id);
    if (!meta) throw new Error(`Версия ${id} не найдена`);
    const json = await fetchJson(meta.url);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, JSON.stringify(json, null, 2));
    return json;
  }

  // ───────────── Установка ─────────────

  nativeClassifier(lib) {
    if (!lib.natives || !lib.natives[OS_NAME]) return null;
    return lib.natives[OS_NAME].replace('${arch}', ARCH_BITS);
  }

  libraryPath(lib) {
    if (lib.downloads?.artifact?.path) return path.join(this.dirs().libraries, lib.downloads.artifact.path);
    // Старый формат без downloads: group:artifact:version
    const [group, name, version] = lib.name.split(':');
    return path.join(this.dirs().libraries, ...group.split('.'), name, version, `${name}-${version}.jar`);
  }

  async install(id, onProgress = () => {}) {
    const { versions, libraries, assets } = this.dirs();
    const vdir = path.join(versions, id);
    onProgress({ stage: 'Получение информации о версии', done: 0, total: 1 });
    const json = await this.readVersionJson(id);

    // Собираем список всего, что нужно скачать
    const jobs = [];
    jobs.push({ url: json.downloads.client.url, dest: path.join(vdir, `${id}.jar`), sha1: json.downloads.client.sha1, size: json.downloads.client.size });

    const nativeJars = [];
    for (const lib of json.libraries) {
      if (!allowed(lib.rules)) continue;
      const art = lib.downloads?.artifact;
      if (art && art.url) jobs.push({ url: art.url, dest: path.join(libraries, art.path), sha1: art.sha1, size: art.size });
      else if (!lib.downloads && !lib.natives) {
        const dest = this.libraryPath(lib);
        jobs.push({ url: `${lib.url || LIBRARIES_URL + '/'}${path.relative(libraries, dest).split(path.sep).join('/')}`, dest });
      }
      const cls = this.nativeClassifier(lib);
      const nat = cls && lib.downloads?.classifiers?.[cls];
      if (nat) {
        const dest = path.join(libraries, nat.path);
        jobs.push({ url: nat.url, dest, sha1: nat.sha1, size: nat.size });
        nativeJars.push({ file: dest, exclude: lib.extract?.exclude || [] });
      }
    }

    if (json.logging?.client?.file) {
      const f = json.logging.client.file;
      jobs.push({ url: f.url, dest: path.join(assets, 'log_configs', f.id), sha1: f.sha1, size: f.size });
    }

    // Индекс ассетов
    const ai = json.assetIndex;
    const indexFile = path.join(assets, 'indexes', `${ai.id}.json`);
    await download(ai.url, indexFile, { sha1: ai.sha1, size: ai.size });
    const index = JSON.parse(await fsp.readFile(indexFile, 'utf8'));
    const objects = Object.entries(index.objects);
    for (const [, o] of objects) {
      const sub = o.hash.slice(0, 2);
      jobs.push({ url: `${RESOURCES_URL}/${sub}/${o.hash}`, dest: path.join(assets, 'objects', sub, o.hash), sha1: o.hash, size: o.size });
    }

    // Одинаковые файлы (например, повторяющиеся ассеты) качаем один раз
    const unique = [...new Map(jobs.map((j) => [j.dest, j])).values()];
    const total = unique.reduce((s, j) => s + (j.size || 0), 0);
    let done = 0;
    const tick = (n) => { done += n; onProgress({ stage: `Загрузка Minecraft ${id}`, done, total }); };
    await pool(unique, 24, (j) => download(j.url, j.dest, { sha1: j.sha1, size: j.size, onBytes: tick }));

    // Старые версии: копируем ассеты в "виртуальную" папку / resources
    if (index.virtual || index.map_to_resources) {
      onProgress({ stage: 'Подготовка старых ресурсов', done: 0, total: objects.length });
      const target = index.map_to_resources ? path.join(this.root, 'resources') : path.join(assets, 'virtual', ai.id);
      let i = 0;
      for (const [name, o] of objects) {
        const dest = path.join(target, name);
        if (!fs.existsSync(dest)) {
          await fsp.mkdir(path.dirname(dest), { recursive: true });
          await fsp.copyFile(path.join(assets, 'objects', o.hash.slice(0, 2), o.hash), dest);
        }
        if (++i % 50 === 0) onProgress({ stage: 'Подготовка старых ресурсов', done: i, total: objects.length });
      }
    }

    // Нативные библиотеки (LWJGL 2 и т. п.)
    const nativesDir = path.join(vdir, 'natives');
    await fsp.mkdir(nativesDir, { recursive: true });
    for (const n of nativeJars) {
      const zip = new AdmZip(n.file);
      for (const e of zip.getEntries()) {
        if (e.isDirectory || n.exclude.some((x) => e.entryName.startsWith(x))) continue;
        zip.extractEntryTo(e, nativesDir, true, true);
      }
    }

    // Java нужной версии
    await ensureJava(this.root, this.javaComponent(json), onProgress);

    await fsp.writeFile(path.join(vdir, MARKER), new Date().toISOString());
    onProgress({ stage: 'Готово', done: 1, total: 1 });
  }

  javaComponent(json) {
    return json.javaVersion?.component || 'jre-legacy';
  }

  // ───────────── Запуск ─────────────

  async launch(id, account, settings, { onLog, onExit } = {}) {
    const { versions, libraries, assets } = this.dirs();
    const vdir = path.join(versions, id);
    const json = JSON.parse(await fsp.readFile(path.join(vdir, `${id}.json`), 'utf8'));
    const java = await ensureJava(this.root, this.javaComponent(json));

    const cp = [];
    const seen = new Set();
    for (const lib of json.libraries) {
      if (!allowed(lib.rules)) continue;
      if (!lib.downloads?.artifact && lib.natives) continue; // только нативы
      const p = this.libraryPath(lib);
      if (seen.has(p)) continue;
      seen.add(p);
      cp.push(p);
    }
    cp.push(path.join(vdir, `${id}.jar`));

    const ai = json.assetIndex;
    const vars = {
      auth_player_name: account.name,
      version_name: id,
      game_directory: this.root,
      assets_root: assets,
      game_assets: ai.id === 'pre-1.6' ? path.join(this.root, 'resources') : path.join(assets, 'virtual', ai.id),
      assets_index_name: ai.id,
      auth_uuid: account.uuid.replace(/-/g, ''),
      auth_access_token: account.accessToken,
      auth_session: `token:${account.accessToken}:${account.uuid.replace(/-/g, '')}`,
      auth_xuid: account.xuid || '0',
      clientid: account.clientId || '0',
      user_type: account.type === 'microsoft' ? 'msa' : 'legacy',
      user_properties: '{}',
      version_type: json.type,
      natives_directory: path.join(vdir, 'natives'),
      launcher_name: 'rionina-launcher',
      launcher_version: '1.0.0',
      classpath: cp.join(CP_SEP),
      classpath_separator: CP_SEP,
      library_directory: libraries,
    };
    const sub = (s) => s.replace(/\$\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    const expand = (list) => {
      const out = [];
      for (const a of list || []) {
        if (typeof a === 'string') { out.push(sub(a)); continue; }
        if (!allowed(a.rules)) continue;
        for (const v of [].concat(a.value)) out.push(sub(v));
      }
      return out;
    };

    const jvm = [`-Xmx${settings.memory}M`, `-Xms${Math.min(512, settings.memory)}M`];
    if (json.logging?.client) {
      const lc = json.logging.client;
      jvm.push(lc.argument.replace('${path}', path.join(assets, 'log_configs', lc.file.id)));
    }
    if (json.arguments?.jvm) jvm.push(...expand(json.arguments.jvm));
    else {
      if (process.platform === 'darwin') jvm.push('-XstartOnFirstThread');
      jvm.push(`-Djava.library.path=${vars.natives_directory}`, '-cp', vars.classpath);
    }

    const game = json.arguments?.game
      ? expand(json.arguments.game)
      : json.minecraftArguments.split(' ').map(sub);
    if (settings.fullscreen) game.push('--fullscreen');

    const args = [...jvm, json.mainClass, ...game];
    onLog?.(`[Rionina] ${java} ${json.mainClass} (${id})\n`);
    const child = spawn(java, args, { cwd: this.root, detached: false });
    child.stdout.on('data', (d) => onLog?.(d.toString()));
    child.stderr.on('data', (d) => onLog?.(d.toString()));
    child.on('close', (code) => onExit?.(code));
    child.on('error', (e) => { onLog?.(`[Rionina] ${e.message}\n`); onExit?.(-1); });
    return child;
  }
}

/** UUID офлайн-игрока — так же, как его считает сам Minecraft. */
function offlineUuid(name) {
  const md5 = crypto.createHash('md5').update(`OfflinePlayer:${name}`).digest();
  md5[6] = (md5[6] & 0x0f) | 0x30;
  md5[8] = (md5[8] & 0x3f) | 0x80;
  const h = md5.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

module.exports = { Minecraft, offlineUuid };
