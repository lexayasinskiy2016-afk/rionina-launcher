// Интерфейс Rionina Launcher.
const R = window.rionina;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TYPE_NAMES = { release: 'Релиз', snapshot: 'Снапшот', old_beta: 'Beta', old_alpha: 'Alpha' };
const TYPE_SHORT = { release: 'R', snapshot: 'S', old_beta: 'β', old_alpha: 'α' };

const st = {
  account: null,
  settings: null,
  versions: [],
  latest: null,
  installed: [],
  filter: 'release',
  query: '',
  limit: 60,
  progress: {}, // id → {stage, done, total, state}
  game: 'idle', // idle | starting | running
  newsLoaded: false,
};

function toast(msg, ms = 3600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.add('hidden'), ms);
}

const fmtDate = (d) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

// ───────────── Старт ─────────────

async function init() {
  const info = await R.info();
  if (info.platform === 'darwin') document.body.classList.add('mac');
  $('#appVer').textContent = info.version;
  $$('#winControls button').forEach((b) => b.addEventListener('click', () => R.win[b.dataset.act]()));

  st.settings = await R.settings.get();
  await applyTheme();
  st.account = await R.account.get().catch(() => null);
  st.account ? showMain() : showLogin();
}

function showLogin(adding = false) {
  $('#main').classList.add('hidden');
  $('#login').classList.remove('hidden');
  $('#loginError').textContent = '';
  $('#loginBack').classList.toggle('hidden', !(adding && st.account));
}

function showMain() {
  $('#login').classList.add('hidden');
  $('#main').classList.remove('hidden');
  renderAccount();
  renderSettings();
  loadVersions();
  if (!st.newsLoaded) loadNews();
  loadBedrock();
  R.bedrock.auto();
}

// ───────────── Вход ─────────────

$('#btnMicrosoft').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  $('#loginError').textContent = '';
  try {
    st.account = await R.account.microsoft();
    showMain();
  } catch (err) {
    const m = err.message || '';
    $('#loginError').textContent = /cancel|closed|error\.gui/i.test(m) ? 'Вход отменён' : m;
  } finally {
    btn.disabled = false;
  }
});

$('#offlineForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    st.account = await R.account.offline($('#nick').value);
    showMain();
  } catch (err) {
    $('#loginError').textContent = err.message;
  }
});

$('#btnLogout').addEventListener('click', async () => {
  const next = await R.account.logout();
  st.account = next;
  if (next) { renderAccount(); toast(`Вы вошли как ${next.name}`); } else showLogin();
});

function renderAccount() {
  const a = st.account;
  $('#accName').textContent = a.name;
  $('#accType').textContent = a.type === 'microsoft' ? 'Аккаунт Microsoft' : 'Офлайн';
  const av = $('#avatar');
  if (a.type === 'microsoft') {
    av.textContent = '';
    av.style.backgroundImage = `url(https://mc-heads.net/avatar/${a.uuid}/72)`;
  } else {
    av.style.backgroundImage = '';
    av.textContent = a.name[0].toUpperCase();
  }
  updateProfileVisuals();
}

// ───────────── Навигация ─────────────

$$('.nav').forEach((b) =>
  b.addEventListener('click', () => {
    $$('.nav').forEach((x) => x.classList.toggle('active', x === b));
    $$('.tab').forEach((t) => t.classList.toggle('hidden', t.id !== `tab-${b.dataset.tab}`));
    if (b.dataset.tab === 'bedrock') loadBedrock();
  })
);

// ───────────── Новости ─────────────

async function loadNews() {
  const list = $('#newsList');
  list.innerHTML = '<div class="skeleton" style="grid-column:1/-1;height:260px"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  try {
    const items = await R.news.list();
    st.newsLoaded = true;
    list.innerHTML = '';
    items.forEach((n, i) => {
      const el = document.createElement('button');
      el.className = `news-card${i === 0 ? ' hero' : ''}`;
      el.innerHTML = `
        <div class="img" style="${n.image ? `background-image:url('${esc(n.image)}')` : ''}"></div>
        <div class="body">
          <span class="tag">${esc(n.tag || 'Новости')}</span>
          <h4>${esc(n.title)}</h4>
          <p>${esc(n.text)}</p>
          <div class="date">${n.date ? fmtDate(n.date) : ''}</div>
        </div>`;
      el.addEventListener('click', () => openNews(n));
      list.appendChild(el);
    });
  } catch (e) {
    list.innerHTML = `<div class="empty">${esc(e.message)}<br><br><button class="btn btn-secondary btn-sm" id="newsRetry">Повторить</button></div>`;
    $('#newsRetry').onclick = loadNews;
  }
}

function sanitize(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,form,link,meta').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((n) => {
    for (const a of [...n.attributes]) {
      if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name);
    }
    if (n.tagName === 'IMG' && n.getAttribute('src')?.startsWith('/')) n.src = 'https://launchercontent.mojang.com' + n.getAttribute('src');
  });
  return doc.body.innerHTML;
}

async function openNews(n) {
  const body = $('#sheetBody');
  body.innerHTML = `
    ${n.image ? `<img class="hero-img" src="${esc(n.image)}" alt="">` : ''}
    <div class="article">
      <span class="tag" style="color:var(--accent);font-weight:700;font-size:12px;text-transform:uppercase">${esc(n.tag || '')}</span>
      <h1>${esc(n.title)}</h1>
      <div id="articleBody"><p>${esc(n.text)}</p></div>
    </div>`;
  $('#sheet').classList.remove('hidden');
  if (n.contentPath) {
    $('#articleBody').innerHTML += '<p class="muted">Загрузка…</p>';
    try {
      $('#articleBody').innerHTML = sanitize(await R.news.body(n.contentPath));
    } catch {
      $('#articleBody').innerHTML = `<p>${esc(n.text)}</p>`;
    }
  } else if (n.link) {
    $('#articleBody').innerHTML += `<p><a href="${esc(n.link)}">Читать полностью на minecraft.net →</a></p>`;
  }
}

$('#sheetClose').onclick = () => $('#sheet').classList.add('hidden');
$('#sheet').addEventListener('click', (e) => {
  if (e.target.id === 'sheet') $('#sheet').classList.add('hidden');
  const a = e.target.closest('a[href]');
  if (a) {
    e.preventDefault();
    R.openExternal(a.href);
  }
});

// ───────────── Версии ─────────────

async function loadVersions(force = false) {
  try {
    const data = await R.versions.list(force);
    st.versions = data.versions;
    st.latest = data.latest;
    st.installed = data.installed;
  } catch (e) {
    $('#versionList').innerHTML = `<div class="empty">Не удалось получить список версий: ${esc(e.message)}</div>`;
  }
  renderInstalled();
  renderVersionList();
  renderSelect();
}

const isInstalled = (id) => st.installed.some((v) => v.id === id);

function renderInstalled() {
  const box = $('#installedList');
  if (!st.installed.length) {
    box.innerHTML = '<div class="empty">Здесь появятся установленные версии. Выберите любую ниже и нажмите «Установить».</div>';
    return;
  }
  box.innerHTML = '';
  for (const v of st.installed) {
    const el = document.createElement('div');
    el.className = `inst-card${st.settings.selectedVersion === v.id ? ' selected' : ''}`;
    el.innerHTML = `
      <div class="type">Minecraft · ${TYPE_NAMES[v.type] || v.type}</div>
      <div class="big">${esc(v.id)}</div>
      <div class="type">${v.releaseTime ? fmtDate(v.releaseTime) : ''}</div>
      <div class="actions">
        <button class="btn btn-primary btn-sm" data-play>Играть</button>
        <button class="btn btn-secondary btn-sm btn-danger" data-del title="Удалить">Удалить</button>
      </div>`;
    el.querySelector('[data-play]').onclick = () => { selectVersion(v.id); play(); };
    el.querySelector('[data-del]').onclick = async () => {
      if (!confirm(`Удалить версию ${v.id}? Миры и настройки сохранятся.`)) return;
      await R.versions.remove(v.id);
      if (st.settings.selectedVersion === v.id) selectVersion(null);
      loadVersions();
    };
    el.addEventListener('dblclick', () => selectVersion(v.id));
    box.appendChild(el);
  }
}

function ringSvg(p) {
  const c = 2 * Math.PI * 11;
  return `<svg class="ring" viewBox="0 0 28 28"><circle class="bg" cx="14" cy="14" r="11"/><circle class="fg" cx="14" cy="14" r="11" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg>`;
}

function rowState(v) {
  const p = st.progress[v.id];
  if (p && (p.state === 'started' || p.state === 'queued')) {
    const frac = p.total ? p.done / p.total : 0;
    return `<span class="muted small">${p.state === 'queued' ? 'В очереди' : Math.round(frac * 100) + '%'}</span>${ringSvg(frac)}`;
  }
  if (isInstalled(v.id)) return `<span class="ok-badge">✓ Установлена</span><button class="btn btn-primary btn-sm" data-play="${esc(v.id)}">Играть</button>`;
  return `<button class="btn btn-secondary btn-sm" data-install="${esc(v.id)}">Установить</button>`;
}

function renderVersionList() {
  const q = st.query.trim().toLowerCase();
  const list = st.versions.filter((v) => v.type === st.filter && (!q || v.id.toLowerCase().includes(q)));
  const box = $('#versionList');
  if (!list.length) {
    box.innerHTML = '<div class="row"><span class="muted">Ничего не найдено</span></div>';
    return;
  }
  const shown = list.slice(0, st.limit);
  box.innerHTML =
    shown
      .map((v) => {
        const latest = st.latest && (st.latest.release === v.id || st.latest.snapshot === v.id);
        return `<div class="row" data-id="${esc(v.id)}">
          <div class="v-icon ${v.type}">${TYPE_SHORT[v.type] || '?'}</div>
          <div class="meta"><strong>${esc(v.id)}${latest ? ' <span class="ok-badge" style="color:var(--accent)">· Новая</span>' : ''}</strong>
          <span>${TYPE_NAMES[v.type]} · ${fmtDate(v.releaseTime)}</span></div>
          <div class="state">${rowState(v)}</div>
        </div>`;
      })
      .join('') + (list.length > shown.length ? `<button class="more" id="moreBtn">Показать ещё (${list.length - shown.length})</button>` : '');
  const more = $('#moreBtn');
  if (more) more.onclick = () => { st.limit += 100; renderVersionList(); };
}

function updateRow(id) {
  const row = document.querySelector(`.row[data-id="${CSS.escape(id)}"] .state`);
  const v = st.versions.find((x) => x.id === id);
  if (row && v) row.innerHTML = rowState(v);
}

$('#versionList').addEventListener('click', async (e) => {
  const inst = e.target.closest('[data-install]');
  const pl = e.target.closest('[data-play]');
  if (inst) {
    const id = inst.dataset.install;
    st.progress[id] = { state: 'queued', done: 0, total: 1 };
    updateRow(id);
    await R.versions.install(id);
  } else if (pl) {
    selectVersion(pl.dataset.play);
    play();
  }
});

$$('#typeFilter button').forEach((b) =>
  b.addEventListener('click', () => {
    $$('#typeFilter button').forEach((x) => x.classList.toggle('active', x === b));
    st.filter = b.dataset.type;
    st.limit = 60;
    renderVersionList();
  })
);
$('#versionSearch').addEventListener('input', (e) => { st.query = e.target.value; st.limit = 60; renderVersionList(); });

R.onInstallState(async ({ id, state, error }) => {
  st.progress[id] = { ...(st.progress[id] || {}), state };
  if (state === 'done') {
    delete st.progress[id];
    toast(`Minecraft ${id} установлен — он появился в «Мои версии»`);
    await loadVersions();
    if (!st.settings.selectedVersion) selectVersion(id);
  } else if (state === 'error') {
    delete st.progress[id];
    toast(`Ошибка установки ${id}: ${error}`, 6000);
  }
  updateRow(id);
  updatePlaybar();
});

R.onInstallProgress((p) => {
  st.progress[p.id] = { ...(st.progress[p.id] || {}), state: 'started', stage: p.stage, done: p.done, total: p.total };
  updateRow(p.id);
  updatePlaybar();
});

// ───────────── Панель запуска ─────────────

function renderSelect() {
  const sel = $('#versionSelect');
  const ids = st.installed.map((v) => v.id);
  let current = st.settings.selectedVersion;
  if (!current || (!ids.includes(current) && !st.progress[current])) current = ids[0] || st.latest?.release || null;
  st.settings.selectedVersion = current;
  const opts = [...new Set([...(current ? [current] : []), ...ids])];
  sel.innerHTML = opts.map((id) => `<option value="${esc(id)}">Minecraft ${esc(id)}${isInstalled(id) ? '' : ' (будет установлена)'}</option>`).join('');
  sel.value = current || '';
  updatePlaybar();
}

function selectVersion(id) {
  st.settings.selectedVersion = id;
  R.settings.set({ selectedVersion: id });
  renderSelect();
  renderInstalled();
}

$('#versionSelect').addEventListener('change', (e) => selectVersion(e.target.value));

function updatePlaybar() {
  const id = st.settings?.selectedVersion;
  const p = id && st.progress[id];
  const busy = Object.values(st.progress).find((x) => x.state === 'started');
  const bar = $('#pbProgress');
  const btn = $('#btnPlay');
  const label = $('#pbStage');

  if (busy) {
    const frac = busy.total ? busy.done / busy.total : 0;
    bar.classList.add('on');
    $('#pbFill').style.width = `${(frac * 100).toFixed(1)}%`;
    label.textContent = `${busy.stage || 'Подготовка'} · ${Math.round(frac * 100)}%`;
  } else {
    bar.classList.remove('on');
    label.textContent = st.game === 'running' ? 'Игра запущена' : st.game === 'starting' ? 'Запуск…' : 'Выбранная версия';
  }

  btn.classList.toggle('running', st.game === 'running');
  if (st.game === 'running') { btn.textContent = 'Закрыть игру'; btn.disabled = false; }
  else if (st.game === 'starting') { btn.textContent = 'Запуск…'; btn.disabled = true; }
  else if (p && p.state === 'started') { btn.textContent = 'Установка…'; btn.disabled = true; }
  else { btn.textContent = 'Играть'; btn.disabled = !id; }
}

async function play() {
  const id = st.settings.selectedVersion;
  if (!id) return toast('Выберите версию во вкладке «Версии»');
  if (st.game === 'running') return R.game.stop();
  st.game = 'starting';
  updatePlaybar();
  $('#log').textContent = '';
  try {
    await R.game.launch(id);
  } catch (e) {
    st.game = 'idle';
    updatePlaybar();
    toast(e.message, 6000);
  }
}

$('#btnPlay').addEventListener('click', play);

R.onGameState(({ state, code }) => {
  st.game = state === 'closed' ? 'idle' : state;
  if (state === 'closed' && code && code !== 0) toast(`Игра завершилась с кодом ${code}. Подробности — в Настройках → Журнал игры`, 7000);
  if (state === 'closed') loadVersions();
  updatePlaybar();
});

R.onGameLog((line) => {
  const log = $('#log');
  log.textContent += line;
  if (log.textContent.length > 200000) log.textContent = log.textContent.slice(-150000);
  log.scrollTop = log.scrollHeight;
});

// ───────────── Bedrock ─────────────

let bedrockBusy = false;

async function loadBedrock() {
  if (bedrockBusy) return;
  const s = await R.bedrock.status().catch(() => ({ supported: false }));
  const badge = $('#bedrockBadge');
  const text = $('#bedrockText');
  const play = $('#btnBedrockPlay');
  const store = $('#btnBedrockInstall');
  $('#brProgress').classList.add('hidden');
  if (!s.supported) {
    badge.textContent = 'Только Windows';
    text.textContent = 'На этом компьютере Bedrock недоступен — он выходит для Windows 10/11, Android, iOS и консолей. Установите Rionina на телефон, чтобы играть в Bedrock там.';
    play.disabled = true;
    store.classList.add('hidden');
    $('#autoBedrockRow').classList.add('hidden');
  } else if (s.installed) {
    badge.textContent = `Установлено · ${s.version}`;
    text.textContent = 'Bedrock Edition установлен и обновляется автоматически через Microsoft Store.';
    play.textContent = 'Играть';
    play.disabled = false;
    store.textContent = 'Microsoft Store';
  } else {
    badge.textContent = 'Не установлено';
    text.textContent = 'Нажмите «Установить» — лаунчер сам скачает и установит Bedrock. Нужен аккаунт Microsoft с купленным Minecraft.';
    play.textContent = 'Установить';
    play.disabled = false;
    store.textContent = 'Microsoft Store';
  }
}

$('#btnBedrockPlay').onclick = () => R.bedrock.launch().catch((e) => toast(e.message));
$('#btnBedrockInstall').onclick = () => R.bedrock.store();

R.onBedrockState(({ state, error }) => {
  const play = $('#btnBedrockPlay');
  if (state === 'started') {
    bedrockBusy = true;
    $('#bedrockBadge').textContent = 'Установка…';
    $('#bedrockText').textContent = 'Скачиваем Minecraft: Bedrock Edition из Microsoft Store. Можно пока играть в Java.';
    $('#brProgress').classList.remove('hidden');
    $('#brProgress').classList.add('indeterminate');
    play.textContent = 'Установка…';
    play.disabled = true;
    toast('Начата установка Minecraft Bedrock');
  } else {
    bedrockBusy = false;
    if (state === 'done') toast('Minecraft Bedrock установлен — нажмите «Играть» во вкладке Bedrock');
    else toast(error || 'Не удалось установить Bedrock', 7000);
    loadBedrock();
  }
});

R.onBedrockProgress(({ percent, text }) => {
  const bar = $('#brProgress');
  bar.classList.remove('hidden');
  bar.classList.toggle('indeterminate', percent == null);
  if (percent != null) $('#brFill').style.width = `${percent}%`;
  $('#bedrockBadge').textContent = percent != null ? `Установка · ${percent}%` : 'Установка…';
  if (text) $('#bedrockText').textContent = text;
});

// ───────────── Настройки ─────────────

function renderSettings() {
  const s = st.settings;
  const mem = $('#memory');
  const max = Math.max(2048, Math.floor((s.totalMemory * 0.75) / 512) * 512);
  mem.max = max;
  mem.value = Math.min(s.memory, max);
  const show = () => ($('#memVal').textContent = `${(mem.value / 1024).toFixed(1)} ГБ`);
  show();
  $('#memHint').textContent = `Всего на компьютере: ${(s.totalMemory / 1024).toFixed(0)} ГБ. Рекомендуем 4–6 ГБ`;
  mem.oninput = show;
  mem.onchange = () => R.settings.set({ memory: +mem.value });
  $('#fullscreen').checked = s.fullscreen;
  $('#fullscreen').onchange = (e) => R.settings.set({ fullscreen: e.target.checked });
  $('#closeOnLaunch').checked = s.closeOnLaunch;
  $('#closeOnLaunch').onchange = (e) => R.settings.set({ closeOnLaunch: e.target.checked });
  $('#autoBedrock').checked = s.autoBedrock !== false;
  $('#autoBedrock').onchange = (e) => R.settings.set({ autoBedrock: e.target.checked });
  $('#rootPath').textContent = s.root;
  $('#btnFolder').onclick = () => R.openFolder();
}

// Запускаем, когда загружены все скрипты страницы
window.addEventListener('DOMContentLoaded', () => init().catch((e) => { console.error(e); showLogin(); }));
