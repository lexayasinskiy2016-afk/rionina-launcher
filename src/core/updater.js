// Обновление Rionina Launcher. Новые версии лежат в релизах GitHub:
//   latest.json                 — какая версия последняя и что в ней нового
//   app.asar                    — сам лаунчер (~2 МБ), если Electron не менялся
//   RioninaLauncher-Windows.zip — полная сборка, если поменялся Electron
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { download } = require('./net');

function newer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

async function sha256(file) {
  const h = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}

class Updater {
  constructor({ repo, currentVersion, electronVersion, exePath, isPackaged }) {
    this.repo = repo;
    this.current = currentVersion;
    this.electron = electronVersion;
    this.exe = exePath;
    this.packaged = isPackaged;
    this.latest = null;
    this.ready = null; // подготовленное обновление
  }

  url(name, version) {
    return version
      ? `https://github.com/${this.repo}/releases/download/v${version}/${name}`
      : `https://github.com/${this.repo}/releases/latest/download/${name}`;
  }

  /** Есть ли новая версия? Возвращает { version, notes, date } или null. */
  async check() {
    if (!this.repo) return null;
    const res = await fetch(this.url('latest.json'), { headers: { 'User-Agent': 'RioninaLauncher' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Не удалось проверить обновления (HTTP ${res.status})`);
    const latest = await res.json();
    this.latest = latest;
    if (!newer(latest.version, this.current)) return null;
    return { version: latest.version, notes: latest.notes || [], date: latest.date, full: latest.electron !== this.electron };
  }

  /** Скачивает обновление. onProgress({ done, total }). */
  async download(onProgress) {
    const L = this.latest;
    if (!L) throw new Error('Сначала проверьте обновления');
    if (process.platform !== 'win32' || !this.packaged) throw new Error('Автообновление работает в Windows-версии лаунчера');
    const tmp = path.join(os.tmpdir(), 'rionina-update');
    await fsp.mkdir(tmp, { recursive: true });
    const full = L.electron !== this.electron;
    const item = full ? L.zip : L.asar;
    const file = path.join(tmp, full ? 'update.zip' : 'app-update.bin');
    let done = 0;
    await download(this.url(item.name, L.version), file, {
      size: item.size,
      onBytes: (n) => { done += n; onProgress?.({ done, total: item.size }); },
    });
    if ((await sha256(file)) !== item.sha256) throw new Error('Файл обновления повреждён — попробуйте ещё раз');
    this.ready = { full, file, version: L.version };
    return this.ready;
  }

  /** Закрывает лаунчер, подменяет файлы и запускает новую версию. */
  apply(quit) {
    const r = this.ready;
    if (!r) throw new Error('Обновление ещё не скачано');
    const appDir = path.dirname(this.exe);
    const res = path.join(appDir, 'resources');
    const tmp = path.dirname(r.file);
    const pid = process.pid;
    const lines = [
      '@echo off',
      'chcp 65001 >nul',
      ':wait',
      `tasklist /FI "PID eq ${pid}" 2>nul | find "${pid}" >nul && (timeout /t 1 /nobreak >nul & goto wait)`,
    ];
    if (r.full) {
      lines.push(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '${r.file}' -DestinationPath '${path.join(tmp, 'unpacked')}' -Force"`,
        `robocopy "${path.join(tmp, 'unpacked', 'Rionina Launcher')}" "${appDir}" /E /NFL /NDL /NJH /NJS /NP >nul`,
        `rmdir /S /Q "${path.join(tmp, 'unpacked')}"`,
      );
    } else {
      lines.push(`move /Y "${r.file}" "${path.join(res, 'app.asar')}" >nul`);
    }
    lines.push(`start "" "${this.exe}"`, 'exit');
    const script = path.join(tmp, 'apply-update.cmd');
    fs.writeFileSync(script, lines.join('\r\n'));
    spawn('cmd.exe', ['/c', script], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    quit();
  }
}

module.exports = { Updater, newer };
