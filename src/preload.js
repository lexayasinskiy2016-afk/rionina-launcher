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
  openFolder: () => call('open:folder'),
  account: {
    get: () => call('account:get'),
    microsoft: () => call('account:microsoft'),
    offline: (name) => call('account:offline', name),
    logout: () => call('account:logout'),
  },
  settings: {
    get: () => call('settings:get'),
    set: (p) => call('settings:set', p),
  },
  news: {
    list: () => call('news:list'),
    body: (p) => call('news:body', p),
  },
  versions: {
    list: (force) => call('versions:list', force),
    install: (id) => call('versions:install', id),
    remove: (id) => call('versions:remove', id),
  },
  game: {
    launch: (id) => call('game:launch', id),
    stop: () => call('game:stop'),
  },
  bedrock: {
    status: () => call('bedrock:status'),
    launch: () => call('bedrock:launch'),
    install: () => call('bedrock:install'),
  },
  onInstallProgress: on('install:progress'),
  onInstallState: on('install:state'),
  onGameState: on('game:state'),
  onGameLog: on('game:log'),
});
