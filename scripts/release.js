#!/usr/bin/env node
// Выпуск новой версии Rionina Launcher.
//
//   node scripts/release.js 1.5.0 "Главное" "Что нового 2" "Что нового 3"
//
// Ставит номер версии, записывает «что нового», добавляет новость на сайт,
// делает коммит и отправляет на GitHub. Дальше GitHub сам
// собирает Windows-версию и Android-приложение и публикует релиз —
// у игроков появляется «Обновите Rionina Launcher».
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
// По умолчанию обновление обязательное (без него «Играть» не работает); --optional — можно отложить
const optional = process.argv.includes('--optional');
const [version, ...notes] = process.argv.slice(2).filter((a) => a !== '--optional');
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('Укажите версию: node scripts/release.js 1.5.0 "Что нового" "Ещё что нового"');
  process.exit(1);
}
const git = (...a) => execFileSync('git', a, { cwd: ROOT, stdio: 'inherit' });

const pkgFile = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
pkg.version = version;
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, 'release-notes.json'), JSON.stringify({ version, notes, mandatory: !optional }, null, 2) + '\n');

// Новость на сайт
const sitePage = path.join(ROOT, 'site', 'index.html');
let html = fs.readFileSync(sitePage, 'utf8');
const marker = '<script id="news" type="application/json">\n[';
if (notes.length && html.includes(marker) && !html.includes(`Rionina ${version}`)) {
  const post = { date: new Date().toISOString().slice(0, 10), tag: 'Вышло', title: `Rionina ${version}`, text: notes[0], items: notes.slice(1) };
  html = html.replace(marker, `${marker}\n  ${JSON.stringify(post)},`);
  fs.writeFileSync(sitePage, html);
}

git('add', 'package.json', 'release-notes.json', 'site/index.html');
git('commit', '-m', `Rionina Launcher ${version}`);
git('-c', 'push.negotiate=true', 'push', 'origin', 'HEAD');
console.log(`\n✔ Версия ${version} отправлена. GitHub соберёт и опубликует её минут за 10:`);
console.log(`  https://github.com/${pkg.rionina.updateRepo}/actions`);
