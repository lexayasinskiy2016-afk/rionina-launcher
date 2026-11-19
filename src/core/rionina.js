// Клиент сервера Rionina (аккаунты с паролем, монеты, сундуки, Pro, друзья)
// + локальный запасной режим, если сервер недоступен.
const crypto = require('crypto');
const { offlineUuid } = require('./minecraft');

const DEFAULT_SERVER = 'https://rioninalauncher.com';
const DAILY = [50, 60, 70, 80, 100, 120, 200];
const CHESTS = { starter: 100, effects: 200, legend: 500 };
const START_COINS = 150;

class Offline extends Error {}

class RioninaApi {
  constructor(getBase) { this.getBase = getBase; }

  /** Проверяем, что по адресу действительно сервер Rionina (ответ кэшируется на минуту). */
  async alive() {
    const base = this.getBase();
    if (this.health && this.health.base === base && Date.now() - this.health.at < 60_000) return this.health.ok;
    let ok = false;
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/api/health`, { signal: AbortSignal.timeout(20000) }); // бесплатный сервер может просыпаться
      ok = res.ok && (await res.json()).name === 'Rionina';
    } catch { ok = false; }
    this.health = { base, ok, at: Date.now() };
    return ok;
  }

  async call(method, path, body, token) {
    if (!(await this.alive())) throw new Offline('Сервер Rionina недоступен');
    let res;
    try {
      res = await fetch(`${this.getBase().replace(/\/$/, '')}/api${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new Offline('Сервер Rionina недоступен');
    }
    let data = {};
    try { data = await res.json(); } catch { /* пустой ответ */ }
    if (!res.ok) {
      const e = new Error(data.error || `Ошибка сервера (${res.status})`);
      e.status = res.status;
      throw e;
    }
    return data;
  }
}

// ───────────── Пароли для локального режима ─────────────
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
function checkPassword(password, acc) {
  const { hash } = hashPassword(password, acc.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(acc.hash, 'hex'));
}

function validate(nick, password) {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) throw new Error('Ник: 3–16 символов, латиница, цифры и «_»');
  if (String(password).length < 6) throw new Error('Пароль — минимум 6 символов');
}

function rioninaAccount(data, nick) {
  return {
    type: 'rionina',
    name: data.me.nick || nick,
    uuid: data.me.uuid || offlineUuid(nick),
    token: data.token,
    accessToken: crypto.randomBytes(16).toString('hex'),
  };
}

/**
 * Вход/регистрация по нику и паролю.
 * accounts — сохранённые аккаунты (для локального режима).
 */
async function authRionina(api, { mode, nick, password }, accounts) {
  nick = String(nick || '').trim();
  validate(nick, password);
  const local = accounts.find((a) => a.type === 'local' && a.name.toLowerCase() === nick.toLowerCase());
  try {
    if (mode === 'register') return rioninaAccount(await api.call('POST', '/auth/register', { nick, password }), nick);
    try {
      return rioninaAccount(await api.call('POST', '/auth/login', { nick, password }), nick);
    } catch (e) {
      // Локальный аккаунт, созданный без сервера, переносим на сервер
      if (e.status === 401 && local && checkPassword(password, local)) {
        return rioninaAccount(await api.call('POST', '/auth/register', { nick, password }), nick);
      }
      throw e;
    }
  } catch (e) {
    if (!(e instanceof Offline)) throw e;
    // Сервер недоступен — локальный аккаунт, защищённый паролем на этом компьютере
    if (mode === 'register') {
      if (local) throw new Error('Этот ник уже занят на этом компьютере');
      return { type: 'local', name: nick, uuid: offlineUuid(nick), accessToken: crypto.randomBytes(16).toString('hex'), ...hashPassword(password) };
    }
    if (!local) throw new Error('Сервер Rionina недоступен, а на этом компьютере такого аккаунта нет');
    if (!checkPassword(password, local)) throw new Error('Неверный пароль');
    return local;
  }
}

// ───────────── Экономика ─────────────
const dayIndex = (t) => Math.floor((t + 3 * 3600e3) / 864e5);

const LOCAL_ACH = {
  first_launch: 20, play_1h: 30, play_10h: 100, chest_10: 50, friend_1: 30, friend_5: 60, streak_7: 100,
  screenshot_1: 20, ai_mod_1: 50, ai_pack_1: 30, cape_1: 30, server_1: 20, call_1: 20, skin_1: 20,
};

function localMe(eco, acc) {
  const today = dayIndex(Date.now());
  return {
    stats: { playMinutes: eco.playMinutes || 0, chestsOpened: eco.chestsOpened || 0, friends: 0 },
    achievements: eco.achievements || [],
    nick: acc.name, uuid: acc.uuid, kind: acc.type, coins: eco.coins, pro: !!eco.pro, streak: eco.streak,
    dailyAvailable: dayIndex(eco.lastDaily || 0) !== today,
    nextDaily: DAILY[Math.min(eco.streak, DAILY.length - 1)] * (eco.pro ? 2 : 1),
    friendsLimit: eco.pro ? 50 : 10, economy: { chests: CHESTS, proPriceUsd: 10, proFree: false }, local: true,
  };
}

class Economy {
  constructor(api, state, save) { this.api = api; this.state = state; this.save = save; }

  eco(acc) {
    const all = (this.state.eco ||= {});
    return (all[acc.uuid] ||= { coins: START_COINS, streak: 0, lastDaily: 0, pro: false });
  }

  /** Сессия на сервере: у Rionina-аккаунта своя, у Microsoft — по токену Minecraft. */
  async token(acc) {
    if (acc.type === 'rionina') return acc.token;
    if (acc.type === 'microsoft') {
      if (acc.rioninaToken) return acc.rioninaToken;
      const data = await this.api.call('POST', '/auth/microsoft', { mcToken: acc.accessToken });
      acc.rioninaToken = data.token;
      this.save();
      return acc.rioninaToken;
    }
    return null;
  }

  async server(acc, method, path, body) {
    const t = await this.token(acc);
    if (!t) throw new Offline('Нужен аккаунт Rionina или Microsoft');
    try {
      return await this.api.call(method, path, body, t);
    } catch (e) {
      if (e.status === 401 && acc.type === 'microsoft') { // сессия устарела
        acc.rioninaToken = null;
        return this.api.call(method, path, body, await this.token(acc));
      }
      throw e;
    }
  }

  async me(acc) {
    try { return await this.server(acc, 'GET', '/me'); } catch (e) {
      if (!(e instanceof Offline)) throw e;
      return localMe(this.eco(acc), acc);
    }
  }

  async daily(acc) {
    try { return await this.server(acc, 'POST', '/daily'); } catch (e) {
      if (!(e instanceof Offline)) throw e;
      const eco = this.eco(acc);
      const today = dayIndex(Date.now());
      if (dayIndex(eco.lastDaily || 0) === today) throw new Error('Награда за сегодня уже получена');
      eco.streak = dayIndex(eco.lastDaily || 0) === today - 1 ? eco.streak + 1 : 1;
      const reward = DAILY[Math.min(eco.streak - 1, DAILY.length - 1)] * (eco.pro ? 2 : 1);
      eco.coins += reward;
      eco.lastDaily = Date.now();
      this.save();
      return { reward, me: localMe(eco, acc) };
    }
  }

  async openChest(acc, chest) {
    try { return await this.server(acc, 'POST', '/chests/open', { chest }); } catch (e) {
      if (!(e instanceof Offline)) throw e;
      const eco = this.eco(acc);
      const price = CHESTS[chest];
      if (price == null) throw new Error('Нет такого сундука');
      if (!eco.pro) {
        if (eco.coins < price) throw new Error(`Не хватает монет: нужно ${price}`);
        eco.coins -= price;
      }
      eco.chestsOpened = (eco.chestsOpened || 0) + 1;
      this.save();
      return { paid: eco.pro ? 0 : price, me: localMe(eco, acc) };
    }
  }

  async playtime(acc, minutes) {
    try { return await this.server(acc, 'POST', '/playtime', { minutes }); } catch (e) {
      if (!(e instanceof Offline)) throw e;
      const eco = this.eco(acc);
      const before = Math.floor((eco.playMinutes || 0) / 30);
      eco.playMinutes = (eco.playMinutes || 0) + Math.max(0, Math.min(600, Math.round(minutes)));
      const earned = (Math.floor(eco.playMinutes / 30) - before) * 10;
      eco.coins += earned;
      this.save();
      return { added: minutes, earned, me: localMe(eco, acc) };
    }
  }

  async achievement(acc, id) {
    try { return await this.server(acc, 'POST', '/achievement', { id }); } catch (e) {
      if (!(e instanceof Offline)) throw e;
      const eco = this.eco(acc);
      eco.achievements ||= [];
      if (!LOCAL_ACH[id]) throw new Error('Нет такого достижения');
      if (eco.achievements.includes(id)) return { reward: 0, me: localMe(eco, acc) };
      const checks = { play_1h: (eco.playMinutes || 0) >= 60, play_10h: (eco.playMinutes || 0) >= 600, chest_10: (eco.chestsOpened || 0) >= 10, streak_7: (eco.streak || 0) >= 7 };
      if (id in checks && !checks[id]) throw new Error('Достижение ещё не выполнено');
      eco.achievements.push(id);
      eco.coins += LOCAL_ACH[id];
      this.save();
      return { reward: LOCAL_ACH[id], me: localMe(eco, acc) };
    }
  }

  async shop(acc) {
    try { return await this.server(acc, 'GET', '/shop'); } catch (e) {
      if (!(e instanceof Offline)) throw e;
      const eco = this.eco(acc);
      const shop = require('./shop');
      return { day: shop.dayIndex(Date.now()), items: shop.shopToday().map((id) => ({ id, rarity: shop.CATALOG[id], price: shop.priceFor(eco.pro, id), owned: (eco.owned || []).includes(id) })) };
    }
  }

  async buy(acc, id) {
    try { return await this.server(acc, 'POST', '/shop/buy', { id }); } catch (e) {
      if (!(e instanceof Offline)) throw e;
      const eco = this.eco(acc);
      const shop = require('./shop');
      if (!shop.shopToday().includes(id)) throw new Error('Этого предмета сегодня нет в магазине');
      eco.owned ||= [];
      if (eco.owned.includes(id)) throw new Error('Этот предмет уже у вас есть');
      const price = shop.priceFor(eco.pro, id);
      if (eco.coins < price) throw new Error(`Не хватает монет: нужно ${price}`);
      eco.coins -= price;
      eco.owned.push(id);
      this.save();
      return { id, paid: price, me: localMe(eco, acc) };
    }
  }

  async activatePro(acc) {
    // Pro продаётся за $10; оплата картой подключится позже — бесплатно не выдаём
    try { return await this.server(acc, 'POST', '/pro/activate'); } catch (e) {
      if (!(e instanceof Offline)) throw e;
      throw new Error('Rionina Pro стоит $10 — оплата картой скоро появится');
    }
  }
}

module.exports = { RioninaApi, Economy, authRionina, Offline, DEFAULT_SERVER };
