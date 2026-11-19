// Rionina Coins, Pro и друзья.

// ───────────── Профиль Rionina: монеты и Pro ─────────────

var setMe = function setMe(me) {
  st.me = me;
  $('#coinCount').textContent = me ? me.coins.toLocaleString('ru-RU') : '—';
  $('#proBadge').classList.toggle('hidden', !me?.pro);
  renderProTab();
};

async function refreshMe() {
  try { setMe(await R.eco.me()); } catch { setMe(null); }
}

$('#coinPill').addEventListener('click', () => document.querySelector('.nav[data-tab="cases"]').click());

// ───────────── Pro ─────────────

async function renderProTab() {
  const pro = !!st.me?.pro;
  const btn = $('#btnPro');
  btn.textContent = pro ? '✓ Pro активен' : 'Купить за $10';
  btn.disabled = pro;
  $('#boostCard').classList.toggle('hidden', !pro);
  if (pro) {
    const builds = (await installedVersions()).filter((v) => v.loader === 'fabric');
    $('#boostVersion').innerHTML = builds.length
      ? builds.map((v) => `<option value="${esc(v.id)}">Fabric ${esc(v.gameVersion)}</option>`).join('')
      : '<option value="">Нет сборок Fabric</option>';
  }
}

$('#btnPro').addEventListener('click', async () => {
  try {
    setMe(await R.eco.pro());
    toast('Добро пожаловать в Rionina Pro! 🎉');
  } catch (e) { toast(e.message, 6000); }
});

$('#btnBoost').addEventListener('click', async () => {
  const id = $('#boostVersion').value;
  if (!id) return toast('Сначала создайте сборку Fabric во вкладке «Моды»');
  const b = $('#btnBoost');
  b.disabled = true;
  b.textContent = 'Ставим моды…';
  try {
    const done = await R.eco.boost(id);
    toast(done.length ? `Сборка ускорена: установлено модов — ${done.length}` : 'Сборка уже ускорена');
  } catch (e) { toast(e.message); }
  b.disabled = false;
  b.textContent = 'Ускорить';
});

document.querySelector('.nav[data-tab="pro"]').addEventListener('click', () => refreshMe());

// ───────────── Друзья ─────────────

const fr = { timer: null, data: null };

function statusText(f) {
  if (f.shared) return `🟢 Открыл мир · ${esc(f.shared.gameVersion)}`;
  if (f.status === 'playing') return `🎮 Играет${f.playing?.gameVersion ? ` в ${esc(f.playing.gameVersion)}` : ''}`;
  return f.online ? '🟢 В лаунчере' : '⚪ Не в сети';
}

async function loadFriends() {
  try {
    fr.data = await R.friends.list();
    if (fr.data.friends.length >= 1) unlock('friend_1');
    if (fr.data.friends.length >= 5) unlock('friend_5');
  } catch (e) {
    $('#friendsList').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    $('#friendsLimit').textContent = '';
    $('#requestsCard').classList.add('hidden');
    return;
  }
  const d = fr.data;
  $('#friendsLimit').textContent = `Друзей: ${d.friends.length} из ${d.limit}${d.limit < 50 ? ' · с Pro до 50' : ''}`;

  const reqs = [...d.incoming.map((n) => ({ n, in: true })), ...d.outgoing.map((n) => ({ n, in: false }))];
  $('#requestsCard').classList.toggle('hidden', !reqs.length);
  $('#requestsList').innerHTML = reqs.map((r) => `
    <div class="acc-row"><div class="meta"><strong>${esc(r.n)}</strong><span>${r.in ? 'Хочет добавить вас в друзья' : 'Заявка отправлена'}</span></div>
    ${r.in ? `<button class="btn btn-primary btn-sm" data-acc="${esc(r.n)}">Принять</button>` : ''}
    <button class="btn btn-secondary btn-sm" data-dec="${esc(r.n)}">${r.in ? 'Отклонить' : 'Отменить'}</button></div>`).join('');

  const list = [...d.friends].sort((a, b) => (b.shared ? 2 : b.online ? 1 : 0) - (a.shared ? 2 : a.online ? 1 : 0));
  $('#friendsList').innerHTML = list.length ? list.map((f) => `
    <div class="acc-row friend ${f.online ? '' : 'off'}">
      <img class="fhead" src="https://mc-heads.net/avatar/${esc(f.uuid)}/64" alt="" />
      <div class="meta"><strong>${esc(f.nick)}${f.pro ? ' <span class="pro-badge">PRO</span>' : ''}</strong><span>${statusText(f)}</span></div>
      ${f.shared ? `<button class="btn btn-primary btn-sm" data-join="${esc(f.nick)}">Зайти</button>` : ''}
      <button class="btn btn-secondary btn-sm chat-btn" data-chat="${esc(f.nick)}">💬${f.unread ? ` <b class="unread">${f.unread}</b>` : ''}</button>
      <button class="btn btn-secondary btn-sm" data-call="${esc(f.nick)}" title="Голосовой звонок">📞</button>
      <button class="icon-btn" data-rmf="${esc(f.nick)}" title="Удалить из друзей"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>`).join('') : '<div class="empty">Пока нет друзей — добавьте друга по нику слева</div>';
  document.querySelectorAll('#friendsList .fhead').forEach((img) => img.addEventListener('error', () => { img.style.visibility = 'hidden'; }));
}

$('#addFriendForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nick = $('#friendNick').value.trim();
  if (!nick) return;
  try {
    const r = await R.friends.request(nick);
    toast(r.status === 'friends' ? `Теперь вы друзья с ${nick}!` : `Заявка отправлена игроку ${nick}`);
    $('#friendNick').value = '';
    loadFriends();
  } catch (er) { toast(er.message); }
});

$('#tab-friends').addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  try {
    if (t.dataset.acc) { await R.friends.accept(t.dataset.acc); toast(`Теперь вы друзья с ${t.dataset.acc}!`); }
    else if (t.dataset.dec) await R.friends.decline(t.dataset.dec);
    else if (t.dataset.rmf) { if (!confirm(`Удалить ${t.dataset.rmf} из друзей?`)) return; await R.friends.remove(t.dataset.rmf); }
    else if (t.dataset.join) {
      t.disabled = true;
      t.textContent = 'Подготовка…';
      toast(`Готовим ту же версию и моды, что у ${t.dataset.join}, и подключаемся…`, 6000);
      await R.friends.join(t.dataset.join);
    } else return;
    loadFriends();
  } catch (er) {
    toast(er.message, 6000);
    loadFriends();
  }
});

// Хост: открыть мир для друзей
async function fillHostVersions() {
  const sel = $('#hostVersion');
  if (sel.options.length > 1) return;
  const releases = st.versions.filter((v) => v.type === 'release').map((v) => v.id);
  let list = releases;
  try {
    const games = new Set(await R.fabric.games());
    list = releases.filter((v) => games.has(v));
  } catch { /* без Fabric-меты — показываем все релизы */ }
  sel.innerHTML = list.slice(0, 40).map((v) => `<option value="${esc(v)}">Minecraft ${esc(v)}</option>`).join('');
}

function renderHosting(h) {
  const box = $('#hostStatus');
  box.classList.toggle('hidden', !h);
  if (!h) { $('#btnHost').disabled = false; $('#btnHost').textContent = 'Разрешить для друзей'; return; }
  $('#btnHost').disabled = true;
  $('#btnHost').textContent = 'Мир открыт';
  box.innerHTML = h.address
    ? `✅ Друзья видят ваш мир и могут зайти.<br><span class="muted small">Адрес: <b>${esc(h.address)}</b></span>`
    : `⏳ Игра запущена. Войдите в мир и нажмите <b>Esc → «Открыть для сети»</b>.<br><span class="muted small">Если у друзей нет купленного Minecraft — выключите там «Online Mode».</span>`;
}

$('#btnHost').addEventListener('click', async () => {
  const v = $('#hostVersion').value;
  if (!v) return;
  const b = $('#btnHost');
  b.disabled = true;
  b.textContent = 'Готовим игру…';
  try {
    await R.friends.host(v);
    renderHosting({ address: null });
  } catch (e) {
    toast(e.message, 6000);
    renderHosting(null);
  }
});

R.onHosting((h) => {
  renderHosting(h);
  if (h?.address) toast('Мир открыт для друзей — они увидят кнопку «Зайти»');
});

document.querySelector('.nav[data-tab="friends"]').addEventListener('click', async () => {
  loadFriends();
  fillHostVersions();
  renderHosting(await R.friends.hostState().catch(() => null));
  clearInterval(fr.timer);
  fr.timer = setInterval(() => { if (!$('#tab-friends').classList.contains('hidden')) loadFriends(); }, 15000);
});

// ───────────── Настройки: адрес сервера ─────────────

$('#serverForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await R.settings.set({ server: $('#serverUrl').value });
    st.settings = await R.settings.get();
    toast('Адрес сервера сохранён');
    refreshMe();
  } catch (er) { toast(er.message); }
});
document.querySelector('.nav[data-tab="settings"]').addEventListener('click', () => {
  $('#serverUrl').value = st.settings.server || '';
  $('#serverStatus').textContent = st.me && !st.me.local ? '🟢 Подключено — аккаунты, друзья и монеты' : '⚪ Сервер недоступен — работает локальный режим';
});
