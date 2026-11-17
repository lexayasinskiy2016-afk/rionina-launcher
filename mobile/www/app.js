// Rionina Launcher для телефона: запуск Minecraft Bedrock, новости и быстрый вход на серверы.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const Cap = window.Capacitor;
const platform = Cap?.getPlatform?.() || 'web';
const Launcher = Cap?.Plugins?.AppLauncher;

const PACKAGE = 'com.mojang.minecraftpe';
const STORE = {
  android: 'https://play.google.com/store/apps/details?id=com.mojang.minecraftpe',
  ios: 'https://apps.apple.com/app/minecraft/id479516143',
  web: 'https://www.minecraft.net/ru-ru/about-minecraft',
};
const CONTENT = 'https://launchercontent.mojang.com';

function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ───────────── Minecraft ─────────────

async function isInstalled() {
  if (!Launcher) return false;
  try {
    const target = platform === 'android' ? PACKAGE : 'minecraft://';
    return (await Launcher.canOpenUrl({ url: target })).value;
  } catch {
    return false;
  }
}

async function openUrl(url) {
  if (Launcher) return Launcher.openUrl({ url });
  window.open(url, '_blank');
}

async function launchMinecraft(deepLink = 'minecraft://') {
  if (await isInstalled()) {
    try {
      await openUrl(platform === 'android' && deepLink === 'minecraft://' ? PACKAGE : deepLink);
      return;
    } catch { /* откроем магазин */ }
  }
  toast('Minecraft не установлен — открываем магазин');
  await openUrl(STORE[platform] || STORE.web);
}

async function refreshStatus() {
  const ok = await isInstalled();
  $('#status').textContent = ok ? 'Установлен' : 'Не установлен';
  $('#statusText').textContent = ok
    ? 'Всё готово. Нажмите «Играть», чтобы запустить Minecraft.'
    : `Установите Minecraft из ${platform === 'ios' ? 'App Store' : 'Google Play'} — он сам будет обновляться.`;
  $('#btnPlay').textContent = ok ? 'Играть' : 'Установить';
}

$('#btnPlay').addEventListener('click', () => launchMinecraft());
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refreshStatus());

// ───────────── Серверы ─────────────

const DEFAULT_SERVERS = [
  { name: 'The Hive', host: 'geo.hivebedrock.network', port: 19132 },
  { name: 'CubeCraft', host: 'play.cubecraft.net', port: 19132 },
  { name: 'Lifeboat', host: 'mco.lbsg.net', port: 19132 },
];

function loadServers() {
  try {
    const s = JSON.parse(localStorage.getItem('servers'));
    if (Array.isArray(s)) return s;
  } catch { /* нет сохранённых */ }
  return DEFAULT_SERVERS;
}
function saveServers(list) {
  try { localStorage.setItem('servers', JSON.stringify(list)); } catch { /* приватный режим */ }
}

function joinServer(s) {
  // Официальная ссылка Bedrock: добавляет сервер в список и открывает игру
  const link = `minecraft://?addExternalServer=${encodeURIComponent(s.name)}|${s.host}:${s.port}`;
  launchMinecraft(link);
}

function serverRow(s, i, removable) {
  return `<div class="item">
    <div class="ic">${esc(s.name[0] || '?').toUpperCase()}</div>
    <div class="meta"><strong>${esc(s.name)}</strong><span>${esc(s.host)}:${s.port}</span></div>
    ${removable ? `<button class="del" data-del="${i}" aria-label="Удалить">✕</button>` : ''}
    <button class="btn primary" data-join="${i}">Играть</button>
  </div>`;
}

function renderServers() {
  const list = loadServers();
  $('#serverList').innerHTML = list.length ? list.map((s, i) => serverRow(s, i, true)).join('') : '<div class="item muted">Список пуст</div>';
  $('#quickServers').innerHTML = list.slice(0, 3).map((s, i) => serverRow(s, i, false)).join('') || '<div class="item muted">Добавьте сервер во вкладке «Серверы»</div>';
}

document.addEventListener('click', (e) => {
  const j = e.target.closest('[data-join]');
  const d = e.target.closest('[data-del]');
  if (j) joinServer(loadServers()[+j.dataset.join]);
  if (d) {
    const list = loadServers();
    list.splice(+d.dataset.del, 1);
    saveServers(list);
    renderServers();
  }
});

$('#serverForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#sName').value.trim();
  const host = $('#sHost').value.trim().replace(/\s/g, '');
  const port = parseInt($('#sPort').value, 10) || 19132;
  if (!name || !/^[\w.-]+$/.test(host) || port < 1 || port > 65535) return toast('Проверьте название, адрес и порт');
  const list = loadServers();
  list.unshift({ name, host, port });
  saveServers(list);
  e.target.reset();
  renderServers();
  toast(`Сервер «${name}» добавлен`);
});

// ───────────── Новости ─────────────

const abs = (u) => (!u ? '' : u.startsWith('http') ? u : CONTENT + u);

async function loadNews() {
  const get = (p) => fetch(`${CONTENT}/v2/${p}`).then((r) => (r.ok ? r.json() : { entries: [] })).catch(() => ({ entries: [] }));
  const [patch, news] = await Promise.all([get('bedrockPatchNotes.json'), get('news.json')]);
  const items = [
    ...(patch.entries || []).slice(0, 30).map((p) => ({ title: p.title, tag: `Bedrock ${p.version || ''}`, date: p.date, text: p.shortText, image: abs(p.image?.url), contentPath: p.contentPath })),
    ...(news.entries || []).filter((n) => !n.newsPlatforms || n.newsPlatforms.some((x) => /bedrock|ios|android/i.test(x))).map((n) => ({ title: n.title, tag: n.tag || 'Новости', date: n.date, text: n.text, image: abs(n.newsPageImage?.url || n.playPageImage?.url), link: n.readMoreLink })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!items.length) {
    $('#newsList').innerHTML = $('#homeNews').innerHTML = '<div class="list"><div class="item muted">Не удалось загрузить новости. Проверьте интернет.</div></div>';
    return;
  }
  const card = (n, i) => `<button class="ncard" data-news="${i}">
    ${n.image ? `<div class="img" style="background-image:url('${esc(n.image)}')"></div>` : ''}
    <div class="b"><span class="tag">${esc(n.tag)}</span><h4>${esc(n.title)}</h4><p>${esc(n.text)}</p></div></button>`;
  $('#newsList').innerHTML = items.map(card).join('');
  $('#homeNews').innerHTML = items.slice(0, 2).map(card).join('');
  document.querySelectorAll('[data-news]').forEach((b) => b.addEventListener('click', () => openNews(items[+b.dataset.news])));
}

function sanitize(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,form,link,meta').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((n) => {
    for (const a of [...n.attributes]) if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
    if (n.tagName === 'IMG' && n.getAttribute('src')?.startsWith('/')) n.src = CONTENT + n.getAttribute('src');
  });
  return doc.body.innerHTML;
}

async function openNews(n) {
  const s = document.createElement('div');
  s.className = 'sheet';
  s.innerHTML = `<button class="close">✕</button>
    <div class="article">${n.image ? `<img src="${esc(n.image)}" alt="">` : ''}
    <h1 style="font-size:28px">${esc(n.title)}</h1><div class="body"><p>${esc(n.text)}</p></div></div>`;
  document.body.appendChild(s);
  s.querySelector('.close').onclick = () => s.remove();
  s.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (a) { e.preventDefault(); openUrl(a.href); }
  });
  if (n.contentPath) {
    try {
      const r = await fetch(`${CONTENT}/v2/${n.contentPath}`);
      const d = await r.json();
      if (d.body) s.querySelector('.body').innerHTML = sanitize(d.body);
    } catch { /* оставляем краткий текст */ }
  } else if (n.link) {
    s.querySelector('.body').innerHTML += `<p><a href="${esc(n.link)}">Читать полностью →</a></p>`;
  }
}

// ───────────── Вкладки ─────────────

$$('.tabbar button').forEach((b) =>
  b.addEventListener('click', () => {
    $$('.tabbar button').forEach((x) => x.classList.toggle('active', x === b));
    $$('section').forEach((s) => s.classList.toggle('hidden', s.id !== `tab-${b.dataset.tab}`));
    window.scrollTo(0, 0);
  })
);

refreshStatus();
renderServers();
loadNews();
