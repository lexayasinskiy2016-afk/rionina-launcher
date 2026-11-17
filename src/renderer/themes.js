// Оформление (темы, акцент, фон из галереи) и несколько аккаунтов.

const THEMES = [
  { id: 'default', name: 'Стандарт', prev: 'linear-gradient(135deg,#f5f5f7,#e8e8ed)' },
  { id: 'ocean', name: 'Океан', prev: 'linear-gradient(160deg,#cde9ff,#4f8dff)' },
  { id: 'sunset', name: 'Закат', prev: 'linear-gradient(160deg,#ffe1c4,#ff9a8b,#c86dd7)' },
  { id: 'forest', name: 'Лес', prev: 'linear-gradient(160deg,#e3f5d8,#3f8f5a)' },
  { id: 'sakura', name: 'Сакура', prev: 'linear-gradient(160deg,#fff0f6,#f39ac0)' },
  { id: 'neon', name: 'Неон', prev: 'radial-gradient(circle at 20% 20%,#5b2ccf,transparent 60%),radial-gradient(circle at 80% 80%,#0bb3c9,transparent 60%),#0d0b1f' },
  { id: 'space', name: 'Космос', prev: 'radial-gradient(circle at 70% 30%,#2a2463,transparent 70%),#07071a' },
];
const ACCENTS = [null, '#ff3b30', '#ff9500', '#34c759', '#00c7be', '#af52de', '#ff2d55', '#5856d6'];
const DARK_PRESETS = new Set(['neon', 'space']);

const theme = () => (st.settings.theme ||= { mode: 'system', preset: 'default', accent: null, bg: false });

async function applyTheme() {
  const t = theme();
  const root = document.documentElement;
  const mode = DARK_PRESETS.has(t.preset) && t.mode === 'system' ? 'dark' : t.mode;
  if (mode === 'system') root.removeAttribute('data-mode'); else root.dataset.mode = mode;
  if (t.preset && t.preset !== 'default') root.dataset.preset = t.preset; else root.removeAttribute('data-preset');
  if (t.accent) {
    root.style.setProperty('--accent', t.accent);
    root.style.setProperty('--accent-hover', t.accent);
  } else {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-hover');
  }
  const bg = $('#appBg');
  const img = t.bg ? await R.theme.getBg().catch(() => null) : null;
  bg.style.backgroundImage = img ? `url("${img}")` : '';
  bg.classList.toggle('has-img', !!img);
  document.body.classList.toggle('glassy', !!img || (t.preset && t.preset !== 'default'));
  $('#btnClearBg')?.classList.toggle('hidden', !img);
}

function saveTheme() {
  R.settings.set({ theme: theme() });
  applyTheme();
  renderThemeSettings();
}

function renderThemeSettings() {
  const t = theme();
  $$('#modeSeg button').forEach((b) => b.classList.toggle('active', b.dataset.v === (t.mode || 'system')));
  $('#themes').innerHTML = THEMES.map((th) => `<button class="theme-card${t.preset === th.id ? ' active' : ''}" data-th="${th.id}" style="background:${th.prev}"><span>${th.name}</span></button>`).join('');
  $('#accents').innerHTML = ACCENTS.map((c) => `<button class="swatch${(t.accent || null) === c ? ' active' : ''}" data-ac="${c || ''}" title="${c ? c : 'По умолчанию'}" style="background:${c || 'conic-gradient(#0071e3 0 50%, #0a84ff 0)'}"></button>`).join('');
}

$('#modeSeg').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.v;
  if (!v) return;
  theme().mode = v;
  saveTheme();
});
$('#themes').addEventListener('click', (e) => {
  const id = e.target.closest('[data-th]')?.dataset.th;
  if (!id) return;
  theme().preset = id;
  saveTheme();
});
$('#accents').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ac]');
  if (!b) return;
  theme().accent = b.dataset.ac || null;
  saveTheme();
});
$('#btnPickBg').addEventListener('click', async () => {
  try {
    const img = await R.theme.pickBg();
    if (!img) return;
    theme().bg = true;
    applyTheme();
    toast('Фон установлен');
  } catch (e) { toast(e.message); }
});
$('#btnClearBg').addEventListener('click', async () => {
  await R.theme.clearBg();
  theme().bg = false;
  applyTheme();
});

// ───────────── Аккаунты ─────────────

async function accountHead(acc, canvas) {
  const prof = st.settings.profiles?.[acc.uuid];
  const skin = (st.settings.skins || []).find((s) => s.id === prof?.skinId);
  if (skin) return drawHead(skin.data, canvas, 64);
  if (acc.type === 'microsoft') {
    canvas.width = canvas.height = 64;
    const img = new Image();
    img.onload = () => canvas.getContext('2d').drawImage(img, 0, 0, 64, 64);
    img.src = `https://mc-heads.net/avatar/${acc.uuid}/64`;
    return;
  }
  return drawHead(presetData(READY_SKINS[0]), canvas, 64);
}

async function renderAccounts() {
  const list = await R.account.list().catch(() => []);
  const box = $('#accountsList');
  box.innerHTML = '';
  for (const a of list) {
    const row = document.createElement('div');
    row.className = 'acc-row';
    row.innerHTML = `<canvas></canvas><div class="meta"><strong>${esc(a.name)}</strong><span>${a.type === 'microsoft' ? 'Microsoft' : 'Офлайн'}</span></div>
      ${a.active ? '<span class="badge-active">● Активный</span>' : '<button class="btn btn-secondary btn-sm" data-sw>Войти</button>'}
      <button class="icon-btn" data-rm title="Удалить"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
    accountHead(a, row.querySelector('canvas'));
    row.querySelector('[data-sw]')?.addEventListener('click', () => switchAccount(a.uuid));
    row.querySelector('[data-rm]').addEventListener('click', async () => {
      if (!confirm(`Удалить аккаунт ${a.name} из лаунчера?`)) return;
      const now = await R.account.remove(a.uuid);
      if (!now) { st.account = null; showLogin(); return; }
      if (a.active) await switchAccount(now.uuid);
      else renderAccounts();
    });
    box.appendChild(row);
  }
}

async function switchAccount(uuid) {
  st.account = await R.account.switch(uuid);
  $('#accMenu').classList.add('hidden');
  renderAccount();
  renderAccounts();
  if (!$('#tab-skins').classList.contains('hidden')) { sk.sel = null; renderSkinsTab(); }
  toast(`Вы вошли как ${st.account.name}`);
}

$('#btnAddMs').addEventListener('click', async () => {
  try {
    st.account = await R.account.microsoft();
    renderAccount();
    renderAccounts();
    toast(`Добавлен аккаунт ${st.account.name}`);
  } catch (e) {
    if (!/cancel|closed|error\.gui/i.test(e.message)) toast(e.message);
  }
});
$('#addOffline').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    st.account = await R.account.offline($('#addNick').value);
    $('#addNick').value = '';
    renderAccount();
    renderAccounts();
    toast(`Добавлен аккаунт ${st.account.name}`);
  } catch (er) { toast(er.message); }
});

// Быстрое переключение по клику на аккаунт в боковой панели
$('#accountChip').addEventListener('click', async (e) => {
  if (e.target.closest('#btnLogout')) return;
  const menu = $('#accMenu');
  if (!menu.classList.contains('hidden')) return menu.classList.add('hidden');
  const list = await R.account.list().catch(() => []);
  menu.innerHTML = list.map((a) => `<button data-u="${esc(a.uuid)}"><canvas></canvas><span>${esc(a.name)}</span>${a.active ? '<span class="check">✓</span>' : ''}</button>`).join('')
    + '<hr><button data-add>＋ Добавить аккаунт</button><button data-manage>Управление аккаунтами</button>';
  [...menu.querySelectorAll('[data-u]')].forEach((b, i) => accountHead(list[i], b.querySelector('canvas')));
  const r = $('#accountChip').getBoundingClientRect();
  menu.style.left = `${r.left}px`;
  menu.style.bottom = `${window.innerHeight - r.top + 8}px`;
  menu.style.top = 'auto';
  menu.classList.remove('hidden');
});
$('#accMenu').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.u) return switchAccount(b.dataset.u);
  $('#accMenu').classList.add('hidden');
  if (b.hasAttribute('data-add')) showLogin(true);
  if (b.hasAttribute('data-manage')) document.querySelector('.nav[data-tab="settings"]').click();
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#accMenu') && !e.target.closest('#accountChip')) $('#accMenu').classList.add('hidden');
});

$('#loginBack').addEventListener('click', () => { if (st.account) showMain(); });

document.querySelector('.nav[data-tab="settings"]').addEventListener('click', () => { renderAccounts(); renderThemeSettings(); });
