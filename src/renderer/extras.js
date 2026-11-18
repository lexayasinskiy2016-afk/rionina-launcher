// Обновления, скриншоты, ИИ-сборки, чат с друзьями и плащи.

// ───────────── Обновление лаунчера ─────────────

const upd = { info: null, ready: false };

function showUpdate(info) {
  if (!info) return;
  upd.info = info;
  $('#ubTitle').textContent = `Обновите Rionina Launcher до версии ${info.version}`;
  $('#ubNotes').textContent = (info.notes || []).slice(0, 3).join(' · ');
  $('#updateBar').classList.remove('hidden');
}

R.onUpdate(showUpdate);
R.update.get().then(showUpdate).catch(() => {});
R.onUpdateProgress(({ done, total }) => {
  $('#ubProgress').classList.remove('hidden');
  $('#ubFill').style.width = `${total ? (done / total) * 100 : 0}%`;
});
$('#ubClose').addEventListener('click', () => $('#updateBar').classList.add('hidden'));
$('#ubBtn').addEventListener('click', async () => {
  const b = $('#ubBtn');
  if (upd.ready) return R.update.apply();
  b.disabled = true;
  b.textContent = 'Скачивание…';
  try {
    await R.update.download();
    upd.ready = true;
    b.disabled = false;
    b.textContent = 'Перезапустить';
    $('#ubTitle').textContent = `Версия ${upd.info.version} готова — перезапустите лаунчер`;
  } catch (e) {
    b.disabled = false;
    b.textContent = 'Скачать с сайта';
    b.onclick = () => R.update.site();
    toast(e.message, 6000);
  }
});

// ───────────── Скриншоты ─────────────

const shotsState = { list: [], filter: 'all', current: null };
const shotUrl = (p, thumb) => `rionina-shot://shot/?p=${encodeURIComponent(p)}${thumb ? '&thumb=1' : ''}`;

async function loadShots() {
  shotsState.list = await R.shots.list().catch(() => []);
  renderShots();
}

function renderShots() {
  const list = shotsState.list.filter((s) => shotsState.filter === 'all' || s.fav);
  const grid = $('#shotsGrid');
  if (!list.length) {
    grid.innerHTML = `<div class="empty">${shotsState.filter === 'fav' ? 'Отметьте звёздочкой важные моменты — они соберутся здесь' : 'Пока нет скриншотов. Запустите игру и нажмите F2 — снимок появится здесь.'}</div>`;
    return;
  }
  grid.innerHTML = list.map((s, i) => `
    <button class="shot" data-i="${i}">
      <img src="${shotUrl(s.path, true)}" alt="" loading="lazy" />
      <span class="shot-meta">${new Date(s.time).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${s.build ? ' · мод' : ''}</span>
      ${s.fav ? '<span class="shot-star">⭐</span>' : ''}
    </button>`).join('');
  grid.querySelectorAll('.shot').forEach((el) => el.addEventListener('click', () => openShot(list[+el.dataset.i])));
}

function openShot(s) {
  shotsState.current = s;
  $('#shotImg').src = shotUrl(s.path);
  $('#shotInfo').textContent = `${s.name} · ${(s.size / 1024 / 1024).toFixed(1)} МБ`;
  $('#shotFav').textContent = s.fav ? '⭐ Важный момент' : '☆ Отметить';
  $('#shotViewer').classList.remove('hidden');
}

$('#shotClose').addEventListener('click', () => $('#shotViewer').classList.add('hidden'));
$('#shotViewer').addEventListener('click', (e) => { if (e.target.id === 'shotViewer') $('#shotViewer').classList.add('hidden'); });
$('#shotFav').addEventListener('click', async () => {
  const s = shotsState.current;
  s.fav = await R.shots.fav(s.path);
  $('#shotFav').textContent = s.fav ? '⭐ Важный момент' : '☆ Отметить';
  renderShots();
});
$('#shotShow').addEventListener('click', () => R.shots.open(shotsState.current.path));
$('#shotDel').addEventListener('click', async () => {
  const b = $('#shotDel');
  if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Точно удалить?'; return; }
  b.dataset.sure = '';
  b.textContent = 'Удалить';
  await R.shots.remove(shotsState.current.path);
  $('#shotViewer').classList.add('hidden');
  loadShots();
});
$('#btnShotFolder').addEventListener('click', () => R.shots.folder());
$$('#shotFilter button').forEach((b) => b.addEventListener('click', () => {
  $$('#shotFilter button').forEach((x) => x.classList.toggle('active', x === b));
  shotsState.filter = b.dataset.v;
  renderShots();
}));
R.onShot(() => {
  toast('📸 Скриншот сохранён в галерею');
  if (!$('#tab-shots').classList.contains('hidden')) loadShots();
});
document.querySelector('.nav[data-tab="shots"]').addEventListener('click', loadShots);

// ───────────── Загрузчик для сборки модов (Fabric / Forge / NeoForge) ─────────────

let modLoader = 'fabric';
const LOADER_NAMES = { fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge' };

async function fillLoaderVersions(select, loader) {
  select.innerHTML = '<option value="">Загрузка…</option>';
  try {
    const list = await R.loaders.versions(loader);
    const releases = new Set(st.versions.filter((v) => v.type === 'release').map((v) => v.id));
    const ok = list.filter((x) => !releases.size || releases.has(x.gameVersion)).slice(0, 50);
    select.innerHTML = ok.length
      ? ok.map((x) => `<option value="${esc(x.gameVersion)}">Minecraft ${esc(x.gameVersion)}</option>`).join('')
      : `<option value="">Нет версий ${LOADER_NAMES[loader]}</option>`;
  } catch {
    select.innerHTML = `<option value="">Нет связи с ${LOADER_NAMES[loader]}</option>`;
  }
}

$$('#loaderSeg button').forEach((b) => b.addEventListener('click', () => {
  $$('#loaderSeg button').forEach((x) => x.classList.toggle('active', x === b));
  modLoader = b.dataset.v;
  fillLoaderVersions($('#fabricGame'), modLoader);
}));

// ───────────── ИИ-сборки ─────────────

const ai = { loader: 'fabric', plan: null, gameVersion: null };
const AI_EXAMPLES = ['Выживание с магией и драконами', 'Техника и космос без лагов', 'Строить красивые дома и фермы', 'Приключения, данжи и боссы', 'Покемоны и карта', 'Максимум FPS на слабом ПК'];

function renderAiExamples() {
  $('#aiExamples').innerHTML = AI_EXAMPLES.map((t) => `<button class="chip">${esc(t)}</button>`).join('');
  $('#aiExamples').querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { $('#aiPrompt').value = c.textContent; }));
}

$$('#aiLoader button').forEach((b) => b.addEventListener('click', () => {
  $$('#aiLoader button').forEach((x) => x.classList.toggle('active', x === b));
  ai.loader = b.dataset.v;
  fillLoaderVersions($('#aiVersion'), ai.loader);
}));

function renderPlan() {
  const p = ai.plan;
  const box = $('#aiResult');
  if (!p) { box.innerHTML = ''; return; }
  if (!p.ok) {
    box.innerHTML = `<div class="ai-plan rejected"><div class="verdict bad">⛔ Модерация: нельзя</div><p>${esc(p.reason)}</p></div>`;
    return;
  }
  box.innerHTML = `
    <div class="ai-plan">
      <div class="plan-head">
        <div class="verdict ok">✅ Модерация пройдена</div>
        <span class="muted small">${p.engine === 'neural' ? 'Собрала нейросеть' : 'Собрал встроенный ИИ-помощник'} · ${LOADER_NAMES[ai.loader]} ${esc(ai.gameVersion)}</span>
      </div>
      <input class="field plan-name" id="planName" maxlength="48" value="${esc(p.name)}" />
      <p class="muted">${esc(p.description)}</p>
      <div class="plan-mods">${p.mods.map((m, i) => `
        <div class="plan-mod">
          ${m.icon ? `<img src="${esc(m.icon)}" alt="" />` : '<i class="ph"></i>'}
          <div><strong>${esc(m.title)}</strong><span>${esc(m.why)}</span></div>
          <button class="icon-btn" data-rm="${i}" title="Убрать"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        </div>`).join('')}</div>
      <div class="row-gap">
        <button class="btn btn-primary" id="btnAiCreate">Создать сборку (${p.mods.length} модов)</button>
        <button class="btn btn-secondary" id="btnAiPublish">Опубликовать для всех</button>
      </div>
      <p class="muted small" id="publishStatus"></p>
    </div>`;
  $('#planName').addEventListener('input', (e) => { p.name = e.target.value; });
  box.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { p.mods.splice(+b.dataset.rm, 1); renderPlan(); }));
  $('#btnAiCreate').addEventListener('click', () => createPack({ name: p.name, mods: p.mods }, ai.gameVersion, ai.loader, $('#btnAiCreate')));
  $('#btnAiPublish').addEventListener('click', publishPlan);
}

$('#btnAiPlan').addEventListener('click', async () => {
  const prompt = $('#aiPrompt').value.trim();
  ai.gameVersion = $('#aiVersion').value;
  if (!ai.gameVersion) return toast('Выберите версию Minecraft');
  const b = $('#btnAiPlan');
  b.disabled = true;
  b.textContent = 'ИИ думает…';
  $('#aiResult').innerHTML = '<div class="skeleton" style="height:220px"></div>';
  try {
    ai.plan = await R.ai.plan({ prompt, gameVersion: ai.gameVersion, loader: ai.loader });
    renderPlan();
  } catch (e) {
    $('#aiResult').innerHTML = '';
    toast(e.message, 6000);
  } finally {
    b.disabled = false;
    b.textContent = '✨ Собрать';
  }
});

async function createPack(plan, gameVersion, loader, btn, packId) {
  btn.disabled = true;
  btn.textContent = 'Устанавливаем…';
  toast(`Ставим ${LOADER_NAMES[loader]} ${gameVersion} и моды — прогресс внизу`, 5000);
  try {
    const res = await R.ai.create({ plan, gameVersion, loader });
    if (packId) R.packs.installed(packId);
    await loadVersions();
    selectVersion(res.id);
    btn.textContent = '✓ Готово — нажмите «Играть»';
    toast(`Сборка «${plan.name}» готова: ${res.installed} модов${res.failed.length ? `, не встали: ${res.failed.length}` : ''}`, 6000);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Повторить';
    toast(e.message, 7000);
  }
}

async function publishPlan() {
  const p = ai.plan;
  const status = $('#publishStatus');
  try {
    const res = await R.packs.publish({ plan: p, gameVersion: ai.gameVersion, loader: ai.loader });
    status.textContent = res.status === 'rejected'
      ? `⛔ Модерация отклонила: ${res.reason}`
      : `⏳ Сборка на проверке — появится у всех через ~${Math.max(1, Math.round((res.publishAt - Date.now()) / 60000))} мин.`;
    loadPacks();
  } catch (e) {
    status.textContent = e.message;
  }
}

function packCard(p, mine) {
  const el = document.createElement('div');
  el.className = 'pack-card';
  const st2 = { approved: '✅ Опубликована', review: '⏳ На проверке', rejected: `⛔ ${p.reason || 'Отклонена'}` }[p.status];
  el.innerHTML = `
    <div class="pack-top"><span class="pill2">${LOADER_NAMES[p.loader] || p.loader} ${esc(p.gameVersion)}</span>${mine ? `<span class="muted small">${esc(st2)}</span>` : `<span class="muted small">⬇ ${p.installs}</span>`}</div>
    <h4>${esc(p.name)}</h4>
    <p class="muted small">${esc(p.description)}</p>
    <p class="muted small">${p.mods.length} модов · автор ${esc(p.author)}</p>
    ${mine ? '' : '<button class="btn btn-primary btn-sm">Установить</button>'}`;
  el.querySelector('button')?.addEventListener('click', (e) => createPack({ name: p.name, mods: p.mods }, p.gameVersion, p.loader, e.target, p.id));
  return el;
}

async function loadPacks() {
  const box = $('#communityPacks');
  try {
    const { community, mine } = await R.packs.list();
    box.innerHTML = community.length ? '' : '<div class="empty">Пока нет опубликованных сборок — соберите свою и нажмите «Опубликовать для всех»</div>';
    community.forEach((p) => box.appendChild(packCard(p, false)));
    $('#myPacksTitle').classList.toggle('hidden', !mine.length);
    $('#myPacks').innerHTML = '';
    mine.forEach((p) => $('#myPacks').appendChild(packCard(p, true)));
  } catch (e) {
    box.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

document.querySelector('.nav[data-tab="ai"]').addEventListener('click', () => {
  renderAiExamples();
  if (!$('#aiVersion').options.length) fillLoaderVersions($('#aiVersion'), ai.loader);
  loadPacks();
});

// ───────────── Чат с друзьями ─────────────

const chat = { nick: null, last: 0, timer: null };

function renderMsgs(msgs, append) {
  const box = $('#chatMsgs');
  if (!append) box.innerHTML = '';
  for (const m of msgs) {
    const mineMsg = m.from.toLowerCase() === st.account?.name.toLowerCase();
    const el = document.createElement('div');
    el.className = `msg ${mineMsg ? 'mine' : ''}`;
    el.innerHTML = `<span>${esc(m.text)}</span><time>${new Date(m.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time>`;
    box.appendChild(el);
    chat.last = Math.max(chat.last, m.at);
  }
  if (!box.children.length) box.innerHTML = '<div class="muted small center">Напишите первое сообщение 👋</div>';
  box.scrollTop = box.scrollHeight;
}

async function pollChat(first) {
  if (!chat.nick) return;
  try {
    const { messages } = await R.chat.get({ nick: chat.nick, after: first ? 0 : chat.last });
    if (first || messages.length) renderMsgs(messages, !first);
  } catch (e) {
    if (first) $('#chatMsgs').innerHTML = `<div class="muted small center">${esc(e.message)}</div>`;
  }
}

function openChat(nick) {
  chat.nick = nick;
  chat.last = 0;
  $('#chatWith').textContent = `💬 ${nick}`;
  $('#chatBox').classList.remove('hidden');
  pollChat(true);
  clearInterval(chat.timer);
  chat.timer = setInterval(() => { if (!$('#tab-friends').classList.contains('hidden')) pollChat(false); }, 4000);
  $('#chatInput').focus();
}

$('#chatClose').addEventListener('click', () => { chat.nick = null; clearInterval(chat.timer); $('#chatBox').classList.add('hidden'); });
$('#chatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#chatInput').value.trim();
  if (!text || !chat.nick) return;
  $('#chatInput').value = '';
  try {
    const m = await R.chat.send({ nick: chat.nick, text });
    renderMsgs([m], true);
  } catch (er) { toast(er.message); }
});
$('#friendsList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-chat]');
  if (b) openChat(b.dataset.chat);
});

// ───────────── Плащи ─────────────

/** Плащ 64×32: лицевая сторона — область (1,1)–(11,17). */
function makeCape({ base, base2, emblem, ecolor = '#ffffff', stripes }) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 17);
  grad.addColorStop(0, base); grad.addColorStop(1, base2 || base);
  g.fillStyle = grad;
  g.fillRect(0, 0, 22, 17);
  if (stripes) {
    g.fillStyle = stripes;
    for (const y of [3, 13]) { g.fillRect(1, y, 10, 1); g.fillRect(12, y, 10, 1); }
  }
  const P = {
    R: ['1110', '1001', '1110', '1010', '1001'],
    star: ['00100', '01110', '11111', '01110', '01010'],
    heart: ['01010', '11111', '11111', '01110', '00100'],
    bolt: ['0011', '0110', '1111', '0110', '1100'],
    flame: ['00100', '01110', '01110', '11011', '01110'],
    crown: ['10101', '11111', '11111', '01110', '00000'],
    leaf: ['00110', '01111', '11110', '11100', '10000'],
    moon: ['0110', '1100', '1100', '1100', '0110'],
  }[emblem];
  if (P) {
    g.fillStyle = ecolor;
    const ox = 1 + Math.floor((10 - P[0].length) / 2), oy = 6;
    P.forEach((row, y) => [...row].forEach((v, x) => { if (v === '1') { g.fillRect(ox + x, oy + y, 1, 1); g.fillRect(12 + ox + x, oy + y, 1, 1); } }));
  }
  return c.toDataURL('image/png');
}

const CAPES = [
  { key: 'cape_rionina', name: 'Плащ Rionina', rarity: 'rare', spec: { base: '#23a653', base2: '#1f6fe0', emblem: 'R' } },
  { key: 'cape_night', name: 'Ночной плащ', rarity: 'common', spec: { base: '#1b2140', base2: '#0b0e1f', emblem: 'moon', ecolor: '#ffe9a8' } },
  { key: 'cape_forest', name: 'Лесной плащ', rarity: 'common', spec: { base: '#2f6b35', base2: '#1d4222', emblem: 'leaf', ecolor: '#9be27a' } },
  { key: 'cape_love', name: 'Плащ сердец', rarity: 'common', spec: { base: '#ff6fa5', base2: '#d6336c', emblem: 'heart' } },
  { key: 'cape_storm', name: 'Плащ бури', rarity: 'epic', spec: { base: '#2a3b8f', base2: '#111845', emblem: 'bolt', ecolor: '#ffe14d', stripes: '#7ab8ff' } },
  { key: 'cape_fire', name: 'Огненный плащ', rarity: 'epic', spec: { base: '#ff8a00', base2: '#b31200', emblem: 'flame', ecolor: '#fff1a8' } },
  { key: 'cape_star', name: 'Звёздный плащ', rarity: 'rare', spec: { base: '#5b2ccf', base2: '#22105e', emblem: 'star', ecolor: '#ffd23f' } },
  { key: 'cape_king', name: 'Королевский плащ', rarity: 'legendary', spec: { base: '#a3122a', base2: '#5c0814', emblem: 'crown', ecolor: '#ffd23f', stripes: '#ffd23f' } },
];
const PRO_CAPES = [
  { key: 'cape_pro', name: 'Плащ Pro', rarity: 'legendary', pro: true, spec: { base: '#ff7a3d', base2: '#b14ef0', emblem: 'star', ecolor: '#ffffff', stripes: '#ffffff' } },
];
const capeCache = new Map();
const capeData = (c) => { if (!capeCache.has(c.key)) capeCache.set(c.key, makeCape(c.spec)); return capeCache.get(c.key); };
const ownedCapes = () => (collection().capes ||= []);
const allCapes = () => [...CAPES, ...PRO_CAPES];

function applyCape(viewer) {
  if (!viewer) return;
  const c = allCapes().find((x) => x.key === profile().cape);
  try {
    if (c) viewer.loadCape(capeData(c));
    else viewer.resetCape();
  } catch { /* старая версия просмотрщика */ }
}

function renderCapeChips() {
  const box = $('#capeChips');
  const owned = new Set(ownedCapes());
  const pro = !!st.me?.pro;
  const cur = profile().cape || null;
  box.innerHTML = '';
  const mk = (key, label, locked, hint) => {
    const b = document.createElement('button');
    b.className = `chip${cur === key ? ' active' : ''}${locked ? ' locked' : ''}`;
    b.textContent = label;
    b.title = hint || '';
    b.onclick = () => {
      if (locked) return toast(hint);
      profile().cape = key;
      saveSkinData();
      applyCape(sk.viewer);
      applyCape(sk.mini);
      renderCapeChips();
    };
    box.appendChild(b);
  };
  mk(null, 'Нет', false);
  for (const c of CAPES) if (owned.has(c.key)) mk(c.key, c.name, false);
  for (const c of PRO_CAPES) mk(c.key, `${c.name}${pro ? '' : ' 🔒'}`, !pro, 'Плащ для Rionina Pro');
  const locked = CAPES.filter((c) => !owned.has(c.key)).length;
  if (locked) mk('__locked', `🔒 Ещё ${locked} — в сундуках`, true, 'Плащи выпадают из сундуков — вкладка «Сундуки»');
}

document.querySelector('.nav[data-tab="skins"]').addEventListener('click', () => {
  renderCapeChips();
  applyCape(sk.viewer);
});
