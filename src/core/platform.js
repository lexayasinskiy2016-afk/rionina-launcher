// Определение ОС и проверка "rules" из JSON-файлов версий Mojang.
const os = require('os');

const OS_NAME = { win32: 'windows', darwin: 'osx', linux: 'linux' }[process.platform] || 'linux';
const ARCH = process.arch; // x64 | arm64 | ia32
const ARCH_BITS = ARCH === 'ia32' ? '32' : '64';
const CP_SEP = process.platform === 'win32' ? ';' : ':';

function ruleMatches(rule) {
  if (rule.features) return false; // demo, custom resolution, quickPlay — не используем
  if (rule.os) {
    if (rule.os.name && rule.os.name !== OS_NAME) return false;
    if (rule.os.arch) {
      if (rule.os.arch === 'x86' && ARCH !== 'ia32') return false;
      if (rule.os.arch === 'arm64' && ARCH !== 'arm64') return false;
    }
    if (rule.os.version) {
      try { if (!new RegExp(rule.os.version).test(os.release())) return false; } catch { /* ignore */ }
    }
  }
  return true;
}

/** Применяет список правил так же, как официальный лаунчер. */
function allowed(rules) {
  if (!rules || !rules.length) return true;
  let result = false;
  for (const r of rules) if (ruleMatches(r)) result = r.action === 'allow';
  return result;
}

/** Ключ платформы для Java-рантаймов Mojang. */
function javaPlatformKeys() {
  if (process.platform === 'win32') {
    return ARCH === 'arm64' ? ['windows-arm64', 'windows-x64'] : ARCH === 'ia32' ? ['windows-x86'] : ['windows-x64'];
  }
  if (process.platform === 'darwin') return ARCH === 'arm64' ? ['mac-os-arm64', 'mac-os'] : ['mac-os'];
  return ARCH === 'ia32' ? ['linux-i386'] : ['linux'];
}

module.exports = { OS_NAME, ARCH, ARCH_BITS, CP_SEP, allowed, javaPlatformKeys };
