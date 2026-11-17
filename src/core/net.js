// Сетевые утилиты: JSON, загрузка файлов с проверкой SHA1, пул параллельных задач.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const UA = 'RioninaLauncher/1.0';

async function fetchJson(url, { retries = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await sleep(500 * (i + 1));
    }
  }
  throw lastErr;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function sha1File(file) {
  const hash = crypto.createHash('sha1');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

async function fileOk(file, sha1, size) {
  try {
    const st = await fsp.stat(file);
    if (size != null && st.size !== size) return false;
    if (!sha1) return st.size > 0;
    return (await sha1File(file)) === sha1;
  } catch {
    return false;
  }
}

/**
 * Скачивает файл, если его нет или контрольная сумма не совпадает.
 * onBytes(n) вызывается по мере загрузки — для прогресс-бара.
 */
async function download(url, dest, { sha1, size, onBytes, retries = 4 } = {}) {
  if (await fileOk(dest, sha1, size)) {
    if (onBytes && size) onBytes(size);
    return false;
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  let lastErr;
  for (let i = 0; i < retries; i++) {
    const tmp = `${dest}.part`;
    let counted = 0;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} — ${url}`);
      const src = Readable.fromWeb(res.body);
      if (onBytes) src.on('data', (c) => { counted += c.length; onBytes(c.length); });
      await pipeline(src, fs.createWriteStream(tmp));
      if (sha1 && (await sha1File(tmp)) !== sha1) throw new Error(`SHA1 не совпадает: ${path.basename(dest)}`);
      await fsp.rename(tmp, dest);
      return true;
    } catch (e) {
      lastErr = e;
      if (onBytes && counted) onBytes(-counted); // откатываем прогресс при повторе
      await fsp.rm(tmp, { force: true });
      await sleep(700 * (i + 1));
    }
  }
  throw lastErr;
}

/** Выполняет задачи с ограничением параллельности. */
async function pool(items, limit, worker) {
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

module.exports = { fetchJson, download, pool, fileOk, sleep };
