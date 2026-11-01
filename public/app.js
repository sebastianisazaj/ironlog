'use strict';
/* IronLog — gym tracker. All data lives in localStorage (optionally synced to the LAN server). */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const DAY = 86400000;
const KG_LB = 2.20462;
const { PROGRAMS, BADGES, RANKS, I18N, QUOTES, TERMS_ES, ic } = window;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================ state
const KEY = 'ironlog.v1';
const DEFAULTS = () => ({
  updatedAt: 0,
  profile: {
    name: '', level: null, unit: 'kg', theme: 'auto', bodyweight: null, rest: 90, syncName: '', autoSync: false,
    lang: (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en',
  },
  workouts: [], deleted: [], active: null, favorites: [], routines: [],
  program: { id: null, next: 0 }, bodylog: [], myPrograms: [], installDismissed: false,
  swaps: {}, noEquip: [],
});

function hydrate(s) {
  const d = DEFAULTS();
  return { ...d, ...s, profile: { ...d.profile, ...(s.profile || {}) }, program: { ...d.program, ...(s.program || {}) }, swaps: { ...(s.swaps || {}) } };
}
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.workouts)) return hydrate(s); } catch {}
  return DEFAULTS();
}
let S = load();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast(t('storageFail')); }
}
function save() {
  S.updatedAt = Date.now();
  persist();
  if (S.profile.autoSync && S.profile.syncName) scheduleSync();
}

// ============================================================ i18n
const LANG = () => (S.profile.lang === 'es' ? 'es' : 'en');
const LOC = () => (LANG() === 'es' ? 'es-CO' : 'en-US');
function t(key, vars = {}) {
  const s = I18N[LANG()][key] ?? I18N.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}
const L = x => (x && typeof x === 'object' ? x[LANG()] ?? x.en : x ?? '');
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : '');
const tr = term => (LANG() === 'es' ? TERMS_ES[term] ?? term : term);
const T = term => cap(tr(term)); // translated + capitalized label
const list = arr => arr.map(T).join(', ');
const PR_KEYS = { w: 'pr.w', e1rm: 'pr.e1rm', reps: 'pr.reps', 'Heaviest weight': 'pr.w', 'Best est. 1RM': 'pr.e1rm', 'Most reps': 'pr.reps' };
const prLabel = k => t(PR_KEYS[k] || k);

// ============================================================ units & formatting
const U = () => S.profile.unit;
const toD = kg => (U() === 'lb' ? kg * KG_LB : kg);
const fromD = v => (U() === 'lb' ? v / KG_LB : v);
const num = x => { const r = Math.round(x * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1); };
const fmtW = kg => (kg == null ? '—' : `${num(toD(kg))} ${U()}`);
const fmtVolD = v => (v >= 100000 ? `${Math.round(v / 1000)}k` : v >= 10000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toLocaleString(LOC()));
const fmtVol = kg => fmtVolD(toD(kg));
const mmss = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const dur = ms => { const m = Math.round(ms / 60000); return m >= 60 ? t('hm', { h: Math.floor(m / 60), m: m % 60 }) : t('min', { n: m }); };
const fmtDate = ts => new Date(ts).toLocaleDateString(LOC(), { day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = ts => new Date(ts).toLocaleDateString(LOC(), { day: 'numeric', month: 'short' });
// animated number: counts up from 0 on view entry
const cnt = (n, fmt = 'int') => `<span class="count" data-count="${n}" data-fmt="${fmt}">${fmt === 'vol' ? fmtVolD(n) : Math.round(n).toLocaleString(LOC())}</span>`;

// ============================================================ exercise db
let EX = [], EXMAP = {}, ES = {}, MUSCLES = [], EQUIP = [], CATS = [];
// Photos come straight from the open-source repo via jsDelivr's CDN (falls back to raw GitHub, see the error listener)
const IMG_CDN = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/';
const IMG_RAW = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const img = (id, n = 0) => `${IMG_CDN}${encodeURIComponent(id)}/${n}.jpg`;
let SERVER = false; // true only when running on the IronLog LAN server (enables device sync)
const exName = id => (LANG() === 'es' && ES[id]?.name) || EXMAP[id]?.name || id.replace(/_/g, ' ');
const hasImg = id => (EXMAP[id]?.images?.length || 0) > 0;
const instructions = id => (LANG() === 'es' && ES[id]?.instructions?.length ? { list: ES[id].instructions, en: false } : { list: EXMAP[id]?.instructions || [], en: LANG() === 'es' });

// ---- equipment & alternatives
const hasEquip = eq => !eq || eq === 'body only' || !S.noEquip.includes(eq);
function alternatives(id, n = 14) {
  const e = EXMAP[id];
  if (!e) return [];
  const pm = e.primaryMuscles[0];
  return EX.filter(x => x.id !== id && x.primaryMuscles.includes(pm) && x.category === e.category && hasEquip(x.equipment))
    .map(x => {
      let s = x.primaryMuscles[0] === pm ? 3 : 0;
      if (x.force && x.force === e.force) s += 3;
      if (x.mechanic === e.mechanic) s += 2;
      if (x.equipment !== e.equipment) s += 1;
      s += x.secondaryMuscles.filter(m => e.secondaryMuscles.includes(m)).length;
      if (x.level === e.level) s += 1;
      if (x.level === 'expert' && e.level !== 'expert') s -= 2;
      return [s, x];
    })
    .sort((a, b) => b[0] - a[0]).slice(0, n).map(a => a[1]);
}
// What actually gets trained for a planned exercise: the user's chosen swap, or an automatic one if the gym lacks the equipment
function resolve(id) {
  const sw = S.swaps[id];
  if (sw && EXMAP[sw]) return { id: sw, orig: id, why: 'user' };
  const e = EXMAP[id];
  if (e && !hasEquip(e.equipment)) {
    const alt = alternatives(id, 1)[0];
    if (alt) return { id: alt.id, orig: id, why: 'auto', missing: e.equipment };
  }
  return { id, orig: id, why: null };
}
const swapChip = r => (r.why === 'user' ? `<span class="chip swap">${ic('swap')} ${t('alt.for', { x: esc(exName(r.orig)) })}</span>`
  : r.why === 'auto' ? `<span class="chip swap">${ic('swap')} ${t('alt.auto', { x: esc(tr(r.missing)) })}</span>` : '');

// ============================================================ records, stats
const e1rm = (w, r) => (!w || !r ? 0 : r === 1 ? w : w * (1 + Math.min(r, 15) / 30));
const working = s => s.done && s.t !== 'W' && s.r > 0;
const sortedWorkouts = () => [...S.workouts].sort((a, b) => a.start - b.start);
const volumeOf = wo => wo.exercises.reduce((v, e) => v + e.sets.filter(working).reduce((x, s) => x + (s.w || 0) * s.r, 0), 0);
const setsDone = wo => wo.exercises.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0);
const prCount = wo => wo.exercises.reduce((n, e) => n + e.sets.filter(s => s.pr).length, 0);

function records(exId) {
  const rec = { w: 0, e1rm: 0, reps: 0, sessions: 0, wDate: 0 };
  for (const wo of S.workouts) {
    let seen = false;
    for (const e of wo.exercises) {
      if (e.id !== exId) continue;
      for (const s of e.sets) {
        if (!working(s)) continue;
        seen = true;
        const w = s.w || 0;
        if (w > rec.w) { rec.w = w; rec.wDate = wo.start; }
        rec.e1rm = Math.max(rec.e1rm, e1rm(w, s.r));
        if (!w) rec.reps = Math.max(rec.reps, s.r);
      }
    }
    if (seen) rec.sessions++;
  }
  return rec;
}

function allRecords() {
  const map = {};
  for (const wo of sortedWorkouts()) {
    const seen = new Set();
    for (const e of wo.exercises) for (const s of e.sets) {
      if (!working(s)) continue;
      const r = (map[e.id] ||= { id: e.id, w: 0, wr: 0, e1rm: 0, reps: 0, date: 0, sessions: 0 });
      if (!seen.has(e.id)) { seen.add(e.id); r.sessions++; }
      const w = s.w || 0;
      if (w > r.w || (w === r.w && s.r > r.wr)) { r.w = w; r.wr = s.r; r.date = wo.start; }
      r.e1rm = Math.max(r.e1rm, e1rm(w, s.r));
      if (!w && s.r > r.reps) { r.reps = s.r; if (!r.w) r.date = wo.start; }
    }
  }
  return map;
}

function lastSession(exId) {
  const ws = sortedWorkouts();
  for (let i = ws.length - 1; i >= 0; i--) {
    const e = ws[i].exercises.find(x => x.id === exId && x.sets.some(working));
    if (e) return { wo: ws[i], e };
  }
  return null;
}

const LOWER = ['quadriceps', 'hamstrings', 'glutes', 'lower back', 'adductors', 'abductors'];
function suggest(exId, target) {
  const last = lastSession(exId);
  if (!last) return null;
  const ws = last.e.sets.filter(working);
  const top = ws.reduce((a, b) => ((b.w || 0) > (a.w || 0) ? b : a));
  const tr_ = parseInt(target, 10) || null;
  if (!top.w) {
    const best = Math.max(...ws.map(s => s.r));
    return { w: 0, r: best + 1, text: t('sug.bw', { n: best, m: best + 1 }) };
  }
  const ex = EXMAP[exId];
  const lower = ex && ex.mechanic === 'compound' && ex.primaryMuscles.some(m => LOWER.includes(m));
  const step = U() === 'lb' ? (lower ? 10 : 5) / KG_LB : lower ? 5 : 2.5;
  const topSets = ws.filter(s => (s.w || 0) >= top.w);
  if (tr_ && topSets.every(s => s.r >= tr_)) {
    return { w: top.w + step, r: tr_, text: t('sug.up', { w: fmtW(top.w), r: top.r, nw: fmtW(top.w + step) }) };
  }
  return { w: top.w, r: tr_ || top.r, text: t('sug.same', { w: fmtW(top.w), r: top.r }) + (tr_ ? t('sug.hit', { n: tr_ }) : '') };
}

const weekStart = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
function weekStreak(ws) {
  const weeks = new Set(ws.map(w => weekStart(w.start)));
  let wk = weekStart(Date.now());
  if (!weeks.has(wk)) wk = weekStart(wk - DAY);
  let n = 0;
  while (weeks.has(wk)) { n++; wk = weekStart(wk - DAY); }
  return n;
}

function stats() {
  const ws = sortedWorkouts();
  const st = { workouts: ws.length, volume: 0, prs: 0, xp: 0, distinct: 0, bwClub: false, early: false, night: false, weekStreak: weekStreak(ws) };
  const distinct = new Set();
  const bw = S.profile.bodyweight;
  for (const wo of ws) {
    st.xp += wo.xp || 0;
    const h = new Date(wo.start).getHours();
    if (h < 7) st.early = true;
    if (h >= 21) st.night = true;
    for (const e of wo.exercises) {
      distinct.add(e.id);
      for (const s of e.sets) {
        if (!working(s)) continue;
        st.volume += (s.w || 0) * s.r;
        if (s.pr) st.prs++;
        if (bw && s.w >= bw) st.bwClub = true;
      }
    }
  }
  st.distinct = distinct.size;
  return st;
}

function rankOf(xp) {
  let i = 0;
  RANKS.forEach((r, j) => { if (xp >= r.xp) i = j; });
  const cur = RANKS[i], nxt = RANKS[i + 1];
  return { cur, nxt, pct: nxt ? ((xp - cur.xp) / (nxt.xp - cur.xp)) * 100 : 100 };
}

function recentPRs(limit = 5) {
  const out = [];
  for (const wo of sortedWorkouts().reverse()) {
    for (const e of wo.exercises) for (const s of e.sets) if (s.pr) out.push({ id: e.id, w: s.w, r: s.r, t: wo.start, kinds: s.pr });
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

// ============================================================ UI helpers
function toast(msg, cls = '') {
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.innerHTML = msg;
  $('#toasts').append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3300);
}

let demoTimer = null;
function openModal(html) {
  closeModal();
  $('#sheet').innerHTML = html;
  $('#modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  stagger($('#sheet'), 10);
}
function closeModal() {
  clearInterval(demoTimer);
  $('#modal').classList.add('hidden');
  $('#sheet').innerHTML = '';
  document.body.style.overflow = '';
}

function stagger(el, max = 14) {
  if (!el) return;
  el.classList.add('anim');
  [...el.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, max)));
}

function countUp(root) {
  const els = $$('.count[data-count]', root);
  if (reducedMotion() || !els.length) return;
  const t0 = performance.now(), D = 900;
  (function frame(now) {
    const p = Math.min(1, (now - t0) / D), k = 1 - Math.pow(1 - p, 3);
    for (const el of els) {
      const v = +el.dataset.count * k;
      el.textContent = el.dataset.fmt === 'vol' ? fmtVolD(v) : Math.round(v).toLocaleString(LOC());
    }
    if (p < 1) requestAnimationFrame(frame);
  })(t0);
}

function confetti() {
  if (reducedMotion()) return;
  const c = $('#confetti'), ctx = c.getContext('2d');
  c.width = innerWidth; c.height = innerHeight;
  const colors = ['#ff5a36', '#ffb020', '#22c58b', '#19c3ff', '#e0287a', '#7b61ff', '#ffffff'];
  const ps = Array.from({ length: 170 }, () => ({
    x: innerWidth / 2, y: innerHeight / 3, vx: (Math.random() - 0.5) * 17, vy: -Math.random() * 14 - 4,
    s: Math.random() * 7 + 4, c: colors[(Math.random() * colors.length) | 0], r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
  }));
  let f = 0;
  (function tick_() {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of ps) {
      p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
    if (++f < 170) requestAnimationFrame(tick_); else ctx.clearRect(0, 0, c.width, c.height);
  })();
}

let actx;
function beep() {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach(d => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = d === 0.5 ? 1320 : 880;
      g.gain.setValueAtTime(0.25, actx.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + d + 0.2);
      o.connect(g).connect(actx.destination);
      o.start(actx.currentTime + d); o.stop(actx.currentTime + d + 0.2);
    });
  } catch {}
  navigator.vibrate?.([200, 100, 200]);
}

const stat = (value, label, id = '') => `<div class="stat"><b ${id ? `id="${id}"` : ''}>${value}</b><span>${label}</span></div>`;
const thumb = (id, size = 56) => (hasImg(id)
  ? `<img class="thumb-sm" src="${img(id)}" alt="" loading="lazy" style="width:${size}px;height:${Math.round(size * 0.75)}px">`
  : `<div class="thumb-sm" style="width:${size}px;height:${Math.round(size * 0.75)}px;background:var(--chip)"></div>`);
const levelChip = lvl => `<span class="chip ${lvl}">${T(lvl)}</span>`;

// ============================================================ theme & language
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const resolvedTheme = () => (S.profile.theme === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : S.profile.theme);
function applyTheme() {
  const th = resolvedTheme();
  document.documentElement.dataset.theme = th;
  $('meta[name=theme-color]').content = th === 'dark' ? '#07080d' : '#eef0f8';
  const b = $('#themeBtn');
  if (b) { b.innerHTML = th === 'dark' ? SUN : MOON; b.setAttribute('aria-label', t('toggleTheme')); b.title = t('toggleTheme'); }
}
darkQuery.addEventListener('change', () => { if (S.profile.theme === 'auto') applyTheme(); });

// Circular reveal from the button that triggered the change (View Transitions API where supported)
function withReveal(btn, fn) {
  if (!document.startViewTransition || reducedMotion() || !btn) return fn();
  const r = btn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.startViewTransition(fn).ready.then(() => {
    document.documentElement.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] },
      { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' });
  }).catch(() => {});
}

function applyStaticI18n() {
  document.documentElement.lang = LANG();
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  const lb = $('#langBtn');
  lb.textContent = LANG() === 'es' ? 'EN' : 'ES';
  lb.title = t('toggleLang'); lb.setAttribute('aria-label', t('toggleLang'));
  applyTheme();
}

// ============================================================ charts (inline SVG)
function lineChart(pts, label) {
  if (pts.length < 2) return `<p class="muted small">${t('chart.need2')}</p>`;
  const W = 600, H = 230, P = { l: 42, r: 14, t: 14, b: 26 };
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = (y1 - y0) * 0.15 || Math.max(1, y1 * 0.1);
  y0 = Math.max(0, y0 - pad); y1 += pad;
  const X = x => P.l + ((x - x0) / (x1 - x0 || 1)) * (W - P.l - P.r);
  const Y = y => H - P.b - ((y - y0) / (y1 - y0)) * (H - P.t - P.b);
  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const v = y0 + ((y1 - y0) * i) / 4, y = Y(v);
    grid += `<line x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}"/><text x="${P.l - 6}" y="${y + 3}" text-anchor="end">${num(v)}</text>`;
  }
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const area = `${d}L${X(x1)},${H - P.b}L${X(x0)},${H - P.b}Z`;
  const best = pts.reduce((a, b) => (b.y >= a.y ? b : a));
  const gid = `g${Math.random().toString(36).slice(2, 7)}`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff5a36" stop-opacity=".4"/><stop offset="1" stop-color="#ff5a36" stop-opacity="0"/></linearGradient>
      <linearGradient id="${gid}l" x1="0" x2="1"><stop offset="0" stop-color="#ff5a36"/><stop offset="1" stop-color="#e0287a"/></linearGradient></defs>
    <g class="grid">${grid}</g>
    <path class="area" d="${area}" fill="url(#${gid})"/>
    <path class="line" pathLength="1" d="${d}" fill="none" stroke="url(#${gid}l)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<circle class="dot" style="animation-delay:${400 + i * 60}ms" cx="${X(p.x)}" cy="${Y(p.y)}" r="${p === best ? 5.5 : 3.5}" fill="${p === best ? '#ffb020' : '#ff5a36'}"><title>${shortDate(p.x)}: ${num(p.y)}</title></circle>`).join('')}
    <text x="${P.l}" y="${H - 6}">${shortDate(x0)}</text><text x="${W - P.r}" y="${H - 6}" text-anchor="end">${shortDate(x1)}</text>
  </svg>`;
}

function barChart(vals, labels) {
  const W = 600, H = 180, P = { l: 8, r: 8, t: 18, b: 22 };
  const max = Math.max(...vals, 1);
  const bw = (W - P.l - P.r) / vals.length;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('chart.weekVol'))}">
    <defs><linearGradient id="barG" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff5a36"/><stop offset="1" stop-color="#e0287a"/></linearGradient></defs>
    ${vals.map((v, i) => {
      const h = (v / max) * (H - P.t - P.b), x = P.l + i * bw + 4, y = H - P.b - h;
      return `<rect class="bar" style="animation-delay:${i * 50}ms" x="${x}" y="${y}" width="${bw - 8}" height="${Math.max(h, v ? 2 : 0)}" rx="6" fill="url(#barG)" opacity="${i === vals.length - 1 ? 1 : 0.55}"><title>${labels[i]}: ${fmtVol(v)} ${U()}</title></rect>
        ${v ? `<text x="${x + (bw - 8) / 2}" y="${y - 4}" text-anchor="middle">${fmtVol(v)}</text>` : ''}
        <text x="${x + (bw - 8) / 2}" y="${H - 6}" text-anchor="middle">${labels[i]}</text>`;
    }).join('')}
  </svg>`;
}

function seriesFor(id) {
  const pts = [];
  let weighted = false;
  for (const wo of sortedWorkouts()) {
    let best = 0, reps = 0, has = false;
    for (const e of wo.exercises) if (e.id === id) for (const s of e.sets) if (working(s)) {
      has = true;
      if (s.w) weighted = true;
      best = Math.max(best, e1rm(s.w || 0, s.r));
      reps = Math.max(reps, s.r);
    }
    if (has) pts.push({ x: wo.start, e: best, reps });
  }
  return weighted
    ? { label: t('chart.e1rm', { u: U() }), pts: pts.filter(p => p.e).map(p => ({ x: p.x, y: toD(p.e) })) }
    : { label: t('chart.reps'), pts: pts.map(p => ({ x: p.x, y: p.reps })) };
}

// ============================================================ router
const VIEWS = {};
let lastView = null;
let JUST = null; // set row that was just checked off, for the pop animation
function go(v) {
  closeModal();
  if (location.hash !== `#${v}`) location.hash = v; else render();
}
function render({ animate = false } = {}) {
  const v = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'home';
  const entering = v !== lastView || animate;
  const view = $('#view');
  view.classList.remove('anim');
  view.innerHTML = VIEWS[v]();
  VIEWS[v].mount?.();
  if (entering) {
    stagger(view);
    $$('.grid.stats, .ex-grid, .grid.badges', view).forEach(g => stagger(g, 12));
    countUp(view);
    window.scrollTo(0, 0);
  }
  const tab = v === 'build' ? 'programs' : v;
  $$('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.go === tab));
  moveInd();
  lastView = v;
  JUST = null;
  tick();
}
window.addEventListener('hashchange', () => { openProgramId = null; closeModal(); render(); });

function moveInd() {
  const b = $('.tabbar button.on'), ind = $('#tabInd');
  if (!b) { ind.style.opacity = 0; return; }
  ind.style.opacity = 1;
  ind.style.width = `${b.offsetWidth}px`;
  ind.style.height = `${b.offsetHeight}px`;
  ind.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop}px)`;
}
window.addEventListener('resize', moveInd);

// ============================================================ HOME
const LEVEL_ICONS = { beginner: 'sprout', intermediate: 'zap', expert: 'flame' };

function levelPicker(title = t('level.choose')) {
  return `<div class="card"><h2>${title}</h2>
    <p class="muted small">${t('level.hint')}</p>
    <div class="level-pick">${Object.keys(LEVEL_ICONS).map(k => `
      <button data-act="setLevel" data-level="${k}" class="${S.profile.level === k ? 'on' : ''}">
        <span class="chip ${k}">${ic(LEVEL_ICONS[k])} ${t(`lvl.${k}`)}</span><b>${t(`lvl.${k}`)}</b><span class="muted small">${t(`lvl.${k}.desc`)}</span>
      </button>`).join('')}</div></div>`;
}

VIEWS.home = () => {
  const p = S.profile, st = stats(), rk = rankOf(st.xp);
  const hour = new Date().getHours();
  const greet = t(hour < 12 ? 'greet.morning' : hour < 18 ? 'greet.afternoon' : 'greet.evening');
  let h = `<div class="card hero">
    <div class="muted small">${greet}${p.name ? `, ${esc(p.name)}` : ''} ${p.level ? `· <b>${ic(LEVEL_ICONS[p.level])} ${t(`lvl.${p.level}`)}</b>` : ''}</div>
    <h1 style="margin-top:6px">${ic(rk.cur.icon)} ${L(rk.cur.name)}</h1>
    <div class="xpbar"><i style="width:${rk.pct}%"></i></div>
    <div class="small muted">${cnt(st.xp)} XP${rk.nxt ? ` · ${t('xp.toNext', { xp: (rk.nxt.xp - st.xp).toLocaleString(LOC()), rank: `${ic(rk.nxt.icon)} ${L(rk.nxt.name)}` })}` : ` · ${t('xp.max')}`}</div>
  </div>`;

  if (!p.level) h += levelPicker(t('level.welcome'));
  h += installCard({ dismissible: true });
  if (!S.active) h += genCta();

  if (S.active) {
    h += `<div class="card row"><div><b>${ic('dumbbell')} ${t('active.title')}</b><div class="muted small">${esc(S.active.name)} · ${t('active.since', { t: dur(Date.now() - S.active.start) })}</div></div>
      <span class="spacer"></span><button class="btn primary" data-go="workout">${t('resume')}</button></div>`;
  }

  const prog = findProgram(x => x.id === S.program.id);
  if (prog) {
    const di = S.program.next % prog.days.length, day = prog.days[di];
    h += `<div class="card"><div class="row"><div><div class="muted small">${t('next.up', { prog: esc(L(prog.name)) })}</div><h2 style="margin:2px 0 0">${esc(L(day.name))}</h2></div>
      <span class="spacer"></span>${levelChip(prog.level)}</div>
      <div class="row wrap" style="margin:12px 0">${day.items.map(it => { const r = resolve(it[0]); return `<span class="chip ${r.why ? 'swap' : ''}" title="${it[1]} × ${esc(it[2])}">${r.why ? `${ic('swap')} ` : ''}${esc(exName(r.id))}</span>`; }).join('')}</div>
      <button class="btn primary big" data-act="startDay" data-prog="${prog.id}" data-day="${di}">${ic('play', 'fill')} ${t('startX', { x: esc(L(day.name)) })}</button></div>`;
  } else {
    h += `<div class="card"><h2>${t('ready.title')}</h2><p class="muted small">${t('ready.sub')}</p>
      <div class="row wrap"><button class="btn primary" data-go="programs">${ic('programs')} ${t('pickProgram')}</button><button class="btn ghost" data-act="startEmpty">${t('quickStart')}</button></div></div>`;
  }

  const wk = weekStart(Date.now());
  const thisWeek = S.workouts.filter(w => w.start >= wk);
  h += `<div class="grid stats" style="margin-bottom:14px">
    ${stat(cnt(thisWeek.length), t('stat.workoutsWeek'))}
    ${stat(`${cnt(toD(thisWeek.reduce((v, w) => v + volumeOf(w), 0)), 'vol')}<small class="muted"> ${U()}</small>`, t('stat.volumeWeek'))}
    ${stat(`${cnt(st.weekStreak)} ${ic('flame', 'acc')}`, t('stat.streak'))}
    ${stat(`${cnt(st.prs)} ${ic('trophy', 'gold')}`, t('stat.prs'))}
  </div>`;

  const prs = recentPRs();
  if (prs.length) {
    h += `<div class="card"><div class="row"><h2>${t('recentPRs')}</h2><span class="spacer"></span><button class="btn sm ghost" data-go="progress">${t('allRecords')} ${ic('arrowRight')}</button></div>
      ${prs.map(r => `<div class="hist-item" data-act="showEx" data-id="${esc(r.id)}">${thumb(r.id, 48)}<div style="flex:1"><b>${esc(exName(r.id))}</b>
        <div class="muted small">${r.kinds.map(prLabel).join(' · ')} · ${fmtDate(r.t)}</div></div><b>${r.w ? `${fmtW(r.w)} × ${r.r}` : `${r.r} ${t('reps')}`}</b></div>`).join('')}</div>`;
  }

  const qs = QUOTES[LANG()];
  h += `<p class="muted small" style="text-align:center;margin-top:24px">“${qs[new Date().getDate() % qs.length]}”</p>`;
  return h;
};

// ============================================================ PROGRAMS
const PRG = { level: null };
VIEWS.programs = () => {
  const lvl = PRG.level || S.profile.level || 'beginner';
  const progs = PROGRAMS.filter(p => p.level === lvl);
  let h = `<h1>${t('nav.programs')}</h1>
    ${genCta()}
    ${S.myPrograms.length ? `<h2>${t('myPrograms')}</h2><div class="grid two" style="margin-bottom:18px">${S.myPrograms.map(programCard).join('')}</div>` : ''}
    <div class="seg" style="margin-bottom:14px">${Object.keys(LEVEL_ICONS).map(k => `<button class="${k === lvl ? 'on' : ''}" data-act="prgLevel" data-level="${k}">${ic(LEVEL_ICONS[k])} ${t(`lvl.${k}`)}</button>`).join('')}</div>
    <div class="grid two">${progs.map(programCard).join('')}</div>`;

  h += `<h2 style="margin-top:22px">${t('myRoutines')}</h2>`;
  if (!S.routines.length) h += `<div class="card muted small">${t('routines.empty')}</div>`;
  else h += `<div class="grid two">${S.routines.map(r => `<div class="card"><div class="row"><h3 style="margin:0">${esc(r.name)}</h3><span class="spacer"></span>
      <button class="round-btn" data-act="delRoutine" data-id="${r.id}" aria-label="${t('deleteRoutine')}">${ic('trash')}</button></div>
      <p class="muted small">${r.items.map(i => esc(exName(resolve(i[0]).id))).join(' · ')}</p>
      <button class="btn primary" data-act="startRoutine" data-id="${r.id}">${ic('play', 'fill')} ${t('start')}</button></div>`).join('')}</div>`;
  return h;
};

function programCard(p) {
  const cur = S.program.id === p.id;
  return `<div class="card prog-card ${cur ? 'current' : ''}" data-act="showProgram" data-id="${p.id}">
    <div class="row wrap">${p.custom ? `<span class="chip swap">${ic('sparkles')} ${t('custom')}</span>` : levelChip(p.level)}<span class="chip">${t('perWeek', { n: p.perWeek })}</span>${cur ? `<span class="chip brand">${t('following')}</span>` : ''}</div>
    <h2 style="margin-top:10px">${esc(L(p.name))}</h2>
    <div class="muted small" style="margin-bottom:8px">${ic('target')} ${esc(L(p.goal))} · ${t('weeks', { n: p.weeks })} · ${p.days.length > 1 ? t('daysN', { n: p.days.length }) : t('days1')}</div>
    <p class="small" style="margin:0">${p.custom ? p.days.map(d => esc(L(d.name))).join(' · ') : esc(L(p.desc))}</p></div>`;
}

function programItem(it) {
  const r = resolve(it[0]);
  return `<div class="hist-item" data-act="showEx" data-id="${esc(r.id)}">${thumb(r.id, 52)}<div style="flex:1;min-width:0"><b>${it[4] ? `<span class="ss-tag">${esc(it[4])}</span> ` : ''}${esc(exName(r.id))}</b>
    <div class="muted small">${t('setsXreps', { s: it[1], r: esc(it[2]), rest: mmss(it[3]) })}</div>${r.why ? `<div style="margin-top:4px">${swapChip(r)}</div>` : ''}</div>
    <button class="round-btn" data-act="altFor" data-orig="${esc(it[0])}" title="${t('alt.btn')}" aria-label="${t('alt.btn')}">${ic('swap')}</button></div>`;
}

let openProgramId = null;
function showProgram(id) {
  const p = findProgram(x => x.id === id);
  openProgramId = id;
  const cur = S.program.id === id;
  openModal(`<button class="close" data-act="close" aria-label="Close">${ic('x')}</button>
    <div class="row wrap">${levelChip(p.level)}<span class="chip">${t('perWeek', { n: p.perWeek })}</span><span class="chip">${t('weeks', { n: p.weeks })}</span></div>
    <h2 style="margin-top:10px">${esc(L(p.name))}</h2><p class="muted">${esc(L(p.desc))}</p>
    ${cur ? '' : `<button class="btn primary big" data-act="followProgram" data-id="${p.id}" style="margin-bottom:16px">${t('follow')}</button>`}
    ${p.custom ? `<button class="btn danger sm" data-act="delProgram" data-id="${p.id}" style="margin-bottom:14px">${ic('trash')} ${t('delProgram')}</button>` : ''}
    ${p.days.map((d, di) => `<div class="card"><div class="row"><h3 style="margin:0">${di + 1}. ${esc(L(d.name))}</h3><span class="spacer"></span>
      ${cur && S.program.next % p.days.length === di ? `<span class="chip brand">${t('next')}</span>` : ''}
      <button class="btn sm primary" data-act="startDay" data-prog="${p.id}" data-day="${di}">${ic('play', 'fill')} ${t('start')}</button></div>
      ${d.items.map(programItem).join('')}</div>`).join('')}`);
}

// ============================================================ BUILDER (generate today's workout or a weekly split)
const findProgram = f => PROGRAMS.find(f) || S.myPrograms.find(f);

const GROUPS = {
  chest: { m: ['chest'], big: true }, back: { m: ['lats', 'middle back'], big: true },
  shoulders: { m: ['shoulders'], big: true }, legs: { m: ['quadriceps', 'hamstrings'], big: true },
  glutes: { m: ['glutes', 'abductors', 'adductors'] }, biceps: { m: ['biceps'] }, triceps: { m: ['triceps'] },
  calves: { m: ['calves'] }, abs: { m: ['abdominals'] }, forearms: { m: ['forearms'] }, traps: { m: ['traps'] },
  lowerback: { m: ['lower back'] },
};
const DURATIONS = { short: 5, normal: 7, long: 9 }; // total exercises
// [sets, reps, rest] for compound / isolation lifts
const GOALS = { strength: { c: [5, '5', 180], i: [3, '8', 120] }, hyp: { c: [4, '6-8', 150], i: [3, '10-12', 75] }, endurance: { c: [3, '12-15', 60], i: [3, '15-20', 45] } };
const LEVEL_RANK = { beginner: 0, intermediate: 1, expert: 2 };
const SPLITS = {
  bro: [['chest', 'biceps'], ['back', 'triceps'], ['legs', 'calves'], ['shoulders', 'abs']],
  ul: [['chest', 'back', 'shoulders'], ['legs', 'glutes', 'calves'], ['chest', 'back', 'biceps', 'triceps'], ['legs', 'glutes', 'abs']],
  ppl: [['chest', 'shoulders', 'triceps'], ['back', 'biceps', 'traps'], ['legs', 'glutes', 'calves']],
  arnold: [['chest', 'back'], ['shoulders', 'biceps', 'triceps'], ['legs', 'calves', 'abs']],
};
let STAPLES = null; // exercises used by the built-in programs = proven, well-known lifts

const GEN = { tab: 'day', groups: [], dur: 'normal', goal: 'hyp', ss: false, seed: 1, items: null, days: SPLITS.bro.map(d => [...d]) };

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t_ = Math.imul(a ^ (a >>> 15), 1 | a); t_ = (t_ + Math.imul(t_ ^ (t_ >>> 7), 61 | t_)) ^ t_; return ((t_ ^ (t_ >>> 14)) >>> 0) / 4294967296; };
}
const groupLabel = g => t(`g.${g}`);
const groupLabelIn = (g, lang) => I18N[lang][`g.${g}`];

function candidates(group) {
  const max = LEVEL_RANK[S.profile.level || 'beginner'];
  return EX.filter(e => ['strength', 'powerlifting'].includes(e.category) && GROUPS[group].m.includes(e.primaryMuscles[0])
    && hasEquip(e.equipment) && LEVEL_RANK[e.level] <= max && e.images.length);
}

function pickFor(group, k, picked, rnd) {
  const big = GROUPS[group].big, wantCompound = k === 0 && big;
  const usedEq = new Set(picked.map(p => p.equipment));
  const taken = new Set(picked.map(p => p.id));
  let best = null, bs = -Infinity;
  for (const e of candidates(group)) {
    if (taken.has(e.id)) continue;
    let s = rnd() * 3;
    if (STAPLES.has(e.id)) s += 4;
    if (wantCompound && e.mechanic === 'compound') s += 5;
    if (!wantCompound && k > 0 && e.mechanic === 'isolation') s += 1.5;
    if (usedEq.has(e.equipment)) s -= 2;
    if (e.level === S.profile.level) s += 1;
    if (s > bs) { bs = s; best = e; }
  }
  return best;
}

const toItem = (e, goal, g) => { const [sets, reps, rest] = e.mechanic === 'compound' ? GOALS[goal].c : GOALS[goal].i; return [e.id, sets, reps, rest, null, g]; };

// → items: [id, sets, reps, rest, supersetLetter|null, group]
function generate(groups, { dur, goal, ss }, seed) {
  STAPLES ||= new Set(PROGRAMS.flatMap(p => p.days.flatMap(d => d.items.map(i => i[0]))));
  const rnd = mulberry32(seed);
  const weights = groups.map(g => (GROUPS[g].big ? 2 : 1));
  const sumW = weights.reduce((a, b) => a + b, 0);
  const per = groups.map((g, gi) => {
    const n = Math.max(1, Math.round((DURATIONS[dur] * weights[gi]) / sumW));
    const picked = [];
    for (let k = 0; k < n; k++) { const e = pickFor(g, k, picked, rnd); if (e) picked.push(e); }
    return picked.map(e => ({ e, g }));
  });
  if (ss && groups.length >= 2) {
    // biseries: pair exercises from two different groups, rotating which groups pair up
    const queues = per.filter(q => q.length).map(q => [...q]);
    const out = [];
    let letter = 0;
    while (queues.some(q => q.length)) {
      const avail = queues.filter(q => q.length);
      if (avail.length >= 2) {
        const L_ = String.fromCharCode(65 + letter++);
        const a = avail[0].shift(), b = avail[1].shift();
        out.push([...toItem(a.e, goal, a.g).slice(0, 4), L_, a.g], [...toItem(b.e, goal, b.g).slice(0, 4), L_, b.g]);
        queues.push(queues.splice(queues.indexOf(avail[0]), 1)[0]);
      } else {
        const a = avail[0].shift();
        out.push(toItem(a.e, goal, a.g));
      }
    }
    return out;
  }
  const flat = per.flat();
  return [...flat.filter(x => x.e.mechanic === 'compound'), ...flat.filter(x => x.e.mechanic !== 'compound')].map(x => toItem(x.e, goal, x.g));
}

function genCta() {
  return `<div class="card gen-cta" data-go="build"><div class="row"><span class="install-ic">${ic('sparkles')}</span>
    <div style="flex:1"><b>${t('gen.cta.title')}</b><div class="muted small">${t('gen.cta.sub')}</div></div>${ic('arrowRight')}</div></div>`;
}

const segOf = (act, cur, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" data-act="${act}" data-v="${v}">${l}</button>`).join('')}</div>`;
const muscleGrid = (sel, act, extra = '') => `<div class="muscle-grid">${Object.keys(GROUPS).map(g => `<button class="${sel.includes(g) ? 'on' : ''}" data-act="${act}" data-g="${g}" ${extra}>${groupLabel(g)}</button>`).join('')}</div>`;

VIEWS.build = () => {
  const lvl = S.profile.level || 'beginner';
  let h = `<h1>${ic('sparkles', 'acc')} ${t('gen.title')}</h1>
    <div class="seg" style="margin-bottom:14px">${[['day', t('gen.tab.day')], ['week', t('gen.tab.week')]].map(([v, l]) => `<button class="${GEN.tab === v ? 'on' : ''}" data-act="genTab" data-v="${v}">${l}</button>`).join('')}</div>`;
  const opts = `<div class="row wrap" style="gap:16px;margin-top:14px">
      <div><div class="muted small">${t('gen.duration')}</div>${segOf('genDur', GEN.dur, [['short', t('gen.dur.short')], ['normal', t('gen.dur.normal')], ['long', t('gen.dur.long')]])}</div>
      <div><div class="muted small">${t('gen.goal')}</div>${segOf('genGoal', GEN.goal, [['strength', t('goal.strength')], ['hyp', t('goal.hyp')], ['endurance', t('goal.endurance')]])}</div>
    </div>
    <label class="switch" style="margin-top:16px"><input type="checkbox" id="genSS" ${GEN.ss ? 'checked' : ''}><i></i><span><b>${t('gen.ss')}</b><br><span class="muted small">${t('gen.ss.sub')}</span></span></label>
    <p class="muted small" style="margin:12px 0 0">${ic('info')} ${t('gen.basis', { l: t(`lvl.${lvl}`) })}</p>`;

  if (GEN.tab === 'day') {
    h += `<div class="card"><h2>${t('gen.muscles')}</h2>${muscleGrid(GEN.groups, 'genGroup')}${opts}
      <button class="btn primary big" data-act="genRun" style="margin-top:16px">${ic('sparkles')} ${t('gen.generate')}</button></div>`;
    if (GEN.items) {
      const title = GEN.groups.map(groupLabel).join(' + ');
      h += `<div class="card"><div class="row wrap"><h2 style="margin:0">${esc(title)}</h2><span class="spacer"></span>
          <button class="btn sm ghost" data-act="genShuffle">${ic('refresh')} ${t('gen.regen')}</button></div>
        <div style="margin-top:8px">${GEN.items.map((it, i) => `<div class="hist-item" data-act="showEx" data-id="${esc(it[0])}">${thumb(it[0], 56)}
          <div style="flex:1;min-width:0"><b>${it[4] ? `<span class="ss-tag">${esc(it[4])}</span> ` : ''}${esc(exName(it[0]))}</b>
          <div class="muted small">${groupLabel(it[5])} · ${t('setsXreps', { s: it[1], r: esc(it[2]), rest: mmss(it[3]) })}</div></div>
          <button class="round-btn" data-act="genReroll" data-i="${i}" title="${t('gen.reroll')}" aria-label="${t('gen.reroll')}">${ic('refresh')}</button>
          <button class="round-btn" data-act="genRemove" data-i="${i}" aria-label="${t('gen.remove')}">${ic('x')}</button></div>`).join('')}</div>
        <div class="row wrap" style="margin-top:14px"><button class="btn ghost" data-act="genSave">${ic('save')} ${t('saveRoutine')}</button><span class="spacer"></span>
          <button class="btn primary" data-act="genStart">${ic('play', 'fill')} ${t('gen.start')}</button></div></div>`;
    }
    return h;
  }

  // weekly split
  h += `<div class="card"><div class="row wrap" style="gap:16px">
      <div><div class="muted small">${t('week.days')}</div>${segOf('weekDays', GEN.days.length, [2, 3, 4, 5, 6].map(n => [n, n]))}</div>
    </div>
    <div class="muted small" style="margin-top:14px">${t('week.presets')}</div>
    <div class="chips" style="margin-top:6px">${Object.keys(SPLITS).map(k => `<button class="chip" data-act="weekPreset" data-v="${k}">${t(`preset.${k}`)}</button>`).join('')}</div>
    <div style="margin-top:10px">${GEN.days.map((d, di) => `<div class="day-row"><div class="row"><b>${t('week.day', { n: di + 1 })}</b>
      <span class="muted small">${d.length ? esc(d.map(groupLabel).join(' + ')) : ''}</span></div>
      <div class="chips" style="margin-top:8px">${Object.keys(GROUPS).map(g => `<button class="chip ${d.includes(g) ? 'on' : ''}" data-act="weekGroup" data-d="${di}" data-g="${g}">${groupLabel(g)}</button>`).join('')}</div></div>`).join('')}</div>
    ${opts}
    <button class="btn primary big" data-act="weekCreate" style="margin-top:16px">${ic('programs')} ${t('week.create')}</button></div>`;
  return h;
};

// ============================================================ LIBRARY
const LIB = { q: '', muscle: '', equip: '', level: '', cat: '', fav: false, limit: 48 };
const opt = (v, label, sel) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(label)}</option>`;
const sortBy = (arr, f) => [...arr].sort((a, b) => f(a).localeCompare(f(b), LOC()));

VIEWS.library = () => `
  <h1>${t('nav.library')}</h1>
  <p class="muted small">${t('lib.sub', { n: EX.length, link: '<a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener">free-exercise-db</a>' })}</p>
  <div class="filters">
    <input type="search" id="libQ" placeholder="${t('lib.search')}" value="${esc(LIB.q)}">
    <select data-lib="muscle">${opt('', t('allMuscles'), LIB.muscle)}${sortBy(MUSCLES, T).map(m => opt(m, T(m), LIB.muscle)).join('')}</select>
    <select data-lib="equip">${opt('', t('allEquip'), LIB.equip)}${sortBy(EQUIP, T).map(m => opt(m, T(m), LIB.equip)).join('')}</select>
    <select data-lib="level">${opt('', t('allLevels'), LIB.level)}${Object.keys(LEVEL_ICONS).map(m => opt(m, T(m), LIB.level)).join('')}</select>
  </div>
  <div class="row wrap" style="margin-bottom:16px">
    <button class="chip ${!LIB.cat ? 'on' : ''}" data-act="libCat" data-cat="">${t('all')}</button>
    ${CATS.map(c => `<button class="chip ${LIB.cat === c ? 'on' : ''}" data-act="libCat" data-cat="${esc(c)}">${esc(T(c))}</button>`).join('')}
    <button class="chip ${LIB.fav ? 'on-gold' : ''}" data-act="libFav">${ic('star')} ${t('favorites')}</button>
  </div>
  <div id="exGrid"></div>`;
VIEWS.library.mount = () => renderGrid(false);

const haystack = e => `${e.name} ${ES[e.id]?.name || ''} ${e.primaryMuscles.join(' ')} ${e.primaryMuscles.map(m => TERMS_ES[m] || '').join(' ')} ${e.equipment || ''} ${TERMS_ES[e.equipment] || ''}`
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const words = q => q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);

function libFiltered() {
  const ws = words(LIB.q);
  const out = EX.filter(e => {
    if (LIB.muscle && !e.primaryMuscles.includes(LIB.muscle)) return false;
    if (LIB.equip && e.equipment !== LIB.equip) return false;
    if (LIB.level && e.level !== LIB.level) return false;
    if (LIB.cat && e.category !== LIB.cat) return false;
    if (LIB.fav && !S.favorites.includes(e.id)) return false;
    if (ws.length) { const hay = haystack(e); return ws.every(w => hay.includes(w)); }
    return true;
  });
  return LANG() === 'es' ? sortBy(out, e => exName(e.id)) : out;
}

function exCard(e) {
  const fav = S.favorites.includes(e.id);
  return `<button class="ex-card" data-act="showEx" data-id="${esc(e.id)}">
    <div class="thumb">${e.images.length ? `<img loading="lazy" src="${img(e.id)}" alt="">` : ''}
      <span class="chip frost ${e.level}">${T(e.level)}</span>${fav ? `<span class="fav">${ic('star', 'fill')}</span>` : ''}</div>
    <div class="meta"><b>${esc(exName(e.id))}</b><small>${esc(list(e.primaryMuscles))} · ${esc(e.equipment ? T(e.equipment) : cap(t('noEquip')))}</small></div></button>`;
}

function renderGrid(animate = true) {
  const el = $('#exGrid');
  if (!el) return;
  const res = libFiltered();
  el.innerHTML = res.length
    ? `<p class="muted small">${res.length === 1 ? t('result1') : t('results', { n: res.length })}</p>
       <div class="ex-grid">${res.slice(0, LIB.limit).map(exCard).join('')}</div>
       ${res.length > LIB.limit ? `<button class="btn ghost big" style="margin-top:14px" data-act="libMore">${t('showMore', { n: res.length - LIB.limit })}</button>` : ''}`
    : `<div class="empty"><div class="big">${ic('search')}</div><p>${t('noMatch')}</p></div>`;
  if (animate) stagger($('.ex-grid', el), 12);
}

function showEx(id) {
  const e = EXMAP[id];
  if (!e) return;
  const rec = records(id);
  const fav = S.favorites.includes(id);
  const series = seriesFor(id);
  const last = lastSession(id);
  const ins = instructions(id);
  openModal(`<button class="close" data-act="close" aria-label="Close">${ic('x')}</button>
    <h2 style="padding-right:44px">${esc(exName(id))}</h2>
    ${LANG() === 'es' && ES[id] ? `<p class="muted small" style="margin-top:-6px">${esc(e.name)}</p>` : ''}
    <div class="chips" style="margin-bottom:12px">
      ${levelChip(e.level)}<span class="chip">${esc(T(e.category))}</span>
      ${e.equipment ? `<span class="chip">${esc(T(e.equipment))}</span>` : ''}${e.mechanic ? `<span class="chip">${esc(T(e.mechanic))}</span>` : ''}${e.force ? `<span class="chip">${esc(T(e.force))}</span>` : ''}
    </div>
    ${e.images.length ? `<div class="demo" id="demo">${e.images.map((_, n) => `<img src="${img(id, n)}" alt="${esc(exName(id))} — ${t('position', { n: n + 1 })}" style="opacity:${n ? 0 : 1}">`).join('')}
      <span class="chip frost ${e.level}">${T(e.level)}</span>
      ${e.images.length > 1 ? `<div class="ctrl"><button data-act="demoToggle">${ic('pause', 'fill')} ${t('pause')}</button></div>` : ''}</div>` : ''}
    <p><b>${t('ex.primary')}:</b> ${esc(list(e.primaryMuscles))}${e.secondaryMuscles.length ? `<br><b>${t('ex.secondary')}:</b> ${esc(list(e.secondaryMuscles))}` : ''}</p>
    <h3>${t('ex.howto')}</h3>${ins.en ? `<p class="muted small">${t('ex.instrEn')}</p>` : ''}
    <ol class="steps">${ins.list.map(i => `<li>${esc(i)}</li>`).join('')}</ol>
    ${rec.sessions ? `<h3>${t('ex.records')}</h3><div class="grid stats" style="margin-bottom:10px">
        ${rec.w ? stat(fmtW(rec.w), t('heaviest')) + stat(fmtW(rec.e1rm), t('e1rm')) : stat(rec.reps, t('mostReps'))}
        ${stat(rec.sessions, t('sessions'))}${last ? stat(fmtDate(last.wo.start), t('lastDone')) : ''}</div>
      <div class="small muted">${series.label}</div>${lineChart(series.pts, series.label)}` : ''}
    <div class="row wrap" style="margin-top:16px">
      <button class="btn ghost" data-act="fav" data-id="${esc(id)}">${ic('star', fav ? 'fill gold' : '')} ${fav ? t('faved') : t('fav')}</button>
      <button class="btn ghost" data-act="altFor" data-orig="${esc(id)}">${ic('swap')} ${t('alt.btn')}</button><span class="spacer"></span>
      ${S.active ? `<button class="btn primary" data-act="addEx" data-id="${esc(id)}">${ic('plus')} ${t('addToWo')}</button>`
                 : `<button class="btn primary" data-act="startWith" data-id="${esc(id)}">${ic('play', 'fill')} ${t('startWith')}</button>`}
    </div>`);
  if (e.images.length > 1) startDemo();
}
function startDemo() {
  let n = 0;
  clearInterval(demoTimer);
  demoTimer = setInterval(() => {
    const imgs = $$('#demo img');
    if (!imgs.length) return clearInterval(demoTimer);
    n = (n + 1) % imgs.length;
    imgs.forEach((im, i) => { im.style.opacity = i === n ? 1 : 0; });
  }, 900);
}

// ---- alternatives
const ALT = { orig: null, ei: null };
function openAlt(orig, ei = null) {
  ALT.orig = orig; ALT.ei = ei;
  const e = EXMAP[orig];
  const cur = ei != null && S.active ? S.active.exercises[ei].id : resolve(orig).id;
  const alts = alternatives(orig, 16).filter(x => x.id !== cur);
  openModal(`<button class="close" data-act="close" aria-label="Close">${ic('x')}</button>
    <h2 style="padding-right:44px">${t('alt.title', { x: esc(exName(orig)) })}</h2>
    <p class="muted small">${t('alt.sub')}</p>
    ${e ? `<div class="chips" style="margin-bottom:10px">${e.primaryMuscles.map(m => `<span class="chip">${esc(T(m))}</span>`).join('')}${e.equipment ? `<span class="chip ${hasEquip(e.equipment) ? '' : 'expert'}">${esc(T(e.equipment))}${hasEquip(e.equipment) ? '' : ` · ${t('alt.unavailable')}`}</span>` : ''}</div>` : ''}
    ${cur !== orig ? `<button class="btn ghost big" data-act="altPick" data-id="${esc(orig)}" style="margin-bottom:8px">${ic('undo')} ${t('alt.restore')} · ${esc(exName(orig))}</button>` : ''}
    ${alts.length ? alts.map(x => `<div class="hist-item" data-act="altPick" data-id="${esc(x.id)}">${thumb(x.id, 60)}
      <div style="flex:1;min-width:0"><b>${esc(exName(x.id))}</b><div class="chips" style="margin-top:5px"><span class="chip">${esc(T(x.equipment || 'body only'))}</span>${levelChip(x.level)}</div></div>
      <span class="chip brand">${ic('swap')}</span></div>`).join('') : `<p class="muted">${t('alt.none')}</p>`}
    <button class="btn ghost big" data-act="altAny" style="margin-top:12px">${ic('search')} ${t('alt.searchAny')}</button>`);
}
function applyAlt(id) {
  const orig = ALT.orig;
  if (id === orig) { delete S.swaps[orig]; toast(t('alt.restored')); }
  else { S.swaps[orig] = id; toast(t('alt.saved', { x: esc(exName(id)), y: esc(exName(orig)) })); }
  if (ALT.ei != null && S.active) {
    const old = S.active.exercises[ALT.ei];
    pushExercise(id, { sets: old.sets.length, target: old.target, rest: old.rest, orig: id === orig ? null : orig }, ALT.ei);
  }
  save();
  if (openProgramId && ALT.ei == null) showProgram(openProgramId); else closeModal();
  render();
}

// ---- picker (add exercise to workout / pick any alternative)
const PICK = { q: '', muscle: '', replace: null, alt: false };
function openPicker({ replace = null, alt = false } = {}) {
  Object.assign(PICK, { q: '', muscle: '', replace, alt });
  openModal(`<button class="close" data-act="close" aria-label="Close">${ic('x')}</button>
    <h2>${alt || replace != null ? t('picker.replace') : t('picker.add')}</h2>
    <input type="search" id="pickQ" placeholder="${t('picker.search', { n: EX.length })}">
    <div class="chips" style="margin:10px 0">${['', ...sortBy(MUSCLES, T)].map(m => `<button class="chip" data-act="pickMuscle" data-m="${esc(m)}">${m ? esc(T(m)) : t('all')}</button>`).join('')}</div>
    <div id="pickList"></div>`);
  renderPick();
  $('#pickQ').focus();
}
function renderPick() {
  const ws = words(PICK.q);
  let res = EX.filter(e => (!PICK.muscle || e.primaryMuscles.includes(PICK.muscle)) && (!ws.length || ws.every(w => haystack(e).includes(w))));
  if (!ws.length) {
    const recent = [...new Set(sortedWorkouts().reverse().flatMap(w => w.exercises.map(e => e.id)))];
    const rank = id => (S.favorites.includes(id) ? 0 : recent.includes(id) ? 1 + recent.indexOf(id) / 1000 : 2);
    res = res.sort((a, b) => rank(a.id) - rank(b.id));
  }
  $$('[data-act=pickMuscle]').forEach(b => b.classList.toggle('on', b.dataset.m === PICK.muscle));
  $('#pickList').innerHTML = res.slice(0, 60).map(e => `<div class="hist-item" data-act="pickEx" data-id="${esc(e.id)}">${thumb(e.id, 56)}
    <div style="flex:1;min-width:0"><b>${esc(exName(e.id))}</b><div class="muted small">${esc(list(e.primaryMuscles))} · ${esc(e.equipment ? T(e.equipment) : cap(t('noEquip')))}</div></div>
    ${levelChip(e.level)}</div>`).join('') || `<div class="empty">${t('noMatches')}</div>`;
}

// ============================================================ WORKOUT
function startWorkout({ name = 'Workout', items = [], programId = null, dayIdx = null } = {}) {
  if (S.active && !confirm(t('wo.inProgressConfirm'))) return;
  S.active = { id: uid(), name, start: Date.now(), programId, dayIdx, note: '', exercises: [] };
  for (const it of items) {
    const r = resolve(it[0]);
    pushExercise(r.id, { sets: it[1], target: it[2], rest: it[3], orig: r.why ? r.orig : null, ss: it[4] || null });
  }
  save();
  stopRest();
  go('workout');
}

function pushExercise(id, { sets = 3, target = '', rest = S.profile.rest, orig = null, ss = null } = {}, at = null) {
  const sug = suggest(id, target);
  const tr_ = parseInt(target, 10) || null;
  const e = { id, target: String(target || ''), rest: rest || S.profile.rest, sets: [] };
  if (orig) e.orig = orig;
  if (ss) e.ss = ss;
  for (let i = 0; i < sets; i++) e.sets.push({ w: sug ? sug.w : null, r: tr_ ?? sug?.r ?? null, done: false, t: 'N' });
  if (at != null) S.active.exercises.splice(at, 1, e); else S.active.exercises.push(e);
}

const woName = () => t('weekdayWorkout', { day: new Date().toLocaleDateString(LOC(), { weekday: 'long' }) });

VIEWS.workout = () => {
  const a = S.active;
  if (!a) {
    const last = sortedWorkouts().pop();
    const prog = findProgram(x => x.id === S.program.id);
    const di = prog ? S.program.next % prog.days.length : 0;
    return `<h1>${t('wo.title')}</h1><div class="card empty"><div class="big">${ic('dumbbell')}</div><p>${t('wo.none')}</p>
      <div class="grid" style="max-width:380px;margin:0 auto">
        ${prog ? `<button class="btn primary big" data-act="startDay" data-prog="${prog.id}" data-day="${di}">${ic('play', 'fill')} ${esc(L(prog.days[di].name))} <small>(${esc(L(prog.name))})</small></button>` : ''}
        <button class="btn ${prog ? 'ghost' : 'primary'} big" data-go="build">${ic('sparkles')} ${t('gen.cta.btn')}</button>
        <button class="btn ghost big" data-act="startEmpty">${t('wo.startEmpty')}</button>
        ${last ? `<button class="btn ghost big" data-act="repeat" data-id="${last.id}">${ic('repeat')} ${t('wo.repeat', { x: esc(last.name) })}</button>` : ''}
        <button class="btn ghost big" data-go="programs">${ic('programs')} ${t('wo.browse')}</button>
      </div></div>`;
  }
  return `<input type="text" id="woName" value="${esc(a.name)}" aria-label="${t('wo.name')}" style="font-weight:800;font-size:1.35rem;background:none;border-color:transparent;padding-left:2px;margin-bottom:8px;backdrop-filter:none">
    <div class="grid stats" style="margin-bottom:14px">
      ${stat(mmss((Date.now() - a.start) / 1000), t('duration'), 'woTimer')}
      ${stat(fmtVol(volumeOf(a)), t('volumeU', { u: U() }), 'woVol')}
      ${stat(`${setsDone(a)}/${a.exercises.reduce((n, e) => n + e.sets.length, 0)}`, t('setsDone'), 'woSets')}
    </div>
    ${a.exercises.map(exBlock).join('')}
    ${a.exercises.length ? '' : `<div class="card empty small">${t('wo.addFirst')}</div>`}
    <button class="btn ghost big" data-act="openPicker">${ic('plus')} ${t('wo.addEx')}</button>
    <label class="field" style="margin-top:16px"><span>${t('notes')}</span><textarea id="woNote" rows="2" placeholder="${t('notes.ph')}">${esc(a.note)}</textarea></label>
    <div class="row" style="margin-top:8px"><button class="btn danger" data-act="cancelWo">${t('discard')}</button><span class="spacer"></span>
      <button class="btn good" data-act="finishWo" style="padding:12px 28px">${ic('check')} ${t('finish')}</button></div>`;
};

function exBlock(e, i) {
  const last = lastSession(e.id);
  const sug = suggest(e.id, e.target);
  const prev = last ? last.e.sets.filter(s => s.done) : [];
  let n = 0;
  const rows = e.sets.map((s, j) => {
    const label = s.t === 'N' ? ++n : t(`st.${s.t}`);
    const pv = prev[j];
    const just = JUST && JUST[0] === i && JUST[1] === j;
    return `<tr class="${s.done ? 'done' : ''} ${s.pr ? 'pr' : ''} ${just ? 'just' : ''}">
      <td><button class="setno ${s.t}" data-act="setType" data-e="${i}" data-s="${j}" title="${t('setTypeHint')}">${label}</button></td>
      <td class="prev">${pv ? `${pv.w ? num(toD(pv.w)) : 'BW'}×${pv.r}` : '—'}</td>
      <td><input type="number" inputmode="decimal" step="any" min="0" data-e="${i}" data-s="${j}" data-f="w" value="${s.w != null ? num(toD(s.w)) : ''}" placeholder="${U()}"></td>
      <td><input type="number" inputmode="numeric" min="0" data-e="${i}" data-s="${j}" data-f="r" value="${s.r ?? ''}" placeholder="${t('reps')}"></td>
      <td><button class="check" data-act="toggleSet" data-e="${i}" data-s="${j}" aria-label="${t('completeSet')}">${ic(s.pr ? 'trophy' : 'check')}</button></td></tr>`;
  }).join('');
  return `<section class="wo-ex ${e.ss ? 'ss' : ''}"><header>${thumb(e.id, 56)}
      <div class="t">${e.ss ? `<span class="ss-tag" title="${t('ss.label', { x: esc(e.ss) })}">${esc(e.ss)}</span> ` : ''}<b data-act="showEx" data-id="${esc(e.id)}" style="display:inline">${esc(exName(e.id))}</b>
        <div class="muted small">${e.target ? `${t('target', { x: esc(e.target) })} · ` : ''}${t('rest', { x: mmss(e.rest) })}</div>
        ${e.orig ? `<div style="margin:3px 0">${swapChip({ why: 'user', orig: e.orig })}</div>` : ''}
        <div class="hint">${ic(sug ? 'trending' : 'sparkles')} ${sug ? sug.text : t('firstTime')}</div></div>
      <button class="round-btn" data-act="altFor" data-e="${i}" title="${t('alt.btn')}" aria-label="${t('alt.btn')}">${ic('swap')}</button>
      <button class="round-btn" data-act="exMenu" data-e="${i}" aria-label="${t('exOptions')}">${ic('more')}</button></header>
    <table class="sets"><thead><tr><th>${t('th.set')}</th><th>${t('th.prev')}</th><th>${U()}</th><th>${t('th.reps')}</th><th>${ic('check')}</th></tr></thead><tbody>${rows}</tbody></table>
    <footer><button class="btn sm" data-act="addSet" data-e="${i}">${ic('plus')} ${t('addSet')}</button><button class="btn sm ghost" data-act="rmSet" data-e="${i}">${ic('minus')} ${t('rmSet')}</button></footer></section>`;
}

function updateWoStats() {
  const a = S.active;
  if (!a) return;
  const v = $('#woVol'), s = $('#woSets');
  if (v) v.textContent = fmtVol(volumeOf(a));
  if (s) s.textContent = `${setsDone(a)}/${a.exercises.reduce((n, e) => n + e.sets.length, 0)}`;
}

function checkPR(ei, si) {
  const e = S.active.exercises[ei], s = e.sets[si];
  const had = !!s.pr;
  delete s.pr;
  if (!working(s)) return;
  const base = records(e.id);
  if (!base.sessions) return; // first time doing it: this session sets the baseline
  for (const x of S.active.exercises) if (x.id === e.id) for (const o of x.sets) if (o !== s && working(o)) {
    base.w = Math.max(base.w, o.w || 0);
    base.e1rm = Math.max(base.e1rm, e1rm(o.w || 0, o.r));
    if (!o.w) base.reps = Math.max(base.reps, o.r);
  }
  const w = s.w || 0, prs = [];
  if (w > 0 && w > base.w + 1e-6) prs.push('w');
  if (w > 0 && e1rm(w, s.r) > base.e1rm + 1e-6) prs.push('e1rm');
  if (!w && base.reps > 0 && s.r > base.reps) prs.push('reps');
  if (prs.length) {
    s.pr = prs;
    if (!had) {
      toast(`${ic('trophy')} ${t('newPR', { x: esc(exName(e.id)) })}<br><span class="small muted">${w ? `${fmtW(w)} × ${s.r}` : `${s.r} ${t('reps')}`} · ${prs.map(prLabel).join(' · ')}</span>`, 'pr');
      confetti();
      navigator.vibrate?.([80, 40, 80, 40, 200]);
    }
  }
}

function finishWorkout() {
  const a = S.active;
  if (!setsDone(a)) {
    if (confirm(t('noSetsDiscard'))) { S.active = null; save(); stopRest(); render(); }
    return;
  }
  a.exercises = a.exercises.map(e => ({ ...e, sets: e.sets.filter(s => s.done) })).filter(e => e.sets.length);
  a.end = Date.now();
  const vol = volumeOf(a), prs = prCount(a), sets = setsDone(a);
  a.xp = Math.round(50 + sets * 5 + vol / 200 + prs * 25);

  const before = stats();
  S.workouts.push(a);
  S.active = null;
  const prog = findProgram(p => p.id === a.programId);
  if (prog && S.program.id === prog.id) S.program.next = (a.dayIdx + 1) % prog.days.length;
  save();
  stopRest();
  const after = stats();
  const badges = BADGES.filter(b => !b.test(before) && b.test(after));
  const rankUp = rankOf(after.xp).cur !== rankOf(before.xp).cur ? rankOf(after.xp).cur : null;

  render();
  confetti();
  openModal(`<button class="close" data-act="close" aria-label="Close">${ic('x')}</button>
    <div style="text-align:center"><div class="big-ic">${ic('sparkles')}</div><h1>${t('done.title')}</h1><p class="muted">${esc(a.name)} · ${fmtDate(a.start)}</p></div>
    <div class="grid stats" style="margin:14px 0">${stat(dur(a.end - a.start), t('duration'))}${stat(`${cnt(toD(vol), 'vol')} ${U()}`, t('volume'))}${stat(cnt(sets), t('sets'))}${stat(`${cnt(prs)} ${ic('trophy', 'gold')}`, t('prs'))}</div>
    <div class="card" style="text-align:center"><b style="font-size:1.5rem;color:var(--accent)">+${cnt(a.xp)} XP</b>
      ${rankUp ? `<div style="margin-top:8px;font-size:1.1rem">${ic('arrowUp')} ${t('rankUp', { r: `<b>${ic(rankUp.icon)} ${L(rankUp.name)}</b>` })}</div>` : ''}</div>
    ${badges.length ? `<h3>${t('newAch')}</h3><div class="grid badges">${badges.map(b => `<div class="badge"><div class="i">${ic(b.icon)}</div><b>${L(b.name)}</b><small>${L(b.desc)}</small></div>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:16px"><button class="btn ghost" data-act="saveRoutine" data-id="${a.id}">${ic('save')} ${t('saveRoutine')}</button><span class="spacer"></span><button class="btn primary" data-act="close">${t('doneBtn')}</button></div>`);
  countUp($('#sheet'));
}

function showWorkout(id) {
  const w = S.workouts.find(x => x.id === id);
  if (!w) return;
  openModal(`<button class="close" data-act="close" aria-label="Close">${ic('x')}</button>
    <h2>${esc(w.name)}</h2><p class="muted">${new Date(w.start).toLocaleString(LOC())} · ${dur((w.end || w.start) - w.start)}</p>
    <div class="grid stats" style="margin-bottom:12px">${stat(`${fmtVol(volumeOf(w))} ${U()}`, t('volume'))}${stat(setsDone(w), t('sets'))}${stat(prCount(w), t('prs'))}${stat(`+${w.xp || 0}`, 'XP')}</div>
    ${w.exercises.map(e => `<div class="card"><div class="row">${thumb(e.id, 44)}<b data-act="showEx" data-id="${esc(e.id)}" style="cursor:pointer">${esc(exName(e.id))}</b></div>
      <div class="chips" style="margin-top:8px">${e.sets.map(s => `<span class="chip ${s.pr ? 'gold' : ''}">${s.t !== 'N' ? `${t(`st.${s.t}`)} · ` : ''}${s.w ? `${num(toD(s.w))} ${U()}` : 'BW'} × ${s.r}${s.pr ? ` ${ic('trophy')}` : ''}</span>`).join('')}</div></div>`).join('')}
    ${w.note ? `<p class="muted">${ic('note')} ${esc(w.note)}</p>` : ''}
    <div class="row wrap"><button class="btn danger" data-act="delWorkout" data-id="${w.id}">${ic('trash')} ${t('delete')}</button><span class="spacer"></span>
      <button class="btn ghost" data-act="saveRoutine" data-id="${w.id}">${ic('save')} ${t('saveRoutine')}</button>
      <button class="btn primary" data-act="repeat" data-id="${w.id}">${ic('repeat')} ${t('repeat')}</button></div>`);
}

// Routines store the planned (original) exercise so swaps and gym equipment keep applying
const itemsFrom = w => w.exercises.map(e => [e.orig || e.id, e.sets.filter(s => s.t !== 'W').length || e.sets.length, e.target || String(Math.max(...e.sets.map(s => s.r || 0))), e.rest, e.ss || null]);

// ============================================================ rest timer & clocks
let rest = null;
function startRest(sec) {
  rest = { end: Date.now() + sec * 1000, total: sec, beeped: false };
  const el = $('#restTimer');
  el.classList.remove('hidden', 'done');
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  tick();
}
function stopRest() { rest = null; $('#restTimer').classList.add('hidden'); }
function tick() {
  if (rest) {
    const left = Math.max(0, Math.round((rest.end - Date.now()) / 1000));
    $('#restText').textContent = left ? mmss(left) : t('go');
    $('#restArc').style.strokeDashoffset = 100.5 * (1 - left / rest.total);
    if (!left && !rest.beeped) {
      rest.beeped = true;
      beep();
      $('#restTimer').classList.add('done');
      const mine = rest;
      setTimeout(() => { if (rest === mine) stopRest(); }, 8000);
    }
  }
  const a = S.active, onWorkout = location.hash === '#workout';
  $('#activePill').classList.toggle('hidden', !a || onWorkout);
  if (a) {
    const tm = mmss((Date.now() - a.start) / 1000);
    $('#activeTimer').textContent = tm;
    const el = $('#woTimer');
    if (el) el.textContent = tm;
  }
}
setInterval(tick, 500);

// ============================================================ PROGRESS
const PROG = { ex: null, all: false };
VIEWS.progress = () => {
  if (!S.workouts.length) {
    return `<h1>${t('nav.progress')}</h1><div class="card empty"><div class="big">${ic('trending')}</div><p>${t('prog.empty')}</p>
      <button class="btn primary" data-go="workout">${t('startTraining')}</button></div>${bodyCard()}${badgesCard(stats())}`;
  }
  const st = stats(), recs = allRecords();
  const recList = Object.values(recs).sort((a, b) => b.sessions - a.sessions || exName(a.id).localeCompare(exName(b.id), LOC()));
  if (!PROG.ex || !recs[PROG.ex]) PROG.ex = recList[0]?.id;
  const series = seriesFor(PROG.ex);

  const wk0 = weekStart(Date.now());
  const vols = [], labels = [];
  for (let i = 11; i >= 0; i--) {
    const s = weekStart(wk0 - i * 7 * DAY), e = weekStart(s + 8 * DAY);
    vols.push(S.workouts.filter(w => w.start >= s && w.start < e).reduce((v, w) => v + volumeOf(w), 0));
    labels.push(new Date(s).toLocaleDateString(LOC(), { day: 'numeric', month: 'numeric' }));
  }
  const hist = sortedWorkouts().reverse();

  return `<h1>${t('nav.progress')}</h1>
    <div class="grid stats" style="margin-bottom:14px">
      ${stat(cnt(st.workouts), t('workouts'))}${stat(`${cnt(toD(st.volume), 'vol')}<small class="muted"> ${U()}</small>`, t('totalVol'))}
      ${stat(`${cnt(st.prs)} ${ic('trophy', 'gold')}`, t('prsSet'))}${stat(`${cnt(st.weekStreak)} ${ic('flame', 'acc')}`, t('stat.streak'))}${stat(cnt(st.xp), 'XP')}
    </div>
    <div class="card"><h2>${t('consistency')}</h2><p class="muted small">${t('consistency.sub')}</p>${heatmap()}</div>
    <div class="card"><h2>${t('weeklyVol')}</h2>${barChart(vols, labels)}</div>
    <div class="card"><div class="row wrap"><h2 style="margin:0">${t('exProgress')}</h2><span class="spacer"></span>
      <select id="progEx" style="width:auto;max-width:100%">${recList.map(r => opt(r.id, exName(r.id), PROG.ex)).join('')}</select></div>
      <div class="small muted" style="margin:8px 0">${series.label}</div>${lineChart(series.pts, series.label)}</div>
    <div class="card"><h2>${ic('trophy', 'gold')} ${t('prBoard')}</h2><div style="overflow-x:auto"><table class="pr-table">
      <thead><tr><th>${t('th.exercise')}</th><th>${t('th.best')}</th><th>${t('th.e1rm')}</th><th>${t('th.sessions')}</th><th>${t('th.date')}</th></tr></thead>
      <tbody>${recList.map(r => `<tr data-act="showEx" data-id="${esc(r.id)}"><td><b>${esc(exName(r.id))}</b></td>
        <td>${r.w ? `${fmtW(r.w)} × ${r.wr}` : `${r.reps} ${t('reps')}`}</td><td>${r.e1rm ? fmtW(r.e1rm) : '—'}</td><td>${r.sessions}</td><td class="muted small">${r.date ? fmtDate(r.date) : ''}</td></tr>`).join('')}</tbody>
    </table></div></div>
    ${badgesCard(st)}
    ${bodyCard()}
    <div class="card"><h2>${t('history')}</h2>
      ${(PROG.all ? hist : hist.slice(0, 15)).map(w => { const d = new Date(w.start); return `<div class="hist-item" data-act="showWorkout" data-id="${w.id}">
        <div class="date"><b>${d.getDate()}</b><small>${d.toLocaleDateString(LOC(), { month: 'short' })}</small></div>
        <div style="flex:1;min-width:0"><b>${esc(w.name)}</b><div class="muted small">${t('hist.line', { e: w.exercises.length, s: setsDone(w), v: `${fmtVol(volumeOf(w))} ${U()}`, d: dur((w.end || w.start) - w.start) })}</div></div>
        ${prCount(w) ? `<span class="chip gold">${prCount(w)} ${ic('trophy')}</span>` : ''}</div>`; }).join('')}
      ${!PROG.all && hist.length > 15 ? `<button class="btn ghost big" data-act="histAll" style="margin-top:10px">${t('showAll', { n: hist.length })}</button>` : ''}
    </div>`;
};
VIEWS.progress.mount = () => { const h = $('.heat'); if (h) h.scrollLeft = h.scrollWidth; };

function heatmap() {
  const days = new Map();
  for (const w of S.workouts) {
    const d = new Date(w.start); d.setHours(0, 0, 0, 0);
    days.set(d.getTime(), (days.get(d.getTime()) || 0) + setsDone(w));
  }
  const start = weekStart(Date.now()) - 19 * 7 * DAY;
  let cells = '';
  for (let i = 0; i < 140; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const ts = d.getTime();
    if (ts > Date.now()) { cells += '<i style="visibility:hidden"></i>'; continue; }
    const n = days.get(ts) || 0;
    cells += `<i style="animation-delay:${Math.floor(i / 7) * 25}ms" class="${n ? (n < 10 ? 'l1' : n < 20 ? 'l2' : 'l3') : ''}" title="${d.toLocaleDateString(LOC())}${n ? ` · ${t('heat.sets', { n })}` : ''}"></i>`;
  }
  return `<div class="heat">${cells}</div>`;
}

function badgesCard(st) {
  const got = BADGES.filter(b => b.test(st)).length;
  return `<div class="card"><h2>${t('achievements')} <span class="muted small">${got}/${BADGES.length}</span></h2><div class="grid badges">
    ${BADGES.map(b => `<div class="badge ${b.test(st) ? '' : 'locked'}"><div class="i">${ic(b.icon)}</div><b>${L(b.name)}</b><small>${L(b.desc)}</small></div>`).join('')}</div></div>`;
}

function bodyCard() {
  const log = [...S.bodylog].sort((a, b) => a.t - b.t);
  const lastE = log[log.length - 1];
  return `<div class="card"><h2>${ic('scale')} ${t('bw.title')}</h2>
    <div class="row"><input type="number" inputmode="decimal" step="any" id="bwIn" placeholder="${t('bw.ph', { u: U() })}" style="max-width:220px"><button class="btn primary" data-act="addBw">${t('log')}</button></div>
    ${log.length ? `<div style="margin-top:10px">${lineChart(log.map(e => ({ x: e.t, y: toD(e.kg) })), t('chart.bw'))}</div>
      <p class="muted small">${t('bw.latest', { w: `<b>${fmtW(lastE.kg)}</b>`, d: fmtDate(lastE.t) })}
      ${log.length > 1 ? t('bw.change', { c: `${num(toD(lastE.kg - log[0].kg))} ${U()}`, d: fmtDate(log[0].t) }) : ''}
      · <a href="#" data-act="undoBw">${t('undoLast')}</a></p>` : `<p class="muted small">${t('bw.hint')}</p>`}</div>`;
}

// ============================================================ TOOLS
const TOOLS = { w: 100, r: 5, target: 100, bar: null, warm: 100 };
const PLATES = {
  kg: [[25, '#d32f2f'], [20, '#1565c0'], [15, '#f9a825'], [10, '#2e7d32'], [5, '#eceff1'], [2.5, '#424242'], [1.25, '#9e9e9e']],
  lb: [[45, '#1565c0'], [35, '#f9a825'], [25, '#2e7d32'], [10, '#eceff1'], [5, '#424242'], [2.5, '#9e9e9e']],
};
VIEWS.tools = () => {
  const u = U();
  if (TOOLS.bar == null || TOOLS.unit !== u) { TOOLS.bar = u === 'kg' ? 20 : 45; TOOLS.unit = u; }
  return `<h1>${t('nav.tools')}</h1><div class="grid two">
    <div class="card"><h2>${ic('calculator')} ${t('rm.title')}</h2>
      <div class="row"><label class="field" style="flex:1"><span>${t('weightU', { u })}</span><input type="number" inputmode="decimal" data-tool="w" value="${TOOLS.w}"></label>
      <label class="field" style="flex:1"><span>${t('th.reps')}</span><input type="number" inputmode="numeric" data-tool="r" value="${TOOLS.r}"></label></div>
      <div id="rmOut"></div></div>
    <div class="card"><h2>${ic('dumbbell')} ${t('plate.title')}</h2>
      <div class="row"><label class="field" style="flex:1"><span>${t('targetU', { u })}</span><input type="number" inputmode="decimal" data-tool="target" value="${TOOLS.target}"></label>
      <label class="field" style="flex:1"><span>${t('barU', { u })}</span><select data-tool="bar">${(u === 'kg' ? [20, 15, 10] : [45, 35, 25]).map(b => `<option ${b === TOOLS.bar ? 'selected' : ''}>${b}</option>`).join('')}</select></label></div>
      <div id="plateOut"></div></div>
    <div class="card"><h2>${ic('flame')} ${t('warm.title')}</h2>
      <label class="field"><span>${t('warm.working', { u })}</span><input type="number" inputmode="decimal" data-tool="warm" value="${TOOLS.warm}"></label>
      <div id="warmOut"></div></div>
  </div>`;
};
VIEWS.tools.mount = updateTools;

function updateTools() {
  const u = U(), step = u === 'kg' ? 2.5 : 5, round = x => Math.round(x / step) * step;
  const rm = $('#rmOut');
  if (!rm) return;
  const one = e1rm(TOOLS.w || 0, TOOLS.r || 0);
  rm.innerHTML = one ? `<div class="stat" style="margin-bottom:10px"><b>${num(one)} ${u}</b><span>${t('rm.est')}</span></div>
    <table class="pr-table"><thead><tr><th>%</th><th>${t('th.weight')}</th><th>${t('th.approxReps')}</th></tr></thead><tbody>
    ${[100, 95, 90, 85, 80, 75, 70, 65, 60].map(p => `<tr><td>${p}%</td><td><b>${num(round((one * p) / 100))}</b> ${u}</td><td>${p === 100 ? 1 : Math.max(1, Math.round(30 * (100 / p - 1)))}</td></tr>`).join('')}</tbody></table>`
    : `<p class="muted small">${t('rm.enter')}</p>`;

  const per = ((TOOLS.target || 0) - TOOLS.bar) / 2;
  const plates = [];
  let left = per;
  for (const [pw, color] of PLATES[u]) while (left >= pw - 1e-9) { plates.push([pw, color]); left -= pw; }
  const maxP = PLATES[u][0][0];
  $('#plateOut').innerHTML = per < 0 ? `<p class="muted small">${t('plate.light')}</p>` : `
    <div class="plates"><div class="bar"></div><div class="sleeve"></div>${plates.map(([pw, c], i) => `<div class="plate" style="animation-delay:${i * 60}ms;background:${c};color:${['#eceff1', '#f9a825'].includes(c) ? '#222' : '#fff'};height:${50 + (pw / maxP) * 70}px;width:${pw >= 10 ? 22 : 15}px">${pw}</div>`).join('')}<div class="sleeve" style="width:30px"></div></div>
    <p style="text-align:center"><b>${t('perSide')}</b> ${plates.length ? plates.map(p => p[0]).join(' + ') : t('justBar')}${left > 1e-6 ? `<br><span class="muted small">${t('plate.rem', { n: num(left), u })}</span>` : ''}</p>`;

  const ww = TOOLS.warm || 0;
  const scheme = [[0, 10], [0.4, 5], [0.6, 3], [0.8, 2], [0.9, 1]];
  $('#warmOut').innerHTML = ww > TOOLS.bar ? `<table class="pr-table"><thead><tr><th>${t('th.set')}</th><th>${t('th.weight')}</th><th>${t('th.reps')}</th></tr></thead><tbody>
    ${scheme.map(([p, r], i) => `<tr><td>${t('st.W')}${i + 1}</td><td><b>${num(Math.max(TOOLS.bar, p ? round(ww * p) : TOOLS.bar))}</b> ${u}${p ? ` <span class="muted small">(${p * 100}%)</span>` : ` <span class="muted small">${t('emptyBar')}</span>`}</td><td>${r}</td></tr>`).join('')}
    <tr><td>${ic('flame', 'acc')}</td><td><b>${num(ww)}</b> ${u}</td><td>${t('workSets')}</td></tr></tbody></table>` : `<p class="muted small">${t('warm.enter')}</p>`;
}

// ============================================================ SETTINGS & SYNC
VIEWS.settings = () => {
  const p = S.profile;
  const swaps = Object.entries(S.swaps).filter(([o, a]) => EXMAP[o] && EXMAP[a]);
  return `<h1>${t('nav.settings')}</h1>
  ${installCard()}
  <div class="card"><h2>${t('profile')}</h2>
    <label class="field"><span>${t('name')}</span><input type="text" data-pref="name" value="${esc(p.name)}" placeholder="${t('name.ph')}"></label>
    <label class="field"><span>${t('bodyweightU', { u: U() })}</span><input type="number" inputmode="decimal" step="any" data-pref="bodyweight" value="${p.bodyweight ? num(toD(p.bodyweight)) : ''}"></label>
    <div class="row wrap" style="gap:16px">
      <div><div class="muted small">${t('language')}</div><div class="seg">${[['en', 'English'], ['es', 'Español']].map(([k, l]) => `<button class="${LANG() === k ? 'on' : ''}" data-act="pref" data-k="lang" data-v="${k}">${l}</button>`).join('')}</div></div>
      <div><div class="muted small">${t('theme')}</div><div class="seg">${[['auto', `${ic('contrast')} ${t('auto')}`], ['light', `${ic('sun')} ${t('light')}`], ['dark', `${ic('moon')} ${t('dark')}`]].map(([k, l]) => `<button class="${p.theme === k ? 'on' : ''}" data-act="pref" data-k="theme" data-v="${k}">${l}</button>`).join('')}</div></div>
      <div><div class="muted small">${t('units')}</div><div class="seg">${['kg', 'lb'].map(u => `<button class="${p.unit === u ? 'on' : ''}" data-act="pref" data-k="unit" data-v="${u}">${u}</button>`).join('')}</div></div>
      <div><div class="muted small">${t('defaultRest')}</div><div class="seg">${[60, 90, 120, 180].map(r => `<button class="${p.rest === r ? 'on' : ''}" data-act="pref" data-k="rest" data-v="${r}">${mmss(r)}</button>`).join('')}</div></div>
    </div></div>
  ${levelPicker(t('level.training'))}
  <div class="card"><h2>${ic('building')} ${t('equip.title')}</h2><p class="muted small">${t('equip.desc')}</p>
    <div class="toggle-chips">${sortBy(EQUIP.filter(e => e !== 'body only'), T).map(eq => `<button class="chip ${S.noEquip.includes(eq) ? 'off' : 'on'}" data-act="toggleEquip" data-v="${esc(eq)}">${ic(S.noEquip.includes(eq) ? 'x' : 'check')} ${esc(T(eq))}</button>`).join('')}</div></div>
  <div class="card"><h2>${ic('swap')} ${t('mySwaps')}</h2>
    ${swaps.length ? swaps.map(([o, a]) => `<div class="hist-item" style="cursor:default">${thumb(a, 48)}<div style="flex:1;min-width:0"><b>${esc(exName(a))}</b>
      <div class="muted small">${t('alt.for', { x: esc(exName(o)) })}</div></div>
      <button class="round-btn" data-act="altFor" data-orig="${esc(o)}" aria-label="${t('alt.btn')}">${ic('swap')}</button>
      <button class="round-btn" data-act="unswap" data-orig="${esc(o)}" aria-label="${t('alt.restore')}">${ic('undo')}</button></div>`).join('') : `<p class="muted small">${t('mySwaps.empty')}</p>`}</div>
  ${SERVER ? `<div class="card"><h2>${ic('wifi')} ${t('sync.title')}</h2>
    <p class="muted small">${t('sync.desc')}</p>
    <label class="field"><span>${t('sync.name')}</span><input type="text" data-pref="syncName" value="${esc(p.syncName)}" placeholder="${t('sync.ph')}" autocapitalize="off"></label>
    <div id="profileList" class="chips" style="margin-bottom:10px"></div>
    <label class="row small" style="margin-bottom:12px"><input type="checkbox" data-pref="autoSync" ${p.autoSync ? 'checked' : ''}> ${t('sync.auto')}</label>
    <button class="btn primary" data-act="syncNow">${ic('refresh')} ${t('sync.now')}</button> <span class="muted small" id="syncInfo"></span></div>` : ''}
  <div class="card"><h2>${ic('save')} ${t('backup')}</h2><div class="row wrap">
    <button class="btn ghost" data-act="export">${ic('download')} ${t('export')}</button>
    <label class="btn ghost">${ic('upload')} ${t('import')}<input type="file" accept="application/json,.json" id="importFile" hidden></label>
    <span class="spacer"></span><button class="btn danger" data-act="reset">${ic('trash')} ${t('reset')}</button></div></div>
  <div class="card small muted"><h3>${t('about')}</h3>${t('about.text', { link: '<a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener">yuhonas/free-exercise-db</a>', sync: p.syncName ? t('about.sync') : '' })}
    <p style="margin:10px 0 0">${t('version', { v: BUILD.startsWith('__') ? 'dev' : BUILD })}</p></div>`;
};
VIEWS.settings.mount = async () => {
  try {
    const names = await (await fetch('api/profiles')).json();
    const el = $('#profileList');
    if (el && names.length) el.innerHTML = `<span class="muted small">${t('sync.onServer')}</span>${names.map(n => `<button class="chip" data-act="pickProfile" data-v="${esc(n)}">${esc(n)}</button>`).join('')}`;
  } catch {}
};

let syncTimer;
function scheduleSync() { if (!SERVER) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(true), 2500); }

function mergeDocs(a, b) {
  const newer = (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a;
  const deleted = [...new Set([...(a.deleted || []), ...(b.deleted || [])])];
  const pick = items => {
    const byId = new Map();
    for (const x of items) if (!deleted.includes(x.id)) byId.set(x.id, byId.get(x.id) && newer !== b ? byId.get(x.id) : x);
    return [...byId.values()];
  };
  const out = hydrate({ ...newer, deleted, updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0) });
  out.workouts = pick([...a.workouts, ...b.workouts]);
  out.bodylog = pick([...(a.bodylog || []), ...(b.bodylog || [])]);
  out.routines = pick([...(a.routines || []), ...(b.routines || [])]);
  if (out.active && out.workouts.some(w => w.id === out.active.id)) out.active = null;
  return out;
}

async function syncNow(quiet = false) {
  const name = S.profile.syncName;
  if (!SERVER) return;
  if (!name) { if (!quiet) toast(t('sync.needName')); return; }
  const url = `api/profiles/${encodeURIComponent(name)}`;
  try {
    const r = await fetch(url);
    let remote = r.ok ? await r.json() : null;
    if (!remote || !Array.isArray(remote.workouts)) remote = null;
    const local = S;
    const merged = remote ? mergeDocs(local, remote) : local;
    // device-specific preferences stay local
    merged.profile = { ...merged.profile, theme: local.profile.theme, lang: local.profile.lang, syncName: local.profile.syncName, autoSync: local.profile.autoSync };
    const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(merged) });
    if (!put.ok) throw new Error(`HTTP ${put.status}`);
    const changed = JSON.stringify(merged) !== JSON.stringify(local);
    S = merged;
    persist();
    applyTheme();
    const info = $('#syncInfo');
    if (info) info.textContent = t('sync.last', { t: new Date().toLocaleTimeString(LOC()) });
    if (!quiet) toast(t('sync.ok', { n: esc(name), w: S.workouts.length }));
    // avoid stealing focus mid-typing during auto-sync
    if (changed && !(quiet && document.activeElement?.matches('input,textarea'))) render();
  } catch (err) {
    if (!quiet) toast(t('sync.fail', { e: esc(err.message) }));
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ironlog-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ============================================================ actions
const ACT = {
  close: () => { openProgramId = null; closeModal(); },
  install: async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    render();
  },
  dismissInstall: () => { S.installDismissed = true; persist(); render(); },

  // workout builder
  genTab: el => { GEN.tab = el.dataset.v; render({ animate: true }); },
  genGroup: el => {
    const g = el.dataset.g;
    GEN.groups = GEN.groups.includes(g) ? GEN.groups.filter(x => x !== g) : [...GEN.groups, g];
    el.classList.toggle('on', GEN.groups.includes(g));
  },
  genDur: el => { GEN.dur = el.dataset.v; render(); },
  genGoal: el => { GEN.goal = el.dataset.v; render(); },
  genRun: () => {
    if (!GEN.groups.length) return toast(t('gen.pickOne'));
    GEN.seed = (Date.now() % 100000) + 1;
    GEN.items = generate(GEN.groups, GEN, GEN.seed);
    for (const g of GEN.groups) if (!GEN.items.some(it => it[5] === g)) toast(t('gen.empty', { g: groupLabel(g) }));
    render({ animate: true });
    setTimeout(() => $$('.card')[1]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  },
  genShuffle: () => { GEN.seed++; GEN.items = generate(GEN.groups, GEN, GEN.seed); render({ animate: true }); },
  genReroll: el => {
    const i = +el.dataset.i, it = GEN.items[i];
    const used = new Set(GEN.items.map(x => x[0]));
    const pool = candidates(it[5]).filter(e => !used.has(e.id));
    if (!pool.length) return;
    const e = pool[Math.floor(Math.random() * pool.length)];
    const fresh = toItem(e, GEN.goal, it[5]);
    fresh[4] = it[4];
    GEN.items[i] = fresh;
    render();
  },
  genRemove: el => { GEN.items.splice(+el.dataset.i, 1); render(); },
  genStart: () => {
    if (!GEN.items?.length) return;
    startWorkout({ name: GEN.groups.map(groupLabel).join(' + '), items: GEN.items });
  },
  genSave: () => {
    const name = prompt(t('routine.name'), GEN.groups.map(groupLabel).join(' + '));
    if (!name) return;
    S.routines.push({ id: uid(), name: name.slice(0, 60), items: GEN.items.map(it => it.slice(0, 5)) });
    save(); toast(t('routine.saved'));
  },
  weekDays: el => {
    const n = +el.dataset.v;
    while (GEN.days.length < n) GEN.days.push([]);
    GEN.days.length = n;
    render();
  },
  weekPreset: el => { GEN.days = SPLITS[el.dataset.v].map(d => [...d]); render({ animate: true }); },
  weekGroup: el => {
    const d = GEN.days[+el.dataset.d], g = el.dataset.g;
    GEN.days[+el.dataset.d] = d.includes(g) ? d.filter(x => x !== g) : [...d, g];
    render();
  },
  weekCreate: () => {
    const empty = GEN.days.findIndex(d => !d.length);
    if (empty >= 0) return toast(t('week.emptyDay', { n: empty + 1 }));
    const n = GEN.days.length;
    const both = key => ({ en: I18N.en[key], es: I18N.es[key] });
    const prog = {
      id: `my-${uid()}`, custom: true, level: S.profile.level || 'beginner', perWeek: n, weeks: 8,
      name: { en: I18N.en['week.name'].replace('{n}', n), es: I18N.es['week.name'].replace('{n}', n) },
      goal: both(`goal.${GEN.goal}`), desc: both('week.desc'),
      days: GEN.days.map((groups, di) => ({
        name: { en: groups.map(g => groupLabelIn(g, 'en')).join(' + '), es: groups.map(g => groupLabelIn(g, 'es')).join(' + ') },
        items: generate(groups, GEN, (Date.now() % 100000) + di * 7919).map(it => it.slice(0, 5)),
      })),
    };
    S.myPrograms.push(prog);
    S.program = { id: prog.id, next: 0 };
    save();
    toast(t('week.created'));
    go('programs');
    setTimeout(() => showProgram(prog.id), 300);
  },
  delProgram: el => {
    if (!confirm(t('delProgram.confirm'))) return;
    S.myPrograms = S.myPrograms.filter(p => p.id !== el.dataset.id);
    if (S.program.id === el.dataset.id) S.program = { id: null, next: 0 };
    save(); openProgramId = null; closeModal(); render();
  },
  toggleTheme: el => withReveal(el, () => { S.profile.theme = resolvedTheme() === 'dark' ? 'light' : 'dark'; save(); applyTheme(); if (location.hash === '#settings') render(); }),
  toggleLang: () => { S.profile.lang = LANG() === 'es' ? 'en' : 'es'; save(); applyStaticI18n(); closeModal(); render({ animate: true }); },
  setLevel: el => {
    const k = el.dataset.level;
    S.profile.level = k; PRG.level = null; save();
    toast(t('lvl.set', { icon: ic(LEVEL_ICONS[k]), level: t(`lvl.${k}`) }));
    render();
  },
  prgLevel: el => { PRG.level = el.dataset.level; render({ animate: true }); },
  showProgram: el => showProgram(el.dataset.id),
  followProgram: el => {
    const p = findProgram(x => x.id === el.dataset.id);
    S.program = { id: p.id, next: 0 };
    if (!S.profile.level) S.profile.level = p.level;
    save(); toast(t('following.toast', { p: esc(L(p.name)) })); showProgram(p.id); render();
  },
  startDay: el => {
    const p = findProgram(x => x.id === el.dataset.prog), di = +el.dataset.day;
    openProgramId = null;
    startWorkout({ name: `${L(p.name)} — ${L(p.days[di].name)}`, items: p.days[di].items, programId: p.id, dayIdx: di });
  },
  startEmpty: () => startWorkout({ name: cap(woName()) }),
  startRoutine: el => { const r = S.routines.find(x => x.id === el.dataset.id); startWorkout({ name: r.name, items: r.items }); },
  delRoutine: el => { if (confirm(t('delRoutine.confirm'))) { S.deleted.push(el.dataset.id); S.routines = S.routines.filter(x => x.id !== el.dataset.id); save(); render(); } },
  saveRoutine: el => {
    const w = S.workouts.find(x => x.id === el.dataset.id);
    const name = prompt(t('routine.name'), w.name);
    if (!name) return;
    S.routines.push({ id: uid(), name: name.slice(0, 60), items: itemsFrom(w) });
    save(); toast(t('routine.saved')); render();
  },
  repeat: el => { const w = S.workouts.find(x => x.id === el.dataset.id); startWorkout({ name: w.name, items: itemsFrom(w), programId: w.programId, dayIdx: w.dayIdx }); },
  startWith: el => startWorkout({ name: t('session', { x: exName(el.dataset.id) }), items: [[el.dataset.id, 3, '', S.profile.rest]] }),

  libCat: el => { LIB.cat = el.dataset.cat; LIB.limit = 48; $$('[data-act=libCat]').forEach(b => b.classList.toggle('on', b === el)); renderGrid(); },
  libFav: el => { LIB.fav = !LIB.fav; LIB.limit = 48; el.classList.toggle('on-gold', LIB.fav); renderGrid(); },
  libMore: () => { LIB.limit += 48; renderGrid(false); },
  showEx: el => { openProgramId = null; showEx(el.dataset.id); },
  fav: el => {
    const id = el.dataset.id;
    S.favorites = S.favorites.includes(id) ? S.favorites.filter(x => x !== id) : [...S.favorites, id];
    save(); el.innerHTML = S.favorites.includes(id) ? `${ic('star', 'fill gold')} ${t('faved')}` : `${ic('star')} ${t('fav')}`;
    if (location.hash === '#library') renderGrid(false);
  },
  demoToggle: el => {
    if (demoTimer) { clearInterval(demoTimer); demoTimer = null; el.innerHTML = `${ic('play', 'fill')} ${t('play')}`; return; }
    startDemo(); el.innerHTML = `${ic('pause', 'fill')} ${t('pause')}`;
  },
  addEx: el => { pushExercise(el.dataset.id); save(); closeModal(); go('workout'); toast(t('added', { x: esc(exName(el.dataset.id)) })); },
  openPicker: () => openPicker(),
  pickMuscle: el => { PICK.muscle = el.dataset.m; renderPick(); },
  pickEx: el => {
    const id = el.dataset.id;
    if (PICK.alt) return applyAlt(id);
    if (!S.active) { closeModal(); return startWorkout({ name: t('session', { x: exName(id) }), items: [[id, 3, '', S.profile.rest]] }); }
    if (PICK.replace != null) { const old = S.active.exercises[PICK.replace]; pushExercise(id, { sets: old.sets.length, target: old.target, rest: old.rest }, PICK.replace); }
    else pushExercise(id);
    save(); closeModal(); render();
    if (PICK.replace == null) setTimeout(() => $$('.wo-ex').pop()?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  },

  // alternatives: from a program item / exercise page (data-orig) or from the active workout (data-e)
  altFor: el => {
    if (el.dataset.e != null) { const e = S.active.exercises[+el.dataset.e]; openAlt(e.orig || e.id, +el.dataset.e); }
    else openAlt(el.dataset.orig);
  },
  altPick: el => applyAlt(el.dataset.id),
  altAny: () => { const keepProg = openProgramId; openPicker({ alt: true }); openProgramId = keepProg; },
  unswap: el => { delete S.swaps[el.dataset.orig]; save(); toast(t('alt.restored')); render(); },
  toggleEquip: el => {
    const v = el.dataset.v;
    S.noEquip = S.noEquip.includes(v) ? S.noEquip.filter(x => x !== v) : [...S.noEquip, v];
    save(); render();
  },

  toggleSet: el => {
    const ei = +el.dataset.e, si = +el.dataset.s, e = S.active.exercises[ei], s = e.sets[si];
    if (!s.done) {
      if (!(s.r > 0)) { toast(t('enterReps')); return; }
      if (s.w == null) s.w = 0;
      s.done = true;
      checkPR(ei, si);
      const nx = e.sets[si + 1];
      if (nx && !nx.done) { if (nx.w == null) nx.w = s.w; if (nx.r == null) nx.r = s.r; }
      // superset (biserie): no rest between the paired exercises, rest after the last one of the pair
      const nextEx = S.active.exercises[ei + 1];
      if (e.ss && nextEx?.ss === e.ss) stopRest(); else startRest(e.rest || S.profile.rest);
      navigator.vibrate?.(15);
    } else {
      s.done = false; delete s.pr;
    }
    save();
    JUST = s.done ? [ei, si] : null;
    render();
  },
  setType: el => {
    const s = S.active.exercises[+el.dataset.e].sets[+el.dataset.s];
    s.t = { N: 'W', W: 'D', D: 'F', F: 'N' }[s.t];
    if (s.t === 'W') delete s.pr;
    save(); render();
  },
  addSet: el => {
    const e = S.active.exercises[+el.dataset.e], last = e.sets[e.sets.length - 1];
    e.sets.push({ w: last?.w ?? null, r: last?.r ?? null, done: false, t: 'N' });
    save(); render();
  },
  rmSet: el => {
    const e = S.active.exercises[+el.dataset.e];
    if (e.sets.length > 1) { e.sets.pop(); save(); render(); }
  },
  exMenu: el => {
    const i = +el.dataset.e, e = S.active.exercises[i];
    openModal(`<button class="close" data-act="close" aria-label="Close">${ic('x')}</button><h2>${esc(exName(e.id))}</h2><div class="grid">
      <button class="btn ghost big" data-act="showEx" data-id="${esc(e.id)}">${ic('info')} ${t('exMenu.howto')}</button>
      <button class="btn ghost big" data-act="altFor" data-e="${i}">${ic('swap')} ${t('alt.btn')}</button>
      <button class="btn ghost big" data-act="replaceEx" data-e="${i}">${ic('repeat')} ${t('exMenu.replace')}</button>
      <div class="row"><button class="btn ghost big" data-act="moveEx" data-e="${i}" data-d="-1" ${i ? '' : 'disabled'}>${ic('arrowUp')} ${t('moveUp')}</button>
        <button class="btn ghost big" data-act="moveEx" data-e="${i}" data-d="1" ${i < S.active.exercises.length - 1 ? '' : 'disabled'}>${ic('arrowDown')} ${t('moveDown')}</button></div>
      <div><div class="muted small">${t('restFor')}</div><div class="seg">${[45, 60, 90, 120, 180, 240].map(r => `<button class="${e.rest === r ? 'on' : ''}" data-act="restEx" data-e="${i}" data-v="${r}">${mmss(r)}</button>`).join('')}</div></div>
      <button class="btn danger big" data-act="rmEx" data-e="${i}">${ic('trash')} ${t('removeEx')}</button></div>`);
  },
  replaceEx: el => openPicker({ replace: +el.dataset.e }),
  moveEx: el => {
    const i = +el.dataset.e, j = i + +el.dataset.d, xs = S.active.exercises;
    [xs[i], xs[j]] = [xs[j], xs[i]];
    save(); closeModal(); render();
  },
  restEx: el => { S.active.exercises[+el.dataset.e].rest = +el.dataset.v; save(); closeModal(); render(); },
  rmEx: el => { S.active.exercises.splice(+el.dataset.e, 1); save(); closeModal(); render(); },
  cancelWo: () => { if (confirm(t('discardConfirm'))) { S.active = null; save(); stopRest(); render(); } },
  finishWo: finishWorkout,
  showWorkout: el => showWorkout(el.dataset.id),
  delWorkout: el => {
    if (!confirm(t('delWoConfirm'))) return;
    S.workouts = S.workouts.filter(w => w.id !== el.dataset.id);
    S.deleted.push(el.dataset.id);
    save(); closeModal(); render();
  },
  histAll: () => { PROG.all = true; render(); },
  addBw: () => {
    const v = parseFloat($('#bwIn').value);
    if (!(v > 0)) return toast(t('bw.enter'));
    const kg = fromD(v);
    S.bodylog.push({ id: uid(), t: Date.now(), kg });
    S.profile.bodyweight = kg;
    save(); toast(t('bw.logged')); render();
  },
  undoBw: () => {
    const last = [...S.bodylog].sort((a, b) => a.t - b.t).pop();
    if (!last) return;
    S.bodylog = S.bodylog.filter(e => e !== last);
    S.deleted.push(last.id);
    save(); render();
  },
  pref: el => {
    const k = el.dataset.k, v = el.dataset.v;
    const apply = () => {
      S.profile[k] = k === 'rest' ? +v : v;
      save(); applyStaticI18n(); render({ animate: k === 'lang' });
    };
    if (k === 'theme') withReveal(el, apply); else apply();
  },
  pickProfile: el => { S.profile.syncName = el.dataset.v; save(); render(); },
  syncNow: () => syncNow(false),
  export: exportData,
  reset: () => {
    if (!confirm(t('reset.c1'))) return;
    if (!confirm(t('reset.c2'))) return;
    localStorage.removeItem(KEY); S = DEFAULTS(); applyStaticI18n(); stopRest(); go('home');
  },
};

document.addEventListener('click', ev => {
  if (ev.target === $('#modal')) { openProgramId = null; return closeModal(); }
  const r = ev.target.closest('[data-rest]');
  if (r && rest) {
    const v = r.dataset.rest;
    if (v === 'skip') stopRest();
    else { rest.end += +v * 1000; rest.total = Math.max(rest.total, Math.round((rest.end - Date.now()) / 1000)); rest.beeped = false; $('#restTimer').classList.remove('done'); tick(); }
    return;
  }
  const g = ev.target.closest('[data-go]');
  if (g) { ev.preventDefault(); return go(g.dataset.go); }
  const a = ev.target.closest('[data-act]');
  if (a && ACT[a.dataset.act]) { ev.preventDefault(); ACT[a.dataset.act](a); }
});

document.addEventListener('input', ev => {
  const el = ev.target;
  if (el.dataset.f && S.active) {
    const s = S.active.exercises[+el.dataset.e].sets[+el.dataset.s];
    const v = parseFloat(el.value);
    s[el.dataset.f] = isNaN(v) ? null : el.dataset.f === 'w' ? fromD(v) : Math.round(v);
    persist(); updateWoStats();
    return;
  }
  if (el.id === 'woName' && S.active) { S.active.name = el.value; persist(); return; }
  if (el.id === 'woNote' && S.active) { S.active.note = el.value; persist(); return; }
  if (el.id === 'libQ') { LIB.q = el.value; LIB.limit = 48; renderGrid(false); return; }
  if (el.id === 'pickQ') { PICK.q = el.value; renderPick(); return; }
  if (el.dataset.tool) { TOOLS[el.dataset.tool] = parseFloat(el.value) || 0; updateTools(); return; }
  if (el.dataset.pref === 'syncName') {
    const clean = el.value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
    if (clean !== el.value) el.value = clean;
    S.profile.syncName = clean; persist();
  }
});

document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.dataset.f && S.active) {
    // edits are saved with a timestamp (and synced) once the field is committed
    const ei = +el.dataset.e, si = +el.dataset.s, s = S.active.exercises[ei].sets[si];
    if (s.done) { checkPR(ei, si); el.closest('tr').classList.toggle('pr', !!s.pr); }
    save();
    return;
  }
  if (el.id === 'woName' || el.id === 'woNote') { save(); return; }
  if (el.dataset.lib) { LIB[el.dataset.lib] = el.value; LIB.limit = 48; renderGrid(); return; }
  if (el.id === 'progEx') { PROG.ex = el.value; render(); return; }
  if (el.id === 'genSS') { GEN.ss = el.checked; return; }
  if (el.dataset.pref) {
    const k = el.dataset.pref;
    if (k === 'name') S.profile.name = el.value.trim().slice(0, 40);
    if (k === 'bodyweight') { const v = parseFloat(el.value); S.profile.bodyweight = v > 0 ? fromD(v) : null; }
    if (k === 'autoSync') { S.profile.autoSync = el.checked; if (el.checked) syncNow(false); }
    save();
    return;
  }
  if (el.id === 'importFile' && el.files[0]) {
    el.files[0].text().then(txt => {
      const doc = JSON.parse(txt);
      if (!doc || !Array.isArray(doc.workouts)) throw new Error(t('import.bad'));
      const replace = confirm(t('import.confirm', { n: doc.workouts.length }));
      S = replace ? hydrate(doc) : mergeDocs(S, hydrate(doc));
      save(); applyStaticI18n(); toast(t('import.ok')); render();
    }).catch(err => toast(t('import.fail', { e: esc(err.message) })));
  }
});

document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') { openProgramId = null; closeModal(); }
  if (ev.key === 'Enter' && ev.target.dataset?.f) ev.target.blur();
});

// Pull newer data from other devices when this tab comes back to the foreground
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.profile.autoSync && S.profile.syncName) syncNow(true);
});

// ============================================================ PWA: install, offline, image fallback
// If jsDelivr can't serve a photo, retry from raw GitHub once
document.addEventListener('error', ev => {
  const el = ev.target;
  if (el.tagName === 'IMG' && el.src.startsWith(IMG_CDN)) el.src = IMG_RAW + el.src.slice(IMG_CDN.length);
}, true);

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let installPrompt = null;
window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); installPrompt = ev; if (['#home', '', '#settings'].includes(location.hash)) render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; toast(t('install.done')); render(); });

function installCard({ dismissible = false } = {}) {
  if (isStandalone()) return '';
  if (dismissible && S.installDismissed) return '';
  const close = dismissible ? `<button class="round-btn" data-act="dismissInstall" aria-label="${t('install.later')}">${ic('x')}</button>` : '';
  if (installPrompt) {
    return `<div class="card install"><div class="row"><span class="install-ic">${ic('install')}</span><div style="flex:1"><b>${t('install.title')}</b>
      <div class="muted small">${t('install.sub')}</div></div>${close}</div>
      <button class="btn primary big" data-act="install" style="margin-top:12px">${ic('download')} ${t('install.btn')}</button></div>`;
  }
  if (isIOS()) {
    return `<div class="card install"><div class="row"><span class="install-ic">${ic('install')}</span><div style="flex:1"><b>${t('install.title')}</b>
      <div class="muted small">${t('install.ios', { share: `<span class="kbd">${ic('share')}</span>`, add: `<span class="kbd">${ic('plusSquare')} ${t('install.iosAdd')}</span>` })}</div></div>${close}</div></div>`;
  }
  return '';
}

// ---- updates: a new deploy installs in the background, then the user is offered a one-tap reload
const BUILD = '__BUILD__'; // replaced with the commit id by the deploy workflow
let updateReg = null, updateRequested = false;

function showUpdate(reg) {
  updateReg = reg;
  if ($('#updateBar')) return;
  const bar = document.createElement('div');
  bar.id = 'updateBar';
  bar.className = 'update-bar';
  bar.innerHTML = `${ic('sparkles', 'acc')}<span>${t('update.ready')}</span><button class="btn primary sm" data-act="applyUpdate">${ic('refresh')} ${t('update.reload')}</button>`;
  document.body.append(bar);
}
ACT.applyUpdate = () => {
  updateRequested = true;
  if (updateReg?.waiting) updateReg.waiting.postMessage({ type: 'SKIP_WAITING' });
  else location.reload();
};

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(reg);
      });
    });
    // installed apps can stay open for days: check when brought back to the foreground and every 30 minutes
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => {});
  // the new worker took over after "Reload": load the new files
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateRequested) location.reload(); });
}

// ============================================================ boot
(async function init() {
  applyStaticI18n();
  fetch('api/health').then(r => (r.ok ? r.json() : null)).then(j => {
    if (j?.ironlog) { SERVER = true; if (location.hash === '#settings') render(); if (S.profile.autoSync && S.profile.syncName) syncNow(true); }
  }).catch(() => {});
  try {
    const [ex, es] = await Promise.all([
      fetch('data/exercises.json').then(r => r.json()),
      fetch('i18n/exercises.es.json').then(r => (r.ok ? r.json() : {})).catch(() => ({})),
    ]);
    EX = ex; ES = es;
  } catch {
    $('#view').innerHTML = `<div class="empty"><div class="big">${ic('plug')}</div><p>${t('loadFail')}</p></div>`;
    return;
  }
  for (const e of EX) EXMAP[e.id] = e;
  const uniq = f => [...new Set(EX.flatMap(f).filter(Boolean))].sort();
  MUSCLES = uniq(e => e.primaryMuscles);
  EQUIP = uniq(e => [e.equipment]);
  CATS = uniq(e => [e.category]);
  render();
})();
