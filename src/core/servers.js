// Опрос серверов Minecraft Java (Server List Ping) — онлайн, пинг, описание, иконка.
const net = require('net');
const dns = require('dns').promises;

function varint(n) {
  const out = [];
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return Buffer.from(out);
}
function readVarint(buf, offset) {
  let n = 0, shift = 0, b;
  do {
    if (offset >= buf.length) return null;
    b = buf[offset++];
    n |= (b & 0x7f) << shift;
    shift += 7;
  } while (b & 0x80);
  return [n, offset];
}
const packet = (id, ...parts) => {
  const body = Buffer.concat([varint(id), ...parts]);
  return Buffer.concat([varint(body.length), body]);
};
const str = (s) => { const b = Buffer.from(s, 'utf8'); return Buffer.concat([varint(b.length), b]); };

/** «play.example.net:25566» → { host, port }; учитываем SRV-запись _minecraft._tcp */
async function resolve(address) {
  let [host, port] = String(address).trim().split(':');
  port = Number(port) || 25565;
  if (!/:\d+$/.test(address)) {
    try {
      const srv = await dns.resolveSrv(`_minecraft._tcp.${host}`);
      if (srv[0]) return { host: srv[0].name, port: srv[0].port, shown: host };
    } catch { /* SRV нет */ }
  }
  return { host, port, shown: host };
}

/** Текст описания (motd) в обычную строку без §-кодов */
function motdText(d) {
  if (!d) return '';
  if (typeof d === 'string') return d.replace(/§./g, '');
  return ((d.text || '') + (d.extra || []).map(motdText).join('')).replace(/§./g, '');
}

async function ping(address, timeout = 5000) {
  const { host, port, shown } = await resolve(address);
  return new Promise((done, fail) => {
    const sock = net.connect({ host, port });
    let buf = Buffer.alloc(0);
    let started = 0;
    let status = null;
    const timer = setTimeout(() => { sock.destroy(); fail(new Error('Сервер не отвечает')); }, timeout);
    const finish = (err, res) => { clearTimeout(timer); sock.destroy(); err ? fail(err) : done(res); };
    sock.on('connect', () => {
      const portBuf = Buffer.alloc(2);
      portBuf.writeUInt16BE(port);
      sock.write(packet(0x00, varint(767), str(shown), portBuf, varint(1))); // рукопожатие → статус
      sock.write(packet(0x00)); // запрос статуса
    });
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      // В одном куске может прийти несколько пакетов — разбираем все
      for (;;) {
      const len = readVarint(buf, 0);
      if (!len || buf.length < len[1] + len[0]) return;
      const id = readVarint(buf, len[1]);
      if (!id) return;
      if (id[0] === 0x00 && !status) {
        const sl = readVarint(buf, id[1]);
        try { status = JSON.parse(buf.slice(sl[1], sl[1] + sl[0]).toString('utf8')); } catch { return finish(new Error('Странный ответ сервера')); }
        buf = buf.slice(len[1] + len[0]);
        const t = Buffer.alloc(8);
        t.writeBigInt64BE(BigInt(Date.now()));
        started = Date.now();
        sock.write(packet(0x01, t)); // пинг
      } else if (id[0] === 0x01 && status) {
        finish(null, {
          online: true,
          ping: Date.now() - started,
          players: { online: status.players?.online ?? 0, max: status.players?.max ?? 0 },
          version: status.version?.name || '',
          protocol: status.version?.protocol || 0,
          motd: motdText(status.description).trim().slice(0, 200),
          favicon: typeof status.favicon === 'string' && status.favicon.startsWith('data:image/png;base64,') ? status.favicon : null,
        });
        return;
      } else {
        buf = buf.slice(len[1] + len[0]); // незнакомый пакет — пропускаем
      }
      }
    });
    sock.on('error', (e) => finish(new Error(e.code === 'ENOTFOUND' ? 'Сервер не найден' : 'Сервер недоступен')));
  });
}

/** Версия Minecraft из строки версии сервера: «Paper 1.21.1» → «1.21.1», «Requires MC 1.8 / 1.21» → «1.21» */
function gameVersionOf(v) {
  const all = String(v).match(/\b(1\.\d{1,2}(?:\.\d{1,2})?|2\d\.\d{1,2}(?:\.\d{1,2})?)\b/g);
  return all ? all[all.length - 1] : null;
}

const DEFAULT_SERVERS = [
  { name: 'Hypixel', address: 'mc.hypixel.net' },
  { name: 'CubeCraft', address: 'play.cubecraft.net' },
  { name: 'Wynncraft', address: 'play.wynncraft.com' },
];

module.exports = { ping, gameVersionOf, DEFAULT_SERVERS };
