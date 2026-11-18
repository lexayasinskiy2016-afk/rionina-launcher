#!/usr/bin/env node
// Выпуск новой версии Rionina Launcher.
//
//   node scripts/release.js 1.5.0 "Что нового 1" "Что нового 2" [--publish]
//
// 1. Ставит номер версии в package.json
// 2. Собирает лаунчер для Windows (папка + zip) и отдельно app.asar (~2 МБ)
// 3. Пишет latest.json — по нему лаунчеры игроков видят «Обновите Rionina Launcher»
// 4. Добавляет новость на сайт и кладёт latest.json в site/
// 5. С флагом --publish создаёт релиз на GitHub и загружает файлы
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const publish = args.includes('--publish');
const [version, ...notes] = args.filter((a) => a !== '--publish');
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('Укажите версию: node scripts/release.js 1.5.0 "Что нового" [--publish]');
  process.exit(1);
}

const pkgFile = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const repo = pkg.rionina.updateRepo;
pkg.version = version;
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');

const run = (cmd, a, opts = {}) => execFileSync(cmd, a, { cwd: ROOT, stdio: 'inherit', ...opts });
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

console.log(`\n▶ Сборка Rionina Launcher ${version} для Windows…`);
fs.rmSync(path.join(ROOT, 'dist'), { recursive: true, force: true });
run('npx', ['electron-builder', '--win', 'dir', '--x64', '--publish', 'never'], { env: { ...process.env, WINEDEBUG: '-all' } });
try { execFileSync('wineserver', ['-k']); } catch { /* wine уже закрыт */ }

const out = path.join(ROOT, 'release');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
const appDir = path.join(ROOT, 'dist', 'Rionina Launcher');
fs.renameSync(path.join(ROOT, 'dist', 'win-unpacked'), appDir);
const zip = path.join(out, 'RioninaLauncher-Windows.zip');
run('zip', ['-9', '-r', '-q', zip, 'Rionina Launcher'], { cwd: path.join(ROOT, 'dist') });
fs.copyFileSync(path.join(appDir, 'resources', 'app.asar'), path.join(out, 'app.asar'));

const electron = require(path.join(ROOT, 'node_modules', 'electron', 'package.json')).version;
const latest = {
  version,
  date: new Date().toISOString().slice(0, 10),
  notes,
  electron,
  asar: { name: 'app.asar', size: fs.statSync(path.join(out, 'app.asar')).size, sha256: sha256(path.join(out, 'app.asar')) },
  zip: { name: 'RioninaLauncher-Windows.zip', size: fs.statSync(zip).size, sha256: sha256(zip) },
};
fs.writeFileSync(path.join(out, 'latest.json'), JSON.stringify(latest, null, 2));
fs.copyFileSync(path.join(out, 'latest.json'), path.join(ROOT, 'site', 'latest.json'));

// Новость на сайт
const sitePage = path.join(ROOT, 'site', 'index.html');
let html = fs.readFileSync(sitePage, 'utf8');
const marker = '<script id="news" type="application/json">\n[';
if (notes.length && html.includes(marker) && !html.includes(`"title": "Rionina ${version}`)) {
  const post = { date: latest.date, tag: 'Вышло', title: `Rionina ${version}`, text: notes[0], items: notes.slice(1) };
  html = html.replace(marker, `${marker}\n  ${JSON.stringify(post)},`);
  fs.writeFileSync(sitePage, html);
}

console.log(`\n✔ Готово: release/ (zip ${(latest.zip.size / 1e6).toFixed(0)} МБ, обновление ${(latest.asar.size / 1e6).toFixed(1)} МБ)`);

if (publish) {
  console.log(`\n▶ Публикация релиза v${version} в ${repo}…`);
  const body = notes.length ? notes.map((n) => `- ${n}`).join('\n') : 'Обновление Rionina Launcher';
  run('gh', ['release', 'create', `v${version}`, '--repo', repo, '--title', `Rionina Launcher ${version}`, '--notes', body,
    path.join(out, 'latest.json'), path.join(out, 'app.asar'), zip]);
  console.log('✔ Релиз опубликован — у игроков появится «Обновите Rionina Launcher»');
}
