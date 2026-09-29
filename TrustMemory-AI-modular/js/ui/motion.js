/**
 * Motion layer: page-enter and scroll reveal, count-up numbers, card tilt, the sliding nav
 * marker, scroll progress, a compact header, and the 3D memory constellation.
 *
 * It only observes the DOM that the pages render, so no page needs to know about it.
 * Everything is skipped with prefers-reduced-motion (the constellation then draws one still frame).
 */
const MOTION = {
  reduced: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  fine: typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches,
  lastPage: null,
  numbers: {},
  io: null,
};

/* ------------------------------------------------------------------ reveal */

const REVEAL_SEL = '.tm-hero, .pagehead, .section > h2, .grid > *, .section > .card, .card, .alert, .detail-head';

function motionReveal(root, fresh){
  if(MOTION.reduced) return;
  const els = Array.from(root.querySelectorAll(REVEAL_SEL)).filter(el => !el.closest('.rv') || el.classList.contains('rv'));
  let i = 0;
  els.forEach(el => {
    if(el.dataset.rvDone) return;
    el.dataset.rvDone = '1';
    if(!fresh) return;                       // a re-render of the same page: no entrance again
    el.classList.add('rv');
    const r = el.getBoundingClientRect();
    if(r.top < innerHeight){
      el.style.setProperty('--i', Math.min(i++, 14));
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
      setTimeout(() => el.classList.add('in'), 700);   // frames can be throttled; never leave content hidden
    } else {
      MOTION.io.observe(el);
    }
  });
}

/* ------------------------------------------------------------------ count-up numbers */

function motionCount(root){
  root.querySelectorAll('.metric .num, .hero-stats b').forEach(el => {
    const text = el.textContent.trim();
    const m = text.match(/^(\d+(?:\.\d+)?)(%?)$/);
    if(!m || el.dataset.counted === text) return;
    const label = (el.parentElement.querySelector('.label') || el.nextSibling || {}).textContent || el.parentElement.textContent;
    const key = route.page + '|' + String(label).trim().slice(0, 40);
    const to = parseFloat(m[1]);
    const from = MOTION.numbers[key] != null ? MOTION.numbers[key] : 0;
    MOTION.numbers[key] = to;
    el.dataset.counted = text;
    if(MOTION.reduced || from === to) return;
    const dec = m[1].includes('.') ? 1 : 0;
    const t0 = performance.now(), dur = 900;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      el.textContent = (from + (to - from) * e).toFixed(dec) + m[2];
      if(k < 1) requestAnimationFrame(step); else el.textContent = text;
    };
    requestAnimationFrame(step);
  });
}

/* ------------------------------------------------------------------ tilt + sheen */

function motionTilt(){
  if(MOTION.reduced || !MOTION.fine) return;
  document.addEventListener('pointermove', e => {
    const el = e.target.closest && e.target.closest('.metric, [data-tilt]');
    if(!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', (x * 100) + '%');
    el.style.setProperty('--my', (y * 100) + '%');
    el.style.setProperty('--ty', ((x - .5) * 6).toFixed(2) + 'deg');
    el.style.setProperty('--tx', ((.5 - y) * 6).toFixed(2) + 'deg');
  }, {passive: true});
  document.addEventListener('pointerout', e => {
    const el = e.target.closest && e.target.closest('.metric, [data-tilt]');
    if(el && !el.contains(e.relatedTarget)){ el.style.setProperty('--tx', '0deg'); el.style.setProperty('--ty', '0deg'); }
  }, {passive: true});
}

/* ------------------------------------------------------------------ nav glider, progress, compact header, rail glow */

function motionGlider(){
  const list = document.getElementById('navlist');
  if(!list) return;
  let g = list.querySelector('.nav-glider');
  if(!g){ g = document.createElement('div'); g.className = 'nav-glider'; list.prepend(g); }
  const active = list.querySelector('button.active');
  if(!active){ g.style.opacity = '0'; return; }
  g.style.opacity = '1';
  g.style.height = active.offsetHeight + 'px';
  g.style.transform = `translateY(${active.offsetTop}px)`;   // #navlist is the offset parent
}

function motionChrome(){
  const bar = document.createElement('div'); bar.className = 'tm-progress';
  const compact = document.createElement('div'); compact.className = 'tm-compact';
  document.body.append(bar, compact);
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.setProperty('--p', max > 0 ? (scrollY / max).toFixed(4) : 0);
    const head = document.querySelector('#content .pagehead h1, #content .tm-hero h1, #content .detail-head h1');
    const show = head && head.getBoundingClientRect().bottom < 0;
    if(show){
      const eb = document.querySelector('#content .pagehead .eyebrow, #content .tm-hero .eyebrow');
      compact.innerHTML = `${eb ? `<span class="eb">${escapeHtml(eb.textContent)}</span>` : ''}<span>${escapeHtml(head.textContent)}</span>`;
    }
    compact.classList.toggle('on', Boolean(show));
  };
  addEventListener('scroll', onScroll, {passive: true});
  addEventListener('resize', onScroll, {passive: true});
  const rail = document.getElementById('rail');
  if(rail && MOTION.fine && !MOTION.reduced){
    rail.addEventListener('pointermove', e => {
      const r = rail.getBoundingClientRect();
      rail.style.setProperty('--rx', ((e.clientX - r.left) / r.width * 100) + '%');
      rail.style.setProperty('--ry', ((e.clientY - r.top) / r.height * 100) + '%');
    }, {passive: true});
  }
  return onScroll;
}

/* ------------------------------------------------------------------ 3D memory constellation */

const CONSTELLATIONS = new Map();

/**
 * A slowly turning sphere of the agency's memory: helpers (brass) and households (teal) as
 * anchors, placements as links between them, and memory nodes from the Hindsight bank as dust
 * around each anchor. Drag to turn it; hover names an anchor; click opens it.
 */
function motionConstellation(host){
  if(CONSTELLATIONS.has(host)) return CONSTELLATIONS.get(host);
  const canvas = document.createElement('canvas');
  const tip = document.createElement('div'); tip.className = 'tip';
  host.prepend(canvas); host.append(tip);
  const ctx = canvas.getContext('2d');
  const view = MOTION.view || (MOTION.view = {yaw: 0.6, pitch: -0.25});
  const state = {yaw: view.yaw, pitch: view.pitch, vyaw: MOTION.reduced ? 0 : 0.0022, drag: null, hover: null, visible: true, w: 0, h: 0, dpr: 1, t: 0};

  // Anchors on a Fibonacci sphere, so they spread evenly whatever the roster size.
  const helpers = (S.helpers || []).map(h => ({kind: 'helper', id: h.id, name: h.name}));
  const households = (S.households || []).map(h => ({kind: 'household', id: h.id, name: h.name}));
  const anchors = helpers.concat(households);
  const n = anchors.length || 1;
  anchors.forEach((a, i) => {
    const y = 1 - (i + .5) / n * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963;
    a.p = [Math.cos(th) * r, y, Math.sin(th) * r];
    a.pulse = 0;
  });
  const byId = Object.fromEntries(anchors.map(a => [a.id, a]));
  const links = (S.placements || []).map(p => [byId[p.helperId], byId[p.householdId], p.status]).filter(l => l[0] && l[1]);

  // Memory dust: the bank's node count spread across anchors (capped for speed).
  const stats = typeof MEMUI !== 'undefined' && MEMUI.cache.stats && MEMUI.cache.stats.stats;
  const totalNodes = stats ? stats.total_nodes || 0 : 0;
  const dustCount = Math.min(420, Math.max(anchors.length * 10, totalNodes));
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const dust = [];
  for(let i = 0; i < dustCount; i++){
    const a = anchors[i % n];
    if(!a) break;
    const s = .10 + rnd() * .22, u = rnd() * Math.PI * 2, v = Math.acos(2 * rnd() - 1);
    const d = [a.p[0] + s * Math.sin(v) * Math.cos(u), a.p[1] + s * Math.sin(v) * Math.sin(u), a.p[2] + s * Math.cos(v)];
    const len = Math.hypot(d[0], d[1], d[2]) || 1, k = (1 + (rnd() - .5) * .18) / len;
    dust.push({p: [d[0] * k, d[1] * k, d[2] * k], a, tw: rnd() * Math.PI * 2});
  }

  function resize(){
    const r = host.getBoundingClientRect();
    state.dpr = Math.min(2, devicePixelRatio || 1);
    state.w = r.width; state.h = r.height;
    canvas.width = Math.round(r.width * state.dpr); canvas.height = Math.round(r.height * state.dpr);
    if(!state.raf) draw();
  }

  function project(p){
    const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw), cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    const x1 = p[0] * cy - p[2] * sy, z1 = p[0] * sy + p[2] * cy;
    const y2 = p[1] * cp - z1 * sp, z2 = p[1] * sp + z1 * cp;
    const R = Math.min(state.w, state.h) * .40, f = 3.2;
    const k = f / (f + z2);
    return {x: state.w / 2 + x1 * R * k, y: state.h / 2 + y2 * R * k, z: z2, k};
  }

  function draw(){
    const {w, h, dpr} = state;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    state.t += 1;
    anchors.forEach(a => { a.s = project(a.p); a.pulse = Math.max(0, a.pulse - .012); });

    // Faint globe outline gives the depth a reference.
    const R = Math.min(w, h) * .40;
    const g = ctx.createRadialGradient(w / 2 - R * .3, h / 2 - R * .3, R * .1, w / 2, h / 2, R * 1.05);
    g.addColorStop(0, 'rgba(237,233,223,.07)'); g.addColorStop(1, 'rgba(237,233,223,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(w / 2, h / 2, R * 1.02, 0, Math.PI * 2); ctx.fill();

    // Dust (memory nodes) and their threads to the anchor.
    dust.forEach(d => {
      const s = project(d.p), depth = (1 - s.z) / 2;
      const tw = .55 + .45 * Math.sin(state.t * .03 + d.tw);
      ctx.strokeStyle = `rgba(237,233,223,${(.035 + depth * .05).toFixed(3)})`;
      ctx.lineWidth = .6;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(d.a.s.x, d.a.s.y); ctx.stroke();
      ctx.fillStyle = `rgba(237,233,223,${(.18 + depth * .5 * tw).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, .7 + depth * 1.1, 0, Math.PI * 2); ctx.fill();
    });

    // Placements: helper to household.
    links.forEach(([a, b, status]) => {
      const depth = (2 - a.s.z - b.s.z) / 4;
      const grad = ctx.createLinearGradient(a.s.x, a.s.y, b.s.x, b.s.y);
      const bad = status === 'failed' || status === 'ended_poor_fit';
      grad.addColorStop(0, `rgba(224,184,116,${(.15 + depth * .5).toFixed(3)})`);
      grad.addColorStop(1, bad ? `rgba(196,98,86,${(.15 + depth * .5).toFixed(3)})` : `rgba(120,170,150,${(.15 + depth * .5).toFixed(3)})`);
      ctx.strokeStyle = grad; ctx.lineWidth = .8 + depth * 1.2;
      ctx.setLineDash(bad ? [3, 4] : []);
      const mx = (a.s.x + b.s.x) / 2 + (h / 2 - (a.s.y + b.s.y) / 2) * .15, my = (a.s.y + b.s.y) / 2 - (w / 2 - (a.s.x + b.s.x) / 2) * .15;
      ctx.beginPath(); ctx.moveTo(a.s.x, a.s.y); ctx.quadraticCurveTo(mx, my, b.s.x, b.s.y); ctx.stroke();
    });
    ctx.setLineDash([]);

    // Anchors, far to near.
    anchors.slice().sort((a, b) => b.s.z - a.s.z).forEach(a => {
      const depth = (1 - a.s.z) / 2, r = 2.6 + depth * 3.4;
      const col = a.kind === 'helper' ? [224, 184, 116] : [120, 170, 150];
      if(a.alert){
        const ring = r + 5 + 3 * Math.sin(state.t * .08);
        ctx.strokeStyle = `rgba(214,110,96,${(.35 + depth * .4).toFixed(3)})`; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(a.s.x, a.s.y, ring, 0, Math.PI * 2); ctx.stroke();
      }
      if(a.pulse > 0){
        ctx.strokeStyle = `rgba(255,255,255,${a.pulse.toFixed(3)})`; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(a.s.x, a.s.y, r + (1 - a.pulse) * 26, 0, Math.PI * 2); ctx.stroke();
      }
      const glow = ctx.createRadialGradient(a.s.x, a.s.y, 0, a.s.x, a.s.y, r * 3.2);
      glow.addColorStop(0, `rgba(${col},${(.35 + depth * .35).toFixed(3)})`); glow.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(a.s.x, a.s.y, r * 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(${col},${(.55 + depth * .45).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(a.s.x, a.s.y, r, 0, Math.PI * 2); ctx.fill();
      if(a === state.hover){ ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(a.s.x, a.s.y, r + 3, 0, Math.PI * 2); ctx.stroke(); }
    });
  }

  function loop(){
    state.raf = null;
    if(!document.body.contains(host)){ stop(); return; }
    if(!state.drag){ state.yaw += state.vyaw; state.vyaw += ((MOTION.reduced ? 0 : 0.0022) - state.vyaw) * .02; }
    draw();
    view.yaw = state.yaw; view.pitch = state.pitch;   // re-renders continue where the sphere was
    if(state.visible && !document.hidden && !MOTION.reduced) state.raf = requestAnimationFrame(loop);
  }
  function start(){ if(!document.body.contains(host)){ stop(); return; } if(!state.raf && !MOTION.reduced) state.raf = requestAnimationFrame(loop); }
  function stop(){ if(state.raf) cancelAnimationFrame(state.raf); state.raf = null; ro.disconnect(); vis.disconnect(); document.removeEventListener('visibilitychange', onVisibility); CONSTELLATIONS.delete(host); }
  function onVisibility(){ if(!document.hidden) start(); }

  function pick(e){
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 14;
    anchors.forEach(a => { if(!a.s || a.s.z > .35) return; const d = Math.hypot(a.s.x - x, a.s.y - y); if(d < bd){ bd = d; best = a; } });
    return best;
  }
  canvas.addEventListener('pointerdown', e => { state.drag = {x: e.clientX, y: e.clientY, yaw: state.yaw, pitch: state.pitch, moved: false}; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if(state.drag){
      const dx = e.clientX - state.drag.x, dy = e.clientY - state.drag.y;
      if(Math.abs(dx) + Math.abs(dy) > 3) state.drag.moved = true;
      const ny = state.drag.yaw + dx * .008;
      state.vyaw = (ny - state.yaw) * .5;
      state.yaw = ny;
      state.pitch = Math.max(-1.1, Math.min(1.1, state.drag.pitch + dy * .006));
      if(MOTION.reduced) draw();
      return;
    }
    const a = pick(e);
    state.hover = a;
    canvas.style.cursor = a ? 'pointer' : 'grab';
    if(a){
      tip.textContent = a.name + (a.alert ? ' · needs attention' : '') + (a.kind === 'helper' ? ' · helper' : ' · household');
      tip.style.left = a.s.x + 'px'; tip.style.top = a.s.y + 'px'; tip.classList.add('on');
    } else tip.classList.remove('on');
    if(MOTION.reduced) draw();
  });
  canvas.addEventListener('pointerup', e => {
    const moved = state.drag && state.drag.moved;
    state.drag = null;
    if(!moved && !document.body.classList.contains('auth-locked')){ const a = pick(e); if(a) nav(a.kind === 'helper' ? 'helperDetail' : 'householdDetail', a.id); }
  });
  canvas.addEventListener('pointerleave', () => { state.hover = null; tip.classList.remove('on'); });

  // A re-render replaces the host; the first observer callback after that releases this instance.
  const ro = new ResizeObserver(() => { if(!document.body.contains(host)){ stop(); return; } resize(); }); ro.observe(host);
  const vis = new IntersectionObserver(es => { state.visible = es[0].isIntersecting; if(state.visible) start(); }); vis.observe(host);
  document.addEventListener('visibilitychange', onVisibility);
  resize(); start();

  const api = {
    /** Mark anchors that need attention (rust ring) and pulse them once. */
    alert(ids){ const set = new Set(ids); anchors.forEach(a => { const was = a.alert; a.alert = set.has(a.id); if(a.alert && !was) a.pulse = 1; }); },
    pulse(id){ if(byId[id]) byId[id].pulse = 1; },
    counts: {helpers: helpers.length, households: households.length, links: links.length, nodes: totalNodes},
  };
  CONSTELLATIONS.set(host, api);
  return api;
}

/** Hero markup with a constellation; pages call it and the observer mounts the canvas. */
function motionHero({eyebrow, title, lede, stats}){
  return `<div class="tm-hero">
    <div style="position:relative; z-index:1;">
      <div class="eyebrow">${eyebrow}</div>
      <h1>${title}</h1>
      <div class="lede">${lede}</div>
      ${stats && stats.length ? `<div class="hero-stats">${stats.map(s => `<div><b>${s.n == null ? '–' : s.n}</b>${s.label}</div>`).join('')}</div>` : ''}
    </div>
    <div class="tm-constellation" data-constellation>
      <div class="legend"><span><i style="background:#E0B874"></i>Helpers</span><span><i style="background:#78AA96"></i>Households</span><span><i style="background:#D66E60"></i>Needs attention</span></div>
      <div class="cap">Drag to turn · click a point to open it</div>
    </div>
  </div>`;
}

function motionMountConstellations(root){
  root.querySelectorAll('[data-constellation]').forEach(host => {
    const api = motionConstellation(host);
    const ids = typeof window.motionAlertIds === 'function' ? window.motionAlertIds() : [];
    api.alert(ids);
  });
}

/** Who needs attention, from the dashboard data the server already sent. */
window.motionAlertIds = function(){
  const d = typeof dashData !== 'undefined' ? dashData : null;
  if(!d || d.error) return [];
  const ids = new Set();
  (d.due || []).forEach(x => x.helper_id && ids.add(x.helper_id));
  (d.escalations || []).forEach(x => x.helper_id && ids.add(x.helper_id));
  (d.alerts || []).forEach(a => a.action && (a.action.ring || a.action.param) && ids.add(a.action.ring || a.action.param));
  return Array.from(ids);
};

/* ------------------------------------------------------------------ wiring */

function motionAfterRender(){
  const content = document.getElementById('content');
  if(!content) return;
  const key = (typeof route !== 'undefined' ? route.page + '/' + (route.param || '') : location.hash);
  // Pages often render twice (a loading state, then data), so the entrance runs for both.
  const now = Date.now();
  if(key !== MOTION.lastPage){
    MOTION.freshUntil = now + 1800;
    if(MOTION.lastPage !== null && scrollY > 0) scrollTo(0, 0);   // a new page starts at the top
  }
  const fresh = now < (MOTION.freshUntil || 0);
  MOTION.lastPage = key;
  if(typeof polishAfterRender === 'function') polishAfterRender();   // icons and rings read the final numbers, before count-up
  motionReveal(content, fresh);
  motionCount(content);
  motionMountConstellations(content);
  motionGlider();
  if(fresh && MOTION.onScroll) MOTION.onScroll();
}

/** Phones: the rail slides in from a menu button and closes after a choice. */
function motionMenu(){
  const rail = document.getElementById('rail');
  if(!rail || document.getElementById('menubtn')) return;
  const b = document.createElement('button');
  b.id = 'menubtn'; b.type = 'button'; b.setAttribute('aria-label', 'Menu');
  b.innerHTML = '<span style="font-size:16px; line-height:1;">☰</span> Menu';
  b.onclick = e => { e.stopPropagation(); rail.classList.toggle('open'); };
  document.body.append(b);
  rail.addEventListener('click', e => { if(e.target.closest('nav button')) rail.classList.remove('open'); });
  document.addEventListener('click', e => { if(rail.classList.contains('open') && !rail.contains(e.target)) rail.classList.remove('open'); });
}

function motionInit(){
  if(typeof document === 'undefined' || typeof MutationObserver === 'undefined' || typeof IntersectionObserver === 'undefined') return;
  motionMenu();
  // Belt and braces: anything still hidden after a few seconds (observer never fired) is shown.
  setInterval(() => document.querySelectorAll('#content .rv:not(.in)').forEach(el => { if(el.getBoundingClientRect().top < innerHeight * 1.5) el.classList.add('in'); }), 1500);
  MOTION.io = new IntersectionObserver(es => es.forEach(e => {
    if(e.isIntersecting){ e.target.classList.add('in'); MOTION.io.unobserve(e.target); }
  }), {rootMargin: '0px 0px -6% 0px'});
  MOTION.onScroll = motionChrome();
  motionTilt();
  let queued = false;
  const schedule = () => { if(queued) return; queued = true; requestAnimationFrame(() => { queued = false; motionAfterRender(); }); };
  const content = document.getElementById('content');
  if(content) new MutationObserver(schedule).observe(content, {childList: true});
  const list = document.getElementById('navlist');
  if(list) new MutationObserver(() => requestAnimationFrame(() => { if(typeof polishNav === 'function') polishNav(); motionGlider(); })).observe(list, {childList: true, subtree: true, attributes: true, attributeFilter: ['class']});
  addEventListener('resize', motionGlider, {passive: true});
  schedule();
}

if(typeof document !== 'undefined' && document.readyState !== 'loading' && typeof requestAnimationFrame === 'function') motionInit();
else if(typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('DOMContentLoaded', motionInit);
