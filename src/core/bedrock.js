// Minecraft: Bedrock Edition на ПК. Bedrock продаётся через Microsoft Store,
// поэтому лаунчер определяет, установлен ли он, запускает его или открывает страницу установки.
const { exec } = require('child_process');
const { shell } = require('electron');

const STORE_PRODUCT = '9NBLGGH2JHXJ';

function status() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve({ supported: false, installed: false });
    exec(
      'powershell -NoProfile -Command "(Get-AppxPackage -Name Microsoft.MinecraftUWP).Version"',
      { windowsHide: true, timeout: 15000 },
      (err, stdout) => {
        const version = (stdout || '').trim();
        resolve({ supported: true, installed: !err && !!version, version: version || null });
      }
    );
  });
}

async function launch() {
  const s = await status();
  if (!s.supported) throw new Error('Bedrock Edition на компьютере работает только в Windows 10/11');
  if (s.installed) await shell.openExternal('minecraft:');
  else await shell.openExternal(`ms-windows-store://pdp/?productid=${STORE_PRODUCT}`);
  return s;
}

async function install() {
  await shell.openExternal(`ms-windows-store://pdp/?productid=${STORE_PRODUCT}`);
}

module.exports = { status, launch, install };
