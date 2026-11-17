// Сундуки: открываются за Rionina Coins (с Pro — бесплатно). Внутри скины и спецэффекты.

const CASES = [
  {
    id: 'starter', name: 'Обычный сундук', art: '📦', desc: 'Скины и обычные эффекты',
    bg: 'linear-gradient(140deg, #34c759, #0a84ff)',
    pool: { common: 64, rare: 28, epic: 7, legendary: 1 },
  },
  {
    id: 'effects', name: 'Сундук эффектов', art: '⚡', desc: 'Только спецэффекты — молния, огонь, портал…',
    bg: 'linear-gradient(140deg, #5e5ce6, #bf5af2)',
    pool: { common: 50, rare: 32, epic: 14, legendary: 4 }, onlyEffects: true,
  },
  {
    id: 'legend', name: 'Легендарный сундук', art: '👑', desc: 'Только редкое и выше',
    bg: 'linear-gradient(140deg, #ff9f0a, #ff375f)',
    pool: { rare: 60, epic: 30, legendary: 10 },
  },
];

// Все возможные награды
function allRewards() {
  const list = [];
  for (const [id, e] of Object.entries(EFFECTS)) list.push({ kind: 'effect', id, name: e.name, rarity: e.rarity });
  for (const s of CASE_SKINS) list.push({ kind: 'skin', id: s.key, name: s.name, rarity: s.rarity });
  // Готовые скины тоже могут выпасть как обычные
  for (const s of READY_SKINS.slice(0, 8)) list.push({ kind: 'skin', id: s.key, name: s.name, rarity: 'common', ready: true });
  return list;
}

function rollReward(box) {
  const pool = allRewards().filter((r) => (!box.onlyEffects || r.kind === 'effect') && box.pool[r.rarity]);
  const total = Object.entries(box.pool).reduce((s, [r, w]) => s + (pool.some((p) => p.rarity === r) ? w : 0), 0);
  let x = Math.random() * total;
  let rarity = 'common';
  for (const [r, w] of Object.entries(box.pool)) {
    if (!pool.some((p) => p.rarity === r)) continue;
    if ((x -= w) <= 0) { rarity = r; break; }
  }
  const options = pool.filter((p) => p.rarity === rarity);
  return options[Math.floor(Math.random() * options.length)];
}

function skinDataFor(reward) {
  const item = CASE_SKINS.find((s) => s.key === reward.id) || READY_SKINS.find((s) => s.key === reward.id);
  return { data: presetData(item), model: item.spec.model || 'classic' };
}

/** Картинка награды: голова скина или превью эффекта. */
function rewardIcon(reward, canvas, size = 96) {
  if (reward.kind === 'effect') return fxThumb(reward.id, canvas, size);
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, RARITY[reward.rarity].color + '55'); g.addColorStop(1, RARITY[reward.rarity].color + '18');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  loadImg(skinDataFor(reward).data).then((img) => {
    ctx.imageSmoothingEnabled = false;
    const s = size * 0.62, o = (size - s) / 2;
    ctx.drawImage(img, 8, 8, 8, 8, o, o, s, s);
    ctx.drawImage(img, 40, 8, 8, 8, o, o, s, s);
  });
}

function owns(reward) {
  const c = collection();
  if (reward.kind === 'effect') return c.effects.includes(reward.id);
  return mySkins().some((s) => s.preset === reward.id);
}

function grant(reward) {
  const c = collection();
  if (reward.kind === 'effect') { if (!c.effects.includes(reward.id)) c.effects.push(reward.id); }
  else if (!mySkins().some((s) => s.preset === reward.id)) {
    const { data, model } = skinDataFor(reward);
    mySkins().push({ id: uid(), name: reward.name, model, data, source: 'case', preset: reward.id, rarity: reward.rarity });
    if (!c.skins.includes(reward.id)) c.skins.push(reward.id);
  }
  st.settings.stats = { ...(st.settings.stats || {}), cases: (st.settings.stats?.cases || 0) + 1 };
  R.settings.set({ skins: st.settings.skins, collection: c, stats: st.settings.stats });
}

// ───────────── Рулетка ─────────────

let spinning = false;

async function openCase(box) {
  if (spinning) return;
  spinning = true;
  try {
    const res = await R.eco.chest(box.id);
    setMe(res.me);
  } catch (e) {
    spinning = false;
    toast(e.message, 5000);
    return;
  }
  const sheet = $('#caseSheet');
  const track = $('#rouletteTrack');
  const result = $('#caseResult');
  $('#caseTitle').textContent = box.name;
  result.classList.add('hidden');
  sheet.classList.remove('hidden');

  const win = rollReward(box);
  const WIN_AT = 44;
  const items = Array.from({ length: 52 }, (_, i) => (i === WIN_AT ? win : rollReward(box)));
  track.style.transition = 'none';
  track.style.transform = 'translateX(0)';
  track.innerHTML = '';
  for (const it of items) {
    const el = document.createElement('div');
    el.className = 'r-item';
    el.style.setProperty('--rc', RARITY[it.rarity].color);
    el.innerHTML = `<canvas></canvas><span>${esc(it.name)}</span>`;
    rewardIcon(it, el.querySelector('canvas'), 96);
    track.appendChild(el);
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const itemW = 120; // 110 + gap 10
  const view = track.parentElement.clientWidth;
  const offset = WIN_AT * itemW + 55 - view / 2 + (Math.random() - 0.5) * 70;
  track.style.transition = 'transform 5.2s cubic-bezier(.12,.75,.12,1)';
  track.style.transform = `translateX(${-offset}px)`;
  await new Promise((r) => setTimeout(r, 5400));

  const dup = owns(win);
  grant(win);
  result.style.setProperty('--rc', RARITY[win.rarity].color);
  result.innerHTML = `
    <canvas class="big"></canvas>
    <h4>${esc(win.name)}</h4>
    <div class="rr">${RARITY[win.rarity].name} ${win.kind === 'effect' ? 'эффект' : 'скин'}${dup ? ' · уже есть в коллекции' : ''}</div>
    <div class="row-gap">
      <button class="btn btn-primary" id="caseUse">${win.kind === 'effect' ? 'Включить эффект' : 'Надеть скин'}</button>
      <button class="btn btn-secondary" id="caseAgain">Открыть ещё</button>
      <button class="btn btn-secondary" id="caseClose">Закрыть</button>
    </div>`;
  rewardIcon(win, result.querySelector('canvas'), 240);
  result.classList.remove('hidden');
  spinning = false;
  renderCollection();

  $('#caseUse').onclick = async () => {
    if (win.kind === 'effect') {
      profile().effect = win.id;
      await saveSkinData();
      toast(`Эффект «${win.name}» включён — посмотрите на своего персонажа`);
    } else {
      const s = mySkins().find((x) => x.preset === win.id);
      sk.sel = { kind: 'mine', id: s.id, data: s.data, model: s.model, name: s.name };
      await wearSelected();
    }
    updateProfileVisuals();
    sheet.classList.add('hidden');
  };
  $('#caseAgain').onclick = () => openCase(box);
  $('#caseClose').onclick = () => sheet.classList.add('hidden');
}

$('#caseSheet').addEventListener('click', (e) => {
  if (e.target.id === 'caseSheet' && !spinning) $('#caseSheet').classList.add('hidden');
});

function renderCases() {
  renderDaily();
  const grid = $('#casesGrid');
  grid.innerHTML = '';
  for (const box of CASES) {
    const el = document.createElement('div');
    el.className = 'case-box';
    el.style.background = box.bg;
    const price = st.me?.economy?.chests?.[box.id] ?? '…';
    const pro = !!st.me?.pro;
    el.innerHTML = `<span class="free">${pro ? 'PRO · бесплатно' : `<i class="coin"></i> ${price}`}</span><div class="art">${box.art}</div><h3>${esc(box.name)}</h3><p>${esc(box.desc)}</p><button class="btn">${pro ? 'Открыть бесплатно' : `Открыть за ${price}`}</button>`;
    el.querySelector('button').onclick = () => openCase(box);
    grid.appendChild(el);
  }
  renderCollection();
}

function renderCollection() {
  const box = $('#collection');
  const all = allRewards();
  const owned = all.filter(owns);
  $('#collCount').textContent = `${owned.length} из ${all.length}`;
  box.innerHTML = '';
  for (const r of all) {
    const have = owns(r);
    const el = document.createElement('div');
    el.className = 'coll-item';
    el.style.setProperty('--rc', RARITY[r.rarity].color);
    if (!have) el.style.opacity = '.38';
    el.innerHTML = `<canvas></canvas><div class="nm">${have ? esc(r.name) : '???'}</div><div class="rr">${RARITY[r.rarity].name}</div>`;
    rewardIcon(r, el.querySelector('canvas'), 96);
    box.appendChild(el);
  }
}

document.querySelector('.nav[data-tab="cases"]').addEventListener('click', renderCases);

// ───────────── Ежедневная награда ─────────────

const DAILY_REWARDS = [50, 60, 70, 80, 100, 120, 200];

function renderDaily() {
  const box = $('#dailyCard');
  const me = st.me;
  if (!me) { box.innerHTML = ''; return; }
  const k = me.pro ? 2 : 1;
  const streak = me.streak || 0;
  const todayIdx = me.dailyAvailable ? Math.min(streak, 6) : Math.max(0, Math.min(streak - 1, 6));
  box.innerHTML = `
    <div class="daily-head">
      <div><h3>Ежедневная награда</h3><p class="muted small">Заходите каждый день подряд — награда растёт${me.pro ? ' · Pro ×2' : ''}</p></div>
      <button class="btn btn-primary" id="btnDaily" ${me.dailyAvailable ? '' : 'disabled'}>${me.dailyAvailable ? `Забрать ${me.nextDaily}` : 'Завтра ещё'}</button>
    </div>
    <div class="daily-days">${DAILY_REWARDS.map((r, i) => `
      <div class="day ${i < todayIdx || (!me.dailyAvailable && i === todayIdx) ? 'got' : ''} ${me.dailyAvailable && i === todayIdx ? 'today' : ''}">
        <span>День ${i + 1}</span><i class="coin"></i><b>${r * k}</b>
      </div>`).join('')}</div>`;
  $('#btnDaily').onclick = async () => {
    try {
      const res = await R.eco.daily();
      setMe(res.me);
      toast(`+${res.reward} Rionina Coins!`);
      coinBurst();
    } catch (e) { toast(e.message); }
  };
}

function coinBurst() {
  const pill = $('#coinPill');
  pill.classList.remove('bump');
  void pill.offsetWidth;
  pill.classList.add('bump');
}
