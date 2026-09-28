/**
 * Visual polish that needs a little DOM: icons in the navigation, page headers and stat tiles,
 * score rings on 0-100 numbers, and toast confirmations for what the agents just did.
 *
 * It decorates whatever the pages render (called from motion.js after each render), so no page
 * has to know about it, and every step is skipped safely when an element is missing.
 */
const POLISH_ICONS = {
  grid: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  memory: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  pulse: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  trend: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  spark: '<path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
};

function polishIcon(name, size = 16){
  return `<svg class="tm-ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${POLISH_ICONS[name] || POLISH_ICONS.spark}</svg>`;
}

const POLISH_NAV = {dashboard: 'grid', people: 'users', memory: 'memory', matching: 'link', voice: 'phone', activity: 'pulse', helperHome: 'home', householdHome: 'home', helperDetail: 'user', householdDetail: 'home'};

/** Icon and accent for a stat tile, from its label. */
function polishMetricStyle(label){
  const l = label.toLowerCase();
  if(/churn|attention|overdue|broken/.test(l)) return {icon: 'trend', tone: 'rust'};
  if(/trust/.test(l)) return {icon: 'shield', tone: 'teal'};
  if(/kept|commitment|promise/.test(l)) return {icon: 'check', tone: 'teal'};
  if(/helper|people/.test(l)) return {icon: 'users', tone: 'brass'};
  if(/placement|link/.test(l)) return {icon: 'link', tone: 'brass'};
  if(/call/.test(l)) return {icon: 'phone', tone: 'ink'};
  if(/observation/.test(l)) return {icon: 'eye', tone: 'teal'};
  if(/fact|memor|recalled|grounded/.test(l)) return {icon: 'memory', tone: 'brass'};
  if(/document/.test(l)) return {icon: 'file', tone: 'ink'};
  if(/difficulty/.test(l)) return {icon: 'alert', tone: 'rust'};
  return {icon: 'spark', tone: 'brass'};
}

function polishNav(){
  document.querySelectorAll('#navlist button[data-id]').forEach(b => {
    if(b.querySelector('.tm-ico')) return;
    const dot = b.querySelector('.dot');
    const html = polishIcon(POLISH_NAV[b.dataset.id] || 'spark', 17);
    if(dot) dot.insertAdjacentHTML('afterend', html); else b.insertAdjacentHTML('afterbegin', html);
  });
}

function polishPage(root){
  const page = typeof route !== 'undefined' ? route.page : '';
  // Page headers get an icon badge matching the navigation.
  root.querySelectorAll('.pagehead').forEach(h => {
    if(h.querySelector('.ph-ico')) return;
    h.insertAdjacentHTML('afterbegin', `<div class="ph-ico">${polishIcon(POLISH_NAV[page] || 'spark', 20)}</div>`);
  });
  // Stat tiles: icon, tone, and a ring for 0-100 scores.
  root.querySelectorAll('.metric').forEach(m => {
    if(m.dataset.polished) return;
    m.dataset.polished = '1';
    const labelEl = m.querySelector('.label');
    const label = labelEl ? labelEl.textContent.trim() : '';
    const st = polishMetricStyle(label);
    m.classList.add('tone-' + st.tone);
    if(labelEl) labelEl.insertAdjacentHTML('beforebegin', `<span class="m-ico">${polishIcon(st.icon, 15)}</span>`);
    const num = m.querySelector('.num');
    const v = num ? parseFloat(num.textContent) : NaN;
    const isScore = /trust|churn|difficulty/i.test(label) || /^\d+(\.\d+)?%$/.test(num ? num.textContent.trim() : '');
    if(num && isScore && v >= 0 && v <= 100){
      const r = 22, c = 2 * Math.PI * r;
      m.classList.add('has-ring');
      m.insertAdjacentHTML('beforeend', `<svg class="m-ring" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="${r}" class="track"/><circle cx="28" cy="28" r="${r}" class="bar" style="stroke-dasharray:${c.toFixed(1)};stroke-dashoffset:${c.toFixed(1)}" data-target="${(c * (1 - v / 100)).toFixed(1)}"/></svg>`);
      const bar = m.querySelector('.m-ring .bar');
      requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.strokeDashoffset = bar.dataset.target; }));
      setTimeout(() => { bar.style.strokeDashoffset = bar.dataset.target; }, 800);
    }
  });
  // Long standing profiles fold; one click shows the rest.
  root.querySelectorAll('.mm-body').forEach(b => {
    if(b.dataset.folded || b.scrollHeight <= 360) return;
    b.dataset.folded = '1';
    const btn = document.createElement('button');
    btn.className = 'mm-more'; btn.type = 'button'; btn.textContent = 'Read the full profile';
    btn.onclick = () => { const open = b.classList.toggle('open'); btn.textContent = open ? 'Show less' : 'Read the full profile'; };
    b.after(btn);
  });
  // Empty states get a soft icon so they read as intentional, not broken.
  root.querySelectorAll('.empty').forEach(e => {
    if(e.querySelector('.empty-ico')) return;
    e.insertAdjacentHTML('afterbegin', `<div class="empty-ico">${polishIcon('spark', 20)}</div>`);
  });
}

/* ------------------------------------------------------------------ toasts */

const POLISH_TOAST = {readyAt: Date.now() + 4000};

function polishToast(text, tone){
  if(typeof document === 'undefined' || !document.body) return;
  let wrap = document.getElementById('tmToasts');
  if(!wrap){ wrap = document.createElement('div'); wrap.id = 'tmToasts'; document.body.append(wrap); }
  const t = document.createElement('div');
  t.className = 'tm-toast ' + (tone || '');
  t.innerHTML = `${polishIcon(tone === 'decision' ? 'trend' : tone === 'voice' ? 'phone' : 'memory', 16)}<span></span>`;
  t.querySelector('span').textContent = String(text).replace(/^[A-Z ]+ — /, '').slice(0, 160);
  wrap.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => t.classList.add('in'), 50);
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 400); }, 4200);
  while(wrap.children.length > 3) wrap.firstChild.remove();
}

/** Agent actions the coordinator triggered also show as a toast (not the start-up chatter). */
function polishWrapLog(){
  if(typeof log !== 'function' || log.polished) return;
  const orig = log;
  const wrapped = function(agentClass, agentLabel, text){
    orig.apply(this, arguments);
    if(Date.now() > POLISH_TOAST.readyAt && text) polishToast(text, agentClass);
  };
  wrapped.polished = true;
  window.log = wrapped;
  try { log = wrapped; } catch(e){ /* const binding: the window property is enough */ }
}

function polishAfterRender(){
  const content = document.getElementById('content');
  if(content) polishPage(content);
  polishNav();
}

if(typeof document !== 'undefined' && typeof document.addEventListener === 'function'){
  document.addEventListener('DOMContentLoaded', polishWrapLog);
}
