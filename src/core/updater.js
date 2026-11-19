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
    return { version: latest.version, notes: latest.notes || [], date: latest.date, full: latest.electron !== this.electron, mandatory: !!latest.mandatory };
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
  /** Сценарий PowerShell, который подменяет файлы после закрытия лаунчера. */
  script() {
    const r = this.ready;
    const q = (p) => `'${String(p).replace(/'/g, "''")}'`; // путь в одинарных кавычках PowerShell
    const appDir = path.dirname(this.exe);
    const asar = path.join(appDir, 'resources', 'app.asar');
    const unpacked = path.join(path.dirname(r.file), 'unpacked');
    const log = path.join(os.tmpdir(), 'rionina-update.log');
    // Повторяем попытки: Windows может ещё секунду держать файлы закрывшегося лаунчера
    const retry = (cmd) => `$ok=$false; for($i=0; $i -lt 30 -and -not $ok; $i++){ try { ${cmd}; $ok=$true } catch { Start-Sleep -Milliseconds 500 } }`;
    const lines = [
      `Start-Transcript -LiteralPath ${q(log)} -Force | Out-Null`,
      `Wait-Process -Id ${process.pid} -Timeout 60 -ErrorAction SilentlyContinue`,
      'Start-Sleep -Milliseconds 800',
    ];
    if (r.full) {
      lines.push(
        `Expand-Archive -LiteralPath ${q(r.file)} -DestinationPath ${q(unpacked)} -Force`,
        retry(`Copy-Item -Path (Join-Path ${q(unpacked)} 'Rionina Launcher\\*') -Destination ${q(appDir)} -Recurse -Force -ErrorAction Stop`),
        `Remove-Item -LiteralPath ${q(unpacked)} -Recurse -Force -ErrorAction SilentlyContinue`,
      );
    } else {
      lines.push(retry(`Move-Item -LiteralPath ${q(r.file)} -Destination ${q(asar)} -Force -ErrorAction Stop`));
    }
    lines.push(`Start-Process -FilePath ${q(this.exe)}`, 'Stop-Transcript | Out-Null');
    return lines.join('\n');
  }

  /** Закрывает лаунчер, подменяет файлы и запускает новую версию. */
  apply(quit) {
    if (!this.ready) throw new Error('Обновление ещё не скачано');
    // -EncodedCommand (UTF-16) — чтобы русские буквы в путях (C:\Users\Алексей\…) не ломались
    const encoded = Buffer.from(this.script(), 'utf16le').toString('base64');
    spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
      { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    quit();
  }
}

module.exports = { Updater, newer };
