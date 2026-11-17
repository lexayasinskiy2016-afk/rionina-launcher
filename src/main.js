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
  accounts: [], activeUuid: null,
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
    delete out.accounts;
  }
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(out, null, 2));
}

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
handle('account:offline', (name) => upsertAccount(auth.loginOffline(name)));
handle('account:switch', (uuid) => {
  if (!state.accounts.some((a) => a.uuid === uuid)) throw new Error('Аккаунт не найден');
  state.activeUuid = uuid;
  save();
  return publicAccount(active());
});
handle('account:remove', (uuid) => {
  state.accounts = state.accounts.filter((a) => a.uuid !== uuid);
  if (state.activeUuid === uuid) state.activeUuid = state.accounts[0]?.uuid || null;
  save();
  return publicAccount(active());
});
handle('account:logout', () => {
  state.accounts = state.accounts.filter((a) => a.uuid !== state.activeUuid);
  state.activeUuid = state.accounts[0]?.uuid || null;
  save();
  return publicAccount(active());
});

// ───────────── Настройки и данные интерфейса ─────────────

handle('settings:get', () => {
  const { accounts, ...rest } = state;
  return { ...rest, totalMemory: Math.floor(require('os').totalmem() / 1024 / 1024), root: ROOT };
});
handle('settings:set', (patch) => {
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

handle('game:launch', async (id) => {
  if (game) throw new Error('Игра уже запущена');
  const acc = active();
  if (!acc) throw new Error('Сначала войдите в аккаунт');
  await refreshIfNeeded(acc, true);

  const installedList = await mc.listInstalled();
  if (!installedList.some((v) => v.id === id)) {
    await mc.install(id, (p) => send('install:progress', { id, ...p }));
    send('install:state', { id, state: 'done' });
  }
  state.selectedVersion = id;
  save();

  // Офлайн-скин: подменяем стандартные скины через ресурс-пак
  const gameDir = await mc.gameDir(id);
  const skin = state.skins.find((s) => s.id === state.profiles[acc.uuid]?.skinId);
  if (acc.type === 'offline' && skin) await packs.writeSkinPack(gameDir, pngFromDataUrl(skin.data)).catch(() => {});
  else await packs.removeSkinPack(gameDir).catch(() => {});

  send('game:state', { state: 'starting', id });
  game = await mc.launch(id, acc, state, {
    onLog: (line) => send('game:log', line),
    onExit: (code) => {
      game = null;
      send('game:state', { state: 'closed', id, code });
      if (state.closeOnLaunch && win) win.show();
    },
  });
  setTimeout(() => {
    if (!game) return;
    send('game:state', { state: 'running', id });
    if (state.closeOnLaunch) win.hide();
  }, 2500);
});
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
