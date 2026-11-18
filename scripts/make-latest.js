// Пишет latest.json для автообновления: версия, что нового и контрольные суммы файлов.
//   node scripts/make-latest.js <папка с app.asar и RioninaLauncher-Windows.zip>
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dir = process.argv[2] || 'release';
const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
let notes = [];
try { notes = require(path.join(root, 'release-notes.json')).notes || []; } catch { /* без заметок */ }

const info = (name) => {
  const file = path.join(dir, name);
  return { name, size: fs.statSync(file).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') };
};

const latest = {
  version: pkg.version,
  date: new Date().toISOString().slice(0, 10),
  notes,
  electron: require(path.join(root, 'node_modules', 'electron', 'package.json')).version,
  asar: info('app.asar'),
  zip: info('RioninaLauncher-Windows.zip'),
};
fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(latest, null, 2));
console.log(`latest.json: ${latest.version}, обновление ${(latest.asar.size / 1e6).toFixed(1)} МБ, полная сборка ${(latest.zip.size / 1e6).toFixed(0)} МБ`);
