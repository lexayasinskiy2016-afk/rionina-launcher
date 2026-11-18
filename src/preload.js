// Безопасный мост между интерфейсом и главным процессом.
const { contextBridge, ipcRenderer } = require('electron');

const call = async (ch, ...args) => {
  const res = await ipcRenderer.invoke(ch, ...args);
  if (!res.ok) throw new Error(res.error);
  return res.data;
};
const on = (ch) => (cb) => {
  const fn = (_e, payload) => cb(payload);
  ipcRenderer.on(ch, fn);
  return () => ipcRenderer.removeListener(ch, fn);
};

contextBridge.exposeInMainWorld('rionina', {
  info: () => call('app:info'),
  win: {
    minimize: () => call('win:minimize'),
    maximize: () => call('win:maximize'),
    close: () => call('win:close'),
  },
  openExternal: (u) => call('open:external', u),
  openFolder: (versionId) => call('open:folder', versionId),
  account: {
    get: () => call('account:get'),
    list: () => call('account:list'),
    microsoft: () => call('account:microsoft'),
    rionina: (p) => call('account:rionina', p),
    switch: (uuid) => call('account:switch', uuid),
    remove: (uuid) => call('account:remove', uuid),
    logout: () => call('account:logout'),
  },
  settings: {
    get: () => call('settings:get'),
    set: (p) => call('settings:set', p),
  },
  theme: {
    getBg: () => call('theme:getBg'),
    pickBg: () => call('theme:pickBg'),
    clearBg: () => call('theme:clearBg'),
  },
  skin: {
    apply: (id) => call('skin:apply', id),
    export: (id) => call('skin:export', id),
    import: () => call('skin:import'),
  },
  news: {
    list: () => call('news:list'),
    body: (p) => call('news:body', p),
  },
  versions: {
    list: (force) => call('versions:list', force),
    installed: () => call('versions:installed'),
    install: (id) => call('versions:install', id),
    remove: (id) => call('versions:remove', id),
  },
  fabric: {
    games: () => call('fabric:games'),
    create: (v) => call('fabric:create', v),
  },
  content: {
    search: (p) => call('content:search', p),
    list: (p) => call('content:list', p),
    install: (p) => call('content:install', p),
    remove: (p) => call('content:remove', p),
    ownPacks: () => call('packs:own'),
    installOwn: (p) => call('packs:installOwn', p),
  },
  eco: {
    me: () => call('eco:me'),
    daily: () => call('eco:daily'),
    chest: (id) => call('eco:chest', id),
    pro: () => call('eco:pro'),
    boost: (versionId) => call('pro:boost', versionId),
  },
  friends: {
    list: () => call('friends:list'),
    request: (nick) => call('friends:request', nick),
    accept: (nick) => call('friends:accept', nick),
    decline: (nick) => call('friends:decline', nick),
    remove: (nick) => call('friends:remove', nick),
    host: (gameVersion) => call('friends:host', gameVersion),
    join: (nick) => call('friends:join', nick),
    hostState: () => call('friends:hostState'),
  },
  game: {
    launch: (id) => call('game:launch', id),
    stop: () => call('game:stop'),
  },
  bedrock: {
    status: () => call('bedrock:status'),
    launch: () => call('bedrock:launch'),
    install: () => call('bedrock:install'),
    store: () => call('bedrock:store'),
    auto: () => call('bedrock:auto'),
  },
  update: {
    check: () => call('update:check'),
    get: () => call('update:get'),
    download: () => call('update:download'),
    apply: () => call('update:apply'),
    site: () => call('update:site'),
  },
  shots: {
    list: () => call('shots:list'),
    fav: (p) => call('shots:fav', p),
    remove: (p) => call('shots:delete', p),
    open: (p) => call('shots:open', p),
    folder: () => call('shots:folder'),
  },
  loaders: {
    versions: (loader) => call('loader:versions', loader),
    create: (p) => call('loader:create', p),
  },
  ai: {
    plan: (p) => call('ai:plan', p),
    create: (p) => call('ai:create', p),
  },
  packs: {
    list: () => call('packs:list'),
    publish: (p) => call('packs:publish', p),
    installed: (id) => call('packs:installed', id),
  },
  chat: {
    get: (p) => call('chat:get', p),
    send: (p) => call('chat:send', p),
  },
  onUpdate: on('update:available'),
  onUpdateProgress: on('update:progress'),
  onShot: on('shots:new'),
  onHosting: on('friends:hosting'),
  onBedrockProgress: on('bedrock:progress'),
  onBedrockState: on('bedrock:state'),
  onInstallProgress: on('install:progress'),
  onInstallState: on('install:state'),
  onGameState: on('game:state'),
  onGameLog: on('game:log'),
});
