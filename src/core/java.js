// Автоматическая установка Java — те же сборки, что использует официальный лаунчер Mojang.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { fetchJson, download, pool } = require('./net');
const { javaPlatformKeys } = require('./platform');

const RUNTIME_INDEX =
  'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';

let indexCache = null;

function javaBinary(home) {
  if (process.platform === 'win32') return path.join(home, 'bin', 'javaw.exe');
  if (process.platform === 'darwin') return path.join(home, 'jre.bundle', 'Contents', 'Home', 'bin', 'java');
  return path.join(home, 'bin', 'java');
}

/**
 * Гарантирует наличие нужной Java и возвращает путь к исполняемому файлу.
 * component — например "java-runtime-delta" (Java 21) или "jre-legacy" (Java 8).
 */
async function ensureJava(root, component, onProgress) {
  indexCache = indexCache || (await fetchJson(RUNTIME_INDEX));

  let platform = null;
  let entry = null;
  for (const key of javaPlatformKeys()) {
    const list = indexCache[key] && indexCache[key][component];
    if (list && list.length) { platform = key; entry = list[0]; break; }
  }
  if (!entry) throw new Error(`Java «${component}» недоступна для этой системы`);

  const home = path.join(root, 'runtime', component, platform);
  const marker = path.join(home, '.rionina-version');
  const bin = javaBinary(home);
  try {
    if ((await fsp.readFile(marker, 'utf8')) === entry.version.name && fs.existsSync(bin)) return bin;
  } catch { /* ещё не установлена */ }

  const manifest = await fetchJson(entry.manifest.url);
  const files = Object.entries(manifest.files);
  const toDownload = files.filter(([, f]) => f.type === 'file');
  const total = toDownload.reduce((s, [, f]) => s + f.downloads.raw.size, 0);
  let done = 0;
  const report = (n) => {
    done += n;
    onProgress?.({ stage: `Установка Java ${entry.version.name}`, done, total });
  };

  for (const [rel, f] of files) if (f.type === 'directory') await fsp.mkdir(path.join(home, rel), { recursive: true });

  await pool(toDownload, 16, async ([rel, f]) => {
    const dest = path.join(home, rel);
    await download(f.downloads.raw.url, dest, { sha1: f.downloads.raw.sha1, size: f.downloads.raw.size, onBytes: report });
    if (f.executable && process.platform !== 'win32') await fsp.chmod(dest, 0o755);
  });

  if (process.platform !== 'win32') {
    for (const [rel, f] of files) {
      if (f.type !== 'link') continue;
      const dest = path.join(home, rel);
      await fsp.rm(dest, { force: true });
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.symlink(f.target, dest).catch(() => {});
    }
  }

  await fsp.writeFile(marker, entry.version.name);
  return bin;
}

module.exports = { ensureJava };
