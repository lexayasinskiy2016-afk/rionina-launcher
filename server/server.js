// Сервер Rionina: аккаунты (ник + пароль или Microsoft), друзья, открытые миры,
// Rionina Coins, ежедневные награды, Pro и сайт rioninalauncher.com.
// Без внешних зависимостей: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SITE_DIR = process.env.SITE_DIR || path.join(__dirname, '..', 'site');

// ───────────── Экономика и лимиты ─────────────
const ECONOMY = {
  startCoins: 150,
  daily: [50, 60, 70, 80, 100, 120, 200], // награда за 1-й…7-й день подряд
  chests: { starter: 100, effects: 200, legend: 500 },
  friendsLimit: { free: 10, pro: 50 },
  proPriceUsd: 10,
  proFree: false, // Pro только за $10 — оплата картой подключится позже
};
const ONLINE_MS = 150_000; // считаем онлайн, если лаунчер отзывался последние 2,5 минуты

// ───────────── Хранилище (JSON-файл) ─────────────
let db = { users: {}, sessions: {}, requests: [], chats: {}, unread: {}, packs: [], clans: {} };

// Где хранить данные: в Postgres (бесплатный Neon), если задан DATABASE_URL, иначе в файле.
// В Postgres вся база лежит одной JSON-строкой — просто и надёжно для небольшого проекта.
const DATABASE_URL = process.env.DATABASE_URL;
let pg = null;
async function loadDb() {
  if (DATABASE_URL) {
    const { Pool } = require('pg');
    pg = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
    await pg.query('CREATE TABLE IF NOT EXISTS rionina_store (id INT PRIMARY KEY, data JSONB NOT NULL, updated TIMESTAMPTZ DEFAULT now())');
    const r = await pg.query('SELECT data FROM rionina_store WHERE id = 1');
    if (r.rows[0]) db = { ...db, ...r.rows[0].data };
    console.log(`База: Postgres, игроков ${Object.keys(db.users).length}`);
  } else {
    try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch { /* новая база */ }
    console.log(`База: файл ${DB_FILE}`);
  }
}
let saveTimer = null;
let saving = Promise.resolve();
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const snapshot = JSON.stringify(db);
    if (pg) {
      saving = saving.then(() => pg.query(
        'INSERT INTO rionina_store (id, data, updated) VALUES (1, $1::jsonb, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated = now()',
        [snapshot],
      )).catch((e) => console.error('Не удалось сохранить базу:', e.message));
    } else {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = DB_FILE + '.tmp';
      fs.writeFileSync(tmp, snapshot);
      fs.renameSync(tmp, DB_FILE);
    }
  }, pg ? 1000 : 200);
}

const lower = (s) => String(s || '').toLowerCase();
const now = () => Date.now();
const NICK_RE = /^[A-Za-z0-9_]{3,16}$/;

function offlineUuid(name) {
  const md5 = crypto.createHash('md5').update(`OfflinePlayer:${name}`).digest();
  md5[6] = (md5[6] & 0x0f) | 0x30;
  md5[8] = (md5[8] & 0x3f) | 0x80;
  const h = md5.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function checkPassword(password, user) {
  const { hash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
}

function newSession(key) {
  const token = crypto.randomBytes(32).toString('hex');
  const id = crypto.createHash('sha256').update(token).digest('hex');
  db.sessions[id] = { user: key, created: now(), expires: now() + 90 * 864e5 };
  save();
  return token;
}
function userByToken(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const s = db.sessions[crypto.createHash('sha256').update(token).digest('hex')];
  if (!s || s.expires < now()) return null;
  return db.users[s.user] || null;
}

function makeUser(nick, kind, extra = {}) {
  const user = {
    nick, kind, uuid: kind === 'rionina' ? offlineUuid(nick) : extra.uuid,
    created: now(), coins: ECONOMY.startCoins, streak: 0, lastDaily: 0,
    pro: false, friends: [], presence: null, ...extra,
  };
  db.users[lower(nick)] = user;
  save();
  return user;
}

const isPro = (u) => !!u.pro;
const limitFor = (u) => (isPro(u) ? ECONOMY.friendsLimit.pro : ECONOMY.friendsLimit.free);
const dayIndex = (t) => Math.floor((t + 3 * 3600e3) / 864e5); // сутки по Москве

function me(u) {
  const today = dayIndex(now());
  return {
    nick: u.nick, uuid: u.uuid, kind: u.kind, coins: u.coins, pro: isPro(u),
    streak: u.streak, dailyAvailable: dayIndex(u.lastDaily) !== today,
    nextDaily: ECONOMY.daily[Math.min(u.streak, ECONOMY.daily.length - 1)] * (isPro(u) ? 2 : 1),
    stats: { playMinutes: u.playMinutes || 0, chestsOpened: u.chestsOpened || 0, friends: u.friends.length },
    achievements: u.achievements || [],
    owned: u.owned || [], clan: u.clan || null,
    friendsLimit: limitFor(u), economy: { chests: ECONOMY.chests, proPriceUsd: ECONOMY.proPriceUsd, proFree: ECONOMY.proFree },
  };
}

// Простая защита от перебора паролей
const attempts = new Map();
function throttle(key) {
  const a = attempts.get(key) || { n: 0, t: now() };
  if (now() - a.t > 10 * 60e3) { a.n = 0; a.t = now(); }
  a.n++;
  attempts.set(key, a);
  if (a.n > 10) throw httpError(429, 'Слишком много попыток — подождите 10 минут');
}

function httpError(code, message) { const e = new Error(message); e.code = code; return e; }

// ───────────── API ─────────────
const routes = {};
const route = (method, p, fn) => { routes[`${method} ${p}`] = fn; };

route('GET', '/api/health', () => ({ ok: true, name: 'Rionina', version: 1 }));

route('POST', '/api/auth/register', ({ body, ip }) => {
  throttle('reg:' + ip);
  const nick = String(body.nick || '').trim();
  const password = String(body.password || '');
  if (!NICK_RE.test(nick)) throw httpError(400, 'Ник: 3–16 символов, латиница, цифры и «_»');
  if (password.length < 6) throw httpError(400, 'Пароль — минимум 6 символов');
  if (db.users[lower(nick)]) throw httpError(409, 'Этот ник уже занят');
  const user = makeUser(nick, 'rionina', hashPassword(password));
  return { token: newSession(lower(nick)), me: me(user) };
});

route('POST', '/api/auth/login', ({ body, ip }) => {
  const nick = String(body.nick || '').trim();
  throttle('login:' + lower(nick) + ':' + ip);
  const user = db.users[lower(nick)];
  if (!user || user.kind !== 'rionina' || !checkPassword(String(body.password || ''), user)) {
    throw httpError(401, 'Неверный ник или пароль');
  }
  return { token: newSession(lower(nick)), me: me(user) };
});

// Аккаунт Microsoft: проверяем токен Minecraft у Mojang и выдаём сессию Rionina
route('POST', '/api/auth/microsoft', async ({ body }) => {
  const res = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${String(body.mcToken || '')}` },
  });
  if (!res.ok) throw httpError(401, 'Mojang не подтвердил аккаунт');
  const prof = await res.json();
  let key = Object.keys(db.users).find((k) => db.users[k].kind === 'microsoft' && db.users[k].uuid === prof.id);
  if (!key) {
    let nick = prof.name;
    if (db.users[lower(nick)]) nick = `${prof.name}_ms`.slice(0, 16);
    makeUser(nick, 'microsoft', { uuid: prof.id });
    key = lower(nick);
  }
  return { token: newSession(key), me: me(db.users[key]) };
});

route('POST', '/api/auth/logout', ({ req }) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  delete db.sessions[crypto.createHash('sha256').update(token).digest('hex')];
  save();
  return { ok: true };
});

route('GET', '/api/me', ({ user }) => me(user));

route('POST', '/api/daily', ({ user }) => {
  const today = dayIndex(now());
  if (dayIndex(user.lastDaily) === today) throw httpError(409, 'Награда за сегодня уже получена');
  user.streak = dayIndex(user.lastDaily) === today - 1 ? user.streak + 1 : 1;
  const reward = ECONOMY.daily[Math.min(user.streak - 1, ECONOMY.daily.length - 1)] * (isPro(user) ? 2 : 1);
  user.coins += reward;
  user.lastDaily = now();
  save();
  return { reward, me: me(user) };
});

route('POST', '/api/chests/open', ({ user, body }) => {
  const price = ECONOMY.chests[body.chest];
  if (price == null) throw httpError(400, 'Нет такого сундука');
  if (!isPro(user)) {
    if (user.coins < price) throw httpError(402, `Не хватает монет: нужно ${price}`);
    user.coins -= price;
  }
  user.chestsOpened = (user.chestsOpened || 0) + 1;
  save();
  return { paid: isPro(user) ? 0 : price, me: me(user) };
});

route('POST', '/api/pro/activate', ({ user }) => {
  if (!ECONOMY.proFree) throw httpError(402, 'Rionina Pro стоит $10 — оплата картой скоро появится');
  user.pro = true;
  user.proSince = now();
  save();
  return me(user);
});

// ───────────── Друзья ─────────────
function publicFriend(nick) {
  const f = db.users[lower(nick)];
  if (!f) return null;
  const p = f.presence;
  const online = !!p && now() - p.at < ONLINE_MS;
  return {
    nick: f.nick, uuid: f.uuid, pro: isPro(f), online, clan: f.clan || null,
    status: online ? p.status : 'offline',
    playing: online ? p.playing || null : null,
    shared: online && p.shared && p.shared.address ? p.shared : null,
  };
}

route('GET', '/api/friends', ({ user }) => ({
  limit: limitFor(user),
  friends: user.friends.map(publicFriend).filter(Boolean)
    .map((f) => ({ ...f, unread: db.unread[lower(user.nick)]?.[lower(f.nick)] || 0 })),
  incoming: db.requests.filter((r) => r.to === lower(user.nick)).map((r) => db.users[r.from]?.nick).filter(Boolean),
  outgoing: db.requests.filter((r) => r.from === lower(user.nick)).map((r) => db.users[r.to]?.nick).filter(Boolean),
}));

route('POST', '/api/friends/request', ({ user, body }) => {
  const target = db.users[lower(body.nick)];
  if (!target) throw httpError(404, 'Игрок с таким ником не найден');
  if (target === user) throw httpError(400, 'Нельзя добавить самого себя');
  if (user.friends.some((n) => lower(n) === lower(target.nick))) throw httpError(409, 'Вы уже друзья');
  if (user.friends.length >= limitFor(user)) throw httpError(403, `Лимит друзей: ${limitFor(user)}${isPro(user) ? '' : ' — с Pro до 50'}`);
  // Встречная заявка — сразу дружим
  const back = db.requests.findIndex((r) => r.from === lower(target.nick) && r.to === lower(user.nick));
  if (back >= 0) {
    db.requests.splice(back, 1);
    link(user, target);
    return { status: 'friends' };
  }
  if (!db.requests.some((r) => r.from === lower(user.nick) && r.to === lower(target.nick))) {
    db.requests.push({ from: lower(user.nick), to: lower(target.nick), at: now() });
    save();
  }
  return { status: 'sent' };
});

function link(a, b) {
  if (a.friends.length >= limitFor(a)) throw httpError(403, `У вас уже ${limitFor(a)} друзей — это лимит`);
  if (b.friends.length >= limitFor(b)) throw httpError(403, `У игрока ${b.nick} заполнен список друзей`);
  if (!a.friends.includes(b.nick)) a.friends.push(b.nick);
  if (!b.friends.includes(a.nick)) b.friends.push(a.nick);
  save();
}

route('POST', '/api/friends/accept', ({ user, body }) => {
  const i = db.requests.findIndex((r) => r.from === lower(body.nick) && r.to === lower(user.nick));
  if (i < 0) throw httpError(404, 'Заявка не найдена');
  const from = db.users[db.requests[i].from];
  db.requests.splice(i, 1);
  link(user, from);
  return { status: 'friends' };
});

route('POST', '/api/friends/decline', ({ user, body }) => {
  db.requests = db.requests.filter((r) => !(
    (r.from === lower(body.nick) && r.to === lower(user.nick)) || (r.from === lower(user.nick) && r.to === lower(body.nick))));
  save();
  return { ok: true };
});

route('POST', '/api/friends/remove', ({ user, body }) => {
  const other = db.users[lower(body.nick)];
  user.friends = user.friends.filter((n) => lower(n) !== lower(body.nick));
  if (other) other.friends = other.friends.filter((n) => lower(n) !== lower(user.nick));
  save();
  return { ok: true };
});

// Лаунчер раз в минуту сообщает статус и открытый для друзей мир
route('POST', '/api/presence', ({ user, body }) => {
  const shared = body.shared && typeof body.shared.address === 'string' && /^[a-z0-9.-]+(:\d+)?$/i.test(body.shared.address)
    ? {
      address: body.shared.address.slice(0, 120),
      gameVersion: String(body.shared.gameVersion || '').slice(0, 32),
      loader: body.shared.loader === 'fabric' ? 'fabric' : null,
      mods: Array.isArray(body.shared.mods) ? body.shared.mods.filter((m) => /^[A-Za-z0-9]{8}$/.test(m)).slice(0, 200) : [],
      world: String(body.shared.world || '').slice(0, 40),
    }
    : null;
  user.presence = {
    at: now(),
    status: ['online', 'playing'].includes(body.status) ? body.status : 'online',
    playing: body.playing ? { gameVersion: String(body.playing.gameVersion || '').slice(0, 32) } : null,
    shared,
  };
  save();
  return { ok: true };
});

// ───────────── Чат с друзьями ─────────────
const chatKey = (a, b) => [lower(a), lower(b)].sort().join('|');
const isFriend = (u, nick) => u.friends.some((n) => lower(n) === lower(nick));

route('GET', '/api/chat', ({ req, user }) => {
  const q = new URL(req.url, 'http://x').searchParams;
  const other = q.get('with') || '';
  if (!isFriend(user, other)) throw httpError(403, 'Писать можно только друзьям');
  const after = Number(q.get('after')) || 0;
  const list = (db.chats[chatKey(user.nick, other)] || []).filter((m) => m.at > after);
  if (db.unread[lower(user.nick)]?.[lower(other)]) { db.unread[lower(user.nick)][lower(other)] = 0; save(); }
  return { messages: list };
});

route('POST', '/api/chat/send', ({ user, body }) => {
  const to = db.users[lower(body.to)];
  if (!to || !isFriend(user, to.nick)) throw httpError(403, 'Писать можно только друзьям');
  const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!text) throw httpError(400, 'Пустое сообщение');
  const key = chatKey(user.nick, to.nick);
  const list = (db.chats[key] ||= []);
  const msg = { from: user.nick, text: moderateText(text), at: now() };
  list.push(msg);
  if (list.length > 300) list.splice(0, list.length - 300);
  const box = (db.unread[lower(to.nick)] ||= {});
  box[lower(user.nick)] = (box[lower(user.nick)] || 0) + 1;
  save();
  return msg;
});

// ───────────── Модерация ─────────────
// Границы слова, которые понимают и русские буквы
const W = (src) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${src})(?![\\p{L}\\p{N}])`, 'iu');
const BLOCKED = [
  W('x-?ray|xray|икс-?рей|иксрей'), W('kill ?aura|aimbot|аимбот|autoclicker|автокликер|автоклик'), W('dupe|дюп'),
  W('cheats?|hacks?|hacked|читы|чит|читер|читов|взлом'), W('wurst|meteor client|impact client|aristois'),
  W('nsfw|porn\\w*|порн\\w*|sex|секс\\w*'), /18\+/,
];
const { censor, hasProfanity } = require('./profanity');
const isRude = (t) => hasProfanity(t);
function moderateText(t) { return censor(t); }
function moderatePack(p) {
  const text = [p.name, p.description, ...(p.mods || []).map((m) => `${m.title} ${m.slug || ''}`)].join(' ');
  const bad = BLOCKED.find((re) => re.test(text));
  if (bad) return { ok: false, reason: 'В сборке есть читы или запрещённый контент' };
  if (isRude(text)) return { ok: false, reason: 'Нецензурные слова в названии или описании' };
  if (!p.mods?.length) return { ok: false, reason: 'В сборке нет модов' };
  if (p.mods.length > 150) return { ok: false, reason: 'Слишком много модов (больше 150)' };
  return { ok: true };
}

// ───────────── Сборки игроков ─────────────
const REVIEW_MS = 10 * 60e3; // проверка ~10 минут, потом сборка видна всем

function publicPack(p) {
  const status = p.status === 'rejected' ? 'rejected' : now() >= p.publishAt ? 'approved' : 'review';
  return { id: p.id, name: p.name, description: p.description, author: p.author, gameVersion: p.gameVersion, loader: p.loader, mods: p.mods, status, reason: p.reason || null, created: p.created, publishAt: p.publishAt, installs: p.installs || 0 };
}

route('GET', '/api/packs', ({ user }) => {
  const all = db.packs.map(publicPack);
  return {
    community: all.filter((p) => p.status === 'approved').sort((a, b) => b.installs - a.installs || b.created - a.created).slice(0, 100),
    mine: all.filter((p) => lower(p.author) === lower(user.nick)).sort((a, b) => b.created - a.created),
  };
});

route('POST', '/api/packs', ({ user, body }) => {
  const mine = db.packs.filter((p) => lower(p.author) === lower(user.nick) && now() - p.created < 864e5);
  if (mine.length >= 5) throw httpError(429, 'Не больше 5 сборок в день');
  const pack = {
    id: crypto.randomBytes(6).toString('hex'),
    name: String(body.name || '').trim().slice(0, 48),
    description: String(body.description || '').trim().slice(0, 400),
    author: user.nick,
    gameVersion: String(body.gameVersion || '').slice(0, 24),
    loader: ['fabric', 'forge', 'neoforge'].includes(body.loader) ? body.loader : 'fabric',
    mods: (Array.isArray(body.mods) ? body.mods : []).filter((m) => /^[A-Za-z0-9]{8}$/.test(m?.id))
      .map((m) => ({ id: m.id, title: String(m.title || '').slice(0, 60), slug: String(m.slug || '').slice(0, 60) })),
    created: now(),
    installs: 0,
  };
  if (pack.name.length < 3) throw httpError(400, 'Название — минимум 3 символа');
  const verdict = moderatePack(pack);
  pack.status = verdict.ok ? 'review' : 'rejected';
  pack.reason = verdict.ok ? null : verdict.reason;
  pack.publishAt = now() + REVIEW_MS;
  db.packs.push(pack);
  save();
  return publicPack(pack);
});

route('POST', '/api/packs/install', ({ body }) => {
  const p = db.packs.find((x) => x.id === body.id);
  if (p) { p.installs = (p.installs || 0) + 1; save(); }
  return { ok: true };
});

// ───────────── ИИ-сборщик (нейросеть Google Gemini, бесплатный ключ) ─────────────
route('POST', '/api/ai/modpack', async ({ body }) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw httpError(501, 'Нейросеть на сервере не подключена');
  const prompt = String(body.prompt || '').slice(0, 600);
  const verdict = moderatePack({ name: prompt, description: '', mods: [{ title: 'x' }] });
  if (!verdict.ok) return { ok: false, reason: verdict.reason };
  const ask = `Ты — помощник лаунчера Minecraft. Игрок хочет сборку модов: «${prompt}». Версия ${body.gameVersion}, загрузчик ${body.loader}.
Верни ТОЛЬКО JSON: {"ok":true,"name":"короткое название на русском","description":"1-2 предложения на русском","queries":["5-12 поисковых запросов на английском для Modrinth, по одному моду или теме"]}.
Если просят читы, взлом, x-ray, 18+ или что-то вредное — верни {"ok":false,"reason":"почему нельзя, по-русски"}.`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: ask }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.6 } }),
  });
  if (!res.ok) throw httpError(502, 'Нейросеть не ответила');
  const data = await res.json();
  const out = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
  return {
    ok: out.ok !== false, reason: out.reason || null,
    name: String(out.name || '').slice(0, 48), description: String(out.description || '').slice(0, 300),
    queries: (out.queries || []).map(String).slice(0, 12),
  };
});

// ───────────── Время в игре и достижения ─────────────
// Награды за достижения (монеты). Проверяемые сервером помечены check.
const ACHIEVEMENTS = {
  first_launch: { coins: 20 }, play_1h: { coins: 30, check: (u) => (u.playMinutes || 0) >= 60 },
  play_10h: { coins: 100, check: (u) => (u.playMinutes || 0) >= 600 }, chest_10: { coins: 50, check: (u) => (u.chestsOpened || 0) >= 10 },
  friend_1: { coins: 30, check: (u) => u.friends.length >= 1 }, friend_5: { coins: 60, check: (u) => u.friends.length >= 5 },
  streak_7: { coins: 100, check: (u) => (u.streak || 0) >= 7 }, screenshot_1: { coins: 20 }, ai_mod_1: { coins: 50 },
  ai_pack_1: { coins: 30 }, cape_1: { coins: 30 }, server_1: { coins: 20 }, call_1: { coins: 20 }, skin_1: { coins: 20 },
};
const PLAY_COINS_EVERY = 30; // минут игры за +10 монет

route('POST', '/api/playtime', ({ user, body }) => {
  // Не больше, чем реально прошло с прошлого отчёта (и не больше часа за раз)
  const since = user.playReportedAt ? Math.ceil((now() - user.playReportedAt) / 60000) + 1 : 60;
  const minutes = Math.max(0, Math.min(60, since, Math.round(Number(body.minutes) || 0)));
  const before = Math.floor((user.playMinutes || 0) / PLAY_COINS_EVERY);
  user.playMinutes = (user.playMinutes || 0) + minutes;
  user.playReportedAt = now();
  const earned = (Math.floor(user.playMinutes / PLAY_COINS_EVERY) - before) * 10;
  user.coins += earned;
  save();
  return { added: minutes, earned, me: me(user) };
});

route('POST', '/api/achievement', ({ user, body }) => {
  const a = ACHIEVEMENTS[body.id];
  if (!a) throw httpError(400, 'Нет такого достижения');
  user.achievements ||= [];
  if (user.achievements.includes(body.id)) return { reward: 0, me: me(user) };
  if (a.check && !a.check(user)) throw httpError(409, 'Достижение ещё не выполнено');
  user.achievements.push(body.id);
  user.coins += a.coins;
  save();
  return { reward: a.coins, me: me(user) };
});

// ───────────── Голосовые звонки: обмен сигналами WebRTC ─────────────
// Сам голос идёт напрямую между игроками; сервер только передаёт «рукопожатие».
const mailboxes = new Map(); // ник → [{ from, data, at }]
route('POST', '/api/call/signal', ({ user, body }) => {
  const to = db.users[lower(body.to)];
  if (!to || !isFriend(user, to.nick)) throw httpError(403, 'Звонить можно только друзьям');
  const data = body.data;
  if (!data || JSON.stringify(data).length > 20000) throw httpError(400, 'Неверный сигнал');
  const box = mailboxes.get(lower(to.nick)) || [];
  box.push({ from: user.nick, data, at: now() });
  mailboxes.set(lower(to.nick), box.filter((m) => now() - m.at < 60000).slice(-200));
  return { ok: true };
});
route('GET', '/api/call/poll', ({ user }) => {
  const box = (mailboxes.get(lower(user.nick)) || []).filter((m) => now() - m.at < 60000);
  mailboxes.delete(lower(user.nick));
  return { messages: box };
});

// ───────────── Магазин за Rionina Coins ─────────────
// Каталог: id → редкость. Те же id, что в лаунчере (эффекты, скины и плащи).
const CATALOG = {
  lightning: 'epic', fire: 'rare', snow: 'common', hearts: 'common', sparkles: 'rare', rainbow: 'epic', bubbles: 'common',
  portal: 'epic', matrix: 'rare', aura: 'legendary', confetti: 'common', galaxy: 'legendary',
  fire_lord: 'epic', ice_queen: 'epic', gold_knight: 'legendary', galaxy_skin: 'legendary', neon: 'rare', emerald: 'rare', shadow: 'rare', samurai: 'rare',
  cape_rionina: 'rare', cape_night: 'common', cape_forest: 'common', cape_love: 'common', cape_storm: 'epic', cape_fire: 'epic', cape_star: 'rare', cape_king: 'legendary',
};
const PRICES = { common: 150, rare: 400, epic: 900, legendary: 2000 };
const SHOP_SIZE = 6;

/** Набор магазина на сегодня — одинаковый у всех игроков и в лаунчере */
function shopToday(day = dayIndex(now())) {
  const ids = Object.keys(CATALOG).sort();
  let seed = day * 2654435761 % 4294967296;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = [];
  while (pick.length < SHOP_SIZE) { const id = ids[Math.floor(rnd() * ids.length)]; if (!pick.includes(id)) pick.push(id); }
  return pick;
}
const priceFor = (u, id) => Math.round(PRICES[CATALOG[id]] * (isPro(u) ? 0.8 : 1));

route('GET', '/api/shop', ({ user }) => ({
  day: dayIndex(now()),
  items: shopToday().map((id) => ({ id, rarity: CATALOG[id], price: priceFor(user, id), owned: (user.owned || []).includes(id) })),
}));
route('POST', '/api/shop/buy', ({ user, body }) => {
  const id = String(body.id || '');
  if (!shopToday().includes(id)) throw httpError(400, 'Этого предмета сегодня нет в магазине');
  user.owned ||= [];
  if (user.owned.includes(id)) throw httpError(409, 'Этот предмет уже у вас есть');
  const price = priceFor(user, id);
  if (user.coins < price) throw httpError(402, `Не хватает монет: нужно ${price}`);
  user.coins -= price;
  user.owned.push(id);
  save();
  return { id, paid: price, me: me(user) };
});
// Предметы из сундуков тоже запоминаем — чтобы коллекция была на любом компьютере
route('POST', '/api/owned/add', ({ user, body }) => {
  const id = String(body.id || '');
  if (!CATALOG[id]) throw httpError(400, 'Нет такого предмета');
  user.owned ||= [];
  if (!user.owned.includes(id)) { user.owned.push(id); save(); }
  return { ok: true };
});

// ───────────── Рейтинг игроков ─────────────
const BOARDS = {
  play: (u) => u.playMinutes || 0,
  chests: (u) => u.chestsOpened || 0,
  achievements: (u) => (u.achievements || []).length,
  coins: (u) => u.coins || 0,
};
route('GET', '/api/leaderboard', ({ req, user }) => {
  const by = new URL(req.url, 'http://x').searchParams.get('by');
  const score = BOARDS[by] || BOARDS.play;
  const all = Object.values(db.users).map((u) => ({ nick: u.nick, uuid: u.uuid, pro: isPro(u), clan: u.clan || null, value: score(u) }))
    .filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const myIndex = all.findIndex((x) => lower(x.nick) === lower(user.nick));
  return { by: BOARDS[by] ? by : 'play', top: all.slice(0, 50), me: myIndex >= 0 ? { rank: myIndex + 1, value: all[myIndex].value } : { rank: null, value: 0 } };
});

// ───────────── Кланы ─────────────
const CLAN_PRICE = 300;
const CLAN_MAX = 30;
const CLAN_EMOJI = ['🐉', '⚔️', '🛡️', '🔥', '❄️', '⚡', '🌙', '⭐', '👑', '💎', '🐺', '🦊', '🌲', '🏰', '🚀', '☠️'];
const CLAN_COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#0a84ff', '#5856d6', '#af52de', '#ff2d55', '#8e8e93'];
const TAG_RE = /^[A-Za-zА-Яа-яЁё0-9]{2,5}$/;

function clanPublic(c, withMembers) {
  const out = { tag: c.tag, name: c.name, emoji: c.emoji, color: c.color, owner: c.owner, members: c.members.length, max: CLAN_MAX, created: c.created };
  if (withMembers) {
    out.list = c.members.map((n) => {
      const u = db.users[lower(n)];
      const online = !!u?.presence && now() - u.presence.at < ONLINE_MS;
      return { nick: u?.nick || n, uuid: u?.uuid, pro: u ? isPro(u) : false, online, playMinutes: u?.playMinutes || 0 };
    });
  }
  return out;
}
const myClan = (u) => (u.clan ? db.clans[lower(u.clan)] : null);

route('GET', '/api/clans', () => ({
  clans: Object.values(db.clans).sort((a, b) => b.members.length - a.members.length).slice(0, 50).map((c) => clanPublic(c, false)),
  price: CLAN_PRICE, emoji: CLAN_EMOJI, colors: CLAN_COLORS,
}));
route('GET', '/api/clan', ({ user }) => {
  const c = myClan(user);
  return c ? clanPublic(c, true) : null;
});
route('POST', '/api/clan/create', ({ user, body }) => {
  if (myClan(user)) throw httpError(409, 'Вы уже в клане — сначала выйдите из него');
  const tag = String(body.tag || '').trim();
  const name = String(body.name || '').trim().slice(0, 24);
  if (!TAG_RE.test(tag)) throw httpError(400, 'Тег клана: 2–5 букв или цифр');
  if (name.length < 3) throw httpError(400, 'Название клана — минимум 3 символа');
  if (isRude(`${tag} ${name}`) || BLOCKED.some((re) => re.test(`${tag} ${name}`))) throw httpError(400, 'Название не прошло модерацию');
  if (db.clans[lower(tag)]) throw httpError(409, 'Такой тег уже занят');
  if (user.coins < CLAN_PRICE) throw httpError(402, `Создание клана стоит ${CLAN_PRICE} монет`);
  user.coins -= CLAN_PRICE;
  const clan = {
    tag, name, owner: user.nick, members: [user.nick], created: now(), chat: [],
    emoji: CLAN_EMOJI.includes(body.emoji) ? body.emoji : '⚔️', color: CLAN_COLORS.includes(body.color) ? body.color : '#0a84ff',
  };
  db.clans[lower(tag)] = clan;
  user.clan = tag;
  save();
  return { clan: clanPublic(clan, true), me: me(user) };
});
route('POST', '/api/clan/join', ({ user, body }) => {
  if (myClan(user)) throw httpError(409, 'Вы уже в клане — сначала выйдите из него');
  const c = db.clans[lower(body.tag)];
  if (!c) throw httpError(404, 'Клан не найден');
  if (c.members.length >= CLAN_MAX) throw httpError(403, 'В клане нет мест');
  c.members.push(user.nick);
  user.clan = c.tag;
  c.chat.push({ from: '★', text: `${user.nick} вступил в клан`, at: now() });
  save();
  return clanPublic(c, true);
});
route('POST', '/api/clan/leave', ({ user }) => {
  const c = myClan(user);
  if (!c) return { ok: true };
  c.members = c.members.filter((n) => lower(n) !== lower(user.nick));
  user.clan = null;
  if (!c.members.length) delete db.clans[lower(c.tag)];
  else {
    if (lower(c.owner) === lower(user.nick)) c.owner = c.members[0]; // глава ушёл — главой становится следующий
    c.chat.push({ from: '★', text: `${user.nick} покинул клан`, at: now() });
  }
  save();
  return { ok: true };
});
route('POST', '/api/clan/kick', ({ user, body }) => {
  const c = myClan(user);
  if (!c || lower(c.owner) !== lower(user.nick)) throw httpError(403, 'Исключать может только глава клана');
  const target = db.users[lower(body.nick)];
  if (!target || lower(target.nick) === lower(user.nick) || !c.members.some((n) => lower(n) === lower(target.nick))) throw httpError(404, 'Игрок не в клане');
  c.members = c.members.filter((n) => lower(n) !== lower(target.nick));
  target.clan = null;
  c.chat.push({ from: '★', text: `${target.nick} исключён из клана`, at: now() });
  save();
  return clanPublic(c, true);
});
route('GET', '/api/clan/chat', ({ req, user }) => {
  const c = myClan(user);
  if (!c) throw httpError(404, 'Вы не в клане');
  const after = Number(new URL(req.url, 'http://x').searchParams.get('after')) || 0;
  return { messages: c.chat.filter((m) => m.at > after) };
});
route('POST', '/api/clan/chat', ({ user, body }) => {
  const c = myClan(user);
  if (!c) throw httpError(404, 'Вы не в клане');
  const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!text) throw httpError(400, 'Пустое сообщение');
  const msg = { from: user.nick, text: moderateText(text), at: now() };
  c.chat.push(msg);
  if (c.chat.length > 300) c.chat.splice(0, c.chat.length - 300);
  save();
  return msg;
});

// Новости для сайта и лаунчера
// Новости берутся из блока <script id="news"> страницы сайта — правите в одном месте
route('GET', '/api/news', () => {
  try {
    const html = fs.readFileSync(path.join(SITE_DIR, 'index.html'), 'utf8');
    return JSON.parse(html.match(/<script id="news" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  } catch { return []; }
});

// ───────────── HTTP ─────────────
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const PUBLIC = new Set(['GET /api/health', 'POST /api/auth/register', 'POST /api/auth/login', 'POST /api/auth/microsoft', 'GET /api/news']);

function send(res, code, data, headers = {}) {
  const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    ...headers,
  });
  res.end(body);
}

// Страница сайта хранится без <html>/<head> — оборачиваем её при отдаче
function wrapPage(buf) {
  const text = buf.toString('utf8');
  if (/^\s*<!doctype/i.test(text)) return buf;
  const split = text.indexOf('</style>') + '</style>'.length;
  return Buffer.from(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${text.slice(0, split)}</head><body>${text.slice(split)}</body></html>`);
}

function serveStatic(req, res) {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // Скачать лаунчер: файл data/RioninaLauncher.exe или ссылка из DOWNLOAD_URL
  if (url === '/download') {
    const exe = path.join(DATA_DIR, 'RioninaLauncher.exe');
    if (fs.existsSync(exe)) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="RioninaLauncher.exe"', 'Content-Length': fs.statSync(exe).size });
      return fs.createReadStream(exe).pipe(res);
    }
    if (process.env.DOWNLOAD_URL) { res.writeHead(302, { Location: process.env.DOWNLOAD_URL }); return res.end(); }
    return send(res, 404, 'Файл лаунчера ещё не загружен на сервер', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  let file = path.normalize(path.join(SITE_DIR, url === '/' ? 'index.html' : url));
  if (!file.startsWith(SITE_DIR)) return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain' });
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = path.join(SITE_DIR, 'index.html');
  let data = fs.readFileSync(file);
  if (path.extname(file) === '.html') data = wrapPage(data);
  send(res, 200, data, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300' });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '');
  const pathname = new URL(req.url, 'http://x').pathname;
  if (!pathname.startsWith('/api/')) return serveStatic(req, res);
  const key = `${req.method} ${pathname}`;
  const fn = routes[key];
  if (!fn) return send(res, 404, { error: 'Не найдено' });
  try {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 64 * 1024) throw httpError(413, 'Слишком большой запрос');
    }
    const body = raw ? JSON.parse(raw) : {};
    const user = userByToken(req);
    if (!PUBLIC.has(key) && !user) throw httpError(401, 'Войдите в аккаунт');
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    send(res, 200, await fn({ req, body, user, ip }));
  } catch (e) {
    send(res, e.code && e.code >= 400 && e.code < 600 ? e.code : 500, { error: e.code ? e.message : 'Ошибка сервера' });
    if (!e.code) console.error(e);
  }
});

loadDb()
  .then(() => server.listen(PORT, () => console.log(`Rionina server: http://localhost:${PORT}`)))
  .catch((e) => { console.error('Не удалось открыть базу:', e.message); process.exit(1); });
module.exports = { server, ECONOMY };
