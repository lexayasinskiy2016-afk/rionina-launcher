// Главный процесс Rionina Launcher.
const { app, BrowserWindow, ipcMain, shell, safeStorage, dialog, protocol, net, nativeImage, Notification } = require('electron');
const { pathToFileURL } = require('url');
const { Updater } = require('./core/updater');
const PKG = require('../package.json');

// Свой протокол для картинок скриншотов (иначе интерфейс не может их показать)
protocol.registerSchemesAsPrivileged([{ scheme: 'rionina-shot', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
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
const aimods = require('./core/aimods');

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
    if (raw.geminiKeyEnc && safeStorage.isEncryptionAvailable()) raw.geminiKey = safeStorage.decryptString(Buffer.from(raw.geminiKeyEnc, 'base64'));
    delete raw.geminiKeyEnc;
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
    if (out.geminiKey) out.geminiKeyEnc = safeStorage.encryptString(out.geminiKey).toString('base64');
    delete out.geminiKey;
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

app.whenReady().then(() => {
  registerShotProtocol();
  createWindow();
  setTimeout(checkUpdates, 5000);
  setInterval(checkUpdates, 6 * 3600e3);
});
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
  const { accounts, localCreds, eco, geminiKey, ...rest } = state;
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
handle('versions:installed', async () => (await mc.listInstalled()).map((v) => ({ ...v, name: state.buildNames?.[v.id] || null })));
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
  if (type === 'mod' && !['fabric', 'forge', 'neoforge'].includes(t.loader)) {
    throw new Error('Моды работают в сборке с модами — создайте её во вкладке «Моды»');
  }
  if (type === 'shader' && t.loader !== 'fabric') {
    throw new Error('Шейдеры ставятся в сборку Fabric — создайте её во вкладке «Моды»');
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
  const installed = await modrinth.installProject({ projectId, type, gameVersion: t.gameVersion, gameDir: t.gameDir, loader: t.loader });
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
  await aimods.syncWorlds(gameDir).catch(() => {}); // ИИ-моды — во все миры
  watchShots(gameDir);
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
      setTimeout(stopShotWatch, 3000);
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

// ───────────── Обновления лаунчера ─────────────

const updater = new Updater({
  repo: PKG.rionina?.updateRepo,
  currentVersion: app.getVersion(),
  electronVersion: process.versions.electron,
  exePath: process.execPath,
  isPackaged: app.isPackaged,
});
let updateInfo = null;

async function checkUpdates() {
  try {
    updateInfo = await updater.check();
    if (updateInfo) send('update:available', updateInfo);
  } catch { /* нет сети или релизов — проверим позже */ }
  return updateInfo;
}
handle('update:check', () => checkUpdates());
handle('update:get', () => updateInfo);
handle('update:download', async () => {
  await updater.download((p) => send('update:progress', p));
  return true;
});
handle('update:apply', () => updater.apply(() => app.quit()));
handle('update:site', () => shell.openExternal(`https://github.com/${PKG.rionina?.updateRepo}/releases/latest`));

// ───────────── Скриншоты (F2 в игре) ─────────────

function shotDirs() {
  const dirs = [path.join(ROOT, 'screenshots')];
  try {
    for (const d of fs.readdirSync(path.join(ROOT, 'instances'))) dirs.push(path.join(ROOT, 'instances', d, 'screenshots'));
  } catch { /* сборок ещё нет */ }
  return dirs;
}
const isShot = (f) => /\.(png|jpe?g)$/i.test(f);
function shotAllowed(file) {
  const abs = path.resolve(file);
  return isShot(abs) && shotDirs().some((d) => abs.startsWith(path.resolve(d) + path.sep));
}

function listShots() {
  const out = [];
  for (const dir of shotDirs()) {
    let files = [];
    try { files = fs.readdirSync(dir).filter(isShot); } catch { continue; }
    const build = path.basename(path.dirname(dir));
    for (const f of files) {
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      out.push({ path: full, name: f, time: st.mtimeMs, size: st.size, build: build === '.rionina' ? null : build, fav: (state.favShots || []).includes(full) });
    }
  }
  return out.sort((a, b) => b.time - a.time);
}

const thumbCache = new Map();
function registerShotProtocol() {
  protocol.handle('rionina-shot', async (req) => {
    const u = new URL(req.url);
    const file = decodeURIComponent(u.searchParams.get('p') || '');
    if (!shotAllowed(file) || !fs.existsSync(file)) return new Response('Нет файла', { status: 404 });
    if (u.searchParams.get('thumb')) {
      const key = file + fs.statSync(file).mtimeMs;
      if (!thumbCache.has(key)) thumbCache.set(key, nativeImage.createFromPath(file).resize({ width: 480 }).toJPEG(82));
      return new Response(thumbCache.get(key), { headers: { 'Content-Type': 'image/jpeg' } });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

handle('shots:list', () => listShots());
handle('shots:fav', (file) => {
  if (!shotAllowed(file)) throw new Error('Не скриншот');
  const favs = new Set(state.favShots || []);
  favs.has(file) ? favs.delete(file) : favs.add(file);
  state.favShots = [...favs];
  save();
  return favs.has(file);
});
handle('shots:delete', (file) => {
  if (!shotAllowed(file)) throw new Error('Не скриншот');
  fs.rmSync(file, { force: true });
  state.favShots = (state.favShots || []).filter((f) => f !== file);
  save();
});
handle('shots:open', (file) => { if (shotAllowed(file)) shell.showItemInFolder(file); });
handle('shots:folder', () => {
  const dir = path.join(ROOT, 'screenshots');
  fs.mkdirSync(dir, { recursive: true });
  return shell.openPath(dir);
});

// Пока идёт игра, следим за новыми скриншотами и сразу показываем их
let shotWatchers = [];
function watchShots(gameDir) {
  stopShotWatch();
  const dir = path.join(gameDir, 'screenshots');
  fs.mkdirSync(dir, { recursive: true });
  const seen = new Set(fs.readdirSync(dir));
  const w = fs.watch(dir, (_ev, name) => {
    if (!name || !isShot(name) || seen.has(name)) return;
    seen.add(name);
    setTimeout(() => {
      const full = path.join(dir, name);
      if (!fs.existsSync(full)) return;
      send('shots:new', { path: full, name });
      if (Notification.isSupported()) new Notification({ title: 'Rionina Launcher', body: 'Скриншот сохранён в галерею', silent: true }).show();
    }, 700);
  });
  shotWatchers.push(w);
}
function stopShotWatch() { shotWatchers.forEach((w) => w.close()); shotWatchers = []; }

// ───────────── Forge и NeoForge ─────────────

const loaders = require('./core/loaders');
handle('loader:versions', async (loader) => {
  if (loader === 'fabric') return (await modrinth.fabricGameVersions()).map((v) => ({ gameVersion: v }));
  return loader === 'forge' ? loaders.forgeVersions() : loaders.neoforgeVersions();
});
handle('loader:create', async ({ loader, gameVersion }) => {
  if (loader === 'fabric') {
    const id = await modrinth.createFabricProfile(path.join(ROOT, 'versions'), gameVersion);
    enqueue(id);
    return id;
  }
  const key = `${loader}-${gameVersion}`;
  send('install:state', { id: key, state: 'started' });
  try {
    const id = await loaders.installLoader(mc, loader, gameVersion, (p) => send('install:progress', { id: key, ...p }));
    send('install:state', { id: key, state: 'done' });
    send('install:state', { id, state: 'done' });
    return id;
  } catch (e) {
    send('install:state', { id: key, state: 'error', error: e.message });
    throw e;
  }
});

// ───────────── ИИ-сборщик и сборки игроков ─────────────

const aibuilder = require('./core/aibuilder');

async function buildFor(loader, gameVersion, progressId) {
  const onProgress = (p) => send('install:progress', { id: progressId, ...p });
  send('install:state', { id: progressId, state: 'started' });
  let id;
  if (loader === 'fabric') {
    id = await modrinth.createFabricProfile(path.join(ROOT, 'versions'), gameVersion);
    if (!(await mc.isInstalled(id))) await mc.install(id, onProgress);
  } else {
    const have = (await mc.listInstalled()).find((v) => v.loader === loader && v.gameVersion === gameVersion);
    id = have && (await mc.isInstalled(have.id)) ? have.id : await loaders.installLoader(mc, loader, gameVersion, onProgress);
  }
  return id;
}

handle('ai:plan', async (params) => {
  let ai = null;
  const acc = active();
  if (acc && ['rionina', 'microsoft'].includes(acc.type)) {
    ai = await economy.server(acc, 'POST', '/ai/modpack', params).catch(() => null); // нейросеть на сервере, если подключена
  }
  const plan = await aibuilder.plan(params, ai);
  return { ...plan, engine: ai ? 'neural' : 'builtin' };
});

// Создать сборку по плану: загрузчик + все моды. Каждая сборка — отдельная папка игры.
handle('ai:create', async ({ plan, gameVersion, loader }) => {
  const key = `pack-${Date.now()}`;
  try {
    const id = await buildFor(loader, gameVersion, key);
    const gameDir = await mc.gameDir(id);
    const res = await aibuilder.installPlan({ mods: plan.mods, gameVersion, loader, gameDir }, (p) => send('install:progress', { id: key, ...p }));
    state.buildNames = { ...(state.buildNames || {}), [id]: plan.name };
    save();
    send('install:state', { id: key, state: 'done' });
    send('install:state', { id, state: 'done' });
    return { id, ...res };
  } catch (e) {
    send('install:state', { id: key, state: 'error', error: e.message });
    throw e;
  }
});

const serverCall = async (method, p, body) => {
  try {
    return await economy.server(needAcc(), method, p, body);
  } catch (e) {
    if (e.status) throw e;
    throw new Error('Нужен сервер Rionina — он пока не запущен');
  }
};
handle('packs:list', () => serverCall('GET', '/packs'));
handle('packs:publish', ({ plan, gameVersion, loader }) => serverCall('POST', '/packs', {
  name: plan.name, description: plan.description, gameVersion, loader,
  mods: plan.mods.map((m) => ({ id: m.id, title: m.title, slug: m.slug })),
}));
handle('packs:installed', (id) => serverCall('POST', '/packs/install', { id }).catch(() => null));

// ───────────── Чат с друзьями ─────────────

handle('chat:get', ({ nick, after }) => friendsCall('GET', `/chat?with=${encodeURIComponent(nick)}&after=${Number(after) || 0}`));
handle('chat:send', ({ nick, text }) => friendsCall('POST', '/chat/send', { to: nick, text }));

// ───────────── ИИ-моды (нейросеть придумывает новые предметы) ─────────────

handle('aimods:key', () => (state.geminiKey ? `${state.geminiKey.slice(0, 4)}…${state.geminiKey.slice(-4)}` : null));
handle('aimods:setKey', (key) => {
  const k = String(key || '').trim();
  if (k && !/^[A-Za-z0-9_-]{20,80}$/.test(k)) throw new Error('Это не похоже на ключ Gemini — он начинается с «AIza»');
  state.geminiKey = k || null;
  save();
  return !!k;
});
handle('aimods:create', async ({ idea, gameVersion }) => {
  const mod = await aimods.create({ key: state.geminiKey, idea, gameVersion });
  if (mod.ok) mod.items = mod.items.map((it) => ({ ...it, preview: aimods.previewPng(it) }));
  return mod;
});
handle('aimods:install', async ({ mod, versionId }) => {
  const t = await target(versionId);
  if (!aimods.supported(t.gameVersion)) throw new Error('ИИ-моды работают в Minecraft 1.21.4 и новее');
  const clean = { ...mod, items: mod.items.map(({ preview, ...it }) => it), gameVersion: t.gameVersion };
  return aimods.install(t.gameDir, clean);
});
handle('aimods:list', async (versionId) => {
  const t = await target(versionId);
  return (await aimods.list(t.gameDir)).map((m) => ({ ...m, items: m.items.map((it) => ({ ...it, preview: aimods.previewPng(it) })) }));
});
handle('aimods:remove', async ({ versionId, ns }) => {
  const t = await target(versionId);
  await aimods.remove(t.gameDir, ns);
});
