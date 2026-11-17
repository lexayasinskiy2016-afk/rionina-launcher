// Minecraft: Bedrock Edition на ПК (Windows 10/11).
// Установка идёт через встроенный в Windows установщик winget из Microsoft Store —
// игра скачивается в фоне и привязывается к аккаунту Microsoft, вошедшему в Store.
const { exec, spawn } = require('child_process');
const { shell } = require('electron');

const STORE_PRODUCT = '9NBLGGH2JHXJ';
let installing = null;

function status() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve({ supported: false, installed: false });
    exec(
      'powershell -NoProfile -Command "(Get-AppxPackage -Name Microsoft.MinecraftUWP).Version"',
      { windowsHide: true, timeout: 15000 },
      (err, stdout) => {
        const version = (stdout || '').trim();
        resolve({ supported: true, installed: !err && !!version, version: version || null, installing: !!installing });
      }
    );
  });
}

async function launch() {
  const s = await status();
  if (!s.supported) throw new Error('Bedrock Edition на компьютере работает только в Windows 10/11');
  if (s.installed) await shell.openExternal('minecraft:');
  else await install();
  return s;
}

function openStore() {
  return shell.openExternal(`ms-windows-store://pdp/?productid=${STORE_PRODUCT}`);
}

/**
 * Автоматически устанавливает Bedrock. onProgress({ percent, text }).
 * Возвращает { ok: true } или { ok: false, reason }. Если winget недоступен
 * или Store не дал установить (нет покупки) — открывает страницу игры в Store.
 */
function install(onProgress = () => {}) {
  if (process.platform !== 'win32') return Promise.resolve({ ok: false, reason: 'Только Windows' });
  if (installing) return installing;

  installing = new Promise((resolve) => {
    onProgress({ percent: 0, text: 'Подготовка установки Bedrock…' });
    const args = [
      'install', '--id', STORE_PRODUCT, '--source', 'msstore',
      '--accept-package-agreements', '--accept-source-agreements',
      '--silent', '--disable-interactivity',
    ];
    let child;
    try {
      child = spawn('winget', args, { windowsHide: true });
    } catch {
      openStore();
      return resolve({ ok: false, reason: 'winget не найден — открыт Microsoft Store' });
    }
    let out = '';
    const onData = (d) => {
      const s = d.toString();
      out += s;
      const pct = [...s.matchAll(/(\d{1,3})\s*%/g)].pop();
      const mb = [...s.matchAll(/([\d.,]+\s*[MG]B)\s*\/\s*([\d.,]+\s*[MG]B)/g)].pop();
      if (pct) onProgress({ percent: Math.min(100, +pct[1]), text: 'Скачивание Bedrock' });
      else if (mb) onProgress({ percent: null, text: `Скачивание Bedrock · ${mb[1]} из ${mb[2]}` });
      else if (/install/i.test(s)) onProgress({ percent: null, text: 'Установка Bedrock…' });
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', () => {
      openStore();
      resolve({ ok: false, reason: 'winget не найден — открыт Microsoft Store' });
    });
    child.on('close', async (code) => {
      const s = await status();
      if (s.installed) return resolve({ ok: true, version: s.version });
      openStore();
      const noLicense = /licen|purchase|entitle|0x8a15005e|0x803fb005/i.test(out);
      resolve({
        ok: false,
        reason: noLicense
          ? 'На вашем аккаунте Microsoft нет Bedrock — открыта страница покупки в Store'
          : `Не удалось установить автоматически (код ${code}) — открыт Microsoft Store`,
      });
    });
  }).finally(() => { installing = null; });

  return installing;
}

module.exports = { status, launch, install, openStore };
