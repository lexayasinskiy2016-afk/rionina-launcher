// Моды, шейдеры и ресурс-паки из Modrinth.
const CT = {
  mods: { type: 'mod', needsFabric: true, loaders: ['fabric', 'forge', 'neoforge'] },
  shaders: { type: 'shader', needsFabric: true, loaders: ['fabric'] },
  packs: { type: 'resourcepack', needsFabric: false },
};
const ctState = { mods: {}, shaders: {}, packs: {} };
const fmtNum = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} млн` : n >= 1e3 ? `${Math.round(n / 1e3)} тыс.` : String(n));

async function installedVersions() {
  try { return await R.versions.installed(); } catch { return []; }
}

async function fillTargets(key) {
  const sel = document.querySelector(`[data-target="${key}"]`);
  const list = (await installedVersions()).filter((v) => !CT[key].needsFabric || CT[key].loaders.includes(v.loader));
  const s = ctState[key];
  if (!list.length) {
    sel.innerHTML = `<option value="">${CT[key].needsFabric ? (key === 'shaders' ? 'Нет сборки Fabric' : 'Нет сборки с модами') : 'Нет установленных версий'}</option>`;
    s.target = null;
    return null;
  }
  if (!list.some((v) => v.id === s.target)) {
    const pref = list.find((v) => v.id === st.settings.selectedVersion);
    s.target = (pref || list[0]).id;
  }
  sel.innerHTML = list.map((v) => `<option value="${esc(v.id)}">${v.name ? `${esc(v.name)} · ` : ''}${v.loader ? `${LOADER_NAMES[v.loader] || v.loader} ${esc(v.gameVersion)}` : `Minecraft ${esc(v.id)}`}</option>`).join('');
  sel.value = s.target;
  return list.find((v) => v.id === s.target);
}

async function renderInstalledContent(key) {
  const s = ctState[key];
  const box = document.querySelector(`[data-installed="${key}"]`);
  if (!s.target) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  let list = [];
  try { list = await R.content.list({ type: CT[key].type, versionId: s.target }); } catch { /* пусто */ }
  s.installedIds = new Set(list.map((x) => x.projectId).filter(Boolean));
  box.querySelector('.count').textContent = list.length;
  box.querySelector('.inst-list').innerHTML = list.length
    ? list.map((x) => `<div class="inst-row"><span>${esc(x.file)}</span><button class="btn btn-secondary btn-sm btn-danger" data-rm="${esc(x.file)}">Удалить</button></div>`).join('')
    : '<div class="inst-row"><span class="muted">Пока ничего не установлено</span></div>';
}

async function searchContent(key, append = false) {
  const s = ctState[key];
  const grid = document.querySelector(`[data-results="${key}"]`);
  const more = document.querySelector(`[data-more="${key}"]`);
  if (!append) { s.offset = 0; grid.innerHTML = '<div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:120px"></div>'; }
  const v = (await installedVersions()).find((x) => x.id === s.target);
  try {
    const res = await R.content.search({ type: CT[key].type, query: s.query || '', gameVersion: v?.gameVersion, loader: v?.loader || 'fabric', offset: s.offset, sort: s.sort || 'downloads' });
    if (!append) grid.innerHTML = '';
    for (const h of res.hits) grid.appendChild(resultCard(key, h));
    s.offset += res.hits.length;
    more.classList.toggle('hidden', s.offset >= res.total);
    if (!res.hits.length && !append) grid.innerHTML = '<div class="empty">Ничего не найдено для этой версии</div>';
  } catch (e) {
    grid.innerHTML = `<div class="empty">Не удалось загрузить каталог: ${esc(e.message)}</div>`;
    more.classList.add('hidden');
  }
}

function resultCard(key, h) {
  const s = ctState[key];
  const el = document.createElement('div');
  el.className = 'mr-card';
  const have = s.installedIds?.has(h.id);
  el.innerHTML = `
    ${h.icon ? `<img src="${esc(h.icon)}" alt="" loading="lazy">` : '<div class="ph"></div>'}
    <div class="info">
      <h4 title="${esc(h.title)}">${esc(h.title)}</h4>
      <span class="by">${esc(h.author)}</span>
      <p>${esc(h.description)}</p>
      <div class="foot">
        <span class="dl">⬇ ${fmtNum(h.downloads)}</span>
        <button class="btn btn-sm ${have ? 'btn-secondary' : 'btn-primary'}" ${have ? 'disabled' : ''}>${have ? '✓ Установлено' : 'Установить'}</button>
      </div>
    </div>`;
  el.querySelector('h4').addEventListener('click', () => R.openExternal(`https://modrinth.com/${CT[key].type === 'resourcepack' ? 'resourcepack' : CT[key].type}/${h.slug}`));
  el.querySelector('h4').style.cursor = 'pointer';
  const btn = el.querySelector('button');
  btn.addEventListener('click', async () => {
    if (!s.target) return toast(CT[key].needsFabric ? 'Сначала создайте сборку с модами во вкладке «Моды»' : 'Сначала установите версию во вкладке «Версии»');
    btn.disabled = true;
    btn.textContent = 'Установка…';
    try {
      const files = await R.content.install({ type: CT[key].type, projectId: h.id, versionId: s.target });
      btn.textContent = '✓ Установлено';
      btn.className = 'btn btn-sm btn-secondary';
      const extra = files.length > 1 ? ` (+${files.length - 1} зависимости)` : '';
      toast(`«${h.title}» установлен${extra}${key === 'shaders' ? ' и включён' : ''}`);
      renderInstalledContent(key);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Установить';
      toast(e.message, 6000);
    }
  });
  return el;
}

async function openContentTab(key) {
  const s = ctState[key];
  await fillTargets(key);
  await renderInstalledContent(key);
  if (key === 'mods') renderFabricHero();
  if (key === 'packs') renderOwnPacks();
  searchContent(key);
  if (!s.bound) {
    s.bound = true;
    document.querySelector(`[data-target="${key}"]`).addEventListener('change', async (e) => {
      s.target = e.target.value;
      await renderInstalledContent(key);
      searchContent(key);
    });
    let t;
    document.querySelector(`[data-search="${key}"]`).addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => { s.query = e.target.value; searchContent(key); }, 350);
    });
    document.querySelectorAll(`[data-sort="${key}"] button`).forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll(`[data-sort="${key}"] button`).forEach((x) => x.classList.toggle('active', x === b));
      s.sort = b.dataset.v;
      searchContent(key);
    }));
    document.querySelector(`[data-more="${key}"]`).addEventListener('click', () => searchContent(key, true));
    document.querySelector(`[data-installed="${key}"]`).addEventListener('click', async (e) => {
      const f = e.target.closest('[data-rm]')?.dataset.rm;
      if (!f) return;
      await R.content.remove({ type: CT[key].type, versionId: s.target, file: f }).catch((er) => toast(er.message));
      renderInstalledContent(key);
    });
  }
}

// ───────────── Сборка Fabric ─────────────

async function renderFabricHero() {
  const sel = $('#fabricGame');
  if (sel.options.length) return;
  fillLoaderVersions(sel, modLoader);
}

$('#btnCreateFabric').addEventListener('click', async () => {
  const v = $('#fabricGame').value;
  if (!v) return;
  const loader = modLoader;
  const btn = $('#btnCreateFabric');
  btn.disabled = true;
  btn.textContent = 'Создаём…';
  toast(`Создаём сборку ${LOADER_NAMES[loader]} ${v} — прогресс внизу`, 6000);
  const finish = async (id) => {
    ctState.mods.target = id;
    if (loader === 'fabric') ctState.shaders.target = id;
    await openContentTab('mods');
    try {
      // Fabric API нужен почти всем модам Fabric — ставим сразу
      if (loader === 'fabric') await R.content.install({ type: 'mod', projectId: 'P7dR8mSH', versionId: id });
      if (st.me?.pro) await R.eco.boost(id).catch(() => {});
    } catch { /* без сети — поставят вручную */ }
    toast(`Сборка ${LOADER_NAMES[loader]} ${v} готова — ставьте моды!`);
    renderInstalledContent('mods');
  };
  try {
    const id = await R.loaders.create({ loader, gameVersion: v });
    if (loader !== 'fabric') await finish(id);
    else {
      const off = R.onInstallState((p) => {
        if (p.id !== id || (p.state !== 'done' && p.state !== 'error')) return;
        off();
        if (p.state === 'done') finish(id);
      });
    }
  } catch (e) {
    toast(e.message, 7000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Создать сборку';
  }
});

// ───────────── Паки Rionina ─────────────

const OWN_PREVIEW = {
  'rionina-smooth': ['#8f9399', '#8a6446', '#e3d6a3', '#b48a55', '#a8735f', '#d6d6d3', '#4f5156', '#a2584a', '#f7fbff'],
  'rionina-clear-glass': ['#f9fffe', '#3ab3da', '#f38baa', '#80c71f', '#fed83d', '#8932b8', '#b02e26', '#169c9c', '#f9801d'],
};

async function renderOwnPacks() {
  const box = $('#ownPacks');
  let list = [];
  try { list = await R.content.ownPacks(); } catch { /* нет */ }
  box.innerHTML = '';
  for (const p of list) {
    const el = document.createElement('div');
    el.className = 'own-pack';
    el.innerHTML = `<div class="prev">${(OWN_PREVIEW[p.id] || []).map((c) => `<i style="background:${c}"></i>`).join('')}</div>
      <div class="t"><h4>${esc(p.name)}</h4><p>${esc(p.description)}</p></div>
      <button class="btn btn-primary btn-sm">Установить</button>`;
    el.querySelector('button').onclick = async (e) => {
      const s = ctState.packs;
      if (!s.target) return toast('Сначала установите версию во вкладке «Версии»');
      e.target.disabled = true;
      try {
        await R.content.installOwn({ packId: p.id, versionId: s.target });
        e.target.textContent = '✓ Включён';
        toast(`«${p.name}» установлен и включён`);
        renderInstalledContent('packs');
      } catch (er) {
        e.target.disabled = false;
        toast(er.message);
      }
    };
    box.appendChild(el);
  }
}

for (const key of Object.keys(CT)) {
  document.querySelector(`.nav[data-tab="${key}"]`).addEventListener('click', () => openContentTab(key));
}
