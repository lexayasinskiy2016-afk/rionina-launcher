// Спецэффекты, которые играют за спиной персонажа (выпадают из кейсов).
const RARITY = {
  common: { name: 'Обычный', color: '#9aa4b2', weight: 60 },
  rare: { name: 'Редкий', color: '#3b82f6', weight: 26 },
  epic: { name: 'Эпический', color: '#a855f7', weight: 11 },
  legendary: { name: 'Легендарный', color: '#f59e0b', weight: 3 },
};

const rnd = (a, b) => a + Math.random() * (b - a);

function heart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
  ctx.fill();
}
function star4(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = i % 2 ? r * 0.28 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

const EFFECTS = {
  lightning: {
    name: 'Молния', emoji: '⚡', rarity: 'epic',
    init: () => ({ bolts: [], next: 0.2, flash: 0 }),
    step(s, ctx, w, h, t, dt) {
      s.next -= dt;
      if (s.next <= 0) {
        s.next = rnd(0.5, 1.3);
        const side = Math.random() < 0.5 ? -1 : 1;
        const x0 = w / 2 + side * rnd(w * 0.12, w * 0.35);
        const pts = [[x0, -10]];
        let x = x0, y = -10;
        while (y < h * rnd(0.6, 0.95)) { y += rnd(12, 28); x += rnd(-22, 22); pts.push([x, y]); }
        const branches = [];
        for (let i = 2; i < pts.length - 2; i += 3) if (Math.random() < 0.5) {
          let [bx, by] = pts[i]; const b = [[bx, by]];
          for (let k = 0; k < 4; k++) { bx += side * rnd(6, 18); by += rnd(10, 22); b.push([bx, by]); }
          branches.push(b);
        }
        s.bolts.push({ pts, branches, life: 0.45 });
        s.flash = 0.35;
      }
      if (s.flash > 0) {
        ctx.fillStyle = `rgba(160,200,255,${s.flash * 0.35})`;
        ctx.fillRect(0, 0, w, h);
        s.flash -= dt;
      }
      ctx.save();
      ctx.lineJoin = 'round';
      for (const b of s.bolts) {
        const a = Math.max(0, b.life / 0.45) * (0.7 + Math.random() * 0.3);
        for (const [line, width] of [[b.pts, 3], ...b.branches.map((br) => [br, 1.5])]) {
          ctx.beginPath();
          line.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
          ctx.shadowColor = '#7ab8ff'; ctx.shadowBlur = 18;
          ctx.strokeStyle = `rgba(120,180,255,${a})`; ctx.lineWidth = width * 3; ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = width; ctx.stroke();
        }
        b.life -= dt;
      }
      ctx.restore();
      s.bolts = s.bolts.filter((b) => b.life > 0);
    },
  },
  fire: {
    name: 'Огненная аура', emoji: '🔥', rarity: 'rare',
    init: () => ({ p: [] }),
    step(s, ctx, w, h, t, dt) {
      for (let i = 0; i < 6; i++) s.p.push({ x: w / 2 + rnd(-w * 0.22, w * 0.22), y: h * 0.92, vx: rnd(-12, 12), vy: rnd(-140, -70), life: 1, r: rnd(8, 18) });
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const q of s.p) {
        q.x += q.vx * dt + Math.sin(t * 6 + q.y * 0.05) * 0.6; q.y += q.vy * dt; q.life -= dt * 0.9;
        const l = Math.max(0, q.life);
        const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r * (0.6 + l));
        g.addColorStop(0, `rgba(255,${180 + 60 * l | 0},80,${0.55 * l})`);
        g.addColorStop(0.5, `rgba(255,${90 * l | 0},20,${0.35 * l})`);
        g.addColorStop(1, 'rgba(120,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (0.6 + l), 0, 7); ctx.fill();
      }
      ctx.restore();
      s.p = s.p.filter((q) => q.life > 0);
    },
  },
  snow: {
    name: 'Снегопад', emoji: '❄️', rarity: 'common',
    init: (w, h) => ({ p: Array.from({ length: 70 }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(1, 3.4), v: rnd(20, 55), d: rnd(0, 6) })) }),
    step(s, ctx, w, h, t, dt) {
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      for (const q of s.p) {
        q.y += q.v * dt; q.x += Math.sin(t + q.d) * 12 * dt;
        if (q.y > h + 5) { q.y = -5; q.x = rnd(0, w); }
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill();
      }
    },
  },
  hearts: {
    name: 'Сердечки', emoji: '💖', rarity: 'common',
    init: () => ({ p: [], next: 0 }),
    step(s, ctx, w, h, t, dt) {
      s.next -= dt;
      if (s.next <= 0) { s.next = 0.18; s.p.push({ x: w / 2 + rnd(-w * 0.35, w * 0.35), y: h + 10, v: rnd(30, 60), s: rnd(10, 20), ph: rnd(0, 6), life: 1 }); }
      for (const q of s.p) {
        q.y -= q.v * dt; q.life = Math.min(1, q.y / (h * 0.5));
        ctx.fillStyle = `rgba(255,${80 + (q.s * 4 | 0)},150,${Math.max(0, q.life) * 0.85})`;
        heart(ctx, q.x + Math.sin(t * 2 + q.ph) * 10, q.y, q.s);
      }
      s.p = s.p.filter((q) => q.y > -30);
    },
  },
  sparkles: {
    name: 'Золотые искры', emoji: '✨', rarity: 'rare',
    init: (w, h) => ({ p: Array.from({ length: 34 }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(3, 9), ph: rnd(0, 6), sp: rnd(1.5, 4) })) }),
    step(s, ctx, w, h, t) {
      ctx.save(); ctx.shadowColor = '#ffd76a'; ctx.shadowBlur = 10;
      for (const q of s.p) {
        const k = (Math.sin(t * q.sp + q.ph) + 1) / 2;
        if (k < 0.05) { q.x = rnd(0, w); q.y = rnd(0, h); }
        ctx.fillStyle = `rgba(255,${200 + 40 * k | 0},90,${k})`;
        star4(ctx, q.x, q.y, q.r * k);
      }
      ctx.restore();
    },
  },
  rainbow: {
    name: 'Радужный нимб', emoji: '🌈', rarity: 'epic',
    init: () => ({}),
    step(s, ctx, w, h, t) {
      const cx = w / 2, cy = h * 0.45, R = Math.min(w, h) * 0.36;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      for (let i = 0; i < 24; i++) {
        const a = t * 0.8 + (i / 24) * Math.PI * 2;
        ctx.strokeStyle = `hsla(${(i * 15 + t * 60) % 360},95%,60%,.55)`;
        ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(cx, cy, R + Math.sin(t * 2 + i) * 4, a, a + 0.2); ctx.stroke();
      }
      ctx.restore();
    },
  },
  bubbles: {
    name: 'Пузыри', emoji: '🫧', rarity: 'common',
    init: (w, h) => ({ p: Array.from({ length: 26 }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(4, 14), v: rnd(15, 40), ph: rnd(0, 6) })) }),
    step(s, ctx, w, h, t, dt) {
      ctx.lineWidth = 1.5;
      for (const q of s.p) {
        q.y -= q.v * dt;
        if (q.y < -20) { q.y = h + 20; q.x = rnd(0, w); }
        const x = q.x + Math.sin(t * 1.5 + q.ph) * 8;
        ctx.strokeStyle = 'rgba(140,210,255,.75)';
        ctx.beginPath(); ctx.arc(x, q.y, q.r, 0, 7); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.6)';
        ctx.beginPath(); ctx.arc(x - q.r * 0.35, q.y - q.r * 0.35, q.r * 0.2, 0, 7); ctx.fill();
      }
    },
  },
  portal: {
    name: 'Портал Края', emoji: '🌀', rarity: 'epic',
    init: () => ({ p: [] }),
    step(s, ctx, w, h, t, dt) {
      const cx = w / 2, cy = h * 0.5;
      for (let i = 0; i < 4; i++) s.p.push({ a: rnd(0, 7), r: Math.min(w, h) * rnd(0.35, 0.5), life: 1 });
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const q of s.p) {
        q.a += dt * (2.2 + (1 - q.r / 200)); q.r -= dt * 70; q.life = q.r / 150;
        const x = cx + Math.cos(q.a) * q.r, y = cy + Math.sin(q.a) * q.r * 0.75;
        ctx.fillStyle = `rgba(${170 + Math.random() * 60 | 0},80,255,${Math.min(1, q.life) * 0.8})`;
        ctx.fillRect(x, y, 3, 3);
      }
      ctx.restore();
      s.p = s.p.filter((q) => q.r > 6);
    },
  },
  matrix: {
    name: 'Код', emoji: '💻', rarity: 'rare',
    init: (w) => ({ cols: Array.from({ length: Math.ceil(w / 14) }, () => rnd(-400, 0)) }),
    step(s, ctx, w, h, t, dt) {
      ctx.font = '13px ui-monospace, monospace';
      s.cols.forEach((y, i) => {
        for (let k = 0; k < 12; k++) {
          const yy = y - k * 15;
          if (yy < 0 || yy > h) continue;
          ctx.fillStyle = k === 0 ? 'rgba(210,255,220,.95)' : `rgba(40,230,110,${0.75 - k * 0.06})`;
          ctx.fillText(String.fromCharCode(0x30a0 + ((i * 7 + k * 13 + (t * 8 | 0)) % 90)), i * 14, yy);
        }
        s.cols[i] = y > h + 200 ? rnd(-200, 0) : y + dt * (90 + (i % 5) * 20);
      });
    },
  },
  aura: {
    name: 'Божественная аура', emoji: '🌟', rarity: 'legendary',
    init: () => ({}),
    step(s, ctx, w, h, t) {
      const cx = w / 2, cy = h * 0.48, hue = (t * 40) % 360;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.translate(cx, cy); ctx.rotate(t * 0.3);
      for (let i = 0; i < 14; i++) {
        ctx.rotate((Math.PI * 2) / 14);
        const g = ctx.createLinearGradient(0, 0, 0, -h * 0.6);
        g.addColorStop(0, `hsla(${hue},100%,70%,.35)`); g.addColorStop(1, 'hsla(0,0%,100%,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(22, -h * 0.6); ctx.lineTo(-22, -h * 0.6); ctx.fill();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const pulse = 0.8 + Math.sin(t * 3) * 0.2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.45 * pulse);
      g.addColorStop(0, `hsla(${hue},100%,75%,.55)`); g.addColorStop(1, 'hsla(0,0%,100%,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    },
  },
  confetti: {
    name: 'Конфетти', emoji: '🎉', rarity: 'common',
    init: (w, h) => ({ p: Array.from({ length: 60 }, () => ({ x: rnd(0, w), y: rnd(-h, h), v: rnd(40, 90), a: rnd(0, 7), va: rnd(-5, 5), c: `hsl(${rnd(0, 360) | 0},90%,60%)` })) }),
    step(s, ctx, w, h, t, dt) {
      for (const q of s.p) {
        q.y += q.v * dt; q.a += q.va * dt; q.x += Math.sin(t + q.a) * 15 * dt;
        if (q.y > h + 10) { q.y = -10; q.x = rnd(0, w); }
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a); ctx.scale(1, Math.cos(q.a * 2));
        ctx.fillStyle = q.c; ctx.fillRect(-4, -2, 8, 4); ctx.restore();
      }
    },
  },
  galaxy: {
    name: 'Галактика', emoji: '🪐', rarity: 'legendary',
    init: () => ({ p: Array.from({ length: 140 }, () => ({ a: rnd(0, 7), r: rnd(0.15, 0.5), s: rnd(0.4, 2.2), c: rnd(0, 1) })) }),
    step(s, ctx, w, h, t) {
      const cx = w / 2, cy = h * 0.5, R = Math.min(w, h);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5);
      g.addColorStop(0, 'rgba(120,90,255,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      for (const q of s.p) {
        const a = q.a + t * (0.6 / q.r) * 0.25;
        const x = cx + Math.cos(a) * q.r * R, y = cy + Math.sin(a) * q.r * R * 0.38;
        ctx.fillStyle = q.c > 0.7 ? 'rgba(255,200,255,.9)' : q.c > 0.35 ? 'rgba(170,200,255,.9)' : 'rgba(255,255,255,.85)';
        ctx.beginPath(); ctx.arc(x, y, q.s, 0, 7); ctx.fill();
      }
      ctx.restore();
    },
  },
};

/** Запускает эффект на canvas; set(null) — без эффекта. */
class FxRunner {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.effect = null;
    this.state = null;
    this.t = 0;
    this.last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t += dt;
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  size() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      if (this.effect) this.state = EFFECTS[this.effect].init(w, h);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [w, h];
  }
  set(id) {
    this.effect = EFFECTS[id] ? id : null;
    const [w, h] = this.size();
    this.state = this.effect ? EFFECTS[this.effect].init(w, h) : null;
  }
  frame(dt) {
    if (!this.canvas.isConnected || !this.canvas.clientWidth) return;
    const [w, h] = this.size();
    this.ctx.clearRect(0, 0, w, h);
    if (this.effect) EFFECTS[this.effect].step(this.state, this.ctx, w, h, this.t, dt);
  }
}

/** Статичная картинка эффекта для карточек (после «прокрутки» симуляции). */
function fxThumb(id, canvas, size = 128) {
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const fx = EFFECTS[id];
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#1b1f3a'); g.addColorStop(1, '#2a1846');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  if (!fx) return;
  const st = fx.init(size, size);
  const off = document.createElement('canvas');
  off.width = off.height = size;
  const octx = off.getContext('2d');
  for (let i = 0; i < 40; i++) { octx.clearRect(0, 0, size, size); fx.step(st, octx, size, size, i * 0.05, 0.05); }
  if (id === 'lightning' && !st.bolts.length) { st.next = 0; octx.clearRect(0, 0, size, size); fx.step(st, octx, size, size, 2, 0.01); }
  ctx.drawImage(off, 0, 0);
  ctx.font = `${size * 0.32}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(fx.emoji, size / 2, size / 2);
}
