// Вылеты игры, объявления, магазин, рейтинг и кланы.

// ───────────── Игра вылетела ─────────────

R.onCrash((c) => {
  const box = $('#crashSheet');
  const card = box.querySelector('.wn-card');
  card.innerHTML = `
    <div class="wn-badge crash-badge">Игра вылетела · ${esc(c.versionId)}</div>
    <h2>${esc(c.title)}</h2>
    <p class="wn-lead">${esc(c.explain)}</p>
    <div class="crash-fixes">${c.fixes.map((f, i) => `<button class="btn btn-primary btn-sm" data-fix="${i}">🔧 ${esc(f.label)}</button>`).join('')}</div>
    <div class="crash-ai hidden" id="crashAi"></div>
    <div class="row-gap">
      <button class="btn btn-secondary btn-sm" id="crashAsk">🤖 Спросить нейросеть</button>
      <button class="btn btn-secondary btn-sm" id="crashLog">Журнал игры</button>
      <button class="btn btn-secondary btn-sm" id="crashClose">Закрыть</button>
    </div>
    ${c.ai ? '' : '<p class="muted small">Чтобы нейросеть объясняла вылеты, подключите её во вкладке «ИИ-сборки» → «Новый мод от ИИ».</p>'}`;
  box.classList.remove('hidden');
  card.querySelectorAll('[data-fix]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      toast(`✅ ${await R.crash.fix(c.fixes[+b.dataset.fix])}. Запускайте игру снова!`, 6000);
      st.settings = await R.settings.get();
      b.textContent = '✓ Готово';
    } catch (e) { b.disabled = false; toast(e.message, 6000); }
  }));
  $('#crashAsk').addEventListener('click', async (e) => {
    const b = e.target;
    b.disabled = true;
    b.textContent = '🤖 Нейросеть читает журнал…';
    try {
      const a = await R.crash.ai();
      const box2 = $('#crashAi');
      box2.innerHTML = `<strong>🤖 ${esc(a.title)}</strong><p>${esc(a.explain)}</p>${a.steps.length ? `<ol>${a.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}`;
      box2.classList.remove('hidden');
      b.textContent = '🤖 Готово';
    } catch (er) { b.disabled = false; b.textContent = '🤖 Спросить нейросеть'; toast(er.message, 6000); }
  });
  $('#crashLog').addEventListener('click', () => { box.classList.add('hidden'); document.querySelector('.nav[data-tab="settings"]').click(); });
  $('#crashClose').addEventListener('click', () => box.classList.add('hidden'));
});

// ───────────── Объявления от Rionina ─────────────

const seenAnn = () => { try { return JSON.parse(localStorage.getItem('rionina-seen-ann') || '[]'); } catch { return []; } };
function showAnnouncements(list) {
  const fresh = (list || []).filter((a) => !seenAnn().includes(a.id));
  const box = $('#announce');
  if (!fresh.length) { box.classList.add('hidden'); return; }
  const a = fresh[0];
  box.className = `announce ${a.style}`;
  box.innerHTML = `<span class="an-icon">${a.style === 'event' ? '🎉' : a.style === 'warning' ? '⚠️' : '📢'}</span>
    <div class="an-text"><strong>${esc(a.title)}</strong><span>${esc(a.text)}</span></div>
    <button class="btn btn-sm" id="anOk">Понятно</button>`;
  $('#anOk').addEventListener('click', () => {
    try { localStorage.setItem('rionina-seen-ann', JSON.stringify([...seenAnn(), a.id].slice(-100))); } catch { /* без хранилища */ }
    showAnnouncements(list);
  });
}
R.onAnnounce(showAnnouncements);
setTimeout(() => R.announcements().then(showAnnouncements).catch(() => {}), 2500);

// ───────────── Магазин ─────────────

const RARITY_ORDER = { legendary: 0, epic: 1, rare: 2, common: 3 };
/** id магазина → награда в формате сундуков */
function shopReward(id, rarity) {
  if (EFFECTS[id]) return { kind: 'effect', id, name: EFFECTS[id].name, rarity };
  if (id.startsWith('cape_')) return { kind: 'cape', id, name: CAPES.find((c) => c.key === id)?.name || id, rarity };
  const key = id === 'galaxy_skin' ? 'galaxy' : id;
  return { kind: 'skin', id: key, name: CASE_SKINS.find((s) => s.key === key)?.name || key, rarity };
}

function shopTimer() {
  const now = new Date();
  const msk = new Date(now.getTime() + (now.getTimezoneOffset() + 180) * 60000);
  const left = 24 * 3600 - (msk.getHours() * 3600 + msk.getMinutes() * 60 + msk.getSeconds());
  $('#shopTimer').textContent = `Новые товары через ${Math.floor(left / 3600)} ч ${Math.floor((left % 3600) / 60)} мин`;
}

async function renderShop() {
  shopTimer();
  const grid = $('#shopGrid');
  let data;
  try { data = await R.shop.get(); } catch (e) { grid.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  grid.innerHTML = '';
  for (const it of data.items.sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity])) {
    const reward = shopReward(it.id, it.rarity);
    const have = it.owned || owns(reward);
    const el = document.createElement('div');
    el.className = 'shop-item';
    el.style.setProperty('--rc', RARITY[it.rarity].color);
    el.innerHTML = `<canvas></canvas>
      <div class="si-name">${esc(reward.name)}</div>
      <div class="si-rar">${RARITY[it.rarity].name} ${reward.kind === 'effect' ? 'эффект' : reward.kind === 'cape' ? 'плащ' : 'скин'}</div>
      <button class="btn btn-sm ${have ? 'btn-secondary' : 'btn-primary'}" ${have ? 'disabled' : ''}>${have ? '✓ Есть' : `<i class="coin"></i> ${it.price}`}</button>`;
    rewardIcon(reward, el.querySelector('canvas'), 120);
    el.querySelector('button').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        const r = await R.shop.buy(it.id);
        setMe(r.me);
        grant(reward);
        coinBurst();
        toast(`🛒 «${reward.name}» теперь ваш${reward.kind === 'skin' ? ' — наденьте во вкладке «Скины»' : ''}`, 5000);
        b.className = 'btn btn-sm btn-secondary';
        b.textContent = '✓ Есть';
        renderCollection();
      } catch (er) { b.disabled = false; toast(er.message, 5000); }
    });
    grid.appendChild(el);
  }
}

$$('#chestMode button').forEach((b) => b.addEventListener('click', () => {
  $$('#chestMode button').forEach((x) => x.classList.toggle('active', x === b));
  const shop = b.dataset.v === 'shop';
  $('#shopPane').classList.toggle('hidden', !shop);
  $('#casesGrid').classList.toggle('hidden', shop);
  if (shop) renderShop();
}));

// ───────────── Рейтинг ─────────────

const LB_FMT = { play: (v) => fmtTime(v), achievements: (v) => `${v} 🏆`, chests: (v) => `${v} 🎁`, coins: (v) => `${v.toLocaleString('ru-RU')} 💰` };
let lbBy = 'play';
const clanBadge = (tag) => (tag ? ` <span class="clan-tag">[${esc(tag)}]</span>` : '');

async function renderLeaderboard() {
  const list = $('#lbList');
  try {
    const d = await R.leaderboard(lbBy);
    $('#lbMe').innerHTML = d.me.rank
      ? `Вы на <b>${d.me.rank} месте</b> · ${esc(LB_FMT[lbBy](d.me.value))}`
      : 'Вас пока нет в рейтинге — играйте, открывайте сундуки и собирайте достижения!';
    list.innerHTML = d.top.length ? d.top.map((p, i) => `
      <div class="lb-row ${p.nick.toLowerCase() === st.account?.name.toLowerCase() ? 'me' : ''}">
        <span class="lb-rank">${['🥇', '🥈', '🥉'][i] || i + 1}</span>
        <img class="fhead" src="https://mc-heads.net/avatar/${esc(p.uuid)}/64" alt="" />
        <strong>${esc(p.nick)}${clanBadge(p.clan)}${p.pro ? ' <span class="pro-badge">PRO</span>' : ''}</strong>
        <span class="lb-val">${esc(LB_FMT[lbBy](p.value))}</span>
      </div>`).join('') : '<div class="empty">Рейтинг пока пуст</div>';
    list.querySelectorAll('.fhead').forEach((img) => img.addEventListener('error', () => { img.style.visibility = 'hidden'; }));
  } catch (e) {
    $('#lbMe').textContent = '';
    list.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}
$$('#lbBy button').forEach((b) => b.addEventListener('click', () => {
  $$('#lbBy button').forEach((x) => x.classList.toggle('active', x === b));
  lbBy = b.dataset.v;
  renderLeaderboard();
}));

// ───────────── Кланы ─────────────

const clan = { data: null, last: 0, timer: null, form: { emoji: '⚔️', color: '#0a84ff' } };

async function renderClans() {
  const box = $('#commClans');
  clearInterval(clan.timer);
  let mine, all;
  try { [mine, all] = await Promise.all([R.clans.get(), R.clans.list()]); } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  clan.data = mine;
  if (mine) {
    const owner = mine.owner.toLowerCase() === st.account?.name.toLowerCase();
    box.innerHTML = `
      <div class="clan-hero" style="--cc:${esc(mine.color)}">
        <span class="clan-emoji">${esc(mine.emoji)}</span>
        <div><h3>[${esc(mine.tag)}] ${esc(mine.name)}</h3><span>${mine.members} из ${mine.max} игроков · глава ${esc(mine.owner)}</span></div>
        <button class="btn btn-sm btn-ghost" id="clanLeave">Выйти из клана</button>
      </div>
      <div class="clan-cols">
        <div class="group" id="clanMembers">${mine.list.map((m) => `
          <div class="acc-row"><span class="dot ${m.online ? 'on' : ''}"></span><div class="meta"><strong>${esc(m.nick)}${m.nick === mine.owner ? ' 👑' : ''}${m.pro ? ' <span class="pro-badge">PRO</span>' : ''}</strong><span>${fmtTime(m.playMinutes)} в игре</span></div>
          ${owner && m.nick !== mine.owner ? `<button class="icon-btn" data-kick="${esc(m.nick)}" title="Исключить"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ''}</div>`).join('')}</div>
        <div class="chat clan-chat">
          <div class="chat-head"><strong>💬 Чат клана</strong></div>
          <div class="chat-msgs" id="clanMsgs"></div>
          <form class="chat-form" id="clanForm"><input class="field field-sm" id="clanInput" placeholder="Сообщение клану…" maxlength="500" autocomplete="off" /><button class="btn btn-primary btn-sm">Отправить</button></form>
        </div>
      </div>`;
    clan.last = 0;
    $('#clanMsgs').innerHTML = '';
    pollClanChat();
    clan.timer = setInterval(() => { if (!$('#tab-community').classList.contains('hidden')) pollClanChat(); }, 4000);
    $('#clanLeave').addEventListener('click', async (e) => {
      if (e.target.dataset.sure !== '1') { e.target.dataset.sure = '1'; e.target.textContent = 'Точно выйти?'; return; }
      await R.clans.leave().catch((er) => toast(er.message));
      refreshMe(); renderClans();
    });
    $('#clanMembers').addEventListener('click', async (e) => {
      const k = e.target.closest('[data-kick]');
      if (!k) return;
      try { await R.clans.kick(k.dataset.kick); renderClans(); } catch (er) { toast(er.message); }
    });
    $('#clanForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = $('#clanInput').value.trim();
      if (!t) return;
      $('#clanInput').value = '';
      try { await R.clans.say(t); pollClanChat(); } catch (er) { toast(er.message); }
    });
    return;
  }
  // Нет клана: создать или вступить
  box.innerHTML = `
    <form class="card clan-create" id="clanCreate">
      <h4>Создать клан · <i class="coin"></i> ${all.price}</h4>
      <div class="cc-row">
        <input class="field field-sm" id="ccTag" placeholder="Тег (2–5 букв)" maxlength="5" style="width:130px" />
        <input class="field field-sm" id="ccName" placeholder="Название клана" maxlength="24" style="flex:1" />
      </div>
      <div class="cc-pick" id="ccEmoji">${all.emoji.map((e) => `<button type="button" data-e="${e}" class="${e === clan.form.emoji ? 'active' : ''}">${e}</button>`).join('')}</div>
      <div class="cc-pick colors" id="ccColor">${all.colors.map((c) => `<button type="button" data-c="${c}" style="background:${c}" class="${c === clan.form.color ? 'active' : ''}"></button>`).join('')}</div>
      <button class="btn btn-primary btn-sm">Создать клан</button>
    </form>
    <h3 class="section-title">Кланы Rionina</h3>
    <div class="clans-grid">${all.clans.length ? all.clans.map((c) => `
      <div class="clan-card" style="--cc:${esc(c.color)}">
        <span class="clan-emoji">${esc(c.emoji)}</span>
        <div class="cc-meta"><strong>[${esc(c.tag)}] ${esc(c.name)}</strong><span class="muted small">${c.members} / ${c.max} игроков</span></div>
        <button class="btn btn-sm btn-primary" data-join="${esc(c.tag)}" ${c.members >= c.max ? 'disabled' : ''}>Вступить</button>
      </div>`).join('') : '<div class="empty">Кланов пока нет — создайте первый!</div>'}</div>`;
  $('#ccEmoji').addEventListener('click', (e) => { const b = e.target.closest('[data-e]'); if (!b) return; clan.form.emoji = b.dataset.e; $$('#ccEmoji button').forEach((x) => x.classList.toggle('active', x === b)); });
  $('#ccColor').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; clan.form.color = b.dataset.c; $$('#ccColor button').forEach((x) => x.classList.toggle('active', x === b)); });
  $('#clanCreate').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await R.clans.create({ tag: $('#ccTag').value.trim(), name: $('#ccName').value.trim(), emoji: clan.form.emoji, color: clan.form.color });
      setMe(r.me);
      toast(`⚔️ Клан [${r.clan.tag}] создан!`);
      renderClans();
    } catch (er) { toast(er.message, 5000); }
  });
  box.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', async () => {
    try { await R.clans.join(b.dataset.join); toast(`Вы вступили в клан [${b.dataset.join}]`); refreshMe(); renderClans(); } catch (er) { toast(er.message); }
  }));
}

async function pollClanChat() {
  try {
    const { messages } = await R.clans.chat(clan.last);
    const box = $('#clanMsgs');
    if (!box) return;
    if (messages.length) box.querySelector('.center')?.remove();
    for (const m of messages) {
      const el = document.createElement('div');
      if (m.from === '★') { el.className = 'msg-sys'; el.textContent = m.text; }
      else {
        const mine = m.from.toLowerCase() === st.account?.name.toLowerCase();
        el.className = `msg ${mine ? 'mine' : ''}`;
        el.innerHTML = `${mine ? '' : `<b>${esc(m.from)}</b> `}<span>${esc(m.text)}</span><time>${new Date(m.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time>`;
      }
      box.appendChild(el);
      clan.last = Math.max(clan.last, m.at);
    }
    if (messages.length) box.scrollTop = box.scrollHeight;
    if (!box.children.length) box.innerHTML = '<div class="muted small center">Напишите клану первым 👋</div>';
  } catch { /* сервер недоступен */ }
}

$$('#commMode button').forEach((b) => b.addEventListener('click', () => {
  $$('#commMode button').forEach((x) => x.classList.toggle('active', x === b));
  const top = b.dataset.v === 'top';
  $('#commTop').classList.toggle('hidden', !top);
  $('#commClans').classList.toggle('hidden', top);
  if (top) renderLeaderboard(); else renderClans();
}));
document.querySelector('.nav[data-tab="community"]').addEventListener('click', () => {
  if ($('#commClans').classList.contains('hidden')) renderLeaderboard(); else renderClans();
});
