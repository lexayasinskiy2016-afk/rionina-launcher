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

const WORLD_AUD = { clan: 'для клана', all: 'для всех' };
const worldRow = (w, tag) => `
  <div class="acc-row clan-world"><span class="cw-ico">${w.mode === 'dungeon' ? '🗡️' : '🌍'}</span>
    <div class="meta"><strong>${w.mode === 'dungeon' ? 'Данж' : 'Мир'} ${esc(w.host)}</strong><span>Minecraft ${esc(w.gameVersion)} · ${WORLD_AUD[w.audience] || ''}</span></div>
    <button class="btn btn-primary btn-sm" data-world="${esc(tag)}" data-host="${esc(w.host)}">Зайти</button></div>`;

async function joinClanWorld(btn) {
  btn.disabled = true;
  btn.textContent = 'Подготовка…';
  toast(`Готовим ту же версию и моды, что у ${btn.dataset.host}, и подключаемся…`, 6000);
  try { await R.clans.world(btn.dataset.world, btn.dataset.host); } catch (er) { toast(er.message, 6000); }
  btn.disabled = false;
  btn.textContent = 'Зайти';
}

function releaseOptions() {
  const host = $('#hostVersion');
  if (host?.options.length) return host.innerHTML;
  return st.versions.filter((v) => v.type === 'release').slice(0, 40).map((v) => `<option value="${esc(v.id)}">Minecraft ${esc(v.id)}</option>`).join('');
}

async function renderClans() {
  const box = $('#commClans');
  clearInterval(clan.timer);
  let mine, all;
  try { [mine, all] = await Promise.all([R.clans.get(), R.clans.list()]); } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  clan.data = mine;
  if (all.notice) toast(all.notice.text, 6000);
  if (mine) {
    const owner = mine.owner.toLowerCase() === st.account?.name.toLowerCase();
    const reqs = mine.requests || [];
    box.innerHTML = `
      <div class="clan-hero" style="--cc:${esc(mine.color)}">
        <span class="clan-emoji">${esc(mine.emoji)}</span>
        <div><h3>[${esc(mine.tag)}] ${esc(mine.name)}</h3><span>${mine.members} из ${mine.max} игроков · глава ${esc(mine.owner)} · ${mine.open ? 'свободный вход' : 'вход по заявке'}</span></div>
        <button class="btn btn-sm btn-ghost" id="clanLeave">Выйти из клана</button>
      </div>
      ${owner && reqs.length ? `<div class="card clan-reqs"><h4>📨 Заявки в клан · ${reqs.length}</h4>${reqs.map((r) => `
        <div class="acc-row"><div class="meta"><strong>${esc(r.nick)}</strong><span>${r.text ? `«${esc(r.text)}»` : 'Хочет вступить в клан'}</span></div>
        <button class="btn btn-primary btn-sm" data-acc="${esc(r.nick)}">Принять</button>
        <button class="btn btn-secondary btn-sm" data-dec="${esc(r.nick)}">Отклонить</button></div>`).join('')}</div>` : ''}
      <div class="card clan-worlds">
        <h4>🏰 Миры клана</h4>
        ${mine.worlds.length ? mine.worlds.map((w) => worldRow(w, mine.tag)).join('') : '<p class="muted small">Сейчас никто не открыл мир. Откройте свой — клан увидит его здесь.</p>'}
        <div class="cw-host">
          <select class="select select-sm" id="cwVersion">${releaseOptions()}</select>
          <div class="segmented" id="cwAudience"><button class="active" data-v="clan">Только клан</button><button data-v="all">Для всех</button></div>
          <label class="host-check"><input type="checkbox" id="cwDungeon" /> 🗡️ Данжи</label>
          <button class="btn btn-primary btn-sm" id="cwOpen">Открыть мир</button>
        </div>
      </div>
      ${owner ? `<div class="card clan-settings"><h4>⚙️ Настройки клана</h4>
        <label class="host-check"><input type="checkbox" id="clanOpen" ${mine.open ? 'checked' : ''} /> Свободный вход — без заявок</label></div>` : ''}
      <div class="clan-cols">
        <div class="group" id="clanMembers">${mine.list.map((m) => `
          <div class="acc-row"><span class="dot ${m.online ? 'on' : ''}"></span><div class="meta"><strong>${esc(m.nick)}${m.nick === mine.owner ? ' 👑' : ''}${m.pro ? ' <span class="pro-badge">PRO</span>' : ''}</strong><span>${fmtTime(m.playMinutes)} в игре</span></div>
          ${owner && m.nick !== mine.owner ? `<button class="icon-btn" data-kick="${esc(m.nick)}" title="Исключить"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ''}</div>`).join('')}</div>
        <div class="chat clan-chat">
          <div class="chat-head"><strong>💬 Чат клана</strong><span class="muted small">без матов и оскорблений</span></div>
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
    box.querySelector('.clan-reqs')?.addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      const nick = t.dataset.acc || t.dataset.dec;
      try {
        await R.clans.answer(nick, !!t.dataset.acc);
        toast(t.dataset.acc ? `${nick} теперь в клане!` : `Заявка ${nick} отклонена`);
        renderClans();
      } catch (er) { toast(er.message); }
    });
    $('#clanOpen')?.addEventListener('change', async (e) => {
      try { await R.clans.settings({ open: e.target.checked }); toast(e.target.checked ? 'Теперь в клан можно вступить без заявки' : 'Теперь в клан вступают по заявке'); renderClans(); } catch (er) { toast(er.message); }
    });
    let cwAud = 'clan';
    $$('#cwAudience button').forEach((b) => b.addEventListener('click', () => { cwAud = b.dataset.v; $$('#cwAudience button').forEach((x) => x.classList.toggle('active', x === b)); }));
    $('#cwOpen').addEventListener('click', async (e) => {
      const v = $('#cwVersion').value;
      if (!v) return toast('Выберите версию');
      const b = e.currentTarget;
      b.disabled = true;
      b.textContent = $('#cwDungeon').checked ? 'Ставим данжи…' : 'Готовим игру…';
      try {
        await hostWorld(v, cwAud, $('#cwDungeon').checked);
        b.textContent = 'Мир открывается…';
        toast($('#cwDungeon').checked ? 'Создайте новый мир — в нём появятся данжи. Потом Esc → «Открыть для сети»' : 'Войдите в мир и нажмите Esc → «Открыть для сети»', 8000);
      } catch (er) { toast(er.message, 6000); b.disabled = false; b.textContent = 'Открыть мир'; }
    });
    box.querySelectorAll('[data-world]').forEach((b) => b.addEventListener('click', () => joinClanWorld(b)));
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
  // Нет клана: создать, вступить или подать заявку
  const cardBtn = (c) => {
    if (all.applied === c.tag) return `<button class="btn btn-sm btn-secondary" data-cancel="1">Заявка отправлена · Отменить</button>`;
    if (c.members >= c.max) return '<button class="btn btn-sm btn-secondary" disabled>Мест нет</button>';
    return c.open ? `<button class="btn btn-sm btn-primary" data-join="${esc(c.tag)}">Вступить</button>`
      : `<button class="btn btn-sm btn-primary" data-apply="${esc(c.tag)}">Подать заявку</button>`;
  };
  box.innerHTML = `
    <form class="card clan-create" id="clanCreate">
      <h4>Создать клан · <i class="coin"></i> ${all.price}</h4>
      <div class="cc-row">
        <input class="field field-sm" id="ccTag" placeholder="Тег (2–5 букв)" maxlength="5" style="width:130px" />
        <input class="field field-sm" id="ccName" placeholder="Название клана" maxlength="24" style="flex:1" />
      </div>
      <div class="cc-pick" id="ccEmoji">${all.emoji.map((e) => `<button type="button" data-e="${e}" class="${e === clan.form.emoji ? 'active' : ''}">${e}</button>`).join('')}</div>
      <div class="cc-pick colors" id="ccColor">${all.colors.map((c) => `<button type="button" data-c="${c}" style="background:${c}" class="${c === clan.form.color ? 'active' : ''}"></button>`).join('')}</div>
      <label class="host-check"><input type="checkbox" id="ccOpen" /> Свободный вход — без заявок</label>
      <button class="btn btn-primary btn-sm">Создать клан</button>
    </form>
    <h3 class="section-title">Кланы Rionina</h3>
    <div class="clans-grid">${all.clans.length ? all.clans.map((c) => `
      <div class="clan-card" style="--cc:${esc(c.color)}">
        <div class="cc-top">
          <span class="clan-emoji">${esc(c.emoji)}</span>
          <div class="cc-meta"><strong>[${esc(c.tag)}] ${esc(c.name)}</strong><span class="muted small">${c.members} / ${c.max} игроков · ${c.open ? 'свободный вход' : 'по заявке'} · глава ${esc(c.owner)}</span></div>
          ${cardBtn(c)}
        </div>
        <div class="cc-apply hidden" data-form="${esc(c.tag)}">
          <input class="field field-sm" maxlength="200" placeholder="Сообщение главе клана (необязательно)" />
          <button class="btn btn-primary btn-sm" data-send="${esc(c.tag)}">Отправить</button>
        </div>
        ${(c.worlds || []).map((w) => worldRow(w, c.tag)).join('')}
      </div>`).join('') : '<div class="empty">Кланов пока нет — создайте первый!</div>'}</div>`;
  $('#ccEmoji').addEventListener('click', (e) => { const b = e.target.closest('[data-e]'); if (!b) return; clan.form.emoji = b.dataset.e; $$('#ccEmoji button').forEach((x) => x.classList.toggle('active', x === b)); });
  $('#ccColor').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; clan.form.color = b.dataset.c; $$('#ccColor button').forEach((x) => x.classList.toggle('active', x === b)); });
  $('#clanCreate').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await R.clans.create({ tag: $('#ccTag').value.trim(), name: $('#ccName').value.trim(), emoji: clan.form.emoji, color: clan.form.color, open: $('#ccOpen').checked });
      setMe(r.me);
      toast(`⚔️ Клан [${r.clan.tag}] создан!`);
      renderClans();
    } catch (er) { toast(er.message, 5000); }
  });
  box.querySelector('.clans-grid').addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    try {
      if (t.dataset.join) {
        await R.clans.join(t.dataset.join);
        toast(`Вы вступили в клан [${t.dataset.join}]`);
        refreshMe(); renderClans();
      } else if (t.dataset.apply) {
        const f = box.querySelector(`[data-form="${CSS.escape(t.dataset.apply)}"]`);
        f.classList.toggle('hidden');
        f.querySelector('input').focus();
      } else if (t.dataset.send) {
        const text = box.querySelector(`[data-form="${CSS.escape(t.dataset.send)}"] input`).value.trim();
        const r = await R.clans.join(t.dataset.send, text);
        if (r.joined) { toast(`Вы вступили в клан [${t.dataset.send}]`); refreshMe(); } else toast(`📨 Заявка отправлена главе клана [${t.dataset.send}] — ждите ответа`, 5000);
        renderClans();
      } else if (t.dataset.cancel) {
        await R.clans.cancelApply();
        renderClans();
      } else if (t.dataset.world) {
        joinClanWorld(t);
      }
    } catch (er) { toast(er.message, 5000); }
  });
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
