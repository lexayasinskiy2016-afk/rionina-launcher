// Скины: генератор готовых скинов, 3D-просмотр, редактор и надевание.

// ───────────── Генератор скинов ─────────────

const toRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const hash = (x, y, s) => {
  let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const shade = (rgb, k) => rgb.map((c) => Math.max(0, Math.min(255, Math.round(c * k))));
const css = (rgb, a = 1) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

// Размеры частей модели и их место на развёртке 64×64
const PARTS = {
  head: [0, 0, 8, 8, 8], hat: [32, 0, 8, 8, 8],
  body: [16, 16, 8, 12, 4], jacket: [16, 32, 8, 12, 4],
  rarm: [40, 16, 4, 12, 4], rsleeve: [40, 32, 4, 12, 4],
  larm: [32, 48, 4, 12, 4], lsleeve: [48, 48, 4, 12, 4],
  rleg: [0, 16, 4, 12, 4], rpants: [0, 32, 4, 12, 4],
  lleg: [16, 48, 4, 12, 4], lpants: [0, 48, 4, 12, 4],
};

/** Все грани части: [имя, x, y, ширина, высота] */
function faces([ox, oy, w, h, d]) {
  return [
    ['top', ox + d, oy, w, d], ['bottom', ox + d + w, oy, w, d],
    ['right', ox, oy + d, d, h], ['front', ox + d, oy + d, w, h],
    ['left', ox + d + w, oy + d, d, h], ['back', ox + d + w + d, oy + d, w, h],
  ];
}

function paint(ctx, part, fn, slim = false) {
  const p = [...PARTS[part]];
  if (slim && /arm|sleeve/.test(part)) p[2] = 3;
  for (const [face, fx, fy, fw, fh] of faces(p)) {
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const c = fn(face, x, y, fw, fh);
        if (!c) continue;
        ctx.fillStyle = typeof c === 'string' ? c : css(c, c[3] ?? 1);
        ctx.fillRect(fx + x, fy + y, 1, 1);
      }
    }
  }
}

/**
 * spec: { skin, hair, hairStyle, eyes, shirt, shirt2, pattern, sleeves, pants, shoes, extra, fx, seed, model }
 * Возвращает dataURL PNG 64×64.
 */
function makeSkin(spec) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const seed = spec.seed || 7;
  const slim = spec.model === 'slim';
  const S = toRgb(spec.skin), H = toRgb(spec.hair || '#3b2a1a'), E = toRgb(spec.eyes || '#3a6ea5');
  const T = toRgb(spec.shirt), T2 = toRgb(spec.shirt2 || spec.shirt), P = toRgb(spec.pants), B = toRgb(spec.shoes || '#3a3a3a');
  const noise = (x, y, k = 0.08, s2 = 0) => 1 + (hash(x, y, seed + s2) - 0.5) * k * 2;
  const style = spec.hairStyle || 'short';

  // Особая раскраска для редких скинов
  const fx = (rgb, x, y, part) => {
    if (!spec.fx) return rgb;
    const gy = y / 12;
    if (spec.fx === 'fire') return [255, 70 + 150 * (1 - gy) * hash(x, y, seed), 20 * hash(y, x, seed)];
    if (spec.fx === 'ice') return shade([150, 210, 255], 0.75 + 0.35 * hash(x, y, seed));
    if (spec.fx === 'gold') return shade([235, 185, 60], 0.7 + 0.45 * hash(x, y, seed) + (x === 0 ? -0.2 : 0));
    if (spec.fx === 'galaxy') return hash(x, y + part.length, seed) > 0.93 ? [255, 255, 255] : shade([40, 20, 90], 0.7 + 0.6 * hash(x * 3, y, seed));
    if (spec.fx === 'neon') return (x + y) % 5 === 0 ? [0, 255, 230] : (y % 4 === 0 ? [255, 0, 200] : [18, 14, 36]);
    if (spec.fx === 'emerald') return hash(x, y, seed) > 0.85 ? [180, 255, 200] : shade([20, 170, 90], 0.7 + 0.4 * hash(x, y, seed));
    if (spec.fx === 'shadow') return shade([30, 30, 40], 0.8 + 0.4 * hash(x, y, seed));
    return rgb;
  };

  // Голова
  paint(ctx, 'head', (face, x, y) => {
    let col = shade(S, noise(x, y, 0.05, 1));
    const isHair =
      style === 'bald' ? false :
      face === 'top' ? true :
      face === 'bottom' ? false :
      face === 'front' ? y < (style === 'long' ? 2 : 1) || (style === 'long' && (x === 0 || x === 7) && y < 6) :
      face === 'back' ? y < (style === 'long' ? 8 : 5) :
      y < (style === 'long' ? 7 : 3) || (style === 'long' && x === (face === 'right' ? 0 : 7));
    if (isHair) col = shade(H, noise(x, y, 0.14, 2));
    if (face === 'front') {
      if (y === 4 && (x === 1 || x === 6)) col = [245, 245, 245];
      if (y === 4 && (x === 2 || x === 5)) col = E;
      if (y === 6 && (x === 3 || x === 4)) col = shade(S, 0.72);
      if (spec.extra === 'beard' && y >= 5 && !(y === 6 && (x === 3 || x === 4))) col = shade(H, noise(x, y, 0.1, 3));
      if (spec.extra === 'mask' && y >= 5) col = shade(T, noise(x, y, 0.08, 4));
      if (spec.extra === 'visor' && y >= 3 && y <= 5 && x >= 1 && x <= 6) col = [40, 50, 70];
    }
    if (spec.extra === 'helmet' && !(face === 'front' && y >= 3 && y <= 6 && x >= 1 && x <= 6)) col = shade(T2, noise(x, y, 0.12, 5));
    return spec.fx && (style === 'bald' || spec.extra === 'helmet') && !(face === 'front' && y === 4) ? fx(col, x, y, 'head') : col;
  });

  // Шляпа / кепка / шлем космонавта — второй слой головы
  if (spec.extra === 'cap') {
    paint(ctx, 'hat', (face, x, y) => (face === 'top' || (face !== 'bottom' && y < 2) ? shade(T2, noise(x, y, 0.08, 6)) : null));
  }
  if (spec.extra === 'glass') {
    paint(ctx, 'hat', (face, x, y) => (face === 'front' && y >= 2 && y <= 6 && x >= 1 && x <= 6 ? [140, 200, 255, 0.45] : face === 'bottom' ? null : shade([235, 238, 245], noise(x, y, 0.05, 7))));
  }

  // Тело
  const pat = spec.pattern || 'plain';
  paint(ctx, 'body', (face, x, y) => {
    let col = T;
    if (pat === 'stripes' && Math.floor(y / 2) % 2 === 1) col = T2;
    if (pat === 'jacket' && face === 'front' && x >= 2 && x <= 5) col = T2;
    if (pat === 'suit' && face === 'front') {
      if (x >= 3 && x <= 4) col = y >= 1 && y <= 7 ? [190, 30, 45] : [245, 245, 245];
      else if (x === 2 || x === 5) col = [245, 245, 245];
    }
    if (pat === 'hoodie' && face === 'front') {
      if (y >= 7 && y <= 9 && x >= 1 && x <= 6) col = shade(T, 0.82);
      if (y <= 3 && (x === 3 || x === 4) && y % 2 === 0) col = T2;
    }
    if (pat === 'armor') col = shade(T, y === 0 || y === 11 || x === 0 ? 0.75 : 1.05);
    if (y === 11 && pat !== 'armor') col = spec.belt ? toRgb(spec.belt) : col;
    return fx(shade(col, noise(x, y, 0.07, 8)), x, y, 'body');
  });

  // Руки
  const sleeve = spec.sleeves ?? (pat === 'plain' || pat === 'stripes' ? 4 : 12);
  for (const part of ['rarm', 'larm']) {
    paint(ctx, part, (face, x, y) => {
      const yy = face === 'top' ? 0 : face === 'bottom' ? 11 : y;
      let col = yy < sleeve ? (pat === 'stripes' && Math.floor(yy / 2) % 2 ? T2 : T) : S;
      if (yy >= sleeve && spec.gloves) col = toRgb(spec.gloves);
      if (pat === 'armor' && yy < sleeve) col = shade(T, yy % 4 === 0 ? 0.8 : 1.05);
      return fx(shade(col, noise(x + (part === 'larm' ? 9 : 0), y, 0.07, 9)), x, yy, part);
    }, slim);
  }

  // Ноги
  for (const part of ['rleg', 'lleg']) {
    paint(ctx, part, (face, x, y) => {
      const yy = face === 'top' ? 0 : face === 'bottom' ? 11 : y;
      const col = yy < 9 ? P : B;
      return fx(shade(col, noise(x + (part === 'lleg' ? 5 : 0), y, 0.07, 10)), x, yy, part);
    });
  }
  return c.toDataURL('image/png');
}

// Готовые скины (оригинальные дизайны Rionina)
const READY_SKINS = [
  { key: 'traveler', name: 'Путешественник', spec: { skin: '#c99a76', hair: '#4a2f1b', shirt: '#2a9d8f', pants: '#264653', shoes: '#3d2b1f', seed: 11 } },
  { key: 'explorer', name: 'Исследовательница', spec: { skin: '#f1c7a5', hair: '#b5432a', hairStyle: 'long', eyes: '#2e7d32', shirt: '#4c8c4a', shirt2: '#e9e2c8', pattern: 'jacket', pants: '#6b4f3a', shoes: '#2f2a25', seed: 12, model: 'slim' } },
  { key: 'hacker', name: 'Хакер', spec: { skin: '#e0b48f', hair: '#1c1c1c', shirt: '#1f1f24', shirt2: '#33ff77', pattern: 'hoodie', pants: '#2b2b33', shoes: '#111', eyes: '#33ff77', seed: 13 } },
  { key: 'miner', name: 'Шахтёр', spec: { skin: '#d1a17e', hair: '#5a3b22', shirt: '#e07b26', shirt2: '#f2c230', extra: 'cap', pants: '#3a4a6b', shoes: '#2a2018', seed: 14, extraBeard: true } },
  { key: 'princess', name: 'Принцесса', spec: { skin: '#f6d2b8', hair: '#f2d16b', hairStyle: 'long', eyes: '#4a7fd6', shirt: '#ff8fc0', shirt2: '#ffd6e8', pattern: 'stripes', pants: '#e46aa6', shoes: '#fff2f8', seed: 15, model: 'slim' } },
  { key: 'knight', name: 'Рыцарь', spec: { skin: '#cfa27c', hair: '#3b2a1a', shirt: '#9aa3ad', shirt2: '#7c858f', pattern: 'armor', extra: 'helmet', pants: '#7c858f', shoes: '#4e555c', seed: 16 } },
  { key: 'ninja', name: 'Ниндзя', spec: { skin: '#d7a982', hair: '#111', shirt: '#1d1d22', shirt2: '#c0392b', pattern: 'jacket', extra: 'mask', pants: '#1d1d22', shoes: '#111', belt: '#c0392b', seed: 17 } },
  { key: 'astronaut', name: 'Космонавт', spec: { skin: '#e4b896', hair: '#3a2a1e', shirt: '#eef1f6', shirt2: '#ff7a1a', pattern: 'jacket', extra: 'glass', pants: '#e3e7ee', shoes: '#9aa3ad', gloves: '#ff7a1a', seed: 18 } },
  { key: 'chef', name: 'Повар', spec: { skin: '#e8bf9a', hair: '#2c1c12', shirt: '#fafafa', shirt2: '#e74c3c', pattern: 'jacket', extra: 'beard', pants: '#2d2d2d', shoes: '#1a1a1a', seed: 19 } },
  { key: 'footballer', name: 'Футболист', spec: { skin: '#8d5b3e', hair: '#141414', shirt: '#d62828', shirt2: '#ffffff', pattern: 'stripes', pants: '#ffffff', shoes: '#111', seed: 20 } },
  { key: 'boss', name: 'Бизнесмен', spec: { skin: '#e2b593', hair: '#2a2a2a', shirt: '#25303f', pattern: 'suit', pants: '#25303f', shoes: '#0f0f0f', seed: 21 } },
  { key: 'punk', name: 'Зомби-панк', spec: { skin: '#6aa84f', hair: '#e83e8c', eyes: '#b00020', shirt: '#2b2b2b', shirt2: '#e83e8c', pattern: 'stripes', pants: '#3b5ba5', shoes: '#222', seed: 22 } },
];

// Редкие скины — только из кейсов
const CASE_SKINS = [
  { key: 'fire_lord', name: 'Повелитель огня', rarity: 'epic', spec: { skin: '#e2a37a', hair: '#ff5a00', hairStyle: 'bald', shirt: '#ff6a00', pants: '#a31d00', shoes: '#330800', fx: 'fire', eyes: '#ffd000', seed: 31 } },
  { key: 'ice_queen', name: 'Ледяная королева', rarity: 'epic', spec: { skin: '#dff1ff', hair: '#e8f7ff', hairStyle: 'long', eyes: '#1e88e5', shirt: '#9fd4ff', pants: '#7cc0ff', shoes: '#e8f7ff', fx: 'ice', seed: 32, model: 'slim' } },
  { key: 'gold_knight', name: 'Золотой рыцарь', rarity: 'legendary', spec: { skin: '#cfa27c', shirt: '#e8b93c', shirt2: '#e8b93c', pattern: 'armor', extra: 'helmet', pants: '#d6a52f', shoes: '#9c7414', fx: 'gold', seed: 33 } },
  { key: 'galaxy', name: 'Галактический странник', rarity: 'legendary', spec: { skin: '#2b1a5c', hair: '#120a2e', hairStyle: 'bald', eyes: '#00e5ff', shirt: '#2b1a5c', pants: '#22134a', shoes: '#120a2e', fx: 'galaxy', seed: 34 } },
  { key: 'neon', name: 'Неоновый гонщик', rarity: 'rare', spec: { skin: '#c99a76', hair: '#ff00c8', eyes: '#00fff0', shirt: '#121024', pants: '#121024', shoes: '#00fff0', fx: 'neon', seed: 35 } },
  { key: 'emerald', name: 'Изумрудный страж', rarity: 'rare', spec: { skin: '#b9875f', hair: '#0f5132', shirt: '#1aa260', shirt2: '#0f5132', pattern: 'armor', extra: 'helmet', pants: '#0f7a46', shoes: '#0a3d24', fx: 'emerald', seed: 36 } },
  { key: 'shadow', name: 'Тень', rarity: 'rare', spec: { skin: '#2a2a33', hair: '#111', hairStyle: 'bald', eyes: '#ff2d55', shirt: '#22222b', pants: '#1a1a22', shoes: '#0b0b0f', fx: 'shadow', extra: 'mask', seed: 37 } },
  { key: 'samurai', name: 'Самурай', rarity: 'rare', spec: { skin: '#d9a77f', hair: '#111', shirt: '#9b1c1c', shirt2: '#f2c94c', pattern: 'armor', pants: '#2b2b2b', shoes: '#111', belt: '#f2c94c', seed: 38 } },
];
// Эксклюзивные скины Rionina Pro
const PRO_SKINS = [
  { key: 'pro_dragon', name: 'Драконий лорд', spec: { skin: '#c99a76', hair: '#5a0f1f', shirt: '#7a1020', shirt2: '#f2c94c', pattern: 'armor', extra: 'helmet', pants: '#3a0810', shoes: '#f2c94c', fx: 'fire', seed: 51 } },
  { key: 'pro_cyber', name: 'Кибер-самурай', spec: { skin: '#d9a77f', hair: '#00fff0', eyes: '#ff00c8', shirt: '#101020', pattern: 'jacket', shirt2: '#00fff0', pants: '#101020', shoes: '#ff00c8', fx: 'neon', extra: 'visor', seed: 52 } },
  { key: 'pro_frost', name: 'Морозный маг', spec: { skin: '#e8f4ff', hair: '#ffffff', hairStyle: 'long', eyes: '#00b4ff', shirt: '#3a6ea5', shirt2: '#cfe8ff', pattern: 'hoodie', pants: '#2a4d75', shoes: '#cfe8ff', fx: 'ice', seed: 53 } },
  { key: 'pro_royal', name: 'Королева Rionina', spec: { skin: '#f6d2b8', hair: '#f2c94c', hairStyle: 'long', eyes: '#7b2ff7', shirt: '#7b2ff7', shirt2: '#f2c94c', pattern: 'stripes', pants: '#4b1ba1', shoes: '#f2c94c', seed: 54, model: 'slim' } },
  { key: 'pro_void', name: 'Странник Пустоты', spec: { skin: '#1a1030', hair: '#05030c', hairStyle: 'bald', eyes: '#c77dff', shirt: '#1a1030', pants: '#120a24', shoes: '#05030c', fx: 'galaxy', extra: 'mask', seed: 55 } },
  { key: 'pro_jade', name: 'Нефритовый воин', spec: { skin: '#b9875f', hair: '#0a3d24', shirt: '#1aa260', shirt2: '#f2c94c', pattern: 'armor', pants: '#0f7a46', shoes: '#f2c94c', fx: 'emerald', belt: '#f2c94c', seed: 56 } },
];

for (const s of READY_SKINS) if (s.spec.extraBeard) s.spec.extra = s.spec.extra || 'beard';

const skinCache = new Map();
function presetData(item) {
  if (!skinCache.has(item.key)) skinCache.set(item.key, makeSkin(item.spec));
  return skinCache.get(item.key);
}

// ───────────── Отрисовка 2D ─────────────

function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

async function drawHead(data, canvas, size = 64) {
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const img = await loadImg(data);
  ctx.drawImage(img, 8, 8, 8, 8, 0, 0, size, size);
  ctx.drawImage(img, 40, 8, 8, 8, 0, 0, size, size);
}

async function drawFront(data, canvas, slim = false) {
  canvas.width = 16 * 4; canvas.height = 32 * 4;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.scale(4, 4);
  const img = await loadImg(data);
  const a = slim ? 3 : 4;
  const blit = (sx, sy, w, h, dx, dy) => ctx.drawImage(img, sx, sy, w, h, dx, dy, w, h);
  blit(8, 8, 8, 8, 4, 0); blit(40, 8, 8, 8, 4, 0);
  blit(20, 20, 8, 12, 4, 8); blit(20, 36, 8, 12, 4, 8);
  blit(44, 20, a, 12, 4 - a, 8); blit(44, 36, a, 12, 4 - a, 8);
  blit(36, 52, a, 12, 12, 8); blit(52, 52, a, 12, 12, 8);
  blit(4, 20, 4, 12, 4, 20); blit(4, 36, 4, 12, 4, 20);
  blit(20, 52, 4, 12, 8, 20); blit(4, 52, 4, 12, 8, 20);
}

// ───────────── Состояние ─────────────

const sk = {
  viewer: null,
  mini: null,
  fx: null,
  miniFx: null,
  sel: null, // { kind: 'mine'|'ready', id/key, data, model, name }
  anim: 'walk',
};

const mySkins = () => st.settings.skins || (st.settings.skins = []);
const profile = () => {
  const p = (st.settings.profiles ||= {});
  return (p[st.account?.uuid] ||= {});
};
const collection = () => (st.settings.collection ||= { effects: [], skins: [] });
const saveSkinData = () => R.settings.set({ skins: st.settings.skins, profiles: st.settings.profiles, collection: st.settings.collection });

function wornSkin() {
  const id = profile().skinId;
  return mySkins().find((s) => s.id === id) || null;
}

// ───────────── 3D ─────────────

function makeViewer(canvas, w, h, small = false) {
  if (!window.skinview3d) return null;
  const v = new skinview3d.SkinViewer({ canvas, width: w, height: h, model: 'auto-detect' });
  v.zoom = small ? 0.75 : 0.85;
  v.fov = 45;
  v.animation = small ? new skinview3d.IdleAnimation() : new skinview3d.WalkingAnimation();
  if (v.animation) v.animation.speed = small ? 1 : 0.6;
  v.autoRotate = small;
  v.autoRotateSpeed = 0.6;
  if (small) v.controls.enableZoom = false;
  return v;
}

function ensureViewers() {
  if (!sk.viewer) {
    const stage = $('#skinStage');
    sk.viewer = makeViewer($('#skinCanvas'), stage.clientWidth || 300, stage.clientHeight || 380);
    sk.fx = new FxRunner($('#fxCanvas'));
    new ResizeObserver(() => sk.viewer?.setSize(stage.clientWidth, stage.clientHeight)).observe(stage);
  }
  if (!sk.mini) {
    const box = document.createElement('div');
    box.className = 'mini-stage';
    box.id = 'miniStage';
    box.title = 'Ваш персонаж — нажмите, чтобы сменить скин';
    box.innerHTML = '<canvas class="fx" id="miniFx"></canvas><canvas id="miniSkin"></canvas>';
    $('#accountChip').before(box);
    box.addEventListener('click', () => document.querySelector('.nav[data-tab="skins"]').click());
    sk.mini = makeViewer($('#miniSkin'), 212, 170, true);
    sk.miniFx = new FxRunner($('#miniFx'));
  }
}

async function loadInto(viewer, data, model) {
  if (!viewer) return;
  try { await viewer.loadSkin(data, { model: model === 'slim' ? 'slim' : 'default' }); } catch { /* битая картинка */ }
}

// ───────────── Профиль: аватар, мини-персонаж ─────────────

async function updateProfileVisuals() {
  if (!st.account) return;
  ensureViewers();
  const worn = wornSkin();
  const data = worn?.data || presetData(READY_SKINS[0]);
  loadInto(sk.mini, data, worn?.model).then(() => applyCape(sk.mini));
  sk.miniFx.set(profile().effect || null);
  const av = $('#avatar');
  if (worn || st.account.type !== 'microsoft') {
    av.style.backgroundImage = '';
    av.textContent = '';
    const c = document.createElement('canvas');
    av.appendChild(c);
    await drawHead(data, c, 72);
  }
}

// ───────────── Вкладка «Скины» ─────────────

function selectSkin(sel) {
  sk.sel = sel;
  loadInto(sk.viewer, sel.data, sel.model);
  $('#stageName').textContent = sel.name;
  $$('.skin-card').forEach((c) => c.classList.toggle('sel', c.dataset.id === (sel.id || sel.key)));
  const worn = profile().skinId && profile().skinId === sel.id;
  $('#btnWearSkin').textContent = worn ? '✓ Надет' : 'Надеть';
  $('#btnWearSkin').disabled = worn;
}

function skinCard({ id, name, data, model, rarity, removable, worn }) {
  const el = document.createElement('div');
  el.className = 'skin-card';
  el.dataset.id = id;
  el.innerHTML = `${rarity ? `<i class="rar" style="background:${RARITY[rarity].color}"></i>` : ''}${worn ? '<span class="worn">Надет</span>' : ''}<canvas></canvas><div class="nm">${esc(name)}</div>${removable ? '<button class="x" title="Удалить">✕</button>' : ''}`;
  drawFront(data, el.querySelector('canvas'), model === 'slim');
  return el;
}

function renderMySkins() {
  const box = $('#mySkins');
  box.innerHTML = '';
  const list = mySkins();
  if (!list.length) box.innerHTML = '<div class="empty">Пока пусто — возьмите готовый скин, создайте свой или откройте кейс.</div>';
  for (const s of list) {
    const el = skinCard({ id: s.id, name: s.name, data: s.data, model: s.model, rarity: s.rarity, removable: true, worn: profile().skinId === s.id });
    el.addEventListener('click', (e) => {
      if (e.target.closest('.x')) return;
      selectSkin({ kind: 'mine', id: s.id, data: s.data, model: s.model, name: s.name });
    });
    el.addEventListener('dblclick', () => openEditor(s));
    el.querySelector('.x').addEventListener('click', () => {
      if (!confirm(`Удалить скин «${s.name}»?`)) return;
      st.settings.skins = mySkins().filter((x) => x.id !== s.id);
      for (const p of Object.values(st.settings.profiles || {})) if (p.skinId === s.id) delete p.skinId;
      saveSkinData();
      renderMySkins();
      updateProfileVisuals();
    });
    box.appendChild(el);
  }
}

function renderReadySkins() {
  const box = $('#readySkins');
  box.innerHTML = '';
  const pro = !!st.me?.pro;
  for (const item of PRO_SKINS) {
    const data = presetData(item);
    const el = skinCard({ id: item.key, name: `${item.name}${pro ? '' : ' 🔒'}`, data, model: item.spec.model });
    el.insertAdjacentHTML('afterbegin', '<span class="pro-badge corner">PRO</span>');
    el.addEventListener('click', () => selectSkin({ kind: 'ready', key: item.key, data, model: item.spec.model, name: item.name, pro: true }));
    box.appendChild(el);
  }
  for (const item of READY_SKINS) {
    const data = presetData(item);
    const el = skinCard({ id: item.key, name: item.name, data, model: item.spec.model });
    el.addEventListener('click', () => selectSkin({ kind: 'ready', key: item.key, data, model: item.spec.model, name: item.name }));
    box.appendChild(el);
  }
}

function renderEffectChips() {
  const box = $('#effectChips');
  const owned = new Set(collection().effects);
  const cur = profile().effect || null;
  box.innerHTML = '';
  const mk = (id, label, locked) => {
    const b = document.createElement('button');
    b.className = `chip${cur === id ? ' active' : ''}${locked ? ' locked' : ''}`;
    b.innerHTML = label;
    b.title = locked ? 'Выпадает из кейсов' : '';
    b.onclick = () => {
      if (locked) return toast('Этот эффект выпадает из кейсов — откройте вкладку «Кейсы»');
      profile().effect = id;
      saveSkinData();
      sk.fx.set(id);
      sk.miniFx?.set(id);
      renderEffectChips();
    };
    box.appendChild(b);
  };
  mk(null, 'Нет', false);
  for (const [id, e] of Object.entries(EFFECTS)) mk(id, `${e.emoji} ${e.name}${owned.has(id) ? '' : ' 🔒'}`, !owned.has(id));
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function wearSelected() {
  const sel = sk.sel;
  if (!sel) return;
  let id = sel.id;
  if (sel.pro && !st.me?.pro) {
    toast('Этот скин — для Rionina Pro. Pro сейчас бесплатный: вкладка «Rionina Pro»', 6000);
    return;
  }
  if (sel.kind === 'ready') {
    const exist = mySkins().find((s) => s.preset === sel.key);
    if (exist) id = exist.id;
    else {
      id = uid();
      mySkins().push({ id, name: sel.name, model: sel.model || 'classic', data: sel.data, source: 'preset', preset: sel.key });
    }
  }
  profile().skinId = id;
  await saveSkinData();
  try {
    const res = await R.skin.apply(id);
    toast(res === 'uploaded' ? 'Скин надет и загружен в ваш профиль Minecraft — его видят все игроки' : 'Скин надет — вы увидите его в игре (офлайн, одиночная игра)');
  } catch (e) {
    toast(`Скин сохранён в лаунчере, но Mojang его не принял: ${e.message}`, 7000);
  }
  renderMySkins();
  selectSkin({ ...sel, kind: 'mine', id });
  updateProfileVisuals();
}

$('#btnWearSkin').addEventListener('click', wearSelected);
$('#btnAnim').addEventListener('click', () => {
  if (!sk.viewer) return;
  sk.anim = sk.anim === 'walk' ? 'idle' : sk.anim === 'idle' ? 'run' : 'walk';
  sk.viewer.animation = sk.anim === 'walk' ? new skinview3d.WalkingAnimation() : sk.anim === 'run' ? new skinview3d.RunningAnimation() : new skinview3d.IdleAnimation();
  if (sk.anim === 'walk') sk.viewer.animation.speed = 0.6;
  $('#btnAnim').textContent = { walk: 'Ходьба', idle: 'Стоит', run: 'Бег' }[sk.anim];
});

$$('#skinTabs button').forEach((b) => b.addEventListener('click', () => {
  $$('#skinTabs button').forEach((x) => x.classList.toggle('active', x === b));
  $$('.skin-pane').forEach((p) => p.classList.toggle('hidden', p.id !== `skinPane-${b.dataset.v}`));
  if (b.dataset.v === 'editor' && !ed.loaded) openEditor(null);
}));

$('#btnNewSkin').addEventListener('click', () => openEditor(null));
$('#btnImportSkin').addEventListener('click', async () => {
  try {
    const data = await R.skin.import();
    if (!data) return;
    const img = await loadImg(data);
    if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) return toast('Нужен скин 64×64 (или старый 64×32)');
    const c = document.createElement('canvas'); c.width = c.height = 64;
    c.getContext('2d').drawImage(img, 0, 0);
    const s = { id: uid(), name: 'Мой скин', model: 'classic', data: c.toDataURL('image/png'), source: 'custom' };
    mySkins().push(s);
    saveSkinData();
    renderMySkins();
    selectSkin({ kind: 'mine', ...s });
  } catch (e) { toast(e.message); }
});
$('#btnRandomSkin').addEventListener('click', () => {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const hue = () => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
  const spec = {
    skin: pick(['#f6d2b8', '#e8bf9a', '#c99a76', '#a8714f', '#8d5b3e', '#5e3b26']), hair: pick(['#141414', '#3b2a1a', '#7a4a25', '#d9b45a', '#b5432a', hue()]),
    hairStyle: pick(['short', 'long', 'bald', 'short']), eyes: hue(), shirt: hue(), shirt2: hue(), pattern: pick(['plain', 'stripes', 'jacket', 'hoodie', 'suit']),
    pants: hue(), shoes: hue(), extra: pick([null, null, 'cap', 'beard', 'mask']), seed: Math.floor(Math.random() * 999), model: pick(['classic', 'slim']),
  };
  const data = makeSkin(spec);
  const name = 'Случайный';
  sk.random = { key: 'random-' + spec.seed, name, spec };
  skinCache.set(sk.random.key, data);
  selectSkin({ kind: 'ready', key: sk.random.key, data, model: spec.model, name });
});

// ───────────── Редактор ─────────────

const ed = { loaded: false, editingId: null, tool: 'pen', color: '#3a7bd5', layer2: false, mirror: true, model: 'classic', undo: [], buf: null, drawing: false };
const PALETTE = ['#000000', '#3b3b3b', '#7a7a7a', '#ffffff', '#f6d2b8', '#e2b593', '#a8714f', '#5e3b26', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#00acc1', '#1e88e5', '#5e35b1', '#d81b60'];
const BASE_RECTS = [[0, 0, 32, 16], [16, 16, 24, 16], [40, 16, 16, 16], [0, 16, 16, 16], [16, 48, 16, 16], [32, 48, 16, 16]];
const OVER_RECTS = [[32, 0, 32, 16], [16, 32, 24, 16], [40, 32, 16, 16], [0, 32, 16, 16], [0, 48, 16, 16], [48, 48, 16, 16]];
const inRects = (x, y, rects) => rects.some(([rx, ry, rw, rh]) => x >= rx && y >= ry && x < rx + rw && y < ry + rh);
const LABELS = [['Голова', 0, 0, 32, 16], ['Тело', 16, 16, 24, 16], ['П. рука', 40, 16, 16, 16], ['П. нога', 0, 16, 16, 16], ['Л. нога', 16, 48, 16, 16], ['Л. рука', 32, 48, 16, 16]];

function edCtx() {
  if (!ed.buf) { ed.buf = document.createElement('canvas'); ed.buf.width = ed.buf.height = 64; }
  return ed.buf.getContext('2d', { willReadFrequently: true });
}

async function openEditor(skin) {
  $$('#skinTabs button').forEach((x) => x.classList.toggle('active', x.dataset.v === 'editor'));
  $$('.skin-pane').forEach((p) => p.classList.toggle('hidden', p.id !== 'skinPane-editor'));
  ed.loaded = true;
  ed.undo = [];
  const base = skin?.data || sk.sel?.data || presetData(READY_SKINS[0]);
  ed.editingId = skin && skin.source === 'custom' ? skin.id : null;
  ed.model = skin?.model || sk.sel?.model || 'classic';
  $('#skinName').value = skin ? skin.name : 'Мой скин';
  $$('#modelSeg button').forEach((b) => b.classList.toggle('active', b.dataset.v === ed.model));
  const ctx = edCtx();
  ctx.clearRect(0, 0, 64, 64);
  ctx.drawImage(await loadImg(base), 0, 0);
  edRender();
  edPreview();
}

function edRender() {
  const view = $('#editorCanvas');
  const ctx = view.getContext('2d');
  const k = view.width / 64;
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(ed.buf, 0, 0, view.width, view.height);
  // Неактивный слой затемняем
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  for (const [x, y, w, h] of ed.layer2 ? BASE_RECTS : OVER_RECTS) ctx.fillRect(x * k, y * k, w * k, h * k);
  // Сетка и подписи
  ctx.strokeStyle = 'rgba(128,128,128,.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) { ctx.moveTo(i * k + 0.5, 0); ctx.lineTo(i * k + 0.5, view.height); ctx.moveTo(0, i * k + 0.5); ctx.lineTo(view.width, i * k + 0.5); }
  ctx.stroke();
  ctx.font = '600 11px -apple-system, Segoe UI, sans-serif';
  for (const [t, x, y, w] of LABELS) {
    const lx = (ed.layer2 ? x + (x < 32 && y < 16 ? 32 : 0) : x) * k;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillText(t, lx + 3, y * k + 12);
  }
}

let edPreviewTimer = null;
function edPreview() {
  clearTimeout(edPreviewTimer);
  edPreviewTimer = setTimeout(() => {
    const data = ed.buf.toDataURL('image/png');
    loadInto(sk.viewer, data, ed.model);
    $('#stageName').textContent = $('#skinName').value || 'Мой скин';
  }, 80);
}

function mirrorOf(x, y) {
  const maps = [
    [[40, 16, 16, 16], -8, 32], [[0, 16, 16, 16], 16, 32],
    [[40, 32, 16, 16], 8, 16], [[0, 32, 16, 16], 0, 16],
  ];
  for (const [[rx, ry, rw, rh], dx, dy] of maps) if (x >= rx && y >= ry && x < rx + rw && y < ry + rh) return [x + dx, y + dy];
  return null;
}

function setPx(ctx, x, y, color) {
  if (!inRects(x, y, ed.layer2 ? OVER_RECTS : BASE_RECTS)) return;
  const pts = [[x, y]];
  if (ed.mirror) { const m = mirrorOf(x, y); if (m) pts.push(m); }
  for (const [px, py] of pts) {
    if (color) { ctx.fillStyle = color; ctx.clearRect(px, py, 1, 1); ctx.fillRect(px, py, 1, 1); }
    else ctx.clearRect(px, py, 1, 1);
  }
}

function flood(ctx, x, y, color) {
  const rects = ed.layer2 ? OVER_RECTS : BASE_RECTS;
  const rect = rects.find(([rx, ry, rw, rh]) => x >= rx && y >= ry && x < rx + rw && y < ry + rh);
  if (!rect) return;
  const img = ctx.getImageData(0, 0, 64, 64).data;
  const at = (px, py) => img.slice((py * 64 + px) * 4, (py * 64 + px) * 4 + 4).join(',');
  const target = at(x, y);
  const seen = new Set();
  const stack = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop();
    const key = px + ',' + py;
    if (seen.has(key)) continue;
    seen.add(key);
    if (px < rect[0] || py < rect[1] || px >= rect[0] + rect[2] || py >= rect[1] + rect[3]) continue;
    if (at(px, py) !== target) continue;
    setPx(ctx, px, py, color);
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
}

function edPoint(e) {
  const r = e.target.getBoundingClientRect();
  return [Math.floor(((e.clientX - r.left) / r.width) * 64), Math.floor(((e.clientY - r.top) / r.height) * 64)];
}

function edApply(e) {
  const [x, y] = edPoint(e);
  if (x < 0 || y < 0 || x > 63 || y > 63) return;
  const ctx = edCtx();
  if (ed.tool === 'pick') {
    const d = ctx.getImageData(x, y, 1, 1).data;
    if (d[3]) {
      ed.color = '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
      $('#colorPick').value = ed.color;
      renderPalette();
    }
    return;
  }
  if (ed.tool === 'fill') flood(ctx, x, y, ed.color);
  else setPx(ctx, x, y, ed.tool === 'eraser' ? null : ed.color);
  edRender();
  edPreview();
}

const edCanvas = $('#editorCanvas');
edCanvas.addEventListener('pointerdown', (e) => {
  ed.undo.push(edCtx().getImageData(0, 0, 64, 64));
  if (ed.undo.length > 40) ed.undo.shift();
  ed.drawing = ed.tool === 'pen' || ed.tool === 'eraser';
  edCanvas.setPointerCapture(e.pointerId);
  edApply(e);
});
edCanvas.addEventListener('pointermove', (e) => { if (ed.drawing) edApply(e); });
edCanvas.addEventListener('pointerup', () => { ed.drawing = false; });

$('#btnUndo').addEventListener('click', () => {
  const prev = ed.undo.pop();
  if (!prev) return;
  edCtx().putImageData(prev, 0, 0);
  edRender();
  edPreview();
});
$$('#toolSeg button').forEach((b) => b.addEventListener('click', () => {
  ed.tool = b.dataset.v;
  $$('#toolSeg button').forEach((x) => x.classList.toggle('active', x === b));
}));
$$('#modelSeg button').forEach((b) => b.addEventListener('click', () => {
  ed.model = b.dataset.v;
  $$('#modelSeg button').forEach((x) => x.classList.toggle('active', x === b));
  edPreview();
}));
$('#layerToggle').addEventListener('change', (e) => { ed.layer2 = e.target.checked; edRender(); });
$('#mirrorToggle').addEventListener('change', (e) => { ed.mirror = e.target.checked; });
$('#colorPick').addEventListener('input', (e) => { ed.color = e.target.value; renderPalette(); });
$('#skinName').addEventListener('input', edPreview);

function renderPalette() {
  $('#palette').innerHTML = PALETTE.map((c) => `<button style="background:${c}" data-c="${c}" class="${c === ed.color ? 'active' : ''}"></button>`).join('');
}
$('#palette').addEventListener('click', (e) => {
  const c = e.target.dataset.c;
  if (!c) return;
  ed.color = c;
  $('#colorPick').value = c;
  if (ed.tool === 'eraser' || ed.tool === 'pick') $$('#toolSeg button')[0].click();
  renderPalette();
});

$('#btnSaveSkin').addEventListener('click', () => {
  const data = ed.buf.toDataURL('image/png');
  const name = $('#skinName').value.trim() || 'Мой скин';
  let s = ed.editingId && mySkins().find((x) => x.id === ed.editingId);
  if (s) Object.assign(s, { data, name, model: ed.model });
  else {
    s = { id: uid(), name, model: ed.model, data, source: 'custom' };
    mySkins().push(s);
    ed.editingId = s.id;
  }
  saveSkinData();
  renderMySkins();
  sk.sel = { kind: 'mine', id: s.id, data, model: s.model, name };
  $('#btnWearSkin').textContent = profile().skinId === s.id ? 'Обновить' : 'Надеть';
  $('#btnWearSkin').disabled = false;
  if (profile().skinId === s.id) updateProfileVisuals();
  toast('Скин сохранён в «Мои скины»');
});

// ───────────── Вход во вкладку ─────────────

function renderSkinsTab() {
  ensureViewers();
  renderMySkins();
  renderReadySkins();
  renderEffectChips();
  renderPalette();
  const worn = wornSkin();
  if (!sk.sel) {
    if (worn) selectSkin({ kind: 'mine', id: worn.id, data: worn.data, model: worn.model, name: worn.name });
    else { const r = READY_SKINS[0]; selectSkin({ kind: 'ready', key: r.key, data: presetData(r), model: r.spec.model, name: r.name }); }
  } else selectSkin(sk.sel);
  sk.fx.set(profile().effect || null);
  $('#skinNote').textContent = st.account?.type === 'microsoft'
    ? 'Надетый скин загружается в ваш профиль Minecraft — его видят все.'
    : 'Офлайн: скин виден вам в одиночной игре. Эффекты видны в лаунчере.';
}

document.querySelector('.nav[data-tab="skins"]').addEventListener('click', renderSkinsTab);
