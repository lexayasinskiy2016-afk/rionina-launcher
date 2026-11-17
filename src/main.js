// Главный процесс Rionina Launcher.
const { app, BrowserWindow, ipcMain, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { Minecraft } = require('./core/minecraft');
const auth = require('./core/auth');
const news = require('./core/news');
const bedrock = require('./core/bedrock');

const ROOT = path.join(app.getPath('appData'), '.rionina');
const DATA = path.join(app.getPath('userData'), 'rionina.json');
const mc = new Minecraft(ROOT);

let win;
let game = null; // запущенный процесс игры

// ───────────── Хранилище настроек и аккаунта ─────────────

const DEFAULTS = { memory: 4096, fullscreen: false, closeOnLaunch: false, selectedVersion: null, account: null };

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    if (raw.accountEnc && safeStorage.isEncryptionAvailable()) {
      raw.account = JSON.parse(safeStorage.decryptString(Buffer.from(raw.accountEnc, 'base64')));
    }
    delete raw.accountEnc;
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}
let state = load();

function save() {
  const out = { ...state };
  if (out.account && safeStorage.isEncryptionAvailable()) {
    out.accountEnc = safeStorage.encryptString(JSON.stringify(out.account)).toString('base64');
    delete out.account;
  }
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(out, null, 2));
}

const publicAccount = (a) => a && { type: a.type, name: a.name, uuid: a.uuid };
const send = (ch, payload) => win && !win.isDestroyed() && win.webContents.send(ch, payload);

// ───────────── Окно ─────────────

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 740,
    minWidth: 960,
    minHeight: 620,
    frame: process.platform === 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#f5f5f7',
    transparent: false,
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
    shell.openExternal(url);
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
handle('open:folder', () => { fs.mkdirSync(ROOT, { recursive: true }); return shell.openPath(ROOT); });

// Аккаунт
handle('account:get', async () => {
  const a = state.account;
  if (a?.type === 'microsoft' && a.expires && Date.now() > a.expires - 60_000) {
    try {
      state.account = await auth.refreshMicrosoft(a);
      save();
    } catch { /* обновим при запуске */ }
  }
  return publicAccount(state.account);
});
handle('account:microsoft', async () => {
  state.account = await auth.loginMicrosoft();
  save();
  return publicAccount(state.account);
});
handle('account:offline', (name) => {
  state.account = auth.loginOffline(name);
  save();
  return publicAccount(state.account);
});
handle('account:logout', () => {
  state.account = null;
  save();
});

// Настройки
handle('settings:get', () => {
  const { account, ...rest } = state;
  return { ...rest, totalMemory: Math.floor(require('os').totalmem() / 1024 / 1024), root: ROOT };
});
handle('settings:set', (patch) => {
  for (const k of ['memory', 'fullscreen', 'closeOnLaunch', 'selectedVersion']) if (k in patch) state[k] = patch[k];
  save();
});

// Новости
handle('news:list', () => news.getNews());
handle('news:body', (p) => news.getPatchBody(p));

// Версии
handle('versions:list', async (force) => {
  const [manifest, installed] = await Promise.all([mc.getManifest(force), mc.listInstalled()]);
  return {
    latest: manifest.latest,
    versions: manifest.versions.map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime })),
    installed,
  };
});
handle('versions:remove', (id) => mc.removeVersion(id));

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
handle('versions:install', (id) => {
  if (installing === id || queue.includes(id)) return 'queued';
  queue.push(id);
  send('install:state', { id, state: 'queued' });
  pump();
  return 'queued';
});

// Запуск Java Edition
handle('game:launch', async (id) => {
  if (game) throw new Error('Игра уже запущена');
  if (!state.account) throw new Error('Сначала войдите в аккаунт');
  if (state.account.type === 'microsoft') {
    state.account = await auth.refreshMicrosoft(state.account);
    save();
  }
  const installed = await mc.listInstalled();
  if (!installed.some((v) => v.id === id)) {
    // Версия не установлена — ставим и сразу запускаем
    await mc.install(id, (p) => send('install:progress', { id, ...p }));
    send('install:state', { id, state: 'done' });
  }
  state.selectedVersion = id;
  save();
  send('game:state', { state: 'starting', id });
  game = await mc.launch(id, state.account, state, {
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

// Bedrock
handle('bedrock:status', () => bedrock.status());
handle('bedrock:launch', () => bedrock.launch());
handle('bedrock:install', () => bedrock.install());
