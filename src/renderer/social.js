// Серверы, профиль с достижениями и голосовые звонки друзьям.

// ───────────── Достижения ─────────────

const ACH = [
  { id: 'first_launch', icon: '👋', name: 'Добро пожаловать', desc: 'Войти в Rionina', coins: 20 },
  { id: 'skin_1', icon: '🧥', name: 'Модник', desc: 'Надеть свой скин', coins: 20 },
  { id: 'play_1h', icon: '⏱️', name: 'Втянулся', desc: 'Наиграть 1 час', coins: 30 },
  { id: 'play_10h', icon: '🔥', name: 'Ветеран', desc: 'Наиграть 10 часов', coins: 100 },
  { id: 'chest_10', icon: '🎁', name: 'Кладоискатель', desc: 'Открыть 10 сундуков', coins: 50 },
  { id: 'streak_7', icon: '📅', name: 'Неделя подряд', desc: 'Забирать награду 7 дней подряд', coins: 100 },
  { id: 'friend_1', icon: '🤝', name: 'Первый друг', desc: 'Добавить друга', coins: 30 },
  { id: 'friend_5', icon: '👥', name: 'Компания', desc: 'Добавить 5 друзей', coins: 60 },
  { id: 'call_1', icon: '📞', name: 'На связи', desc: 'Поговорить с другом голосом', coins: 20 },
  { id: 'server_1', icon: '🌐', name: 'Путешественник', desc: 'Зайти на сервер из лаунчера', coins: 20 },
  { id: 'screenshot_1', icon: '📸', name: 'Фотограф', desc: 'Сделать скриншот (F2)', coins: 20 },
  { id: 'cape_1', icon: '🦸', name: 'Герой в плаще', desc: 'Надеть плащ', coins: 30 },
  { id: 'ai_pack_1', icon: '🧩', name: 'Сборщик', desc: 'Создать ИИ-сборку', coins: 30 },
  { id: 'ai_mod_1', icon: '✨', name: 'Творец', desc: 'Создать мод с нейросетью', coins: 50 },
];

const achBusy = new Set();
async function unlock(id) {
  if (!st.account || achBusy.has(id) || st.me?.achievements?.includes(id)) return;
  achBusy.add(id);
  try {
    const r = await R.achievement(id);
    setMe(r.me);
    const a = ACH.find((x) => x.id === id);
    if (r.reward && a) { toast(`🏆 Достижение «${a.name}» · +${r.reward} монет`, 5000); coinBurst(); }
  } catch { /* ещё не выполнено */ }
  achBusy.delete(id);
}

/** Проверяем то, что сервер может подтвердить сам */
function checkProgress(me) {
  if (!me) return;
  const s = me.stats || {};
  if (s.playMinutes >= 60) unlock('play_1h');
  if (s.playMinutes >= 600) unlock('play_10h');
  if (s.chestsOpened >= 10) unlock('chest_10');
  if ((me.streak || 0) >= 7) unlock('streak_7');
}

R.onEcoChanged((me) => { setMe(me); checkProgress(me); });
R.onEcoEarned(({ coins, reason }) => { toast(`💰 +${coins} монет ${reason}`); coinBurst(); });
R.onServerChanged(() => refreshMe());

// Отслеживаем события, за которые даются достижения
{
  const _setMe = setMe;
  setMe = (me) => { _setMe(me); checkProgress(me); }; // eslint-disable-line no-global-assign
}
R.onShot(() => unlock('screenshot_1'));
$('#capeChips').addEventListener('click', () => setTimeout(() => { if (profile().cape) unlock('cape_1'); }, 100));

// ───────────── Профиль ─────────────

function levelOf(me) {
  const s = me?.stats || {};
  const xp = (s.playMinutes || 0) * 2 + (s.chestsOpened || 0) * 10 + (me?.achievements?.length || 0) * 25;
  const level = Math.floor(Math.sqrt(xp / 40)) + 1;
  const cur = (level - 1) ** 2 * 40, next = level ** 2 * 40;
  return { level, xp, progress: (xp - cur) / (next - cur), toNext: next - xp };
}
const fmtTime = (m) => (m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`);

async function renderProfile() {
  await refreshMe();
  const me = st.me;
  const lv = levelOf(me);
  const shots = await R.shots.list().catch(() => []);
  const hero = $('#profileHero');
  hero.innerHTML = `
    <canvas class="p-head" id="pHead"></canvas>
    <div class="p-info">
      <h2>${esc(st.account.name)} ${me?.pro ? '<span class="pro-badge big">PRO</span>' : ''}</h2>
      <span class="muted">${ACC_TYPES[st.account.type] || ''}</span>
      <div class="p-level"><b>Уровень ${lv.level}</b><div class="p-bar"><i style="width:${Math.round(lv.progress * 100)}%"></i></div><span class="muted small">ещё ${lv.toNext} опыта до ${lv.level + 1}</span></div>
    </div>`;
  accountHead(st.account, $('#pHead'));
  const s = me?.stats || {};
  const unlocked = me?.achievements || [];
  $('#profileStats').innerHTML = [
    ['⏱️', fmtTime(s.playMinutes || 0), 'в игре'],
    ['💰', (me?.coins ?? 0).toLocaleString('ru-RU'), 'Rionina Coins'],
    ['🎁', s.chestsOpened || 0, 'сундуков открыто'],
    ['👥', s.friends || 0, 'друзей'],
    ['📸', shots.length, 'скриншотов'],
    ['🏆', `${unlocked.length} / ${ACH.length}`, 'достижений'],
  ].map(([i, v, l]) => `<div class="stat"><span>${i}</span><b>${esc(v)}</b><em>${l}</em></div>`).join('');
  $('#achCount').textContent = `${unlocked.length} из ${ACH.length} · за 30 минут игры +10 монет`;
  $('#achGrid').innerHTML = ACH.map((a) => {
    const got = unlocked.includes(a.id);
    return `<div class="ach ${got ? 'got' : ''}"><span class="ai">${a.icon}</span><div><strong>${esc(a.name)}</strong><em>${esc(a.desc)}</em></div><span class="ar">${got ? '✓' : `+${a.coins}`}</span></div>`;
  }).join('');
}
document.querySelector('.nav[data-tab="profile"]').addEventListener('click', renderProfile);

// ───────────── Серверы ─────────────

async function renderServers() {
  const list = await R.servers.list().catch(() => []);
  const box = $('#serverList');
  box.innerHTML = list.map((sv, i) => `
    <div class="srv" data-i="${i}">
      <img class="srv-ico" alt="" />
      <div class="srv-meta"><strong>${esc(sv.name)}</strong><span class="muted small">${esc(sv.address)}</span><span class="srv-motd small">Проверяем…</span></div>
      <div class="srv-state"><span class="srv-online muted small"></span><span class="srv-ping small"></span></div>
      <button class="btn btn-primary btn-sm" data-play="${esc(sv.address)}">Играть</button>
      <button class="icon-btn" data-del="${esc(sv.address)}" title="Удалить"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>`).join('') || '<div class="empty">Добавьте сервер по адресу выше</div>';
  list.forEach((sv, i) => {
    const row = box.querySelector(`.srv[data-i="${i}"]`);
    R.servers.ping(sv.address).then((info) => {
      row.querySelector('.srv-motd').textContent = info.motd || info.version;
      row.querySelector('.srv-online').textContent = `👥 ${info.players.online.toLocaleString('ru-RU')} / ${info.players.max.toLocaleString('ru-RU')}`;
      const p = row.querySelector('.srv-ping');
      p.textContent = `${info.ping} мс`;
      p.className = `srv-ping small ${info.ping < 80 ? 'good' : info.ping < 180 ? 'mid' : 'bad'}`;
      if (info.favicon) row.querySelector('.srv-ico').src = info.favicon;
      row.querySelector('.srv-motd').title = info.version;
    }).catch((e) => {
      row.querySelector('.srv-motd').textContent = e.message;
      row.classList.add('off');
    });
  });
}

$('#addServerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await R.servers.add({ name: $('#srvName').value, address: $('#srvAddress').value });
    $('#srvName').value = '';
    $('#srvAddress').value = '';
    renderServers();
  } catch (er) { toast(er.message); }
});
$('#serverList').addEventListener('click', async (e) => {
  const play = e.target.closest('[data-play]');
  const del = e.target.closest('[data-del]');
  if (del) { await R.servers.remove(del.dataset.del); renderServers(); }
  if (play) {
    play.disabled = true;
    play.textContent = 'Запуск…';
    try {
      const id = await R.servers.play({ address: play.dataset.play });
      toast(`Запускаем Minecraft ${id} и подключаемся к ${play.dataset.play}`);
      unlock('server_1');
    } catch (er) { toast(er.message, 6000); }
    play.disabled = false;
    play.textContent = 'Играть';
  }
});
document.querySelector('.nav[data-tab="servers"]').addEventListener('click', renderServers);

// ───────────── Голосовые звонки ─────────────

const call = { pc: null, peer: null, id: null, state: 'idle', stream: null, audio: null, pending: [], started: 0, timer: null, ring: null, muted: false };
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
const sendSignal = (data) => R.call.signal({ to: call.peer, data: { ...data, callId: call.id } }).catch(() => {});

function showCallBar(title, sub, { accept = false, mute = false } = {}) {
  $('#callBar').classList.remove('hidden');
  $('#callTitle').textContent = title;
  $('#callSub').textContent = sub;
  $('#callAccept').classList.toggle('hidden', !accept);
  $('#callMute').classList.toggle('hidden', !mute);
}

function ringtone(on) {
  clearInterval(call.ring);
  if (!on) return;
  const beep = () => {
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 660; g.gain.value = 0.05;
      o.connect(g).connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.35);
      setTimeout(() => ctx.close(), 600);
    } catch { /* без звука */ }
  };
  beep();
  call.ring = setInterval(beep, 1500);
}

async function setupPeer() {
  call.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const pc = new RTCPeerConnection({ iceServers: ICE });
  call.pc = pc;
  call.stream.getTracks().forEach((t) => pc.addTrack(t, call.stream));
  pc.onicecandidate = (e) => { if (e.candidate) sendSignal({ type: 'ice', candidate: e.candidate.toJSON() }); };
  pc.ontrack = (e) => {
    call.audio = call.audio || new Audio();
    call.audio.srcObject = e.streams[0];
    call.audio.play().catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') connected();
    if (['failed', 'disconnected'].includes(pc.connectionState)) endCall(pc.connectionState === 'failed' ? 'Не удалось соединиться — возможно, мешает роутер' : 'Связь прервалась');
  };
  return pc;
}

function connected() {
  if (call.state === 'live') return;
  call.state = 'live';
  ringtone(false);
  call.started = Date.now();
  clearInterval(call.timer);
  const tick = () => { const s = Math.floor((Date.now() - call.started) / 1000); showCallBar(`📞 ${call.peer}`, `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')} · можно играть — звонок идёт в фоне`, { mute: true }); };
  tick();
  call.timer = setInterval(tick, 1000);
  unlock('call_1');
}

async function startCall(nick) {
  if (call.state !== 'idle') return toast('Вы уже разговариваете');
  call.peer = nick;
  call.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  call.state = 'calling';
  showCallBar(`Звоним ${nick}…`, 'Ждём, когда друг ответит');
  try {
    const pc = await setupPeer();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal({ type: 'offer', sdp: offer.sdp });
    setTimeout(() => { if (call.state === 'calling' && call.peer === nick) { sendSignal({ type: 'hangup' }); endCall(`${nick} не отвечает`); } }, 35000);
  } catch (e) {
    endCall(/Permission|NotAllowed|NotFound/i.test(e.name || e.message) ? 'Нет доступа к микрофону' : e.message);
  }
}

async function acceptCall() {
  if (call.state !== 'ringing') return;
  ringtone(false);
  call.state = 'connecting';
  showCallBar(`📞 ${call.peer}`, 'Соединяем…');
  try {
    const pc = await setupPeer();
    await pc.setRemoteDescription({ type: 'offer', sdp: call.offer });
    for (const c of call.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignal({ type: 'answer', sdp: answer.sdp });
  } catch (e) {
    sendSignal({ type: 'decline' });
    endCall(/Permission|NotAllowed|NotFound/i.test(e.name || e.message) ? 'Нет доступа к микрофону' : e.message);
  }
}

function endCall(reason) {
  ringtone(false);
  clearInterval(call.timer);
  call.pc?.close();
  call.stream?.getTracks().forEach((t) => t.stop());
  if (call.audio) call.audio.srcObject = null;
  Object.assign(call, { pc: null, peer: null, id: null, state: 'idle', stream: null, pending: [], muted: false, offer: null });
  $('#callBar').classList.add('hidden');
  $('#callMute').textContent = '🎤 Вкл';
  if (reason) toast(reason, 5000);
}

async function onSignal({ from, data }) {
  if (data.type === 'offer') {
    if (call.state !== 'idle') return R.call.signal({ to: from, data: { type: 'busy', callId: data.callId } }).catch(() => {});
    Object.assign(call, { peer: from, id: data.callId, state: 'ringing', offer: data.sdp, pending: [] });
    showCallBar(`📞 ${from} звонит вам`, 'Голосовой звонок Rionina', { accept: true });
    ringtone(true);
    return;
  }
  if (from !== call.peer || data.callId !== call.id) return;
  if (data.type === 'answer' && call.pc) {
    await call.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
    for (const c of call.pending.splice(0)) await call.pc.addIceCandidate(c).catch(() => {});
    showCallBar(`📞 ${call.peer}`, 'Соединяем…');
  } else if (data.type === 'ice') {
    if (call.pc?.remoteDescription) await call.pc.addIceCandidate(data.candidate).catch(() => {});
    else call.pending.push(data.candidate);
  } else if (data.type === 'hangup') endCall(`${from} завершил звонок`);
  else if (data.type === 'decline') endCall(`${from} отклонил звонок`);
  else if (data.type === 'busy') endCall(`${from} сейчас разговаривает`);
}

$('#callAccept').addEventListener('click', acceptCall);
$('#callEnd').addEventListener('click', () => {
  if (call.state === 'ringing') sendSignal({ type: 'decline' }); else sendSignal({ type: 'hangup' });
  endCall();
});
$('#callMute').addEventListener('click', () => {
  call.muted = !call.muted;
  call.stream?.getAudioTracks().forEach((t) => { t.enabled = !call.muted; });
  $('#callMute').textContent = call.muted ? '🔇 Выкл' : '🎤 Вкл';
});
$('#friendsList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-call]');
  if (b) startCall(b.dataset.call);
});

// Почтовый ящик сигналов: часто во время звонка, реже в покое
let pollDelay = 3000;
async function pollSignals() {
  if (st.account && ['rionina', 'microsoft'].includes(st.account.type)) {
    try {
      const { messages } = await R.call.poll();
      for (const m of messages) await onSignal(m);
      pollDelay = call.state === 'idle' ? 3000 : 1000;
    } catch {
      pollDelay = 30000; // сервер недоступен — проверяем редко
    }
  } else pollDelay = 10000;
  setTimeout(pollSignals, pollDelay);
}
setTimeout(pollSignals, 4000);

// Первое достижение — при входе
setTimeout(() => { if (st.account) unlock('first_launch'); }, 6000);
