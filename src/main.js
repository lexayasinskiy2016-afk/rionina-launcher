// Загрузчик Rionina Launcher.
// Обновления скачиваются в папку данных лаунчера (updates/<версия>.asar). При запуске
// загрузчик выбирает самую новую версию: скачанную или встроенную. Никаких скриптов
// и замены файлов программы — антивирус и права администратора не мешают.
const path = require('path');
const fs = require('original-fs');
const { app } = require('electron');

const BUNDLED = require('../package.json').version;
const newer = (a, b) => {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

function pickApp() {
  try {
    const dir = path.join(app.getPath('userData'), 'updates');
    const cur = JSON.parse(fs.readFileSync(path.join(dir, 'current.json'), 'utf8'));
    const entry = path.join(cur.file, 'src', 'app-main.js');
    // Скачанная версия должна быть новее встроенной и для того же Electron
    if (newer(cur.version, BUNDLED) && cur.electron === process.versions.electron && fs.existsSync(cur.file)) return entry;
  } catch { /* обновлений ещё не скачивали */ }
  return path.join(__dirname, 'app-main.js');
}

const entry = pickApp();
try {
  require(entry);
} catch (e) {
  // Скачанная версия сломалась — запускаем встроенную
  if (entry !== path.join(__dirname, 'app-main.js')) {
    console.error('Не удалось запустить обновление:', e);
    require('./app-main.js');
  } else throw e;
}
