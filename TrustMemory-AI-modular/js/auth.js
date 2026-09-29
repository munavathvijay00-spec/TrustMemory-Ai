/* =========================================================================
   auth.js — sign-in, sign-up, pending approval, the sidebar account box, and
   the coordinator's "Pending accounts" block. The session itself is an
   HttpOnly cookie set by the server; this file only reads /api/auth/me.
   ========================================================================= */

let AUTH_VIEW = 'login';     // 'login' | 'signup'
let AUTH_SIGNUP_ROLE = 'helper';
let AUTH_PENDING = null;     // coordinator: pending accounts, null until loaded
let AUTH_PENDING_AT = 0;

const AUTH_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function authJson(path, body){
  const res = await fetch(path, body ? {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)} : undefined);
  const data = await res.json().catch(() => ({}));
  if(!res.ok) throw Object.assign(new Error(data.error || ('HTTP ' + res.status)), {code: data.code, status: res.status});
  return data;
}

/**
 * Ask the server who is signed in. Resolves to 'ok', 'gate' (nobody signed in), 'pending',
 * or 'offline' (server unreachable: the reconnecting screen is shown, which retries).
 */
async function authBoot(){
  let me;
  try { me = await authJson('/api/auth/me'); }
  catch(e){ return 'offline'; }
  if(!me.authenticated || !me.account){
    CURRENT_USER = {isLoggedIn:false, name:'', email:'', role:'', entityId:null, authMode:'on'};
    return 'gate';
  }
  const a = me.account;
  CURRENT_USER = {
    isLoggedIn: a.status === 'active',
    name: a.name,
    email: a.email || '',
    role: a.role === 'coordinator' ? 'admin' : a.role,
    entityId: a.person_id || null,
    authMode: me.auth === 'off' ? 'off' : 'on',
    status: a.status,
  };
  return a.status === 'active' ? 'ok' : 'pending';
}

function authLock(on){
  if(document.body && document.body.classList) document.body.classList[on ? 'add' : 'remove']('auth-locked');
}

/* ---------------------------------------------------------------- sidebar account box */

function renderAuthRail(){
  const box = document.getElementById('authBox');
  if(!box) return;
  const roleText = {admin:'Coordinator console', helper:'Helper', household:'Household'}[CURRENT_USER.role] || '';
  box.innerHTML = `
    <div class="user-profile-badge">
      <div class="user-avatar">${initials(CURRENT_USER.name || '?')}</div>
      <div class="user-info">
        <div class="user-name">${escapeHtml(CURRENT_USER.name)}</div>
        <div class="user-email">${escapeHtml(CURRENT_USER.email || roleText)}</div>
      </div>
    </div>
    ${CURRENT_USER.authMode === 'on' ? `<div class="auth-actions"><span style="color:#A6B0BD;">${escapeHtml(roleText)}</span><a onclick="authLogout()">Sign out</a></div>` : ''}
  `;
}

async function authLogout(){
  let reached = true;
  try { await authJson('/api/auth/logout', {}); }
  catch(e){ reached = !(e instanceof TypeError); }   // a TypeError is the network; an HTTP error still reached the server
  if(typeof history !== 'undefined' && history.replaceState) history.replaceState(null, '', location.pathname);
  // Server unreachable: never reload into a dead page. Wait, then finish signing out.
  if(!reached) return showOfflineScreen({signingOut: true});
  location.reload();
}

/**
 * The agency server cannot be reached (restarting, network down). Show that plainly and retry,
 * instead of an empty console full of failed requests.
 */
let AUTH_RETRY_TIMER = null;
function showOfflineScreen({signingOut = false} = {}){
  authLock(true);
  const c = document.getElementById('content');
  if(c) c.innerHTML = `
    <div class="auth-split">
    ${authSide()}
    <div class="auth-card">
      <div class="auth-brand">TrustMemory AI</div>
      <h1>${signingOut ? 'Signing you out…' : 'Reconnecting…'}</h1>
      <p class="auth-lede">The agency server is not answering right now. This page checks again every few seconds and carries on by itself when it is back.</p>
      <div class="tm-skel" style="height:6px; margin-top:14px;"></div>
    </div>
    </div>`;
  if(AUTH_RETRY_TIMER) clearInterval(AUTH_RETRY_TIMER);
  AUTH_RETRY_TIMER = setInterval(async () => {
    try {
      const r = await fetch('/api/health');
      if(!r.ok) return;
      clearInterval(AUTH_RETRY_TIMER);
      if(signingOut){ try { await authJson('/api/auth/logout', {}); } catch(e){} }
      location.reload();
    } catch(e){ /* still down */ }
  }, 3000);
}

/* ---------------------------------------------------------------- sign-in / sign-up screen */

function authField(label, input, hint){
  return `<label class="auth-field"><span>${label}</span>${input}${hint ? `<small>${hint}</small>` : ''}</label>`;
}

function authLoginForm(){
  return `
    <form id="authLoginForm" novalidate>
      ${authField('Email', '<input type="email" id="authEmail" autocomplete="username" required>')}
      ${authField('Password', '<input type="password" id="authPassword" autocomplete="current-password" required>')}
      <div class="auth-error" id="authError"></div>
      <button class="btn primary auth-submit" type="submit">Sign in</button>
    </form>
    <div class="auth-switch">New helper or household? <a onclick="authShow('signup')">Create an account</a></div>
    ${authDemoHtml()}`;
}

/* One-click demo sign-in, offered only when the server says the demo accounts are public. */
let AUTH_DEMO_ROLES = null;
const AUTH_DEMO_LABELS = {coordinator: ['Coordinator', 'the full console'], helper: ['Helper', 'as Radha'], household: ['Household', 'the Gupta family']};

function authDemoHtml(){
  if(!AUTH_DEMO_ROLES || !AUTH_DEMO_ROLES.length) return '';
  return `<div class="auth-demo">
      <div class="auth-demo-label">Just looking? Explore the demo as</div>
      <div class="auth-demo-btns">${AUTH_DEMO_ROLES.filter(r => AUTH_DEMO_LABELS[r]).map((r, i) => `<button type="button" class="auth-demo-btn${i === 0 ? ' first' : ''}" data-demo="${r}"><b>${AUTH_DEMO_LABELS[r][0]}</b><span>${AUTH_DEMO_LABELS[r][1]}</span></button>`).join('')}</div>
    </div>`;
}

async function authLoadDemo(){
  try {
    const r = await fetch('/api/auth/demo');
    const d = r.ok ? await r.json() : {};
    AUTH_DEMO_ROLES = Array.isArray(d.roles) ? d.roles : [];
  } catch(e){ AUTH_DEMO_ROLES = []; }
  if(AUTH_VIEW !== 'signup' && document.getElementById('authLoginForm')) showAuthGate();
}

async function authDemoSignIn(role, btn){
  btn.disabled = true;
  try {
    await authJson('/api/auth/demo', {role});
    if(history.replaceState) history.replaceState(null, '', location.pathname);
    location.reload();
  } catch(e){ authError(e.message); btn.disabled = false; }
}

function authSignupForm(){
  const helper = AUTH_SIGNUP_ROLE === 'helper';
  const roleOpts = ['elder_care','child_care','cleaning','cooking'];
  const profile = helper ? `
      ${authField('Full name', '<input type="text" id="suName" maxlength="60" required>')}
      ${authField('Area you live in', '<input type="text" id="suLocation" maxlength="60" placeholder="e.g. Secunderabad" required>')}
      <div class="auth-row">
        ${authField('Years of experience', '<input type="number" id="suExp" min="0" max="50" value="1" required>')}
        ${authField('Availability', `<select id="suAvailability">${['Full-time','Part-time','Live-in','Weekends'].map(a => `<option>${a}</option>`).join('')}</select>`)}
      </div>
      <div class="auth-field"><span>Work you do</span><div class="auth-checks">${roleOpts.map(r => `<label><input type="checkbox" name="suSkill" value="${r}"> ${roleLabel(r)}</label>`).join('')}</div></div>`
    : `
      ${authField('Household name', '<input type="text" id="suName" maxlength="60" placeholder="e.g. Menon Residence" required>')}
      ${authField('Area', '<input type="text" id="suLocation" maxlength="60" placeholder="e.g. Tarnaka" required>')}
      <div class="auth-row">
        ${authField('What you need', `<select id="suNeed">${roleOpts.map(r => `<option value="${r}">${roleLabel(r)}</option>`).join('')}</select>`)}
        ${authField('Schedule', '<input type="text" id="suSchedule" maxlength="100" placeholder="e.g. Weekdays 8am–4pm" required>')}
      </div>
      ${authField('Anything the agency should know (optional)', '<textarea id="suNotes" maxlength="500" rows="2"></textarea>')}`;
  return `
    <div class="auth-roles">
      <button type="button" class="btn sm ${helper ? 'primary' : ''}" onclick="authSetRole('helper')">I am a helper</button>
      <button type="button" class="btn sm ${helper ? '' : 'primary'}" onclick="authSetRole('household')">We are a household</button>
    </div>
    <form id="authSignupForm" novalidate>
      ${profile}
      ${authField('Email', '<input type="email" id="suEmail" autocomplete="username" required>')}
      <div class="auth-row">
        ${authField('Password', '<input type="password" id="suPassword" autocomplete="new-password" required>', '8+ characters, a letter and a number')}
        ${authField('Confirm password', '<input type="password" id="suConfirm" autocomplete="new-password" required>')}
      </div>
      <div class="auth-error" id="authError"></div>
      <button class="btn primary auth-submit" type="submit">Create account</button>
    </form>
    <div class="auth-switch">Already have an account? <a onclick="authShow('login')">Sign in</a></div>`;
}

/** The left half of the sign-in screen: what the product is, over the live memory constellation. */
function authSide(){
  return `<div class="auth-side">
    <div class="auth-side-copy">
      <div class="eyebrow">Home-care agency · Hyderabad</div>
      <h2>An agency that <em>remembers</em> every helper.</h2>
      <p>Voice check-ins in Telugu, Hindi and English that recall every earlier call, keep track of every promise, and notice what one call alone never could.</p>
      <ul>
        <li><b>Remembers</b> every call, promise and household, in Hindsight</li>
        <li><b>Notices</b> patterns across calls: late pay, festival travel, broken promises</li>
        <li><b>Hands over</b> what a household needs to the next helper</li>
      </ul>
    </div>
    <div class="tm-constellation auth-constellation" data-constellation><div class="cap">Every point is a helper or household the agency remembers</div></div>
  </div>`;
}

function showAuthGate(view){
  if(view) AUTH_VIEW = view;
  authLock(true);
  const c = document.getElementById('content');
  if(!c) return;
  c.innerHTML = `
    <div class="auth-split">
    ${authSide()}
    <div class="auth-card">
      <div class="auth-brand">TrustMemory AI</div>
      <h1>${AUTH_VIEW === 'signup' ? 'Create an account' : 'Sign in'}</h1>
      <p class="auth-lede">${AUTH_VIEW === 'signup'
        ? 'Helpers and households sign up here. The agency approves each account before it opens.'
        : 'Coordinators, helpers and households all sign in here.'}</p>
      ${AUTH_VIEW === 'signup' ? authSignupForm() : authLoginForm()}
    </div>
    </div>`;
  const lf = document.getElementById('authLoginForm');
  if(lf && lf.addEventListener) lf.addEventListener('submit', authSubmitLogin);
  if(c.querySelectorAll) c.querySelectorAll('[data-demo]').forEach(b => { b.onclick = () => authDemoSignIn(b.dataset.demo, b); });
  if(AUTH_DEMO_ROLES === null && typeof fetch === 'function'){ AUTH_DEMO_ROLES = []; authLoadDemo(); }
  const sf = document.getElementById('authSignupForm');
  if(sf && sf.addEventListener) sf.addEventListener('submit', authSubmitSignup);
}

function authShow(view){ showAuthGate(view); }
function authSetRole(role){ AUTH_SIGNUP_ROLE = role; showAuthGate('signup'); }

function authError(msg){
  const el = document.getElementById('authError');
  if(el) el.textContent = msg || '';
  return false;
}

function authBusy(form, on){
  const b = form && form.querySelector ? form.querySelector('button[type="submit"]') : null;
  if(b) b.disabled = on;
}

async function authSubmitLogin(event){
  event.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if(!AUTH_EMAIL_RE.test(email)) return authError('Enter a valid email address.');
  if(!password) return authError('Enter your password.');
  authBusy(event.target, true);
  try {
    await authJson('/api/auth/login', {email, password});
    if(history.replaceState) history.replaceState(null, '', location.pathname);
    location.reload();
  } catch(e){
    authError(e.message);
    authBusy(event.target, false);
  }
}

/** Same rules as the server, so most mistakes are caught before the request. */
function authCheckSignup(body){
  if(!body.name || body.name.length < 2 || body.name.length > 60) return 'Name must be 2 to 60 characters.';
  if(!body.location || body.location.length < 2) return 'Location must be 2 to 60 characters.';
  if(body.role === 'helper'){
    if(!/^[\p{L} .'-]+$/u.test(body.name)) return 'Name can only contain letters, spaces, dots, apostrophes and hyphens.';
    if(!Number.isInteger(body.experience_years) || body.experience_years < 0 || body.experience_years > 50) return 'Experience must be a whole number of years from 0 to 50.';
    if(!body.skills.length) return 'Pick at least one kind of work you do.';
  } else if(!body.schedule || body.schedule.length < 2) return 'Schedule must be 2 to 100 characters.';
  if(!AUTH_EMAIL_RE.test(body.email) || body.email.length > 254) return 'Enter a valid email address.';
  if(body.password.length < 8 || body.password.length > 72) return 'Password must be 8 to 72 characters.';
  if(!/[A-Za-z]/.test(body.password) || !/\d/.test(body.password)) return 'Password must contain at least one letter and one number.';
  if(body.password !== body.confirm) return 'The two passwords do not match.';
  return null;
}

async function authSubmitSignup(event){
  event.preventDefault();
  const v = id => (document.getElementById(id) || {}).value || '';
  const body = {
    role: AUTH_SIGNUP_ROLE,
    name: v('suName').trim(),
    location: v('suLocation').trim(),
    email: v('suEmail').trim(),
    password: v('suPassword'),
    confirm: v('suConfirm'),
  };
  if(AUTH_SIGNUP_ROLE === 'helper'){
    body.experience_years = parseInt(v('suExp'), 10);
    body.availability = v('suAvailability');
    body.skills = Array.from(document.querySelectorAll('input[name="suSkill"]:checked')).map(cb => cb.value);
  } else {
    body.requirement = v('suNeed');
    body.schedule = v('suSchedule').trim();
    body.notes = v('suNotes').trim();
  }
  const problem = authCheckSignup(body);
  if(problem) return authError(problem);
  authBusy(event.target, true);
  try {
    await authJson('/api/auth/signup', body);
    if(history.replaceState) history.replaceState(null, '', location.pathname);
    location.reload();
  } catch(e){
    authError(e.message);
    authBusy(event.target, false);
  }
}

/** Signed in, but a coordinator has not approved the account yet. */
function showPendingScreen(){
  authLock(true);
  const c = document.getElementById('content');
  if(!c) return;
  c.innerHTML = `
    <div class="auth-card">
      <div class="auth-brand">TrustMemory AI</div>
      <h1>Thank you, ${escapeHtml(CURRENT_USER.name)}</h1>
      <p class="auth-lede">Your ${CURRENT_USER.role === 'household' ? 'household' : 'helper'} account is waiting for the agency to approve it. You can sign in again once it is approved.</p>
      <p class="auth-lede">Signed in as ${escapeHtml(CURRENT_USER.email)}.</p>
      <button class="btn" onclick="authLogout()">Sign out</button>
    </div>`;
}

/* ---------------------------------------------------------------- coordinator: pending accounts */

function authPendingHtml(){
  if(AUTH_PENDING === null) return '<div style="font-size:12.5px; color:var(--ink-soft);">Loading sign-ups…</div>';
  if(!AUTH_PENDING.length) return '<div style="font-size:12.5px; color:var(--ink-soft);">No sign-ups waiting. Helpers and households who sign up appear here for approval.</div>';
  return AUTH_PENDING.map(a => `
    <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; padding:8px 0; border-top:1px solid var(--line);">
      <div><div style="font-size:13px; font-weight:600;">${escapeHtml(a.name)} <span class="badge neutral">${a.role}</span></div>
        <div style="font-size:12px; color:var(--ink-soft); margin-top:2px;">${escapeHtml(a.email)}${a.location ? ' · ' + escapeHtml(a.location) : ''}${a.detail ? ' · ' + escapeHtml(a.detail) : ''} · signed up ${escapeHtml(String(a.created_at || '').slice(0, 10))}</div></div>
      <button class="btn sm primary" onclick="authApprove('${escapeHtml(a.id)}')">Approve</button>
    </div>`).join('');
}

function authRenderPending(){
  const el = document.getElementById('authPendingSlot');
  if(el) el.innerHTML = authPendingHtml();
}

async function authLoadPending(){
  if(CURRENT_USER.authMode !== 'on' || CURRENT_USER.role !== 'admin') return;
  AUTH_PENDING_AT = Date.now();
  const before = AUTH_PENDING ? AUTH_PENDING.length : 0;
  try { AUTH_PENDING = await authJson('/api/auth/pending'); } catch(e){ AUTH_PENDING = []; }
  // The block appears or disappears with the list, so re-render the People page when that changes.
  if((before === 0) !== (AUTH_PENDING.length === 0) && typeof route !== 'undefined' && route.page === 'people' && typeof renderCurrentPage === 'function') renderCurrentPage();
  else authRenderPending();
}

async function authApprove(id){
  try {
    await authJson('/api/auth/approve/' + encodeURIComponent(id), {});
    if(typeof log === 'function') log('mem', 'MEMORY AGENT', 'Approved a new account; the profile is now in the roster and in Hindsight.');
    if(typeof syncBackendData === 'function') syncBackendData();
  } catch(e){
    // e.g. a helper with the same name was added meanwhile: say why instead of failing silently.
    if(typeof polishToast === 'function') polishToast(e.message || 'Could not approve the account.', 'decision');
  }
  authLoadPending();
}

/** "Pending accounts" block for the People page (coordinator only; empty when sign-in is off). */
function authPendingBlock(){
  if(CURRENT_USER.authMode !== 'on' || CURRENT_USER.role !== 'admin') return '';
  if(AUTH_PENDING === null || Date.now() - AUTH_PENDING_AT > 20000) setTimeout(authLoadPending, 0);
  if(!AUTH_PENDING || !AUTH_PENDING.length) return '';   // nothing waiting: no empty box above the roster
  return `<div class="section"><h2>Pending accounts <span class="badge warn">${AUTH_PENDING.length}</span></h2><div class="card" id="authPendingSlot">${authPendingHtml()}</div></div>`;
}
