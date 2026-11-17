// Главный процесс Rionina Launcher.
const { app, BrowserWindow, ipcMain, shell, safeStorage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { Minecraft } = require('./core/minecraft');
const auth = require('./core/auth');
const news = require('./core/news');
const bedrock = require('./core/bedrock');
const modrinth = require('./core/modrinth');
const packs = require('./core/packs');
const { RioninaApi, Economy, authRionina, DEFAULT_SERVER } = require('./core/rionina');
const mp = require('./core/multiplayer');

const ROOT = path.join(app.getPath('appData'), '.rionina');
const USER = app.getPath('userData');
const DATA = path.join(USER, 'rionina.json');
const mc = new Minecraft(ROOT);

let win;
let game = null; // запущенный процесс игры

// ───────────── Хранилище ─────────────

const DEFAULTS = {
  memory: 4096, fullscreen: false, closeOnLaunch: false, selectedVersion: null,
  autoBedrock: true, bedrockAutoDone: false,
  accounts: [], activeUuid: null, server: DEFAULT_SERVER, eco: {},
  // Данные интерфейса: скины, коллекция из кейсов, тема
  skins: [], profiles: {}, collection: { effects: [], skins: [] }, theme: { mode: 'system', preset: 'default', accent: null, bg: false }, stats: { cases: 0 },
};
const UI_KEYS = ['skins', 'profiles', 'collection', 'theme', 'stats'];

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    if (raw.accountsEnc && safeStorage.isEncryptionAvailable()) {
      raw.accounts = JSON.parse(safeStorage.decryptString(Buffer.from(raw.accountsEnc, 'base64')));
    }
    // Переход со старой версии, где был один аккаунт
    if (raw.accountEnc && safeStorage.isEncryptionAvailable()) {
      const a = JSON.parse(safeStorage.decryptString(Buffer.from(raw.accountEnc, 'base64')));
      raw.accounts = [a];
      raw.activeUuid = a.uuid;
    }
    if (raw.localCredsEnc && safeStorage.isEncryptionAvailable()) {
      raw.localCreds = JSON.parse(safeStorage.decryptString(Buffer.from(raw.localCredsEnc, 'base64')));
    }
    delete raw.localCredsEnc;
    delete raw.accountsEnc;
    delete raw.accountEnc;
    delete raw.account;
    return { ...DEFAULTS, ...raw };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
}
let state = load();

function save() {
  const out = { ...state };
  if (safeStorage.isEncryptionAvailable()) {
    out.accountsEnc = safeStorage.encryptString(JSON.stringify(out.accounts)).toString('base64');
    out.localCredsEnc = safeStorage.encryptString(JSON.stringify(out.localCreds || [])).toString('base64');
    delete out.accounts;
    delete out.localCreds;
  }
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(out, null, 2));
}

const api = new RioninaApi(() => state.server || DEFAULT_SERVER);
const economy = new Economy(api, state, () => save());
const proCache = new Map(); // uuid → Pro (из последнего ответа сервера)
const isPro = (acc) => !!acc && !!proCache.get(acc.uuid);

const active = () => state.accounts.find((a) => a.uuid === state.activeUuid) || null;
const publicAccount = (a) => a && { type: a.type, name: a.name, uuid: a.uuid };
const send = (ch, payload) => win && !win.isDestroyed() && win.webContents.send(ch, payload);

function upsertAccount(acc) {
  state.accounts = state.accounts.filter((a) => a.uuid !== acc.uuid);
  state.accounts.push(acc);
  state.activeUuid = acc.uuid;
  save();
  return publicAccount(acc);
}

async function refreshIfNeeded(acc, force = false) {
  if (acc?.type !== 'microsoft') return acc;
  if (!force && acc.expires && Date.now() < acc.expires - 60_000) return acc;
  const fresh = await auth.refreshMicrosoft(acc);
  Object.assign(acc, fresh);
  save();
  return acc;
}

// ───────────── Окно ─────────────

function createWindow() {
  win = new BrowserWindow({
    width: 1220,
    height: 780,
    minWidth: 1000,
    minHeight: 640,
    frame: process.platform === 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#f5f5f7',
    show: false,
    title: 'Rionina Launcher',
    icon: path.join(__dirname, 'renderer', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ───────────── IPC ─────────────

const handle = (ch, fn) =>
  ipcMain.handle(ch, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

handle('app:info', () => ({ platform: process.platform, version: app.getVersion(), root: ROOT }));
handle('win:minimize', () => win.minimize());
handle('win:maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
handle('win:close', () => win.close());
handle('open:external', (url) => /^https?:\/\//.test(url) && shell.openExternal(url));
handle('open:folder', async (versionId) => {
  const dir = versionId ? await mc.gameDir(versionId) : ROOT;
  fs.mkdirSync(dir, { recursive: true });
  return shell.openPath(dir);
});

// ───────────── Аккаунты ─────────────

handle('account:get', async () => {
  const a = active();
  if (a) await refreshIfNeeded(a).catch(() => {});
  return publicAccount(a);
});
handle('account:list', () => state.accounts.map((a) => ({ ...publicAccount(a), active: a.uuid === state.activeUuid })));
handle('account:microsoft', async () => upsertAccount(await auth.loginMicrosoft()));
// Аккаунт Rionina: ник + пароль (сервер Rionina, а без него — локально с паролем)
handle('account:rionina', async (params) => upsertAccount(await authRionina(api, params, [...state.accounts, ...(state.localCreds || [])])));

// При выходе локальный пароль остаётся на компьютере, чтобы можно было войти снова
function forget(acc) {
  if (!acc) return;
  if (acc.type === 'local') {
    state.localCreds = (state.localCreds || []).filter((c) => c.uuid !== acc.uuid);
    state.localCreds.push(acc);
  }
  if (acc.type === 'rionina') api.call('POST', '/auth/logout', {}, acc.token).catch(() => {});
}
handle('account:switch', (uuid) => {
  if (!state.accounts.some((a) => a.uuid === uuid)) throw new Error('Аккаунт не найден');
  state.activeUuid = uuid;
  save();
  return publicAccount(active());
});
handle('account:remove', (uuid) => {
  forget(state.accounts.find((a) => a.uuid === uuid));
  state.accounts = state.accounts.filter((a) => a.uuid !== uuid);
  if (state.activeUuid === uuid) state.activeUuid = state.accounts[0]?.uuid || null;
  save();
  return publicAccount(active());
});
handle('account:logout', () => {
  forget(active());
  state.accounts = state.accounts.filter((a) => a.uuid !== state.activeUuid);
  state.activeUuid = state.accounts[0]?.uuid || null;
  save();
  return publicAccount(active());
});

// ───────────── Настройки и данные интерфейса ─────────────

handle('settings:get', () => {
  const { accounts, localCreds, eco, ...rest } = state;
  return { ...rest, totalMemory: Math.floor(require('os').totalmem() / 1024 / 1024), root: ROOT };
});
handle('settings:set', (patch) => {
  if ('server' in patch) {
    const url = String(patch.server || '').trim() || DEFAULT_SERVER;
    if (!/^https?:\/\/[\w.-]+(:\d+)?\/?$/.test(url)) throw new Error('Адрес сервера вида https://rioninalauncher.com');
    state.server = url.replace(/\/$/, '');
  }
  for (const k of ['memory', 'fullscreen', 'closeOnLaunch', 'selectedVersion', 'autoBedrock', ...UI_KEYS]) if (k in patch) state[k] = patch[k];
  save();
});

// Фон из галереи
const BG_FILE = path.join(USER, 'background');
function bgDataUrl() {
  try {
    const buf = fs.readFileSync(BG_FILE);
    const mime = buf[0] === 0x89 ? 'image/png' : buf.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : buf.slice(0, 3).toString() === 'GIF' ? 'image/gif' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
handle('theme:getBg', () => (state.theme?.bg ? bgDataUrl() : null));
handle('theme:pickBg', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Выберите фон',
    properties: ['openFile'],
    filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const st = fs.statSync(res.filePaths[0]);
  if (st.size > 25 * 1024 * 1024) throw new Error('Картинка больше 25 МБ');
  fs.copyFileSync(res.filePaths[0], BG_FILE);
  state.theme = { ...state.theme, bg: true };
  save();
  return bgDataUrl();
});
handle('theme:clearBg', () => {
  fs.rmSync(BG_FILE, { force: true });
  state.theme = { ...state.theme, bg: false };
  save();
});

// ───────────── Скины ─────────────

const pngFromDataUrl = (d) => Buffer.from(String(d).replace(/^data:image\/png;base64,/, ''), 'base64');

/** Надеть скин: для Microsoft — загрузить в профиль Minecraft, для офлайна — применится при запуске. */
handle('skin:apply', async (skinId) => {
  const acc = active();
  if (!acc) throw new Error('Нет аккаунта');
  const skin = state.skins.find((s) => s.id === skinId);
  if (!skin) throw new Error('Скин не найден');
  state.profiles[acc.uuid] = { ...(state.profiles[acc.uuid] || {}), skinId };
  save();
  if (acc.type === 'microsoft') {
    await refreshIfNeeded(acc);
    await auth.uploadSkin(acc.accessToken, pngFromDataUrl(skin.data), skin.model);
    return 'uploaded';
  }
  return 'offline';
});

handle('skin:export', async (skinId) => {
  const skin = state.skins.find((s) => s.id === skinId);
  if (!skin) throw new Error('Скин не найден');
  const res = await dialog.showSaveDialog(win, { defaultPath: `${skin.name || 'skin'}.png`, filters: [{ name: 'PNG', extensions: ['png'] }] });
  if (!res.canceled && res.filePath) fs.writeFileSync(res.filePath, pngFromDataUrl(skin.data));
});

handle('skin:import', async () => {
  const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Скин PNG 64×64', extensions: ['png'] }] });
  if (res.canceled || !res.filePaths[0]) return null;
  const buf = fs.readFileSync(res.filePaths[0]);
  if (buf.length > 1024 * 1024) throw new Error('Файл слишком большой для скина');
  return `data:image/png;base64,${buf.toString('base64')}`;
});

// ───────────── Новости ─────────────

handle('news:list', () => news.getNews());
handle('news:body', (p) => news.getPatchBody(p));

// ───────────── Версии ─────────────

handle('versions:list', async (force) => {
  const [manifest, installed] = await Promise.all([mc.getManifest(force), mc.listInstalled()]);
  return {
    latest: manifest.latest,
    versions: manifest.versions.map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime })),
    installed,
  };
});
handle('versions:installed', () => mc.listInstalled());
handle('versions:remove', async (id) => {
  await mc.removeVersion(id);
  // Папку сборки с модами (миры, моды) удаляем только у Fabric-сборок
  const inst = path.join(ROOT, 'instances', id);
  if (fs.existsSync(inst)) fs.rmSync(inst, { recursive: true, force: true });
});

// Очередь установки — версии ставятся по одной
const queue = [];
let installing = null;
function pump() {
  if (installing || !queue.length) return;
  installing = queue.shift();
  const id = installing;
  send('install:state', { id, state: 'started' });
  mc.install(id, (p) => send('install:progress', { id, ...p }))
    .then(() => send('install:state', { id, state: 'done' }))
    .catch((e) => send('install:state', { id, state: 'error', error: e.message }))
    .finally(() => { installing = null; pump(); });
}
function enqueue(id) {
  if (installing === id || queue.includes(id)) return;
  queue.push(id);
  send('install:state', { id, state: 'queued' });
  pump();
}
handle('versions:install', (id) => { enqueue(id); return 'queued'; });

// ───────────── Моды, шейдеры, ресурс-паки ─────────────

handle('fabric:games', () => modrinth.fabricGameVersions());
handle('fabric:create', async (gameVersion) => {
  const id = await modrinth.createFabricProfile(path.join(ROOT, 'versions'), gameVersion);
  enqueue(id);
  return id;
});

async function target(versionId) {
  const v = (await mc.listInstalled()).find((x) => x.id === versionId);
  if (!v) throw new Error('Сначала выберите установленную версию');
  return { gameVersion: v.gameVersion, gameDir: await mc.gameDir(versionId), loader: v.loader };
}

handle('content:search', (params) => modrinth.search(params));
handle('content:list', async ({ type, versionId }) => {
  const t = await target(versionId);
  return modrinth.listInstalled(t.gameDir, type);
});
handle('content:remove', async ({ type, versionId, file }) => {
  const t = await target(versionId);
  await modrinth.removeFile(t.gameDir, type, file);
});
handle('content:install', async ({ type, projectId, versionId }) => {
  const t = await target(versionId);
  if ((type === 'mod' || type === 'shader') && t.loader !== 'fabric') {
    throw new Error('Моды и шейдеры работают в сборке Fabric — создайте её во вкладке «Моды»');
  }
  const files = [];
  if (type === 'shader') {
    // Для шейдеров нужны Iris и Sodium
    for (const dep of ['sodium', 'iris']) {
      if (!(await modrinth.hasProject(path.join(t.gameDir, 'mods'), await modrinth.projectIdOf(dep)))) {
        files.push(...(await modrinth.installProject({ projectId: dep, type: 'mod', gameVersion: t.gameVersion, gameDir: t.gameDir })));
      }
    }
  }
  const installed = await modrinth.installProject({ projectId, type, gameVersion: t.gameVersion, gameDir: t.gameDir });
  files.push(...installed);
  if (type === 'shader') await packs.enableShader(t.gameDir, installed[0]);
  if (type === 'resourcepack') await packs.enableResourcePack(t.gameDir, installed[0]);
  return files;
});
handle('packs:own', () => packs.OWN_PACKS);
handle('packs:installOwn', async ({ packId, versionId }) => {
  const t = await target(versionId);
  return packs.installOwnPack(t.gameDir, packId);
});

// ───────────── Запуск Java Edition ─────────────

// ───────────── Запуск игры ─────────────

let hosting = null; // { versionId, gameVersion, mods, address }

async function launchGame(id, { join = null, host = false } = {}) {
  if (game) throw new Error('Игра уже запущена');
  const acc = active();
  if (!acc) throw new Error('Сначала войдите в аккаунт');
  await refreshIfNeeded(acc, true);
  mc.concurrency = isPro(acc) ? 48 : 24;

  // Проверяем всю цепочку: сборка Fabric + обычная версия под ней
  if (!(await mc.isInstalled(id))) {
    await mc.install(id, (p) => send('install:progress', { id, ...p }));
    send('install:state', { id, state: 'done' });
  }
  state.selectedVersion = id;
  save();

  // Скин без Microsoft: подменяем стандартные скины через ресурс-пак
  const gameDir = await mc.gameDir(id);
  const skin = state.skins.find((s) => s.id === state.profiles[acc.uuid]?.skinId);
  if (acc.type !== 'microsoft' && skin) await packs.writeSkinPack(gameDir, pngFromDataUrl(skin.data)).catch(() => {});
  else await packs.removeSkinPack(gameDir).catch(() => {});

  const installed = (await mc.listInstalled()).find((v) => v.id === id);
  if (host) hosting = { versionId: id, gameVersion: installed?.gameVersion || id, loader: installed?.loader || null, mods: await mp.modList(mc, id).catch(() => []), address: null };

  send('game:state', { state: 'starting', id });
  game = await mc.launch(id, acc, { ...state, pro: isPro(acc), join }, {
    onLog: (line) => {
      send('game:log', line);
      if (hosting && !hosting.address) {
        const address = mp.findAddress(line);
        if (address) {
          hosting.address = address;
          send('friends:hosting', { address });
          heartbeat();
        }
      }
    },
    onExit: (code) => {
      game = null;
      if (hosting) { hosting = null; send('friends:hosting', null); }
      send('game:state', { state: 'closed', id, code });
      heartbeat();
      if (state.closeOnLaunch && win) win.show();
    },
  });
  heartbeat();
  setTimeout(() => {
    if (!game) return;
    send('game:state', { state: 'running', id });
    if (state.closeOnLaunch && !host) win.hide();
  }, 2500);
}

handle('game:launch', (id) => launchGame(id));
handle('game:stop', () => { if (game) game.kill(); });

// ───────────── Bedrock ─────────────

handle('bedrock:status', () => bedrock.status());
handle('bedrock:launch', async () => {
  const s = await bedrock.status();
  if (s.supported && !s.installed) return installBedrock();
  return bedrock.launch();
});
handle('bedrock:install', () => installBedrock());
handle('bedrock:store', () => bedrock.openStore());

async function installBedrock() {
  send('bedrock:state', { state: 'started' });
  const res = await bedrock.install((p) => send('bedrock:progress', p));
  send('bedrock:state', res.ok ? { state: 'done', version: res.version } : { state: 'error', error: res.reason });
  return res;
}

// Автоустановка Bedrock при первом запуске лаунчера (только Windows)
async function autoInstallBedrock() {
  if (process.platform !== 'win32' || !state.autoBedrock || state.bedrockAutoDone) return;
  const s = await bedrock.status();
  state.bedrockAutoDone = true;
  save();
  if (!s.installed) installBedrock();
}
handle('bedrock:auto', () => { autoInstallBedrock(); });

// ───────────── Rionina Coins, сундуки, Pro ─────────────

async function meFor(acc) {
  const me = await economy.me(acc);
  proCache.set(acc.uuid, !!me.pro);
  return me;
}
const needAcc = () => { const a = active(); if (!a) throw new Error('Нет аккаунта'); return a; };
handle('eco:me', () => meFor(needAcc()));
handle('eco:daily', async () => { const r = await economy.daily(needAcc()); proCache.set(needAcc().uuid, !!r.me.pro); return r; });
handle('eco:chest', async (chest) => economy.openChest(needAcc(), chest));
handle('eco:pro', async () => { const me = await economy.activatePro(needAcc()); proCache.set(needAcc().uuid, !!me.pro); return me; });
handle('pro:boost', async (versionId) => {
  if (!isPro(needAcc())) throw new Error('Ускорение доступно в Rionina Pro');
  return mp.boostBuild(mc, versionId);
});

// ───────────── Друзья ─────────────

const friendsCall = async (method, p, body) => {
  try {
    return await economy.server(needAcc(), method, p, body);
  } catch (e) {
    if (e.name === 'Error' && e.status) throw e;
    const acc = active();
    throw new Error(acc?.type === 'offline'
      ? 'Друзья работают с Rionina ID (ник + пароль) или Microsoft — добавьте такой аккаунт в Настройках'
      : 'Сервер Rionina пока не запущен — друзья заработают, когда он появится. Аккаунт перенесётся на сервер при следующем входе с паролем.');
  }
};
handle('friends:list', () => friendsCall('GET', '/friends'));
handle('friends:request', (nick) => friendsCall('POST', '/friends/request', { nick }));
handle('friends:accept', (nick) => friendsCall('POST', '/friends/accept', { nick }));
handle('friends:decline', (nick) => friendsCall('POST', '/friends/decline', { nick }));
handle('friends:remove', (nick) => friendsCall('POST', '/friends/remove', { nick }));
handle('friends:hostState', () => (hosting ? { address: hosting.address, gameVersion: hosting.gameVersion } : null));

// Открыть свой мир для друзей
handle('friends:host', async (gameVersion) => {
  const acc = needAcc();
  const versionId = await mp.prepareHost(mc, gameVersion, { pro: isPro(acc) }, (p) => send('install:progress', { id: gameVersion, ...p }));
  send('install:state', { id: gameVersion, state: 'done' });
  await launchGame(versionId, { host: true });
  return versionId;
});

// Зайти в мир друга
handle('friends:join', async (nick) => {
  const acc = needAcc();
  const list = await friendsCall('GET', '/friends');
  const f = list.friends.find((x) => x.nick.toLowerCase() === String(nick).toLowerCase());
  if (!f?.shared?.address) throw new Error(`${nick} сейчас не открыл мир для друзей`);
  const versionId = await mp.prepareJoin(mc, f.shared, { pro: isPro(acc) }, (p) => send('install:progress', { id: f.shared.gameVersion, ...p }));
  send('install:state', { id: f.shared.gameVersion, state: 'done' });
  await launchGame(versionId, { join: f.shared.address });
});

// Статус для друзей: раз в минуту и при каждом изменении
async function heartbeat() {
  const acc = active();
  if (!acc || !['rionina', 'microsoft'].includes(acc.type)) return;
  const body = {
    status: game ? 'playing' : 'online',
    playing: game ? { gameVersion: hosting?.gameVersion || state.selectedVersion } : null,
    shared: hosting?.address ? { address: hosting.address, gameVersion: hosting.gameVersion, loader: hosting.loader, mods: hosting.mods, world: 'Мир' } : null,
  };
  await economy.server(acc, 'POST', '/presence', body).catch(() => {});
}
setInterval(heartbeat, 60_000);
app.whenReady().then(() => setTimeout(heartbeat, 3000));
