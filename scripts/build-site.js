// Собирает сайт в папку _site: оборачивает страницу в полноценный HTML-документ.
const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const OUT = path.join(__dirname, '..', '_site');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(SITE)) {
  const src = path.join(SITE, f);
  if (!fs.statSync(src).isFile()) continue;
  if (f.endsWith('.html')) {
    const text = fs.readFileSync(src, 'utf8');
    const split = text.indexOf('</style>') + '</style>'.length;
    const html = /^\s*<!doctype/i.test(text) ? text
      : `<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${text.slice(0, split)}\n</head>\n<body>\n${text.slice(split)}\n</body>\n</html>\n`;
    fs.writeFileSync(path.join(OUT, f), html);
  } else {
    fs.copyFileSync(src, path.join(OUT, f));
  }
}
console.log('Сайт собран в _site');
