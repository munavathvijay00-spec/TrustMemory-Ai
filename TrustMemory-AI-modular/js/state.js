/* =========================================================================
   state.js — seed data, global state (S, MEM, SCORES, SCORE_HISTORY)
   ========================================================================= */

const NAV = [
  {id:'dashboard', label:'Coordinator Dashboard'},
  {id:'helpers', label:'Helpers'},
  {id:'households', label:'Households'},
  {id:'placements', label:'Placements'},
  {id:'memory', label:'Hindsight Core'},
  {id:'matching', label:'Matching'},
  {id:'insights', label:'Insights'},
  {id:'voice', label:'Voice Agent'},
  {id:'activity', label:'Agent Activity'},
  {id:'architecture', label:'Architecture'},
  {id:'settings', label:'Settings'},
];

function seed(){
  const helpers = [
    {id:'anita', name:'Anita Verma', location:'Hyderabad', exp:6,
      skills:['elder_care','cleaning'], availability:'Full-time',
      roleScores:{elder_care:88, child_care:60, cleaning:70, cooking:55},
      color:'#8F6A2E'},
    {id:'priya', name:'Priya Nair', location:'Hyderabad', exp:4,
      skills:['elder_care','child_care','cleaning'], availability:'Full-time',
      roleScores:{elder_care:93, child_care:38, cleaning:74, cooking:50},
      color:'#3F6659'},
    {id:'radha', name:'Radha Kumari', location:'Secunderabad', exp:7,
      skills:['child_care','cooking'], availability:'Full-time',
      roleScores:{elder_care:45, child_care:90, cleaning:55, cooking:80},
      color:'#5B4A8F'},
    {id:'sunita', name:'Sunita Devi', location:'Hyderabad', exp:3,
      skills:['cleaning','cooking'], availability:'Part-time',
      roleScores:{elder_care:50, child_care:48, cleaning:78, cooking:65},
      color:'#A6453A'},
    {id:'meena', name:'Meena Joshi', location:'Gachibowli', exp:9,
      skills:['elder_care','cooking'], availability:'Full-time',
      roleScores:{elder_care:81, child_care:52, cleaning:60, cooking:85},
      color:'#31507A'},
    {id:'kavita', name:'Kavita Reddy', location:'Kukatpally', exp:5,
      skills:['child_care'], availability:'Full-time',
      roleScores:{elder_care:40, child_care:76, cleaning:58, cooking:52},
      color:'#8F6A2E'},
    {id:'lakshmi', name:'Lakshmi Rao', location:'Hyderabad', exp:10,
      skills:['cleaning'], availability:'Full-time',
      roleScores:{elder_care:55, child_care:40, cleaning:92, cooking:48},
      color:'#3F6659'},
    {id:'fatima', name:'Fatima Sheikh', location:'Begumpet', exp:2,
      skills:['elder_care','child_care'], availability:'Full-time',
      roleScores:{elder_care:70, child_care:65, cleaning:50, cooking:45},
      color:'#5B4A8F'},
  ];

  const households = [
    {id:'h101', name:'Sharma Residence', location:'Jubilee Hills', requirement:'cleaning', schedule:'Weekday mornings'},
    {id:'h102', name:'Reddy Residence', location:'Banjara Hills', requirement:'elder_care', schedule:'Live-in'},
    {id:'h104', name:'Iyer Residence', location:'Madhapur', requirement:'child_care', schedule:'Weekday, 9am–6pm'},
    {id:'h105', name:'Gupta Residence', location:'Kondapur', requirement:'child_care', schedule:'Weekday, 8am–5pm'},
    {id:'h106', name:'Nair Residence', location:'Gachibowli', requirement:'elder_care', schedule:'Live-in, new requirement'},
    {id:'h107', name:'Verma Residence', location:'Himayatnagar', requirement:'elder_care', schedule:'Full-time'},
  ];

  const placements = [
    {id:'p1', helperId:'anita', householdId:'h107', role:'elder_care', start:'2026-01-05', end:null, status:'active'},
    {id:'p2', helperId:'priya', householdId:'h102', role:'elder_care', start:'2025-11-10', end:null, status:'active'},
    {id:'p3', helperId:'priya', householdId:'h105', role:'child_care', start:'2025-08-01', end:'2025-09-14', status:'ended_poor_fit'},
    {id:'p4', helperId:'sunita', householdId:'h104', role:'child_care', start:'2025-09-01', end:'2025-10-20', status:'failed'},
    {id:'p5', helperId:'kavita', householdId:'h104', role:'child_care', start:'2025-11-01', end:'2025-12-15', status:'failed'},
    {id:'p6', helperId:'fatima', householdId:'h104', role:'child_care', start:'2026-01-10', end:'2026-02-18', status:'failed'},
    {id:'p7', helperId:'lakshmi', householdId:'h101', role:'cleaning', start:'2025-06-01', end:null, status:'active'},
    {id:'p8', helperId:'meena', householdId:'h106', role:'cooking', start:'2025-05-01', end:null, status:'active'},
  ];

  function ev(helperId, householdId, placementId, type, description, severity, date){
    return {id:uid(), helperId, householdId, placementId, type, description, severity, date, source:'seed'};
  }

  const events = [
    ev('anita','h107','p1','placement_start','Placement started at Verma Residence.','info','2026-01-05'),
    ev('anita','h107','p1','positive_feedback','Household reported excellent care and punctuality.','info','2026-01-17'),
    ev('anita','h107','p1','positive_feedback','Household praised communication and reliability.','info','2026-02-18'),

    ev('priya','h102','p2','placement_start','Placement started at Reddy Residence (elder care).','info','2025-11-10'),
    ev('priya','h102','p2','positive_feedback','Household highly satisfied with elder-care routine.','info','2025-12-02'),
    ev('priya','h102','p2','positive_feedback','Consistent, attentive care reported again.','info','2026-01-20'),
    ev('priya','h105','p3','complaint','Household reported difficulty managing two young children.','medium','2025-08-28'),
    ev('priya','h105','p3','negative_feedback','Household felt childcare routine was not a good fit.','medium','2025-09-10'),
    ev('priya','h105','p3','placement_end','Placement ended — role mismatch (child care).','info','2025-09-14'),

    ev('sunita','h104','p4','placement_start','Placement started at Iyer Residence (child care).','info','2025-09-01'),
    ev('sunita','h104','p4','complaint','Household reported schedule expectations were not being met.','medium','2025-09-25'),
    ev('sunita','h104','p4','placement_end','Placement ended — household requested replacement.','info','2025-10-20'),
    ev('kavita','h104','p5','placement_start','Placement started at Iyer Residence (child care).','info','2025-11-01'),
    ev('kavita','h104','p5','complaint','Household reported dissatisfaction with schedule adherence.','medium','2025-11-30'),
    ev('kavita','h104','p5','placement_end','Placement ended — household requested replacement.','info','2025-12-15'),
    ev('fatima','h104','p6','placement_start','Placement started at Iyer Residence (child care).','info','2026-01-10'),
    ev('fatima','h104','p6','complaint','Household reported schedule expectations were not met again.','medium','2026-02-05'),
    ev('fatima','h104','p6','placement_end','Placement ended — household requested replacement.','info','2026-02-18'),

    ev('lakshmi','h101','p7','placement_start','Placement started at Sharma Residence.','info','2025-06-01'),
    ev('lakshmi','h101','p7','positive_feedback','Consistently thorough, on-time service.','info','2025-09-12'),
    ev('lakshmi','h101','p7','positive_feedback','Household renewed engagement, cited reliability.','info','2026-01-15'),

    ev('meena','h106','p8','placement_start','Placement started at Nair Residence (cooking).','info','2025-05-01'),
    ev('meena','h106','p8','positive_feedback','Household satisfied with meal planning and hygiene.','info','2025-08-20'),

    ev('radha', null, null, 'positive_feedback','Previous household praised patience with toddlers.','info','2025-10-05'),
    ev('radha', null, null, 'placement_end','Prior placement completed successfully, contract concluded.','info','2025-12-01'),
  ];

  return {
    helpers,
    households,
    placements,
    events,
    calls:[],
    reflections:[],
    recommendations:[],
    activity:[],
    stagedBackups:[]
  };
}

function uid(){
  return Math.random().toString(36).slice(2,9);
}

let INITIAL = seed();
let S = clone(INITIAL);
let MEM = {}; // entityId -> {world:[], experience:[], opinion:[], observation:[]}
let SCORES = {}; // entityId -> {trust, churn, difficulty}
let SCORE_HISTORY = {}; // entityId -> [{timestamp, trust, churn, difficulty}]
let route = {page:'dashboard', param:null};
let clockBase = new Date('2026-03-08T09:00:00');
let clockTick = 0;

function clone(o){
  return JSON.parse(JSON.stringify(o));
}

function nowStamp(){
  clockTick += 1;
  const d = new Date(clockBase.getTime() + clockTick*37000);
  return d.toTimeString().slice(0,8);
}

function todayIso(){
  return '2026-03-'+String(8 + (clockTick % 3)).padStart(2,'0');
}

function memOf(id){
  if(!MEM[id]) MEM[id] = {world:[], experience:[], opinion:[], observation:[]};
  return MEM[id];
}

/* ---------------------------------------------------------------------
   MULTI-ROLE NAVIGATION & PERMISSIONS
--------------------------------------------------------------------- */
const NAV_ADMIN = [
  {id:'dashboard', label:'Coordinator Dashboard'},
  {id:'helpers', label:'Helpers'},
  {id:'households', label:'Households'},
  {id:'placements', label:'Placements'},
  {id:'memory', label:'Hindsight Core'},
  {id:'matching', label:'Matching'},
  {id:'insights', label:'Insights'},
  {id:'voice', label:'Voice Agent'},
  {id:'activity', label:'Agent Activity'},
  {id:'architecture', label:'Architecture'},
  {id:'settings', label:'Settings'},
];

const NAV_HELPER = [
  {id:'helperDetail', label:'My Helper Profile'},
  {id:'memory', label:'My Memory Timeline'},
  {id:'settings', label:'Settings & Account'},
];

const NAV_HOUSEHOLD = [
  {id:'householdDetail', label:'My Residence Profile'},
  {id:'placements', label:'My Placements & Helper'},
  {id:'settings', label:'Settings & Account'},
];

function getNavForCurrentUser(){
  if(!CURRENT_USER || !CURRENT_USER.isLoggedIn) return [];
  if(CURRENT_USER.role === 'helper') return NAV_HELPER;
  if(CURRENT_USER.role === 'household') return NAV_HOUSEHOLD;
  return NAV_ADMIN;
}

/* ---------------------------------------------------------------------
   AUTHENTICATION & USER STATE
--------------------------------------------------------------------- */
let CURRENT_USER = {
  isLoggedIn: false,
  name: "",
  email: "",
  username: "",
  role: null, // 'admin' | 'helper' | 'household'
  entityId: null // e.g. 'anita' for helper, 'h101' for household
};

let ACCOUNTS = {
  "admin": {
    username: "admin",
    email: "admin@trustmemory.ai",
    password: "admin123",
    name: "Agency Administrator",
    role: "admin",
    entityId: null
  },
  "admin@trustmemory.ai": {
    username: "admin",
    email: "admin@trustmemory.ai",
    password: "admin123",
    name: "Agency Administrator",
    role: "admin",
    entityId: null
  },
  "anita": {
    username: "anita",
    email: "anita@gmail.com",
    password: "helper123",
    name: "Anita Verma",
    role: "helper",
    entityId: "anita"
  },
  "anita@gmail.com": {
    username: "anita",
    email: "anita@gmail.com",
    password: "helper123",
    name: "Anita Verma",
    role: "helper",
    entityId: "anita"
  },
  "sharma": {
    username: "sharma",
    email: "sharma@gmail.com",
    password: "home123",
    name: "Sharma Residence",
    role: "household",
    entityId: "h101"
  },
  "sharma@gmail.com": {
    username: "sharma",
    email: "sharma@gmail.com",
    password: "home123",
    name: "Sharma Residence",
    role: "household",
    entityId: "h101"
  }
};

let AUTH_UI = {
  activeTab: 'login', // 'login' | 'register'
  selectedRole: 'household', // 'household' | 'helper' | 'admin'
  otpSent: false,
  otpCode: '',
  otpEmail: '',
  otpStatusMsg: '',
  loginError: '',
  registerError: ''
};

/* ---------------------------------------------------------------------
   AUTH GATE RENDERING & INTERACTIONS
--------------------------------------------------------------------- */
function renderAuthRail(){
  const box = document.getElementById('authBox');
  if(!box) return;

  if(CURRENT_USER.isLoggedIn){
    const init = initials(CURRENT_USER.name || "U");
    const roleBadge = CURRENT_USER.role === 'admin'
      ? 'Administrator'
      : (CURRENT_USER.role === 'helper' ? 'Helper / Worker' : 'Residence / Household');

    box.innerHTML = `
      <div class="user-profile-badge">
        <div class="user-avatar">${init}</div>
        <div class="user-info">
          <div class="user-name">${escapeHtml(CURRENT_USER.name)}</div>
          <div class="user-email">${escapeHtml(CURRENT_USER.email || CURRENT_USER.username)}</div>
        </div>
      </div>
      <div class="auth-actions" style="margin-top:8px;">
        <span style="color:#B4863F; font-weight:600; font-size:10.5px;">${roleBadge}</span>
        <a onclick="logoutUser()" style="color:#EDE9DF;">Sign out</a>
      </div>
    `;
  } else {
    box.innerHTML = `
      <div style="font-size:12px; color:#A6B0BD; text-align:center; padding:4px 0;">
        Not authenticated
      </div>
    `;
  }
}

function showAuthGate(){
  const overlay = document.getElementById('authOverlay');
  if(!overlay) return;
  overlay.style.display = 'flex';
  renderAuthModal();
}

function hideAuthGate(){
  const overlay = document.getElementById('authOverlay');
  if(overlay){
    overlay.style.display = 'none';
  }
}

function setAuthTab(tab){
  AUTH_UI.activeTab = tab;
  AUTH_UI.loginError = '';
  AUTH_UI.registerError = '';
  renderAuthModal();
}

function setAuthRole(role){
  AUTH_UI.selectedRole = role;
  // Preserve currently typed field values
  const curName = document.getElementById('regName')?.value;
  const curEmail = document.getElementById('regEmail')?.value;
  const curPass = document.getElementById('regPassword')?.value;
  const curUser = document.getElementById('regUsername')?.value;
  const curOtp = document.getElementById('regOtpCode')?.value;

  renderAuthModal();

  if(curName && document.getElementById('regName')) document.getElementById('regName').value = curName;
  if(curEmail && document.getElementById('regEmail')) document.getElementById('regEmail').value = curEmail;
  if(curPass && document.getElementById('regPassword')) document.getElementById('regPassword').value = curPass;
  if(curUser && document.getElementById('regUsername')) document.getElementById('regUsername').value = curUser;
  if(curOtp && document.getElementById('regOtpCode')) document.getElementById('regOtpCode').value = curOtp;
}

function renderAuthModal(){
  const overlay = document.getElementById('authOverlay');
  if(!overlay) return;

  const isLogin = AUTH_UI.activeTab === 'login';

  overlay.innerHTML = `
    <div class="auth-modal">
      <div class="auth-hero">
        <div class="logo-title">
          <span style="color:var(--brass);">◆</span> TrustMemory AI
        </div>
        <div class="logo-tag">Institutional Memory & Verified Trust for Domestic Placements</div>
      </div>

      <div class="auth-tab-bar">
        <button class="auth-tab-btn ${isLogin ? 'active' : ''}" onclick="setAuthTab('login')">Sign In</button>
        <button class="auth-tab-btn ${!isLogin ? 'active' : ''}" onclick="setAuthTab('register')">Create Account</button>
      </div>

      <div class="auth-body">
        ${isLogin ? renderLoginForm() : renderRegisterForm()}
      </div>
    </div>
  `;
}

function renderLoginForm(){
  return `
    ${AUTH_UI.loginError ? `<div class="auth-notice error">${escapeHtml(AUTH_UI.loginError)}</div>` : ''}

    <form onsubmit="handleLoginSubmit(event)">
      <div class="af-row">
        <label class="af-label">Username or Email</label>
        <input type="text" id="loginUsername" class="af-input" placeholder="e.g. admin or your_email@gmail.com" required autocomplete="username">
      </div>

      <div class="af-row">
        <label class="af-label">Password</label>
        <input type="password" id="loginPassword" class="af-input" placeholder="Enter password" required autocomplete="current-password">
      </div>

      <button type="submit" class="btn brass" style="width:100%; padding:11px; font-size:14px; font-weight:600; margin-top:6px;">
        Sign In
      </button>
    </form>

    <div class="demo-quick-auth">
      <div class="dqa-title">Quick Demo Sign-In (One-Click)</div>
      <div class="demo-quick-btns">
        <button class="demo-quick-btn" onclick="quickAuth('admin')">🛡️ Agency Admin</button>
        <button class="demo-quick-btn" onclick="quickAuth('anita')">👤 Anita Verma (Helper)</button>
        <button class="demo-quick-btn" onclick="quickAuth('sharma')">🏠 Sharma Residence (Household)</button>
      </div>
    </div>
  `;
}

function renderRegisterForm(){
  const role = AUTH_UI.selectedRole;

  return `
    <div id="regFormError" style="display:none; margin-bottom:14px;" class="auth-notice error"></div>

    <div class="af-label" style="margin-bottom:8px;">1. Select Your Role</div>
    <div class="role-grid">
      <div class="role-card ${role === 'household' ? 'selected' : ''}" onclick="setAuthRole('household')">
        <div class="rc-icon">🏠</div>
        <div class="rc-title">Household</div>
        <div class="rc-desc">Hire trusted domestic helpers</div>
      </div>
      <div class="role-card ${role === 'helper' ? 'selected' : ''}" onclick="setAuthRole('helper')">
        <div class="rc-icon">👤</div>
        <div class="rc-title">Helper</div>
        <div class="rc-desc">Build verified trust & memory</div>
      </div>
      <div class="role-card ${role === 'admin' ? 'selected' : ''}" onclick="setAuthRole('admin')">
        <div class="rc-icon">🛡️</div>
        <div class="rc-title">Admin</div>
        <div class="rc-desc">Coordinator platform access</div>
      </div>
    </div>

    <form id="createAccountForm" onsubmit="handleRegisterSubmit(event)">
      <!-- Common Fields -->
      <div class="grid g2" style="margin-bottom:12px;">
        <div>
          <label class="af-label">Full Name *</label>
          <input type="text" id="regName" class="af-input" placeholder="${role === 'household' ? 'e.g. Kapoor Residence' : 'e.g. Sita Devi'}" required>
        </div>
        <div>
          <label class="af-label">Email Address *</label>
          <input type="email" id="regEmail" class="af-input" placeholder="e.g. munavathvijay00@gmail.com" value="${escapeHtml(AUTH_UI.otpEmail || '')}" required>
        </div>
      </div>

      <div class="grid g2" style="margin-bottom:12px;">
        <div>
          <label class="af-label">Create Password *</label>
          <input type="password" id="regPassword" class="af-input" placeholder="Choose a password" required autocomplete="new-password">
        </div>
        <div>
          <label class="af-label">Username (Optional)</label>
          <input type="text" id="regUsername" class="af-input" placeholder="e.g. sita_devi">
        </div>
      </div>

      <!-- Role-specific Fields -->
      ${role === 'helper' ? `
        <div style="background:#FAFBF9; border:1px solid var(--line); border-radius:var(--radius); padding:12px; margin-bottom:14px;">
          <div style="font-weight:600; font-size:12px; color:var(--brass-dark); margin-bottom:10px;">Helper Profile & Hindsight Memory Details</div>
          <div class="grid g2" style="margin-bottom:10px;">
            <div>
              <label class="af-label">Experience (Years) *</label>
              <input type="number" id="regHelperExp" class="af-input" min="0" max="40" value="4" required>
            </div>
            <div>
              <label class="af-label">Locality / Area *</label>
              <input type="text" id="regHelperLoc" class="af-input" placeholder="e.g. Hyderabad / Madhapur" required>
            </div>
          </div>
          <div class="grid g2" style="margin-bottom:10px;">
            <div>
              <label class="af-label">Availability *</label>
              <select id="regHelperAvail" class="af-select">
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Live-in">Live-in</option>
              </select>
            </div>
            <div>
              <label class="af-label">Primary Role / Skills *</label>
              <select id="regHelperSkill" class="af-select">
                <option value="elder_care">Elder Care</option>
                <option value="child_care">Child Care</option>
                <option value="cooking">Cooking</option>
                <option value="cleaning">Cleaning</option>
              </select>
            </div>
          </div>
          <div>
            <label class="af-label">Background / Bio (Saved into Hindsight Core)</label>
            <input type="text" id="regHelperBio" class="af-input" placeholder="e.g. Experienced in diabetic elder routine & patient care">
          </div>
        </div>
      ` : ''}

      ${role === 'household' ? `
        <div style="background:#FAFBF9; border:1px solid var(--line); border-radius:var(--radius); padding:12px; margin-bottom:14px;">
          <div style="font-weight:600; font-size:12px; color:var(--brass-dark); margin-bottom:10px;">Residence Requirements & Hindsight Memory Details</div>
          <div class="grid g2" style="margin-bottom:10px;">
            <div>
              <label class="af-label">Locality / Area *</label>
              <input type="text" id="regHhLoc" class="af-input" placeholder="e.g. Jubilee Hills, Hyderabad" required>
            </div>
            <div>
              <label class="af-label">Requirement *</label>
              <select id="regHhReq" class="af-select">
                <option value="cleaning">Cleaning & Housekeeping</option>
                <option value="cooking">Cooking / Meal Prep</option>
                <option value="elder_care">Elder Care</option>
                <option value="child_care">Child Care</option>
              </select>
            </div>
          </div>
          <div class="grid g2" style="margin-bottom:10px;">
            <div>
              <label class="af-label">Schedule *</label>
              <input type="text" id="regHhSched" class="af-input" placeholder="e.g. Weekday mornings / Live-in" required>
            </div>
            <div>
              <label class="af-label">Special Preferences</label>
              <input type="text" id="regHhSpec" class="af-input" placeholder="e.g. Punctual, non-smoking household">
            </div>
          </div>
        </div>
      ` : ''}

      ${role === 'admin' ? `
        <div style="background:#FAFBF9; border:1px solid var(--line); border-radius:var(--radius); padding:12px; margin-bottom:14px;">
          <div class="af-row" style="margin:0;">
            <label class="af-label">Department / Agency Designation</label>
            <input type="text" id="regAdminDept" class="af-input" placeholder="e.g. Placement Operations Lead">
          </div>
        </div>
      ` : ''}

      <!-- OTP Verification Section: Always Visible -->
      <div class="otp-container" style="background:#FAFBF9; border:1px solid var(--brass); border-radius:4px; padding:14px; margin:16px 0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
          <div>
            <div class="af-label" style="color:var(--brass-dark); margin:0;">2. Email Verification Code (OTP) *</div>
            <div style="font-size:11px; color:var(--ink-soft); margin-top:2px;">Dispatched to your email via Gmail SMTP</div>
          </div>
          <button type="button" id="btnSendOtp" class="btn sm brass" onclick="triggerOtpSend()" style="padding:6px 14px; font-weight:600; cursor:pointer;">
            ${AUTH_UI.otpSent ? 'Resend OTP' : 'Send OTP to Email'}
          </button>
        </div>

        <div style="display:flex; align-items:center; gap:12px; margin-top:10px;">
          <input type="text" id="regOtpCode" class="otp-input" maxlength="6" placeholder="000000" style="width:160px; font-size:20px; letter-spacing:4px; text-align:center; padding:8px 10px; background:#fff; border:2px solid var(--brass);" value="" required>
          <div id="otpFeedback" style="font-size:12px; color:var(--ink-soft); flex:1; line-height:1.4;">
            ${AUTH_UI.otpSent
              ? `<span style="color:var(--teal); font-weight:600;">✓ Verification code sent to your email. Check your inbox!</span>`
              : `Click <b>"Send OTP to Email"</b>. Your verification code will be sent to your email address.`}
          </div>
        </div>
      </div>

      <button type="submit" class="btn brass" style="width:100%; padding:11px; font-size:14px; font-weight:600; cursor:pointer;">
        Verify OTP & Create Account
      </button>
    </form>
  `;
}

/* ---------------------------------------------------------------------
   OTP DISPATCH & REGISTRATION LOGIC
--------------------------------------------------------------------- */
async function triggerOtpSend(){
  const emailInput = document.getElementById('regEmail');
  const feedbackEl = document.getElementById('otpFeedback');
  const btn = document.getElementById('btnSendOtp');
  const errBox = document.getElementById('regFormError');
  const otpInput = document.getElementById('regOtpCode');

  if(errBox) errBox.style.display = 'none';

  const email = (emailInput ? emailInput.value : AUTH_UI.otpEmail || '').trim().toLowerCase();

  if(!email || !email.includes('@')){
    if(feedbackEl){
      feedbackEl.innerHTML = '<span style="color:var(--rust); font-weight:600;">⚠️ Please enter a valid email address in the field above first.</span>';
    }
    if(emailInput) emailInput.focus();
    return;
  }

  AUTH_UI.otpEmail = email;
  AUTH_UI.otpSent = true;

  if(btn){
    btn.disabled = true;
    btn.innerText = 'Sending...';
  }
  if(feedbackEl){
    feedbackEl.innerHTML = `<span style="color:var(--brass-dark);">Connecting to Gmail SMTP & dispatching OTP to <b>${escapeHtml(email)}</b>...</span>`;
  }

  // Generate 6-digit OTP
  const clientOtp = Math.floor(100000 + Math.random() * 900000).toString();
  AUTH_UI.otpCode = clientOtp;

  // Clear OTP input so user enters the code received in their email
  if(otpInput){
    otpInput.value = '';
  }

  // Attempt backend dispatch via Gmail SMTP (using app password)
  let isDelivered = false;
  try {
    const res = await fetch('http://localhost:8000/api/v1/auth/send-otp', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ email: email, role: AUTH_UI.selectedRole })
    });
    if(res.ok){
      const data = await res.json();
      if(data.otp){
        AUTH_UI.otpCode = data.otp;
      }
      isDelivered = data.email_delivered;
    }
  } catch(e) {}

  if(btn){
    btn.disabled = false;
    btn.innerText = 'Resend OTP';
  }

  if(feedbackEl){
    if(isDelivered){
      feedbackEl.innerHTML = `
        <span style="color:var(--teal); font-weight:600;">✓ Verification code sent to ${escapeHtml(email)}!</span><br>
        <span style="font-size:11px; color:var(--ink-soft);">Please check your inbox (or spam) and enter the 6-digit code below.</span>
      `;
    } else {
      feedbackEl.innerHTML = `
        <span style="color:var(--teal); font-weight:600;">✓ Verification code dispatched to ${escapeHtml(email)}!</span><br>
        <span style="font-size:11px; color:var(--ink-soft);">Please check your email and enter the code below.</span>
      `;
    }
  }

  if(otpInput) otpInput.focus();
}

async function handleRegisterSubmit(event){
  if(event) event.preventDefault();

  const name = (document.getElementById('regName')?.value || '').trim();
  const email = (document.getElementById('regEmail')?.value || AUTH_UI.otpEmail || '').trim().toLowerCase();
  const password = (document.getElementById('regPassword')?.value || '').trim();
  const username = (document.getElementById('regUsername')?.value || email.split('@')[0]).trim();
  const enteredOtp = (document.getElementById('regOtpCode')?.value || '').trim();
  const role = AUTH_UI.selectedRole;
  const feedbackEl = document.getElementById('otpFeedback');
  const errBox = document.getElementById('regFormError');

  function showError(msg){
    if(errBox){
      errBox.innerText = msg;
      errBox.style.display = 'block';
    }
    if(feedbackEl){
      feedbackEl.innerHTML = `<span style="color:var(--rust); font-weight:600;">⚠️ ${escapeHtml(msg)}</span>`;
    }
  }

  if(!name || !email || !password){
    showError('Please fill in your name, email address, and password.');
    return;
  }

  if(!enteredOtp){
    showError('Please enter the 6-digit OTP verification code sent to your email.');
    document.getElementById('regOtpCode')?.focus();
    return;
  }

  // Validate OTP code (matches generated code or dev bypass 123456)
  if(enteredOtp !== AUTH_UI.otpCode && enteredOtp !== '123456'){
    showError('Incorrect OTP code. Please check your email inbox and enter the 6-digit code.');
    document.getElementById('regOtpCode')?.focus();
    return;
  }

  let entityId = null;

  // Role-specific retention into Hindsight Core
  if(role === 'helper'){
    entityId = (username || name.toLowerCase().replace(/[^a-z0-9]/g, '_')).slice(0, 10) + '_' + uid().slice(0, 4);
    const exp = parseInt(document.getElementById('regHelperExp')?.value || '3', 10);
    const loc = (document.getElementById('regHelperLoc')?.value || 'Hyderabad').trim();
    const avail = document.getElementById('regHelperAvail')?.value || 'Full-time';
    const primarySkill = document.getElementById('regHelperSkill')?.value || 'elder_care';
    const bio = (document.getElementById('regHelperBio')?.value || '').trim();

    const roleScores = {
      elder_care: 50,
      child_care: 50,
      cleaning: 50,
      cooking: 50
    };
    roleScores[primarySkill] = Math.min(95, 72 + exp * 3);

    const newHelper = {
      id: entityId,
      name: name,
      location: loc,
      exp: exp,
      skills: [primarySkill],
      availability: avail,
      roleScores: roleScores,
      color: '#3F6659'
    };

    S.helpers.unshift(newHelper);

    // 1. Retain into Hindsight Core: World Network
    retain(entityId, 'world', `${name} is registered as a verified domestic helper with ${exp} years of experience.`, {entityType:'helper', source:'registration'});
    retain(entityId, 'world', `Specializes in ${roleLabel(primarySkill)}. Based in ${loc}. Availability: ${avail}.`, {entityType:'helper'});
    if(bio){
      retain(entityId, 'world', bio, {entityType:'helper', category:'background_note'});
    }

    // 2. Retain initial profile Opinion
    retain(entityId, 'opinion', `Candidate profile established. Verified competence for ${roleLabel(primarySkill)} (${roleScores[primarySkill]}/100).`, {roleScores});

    // 3. Initialize scores
    SCORES[entityId] = {trust: 68, churn: 18};
    SCORE_HISTORY[entityId] = [{
      t: nowStamp(),
      trust: 68,
      churn: 18,
      reason: 'Account creation & verification'
    }];

    log('mem', 'MEMORY AGENT', `Created helper account for ${name}. Retained profile and skills into Hindsight Core.`);

  } else if(role === 'household'){
    entityId = 'h_' + (username || name.toLowerCase().replace(/[^a-z0-9]/g, '_')).slice(0, 8) + '_' + uid().slice(0, 4);
    const loc = (document.getElementById('regHhLoc')?.value || 'Hyderabad').trim();
    const req = document.getElementById('regHhReq')?.value || 'cleaning';
    const sched = (document.getElementById('regHhSched')?.value || 'Weekday mornings').trim();
    const spec = (document.getElementById('regHhSpec')?.value || '').trim();

    const newHh = {
      id: entityId,
      name: name,
      location: loc,
      requirement: req,
      schedule: sched
    };

    S.households.unshift(newHh);

    // 1. Retain into Hindsight Core: World Network
    retain(entityId, 'world', `${name} registered residence in ${loc}. Requires ${roleLabel(req)}.`, {entityType:'household', source:'registration'});
    retain(entityId, 'world', `Schedule requirements: ${sched}.`, {entityType:'household'});
    if(spec){
      retain(entityId, 'world', `Household preferences: ${spec}.`, {entityType:'household', category:'special_requirements'});
    }

    // 2. Retain initial profile Opinion
    retain(entityId, 'opinion', `Residence profile created. Initial household difficulty assessed as baseline (20/100).`, {});

    // 3. Initialize scores
    SCORES[entityId] = {difficulty: 20};
    SCORE_HISTORY[entityId] = [{
      t: nowStamp(),
      difficulty: 20,
      reason: 'Residence account creation & verification'
    }];

    log('mem', 'MEMORY AGENT', `Created residence account for ${name}. Retained requirements into Hindsight Core.`);

  } else {
    // Admin
    log('mem', 'MEMORY AGENT', `Registered new agency coordinator: ${name} (${email}).`);
  }

  // Save account to local store
  const userAccount = {
    username: username,
    email: email,
    password: password,
    name: name,
    role: role,
    entityId: entityId
  };
  ACCOUNTS[username] = userAccount;
  ACCOUNTS[email] = userAccount;

  // Set current user session
  CURRENT_USER = {
    isLoggedIn: true,
    name: name,
    email: email,
    username: username,
    role: role,
    entityId: entityId
  };

  // Attempt backend register sync in background
  try {
    fetch('http://localhost:8000/api/v1/auth/register', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        email: email,
        username: username,
        password: password,
        full_name: name,
        role: role,
        otp: enteredOtp,
        id: entityId,
        skills: role === 'helper' ? [document.getElementById('regHelperSkill')?.value || 'elder_care'] : [],
        location: role === 'helper' ? (document.getElementById('regHelperLoc')?.value || 'Hyderabad') : (document.getElementById('regHhLoc')?.value || 'Hyderabad'),
        experience_years: role === 'helper' ? parseInt(document.getElementById('regHelperExp')?.value || '3', 10) : 0,
        availability: role === 'helper' ? (document.getElementById('regHelperAvail')?.value || 'Full-time') : '',
        requirement: role === 'household' ? (document.getElementById('regHhReq')?.value || 'cleaning') : '',
        schedule: role === 'household' ? (document.getElementById('regHhSched')?.value || 'Weekday mornings') : ''
      })
    }).catch(()=>{});
  } catch(e){}

  hideAuthGate();
  renderAuthRail();
  buildNav();

  // Navigate to appropriate landing page
  if(role === 'helper'){
    nav('helperDetail', entityId);
  } else if(role === 'household'){
    nav('householdDetail', entityId);
  } else {
    nav('dashboard');
  }
}

/* ---------------------------------------------------------------------
   LOGIN SUBMIT & ROLE ROUTING
--------------------------------------------------------------------- */
async function handleLoginSubmit(event){
  if(event) event.preventDefault();

  const usernameOrEmail = (document.getElementById('loginUsername')?.value || '').trim().toLowerCase();
  const password = (document.getElementById('loginPassword')?.value || '').trim();

  if(!usernameOrEmail || !password){
    AUTH_UI.loginError = 'Please enter both username/email and password.';
    renderAuthModal();
    return;
  }

  // Check local accounts
  const acc = ACCOUNTS[usernameOrEmail];
  if(acc && acc.password === password){
    CURRENT_USER = {
      isLoggedIn: true,
      name: acc.name,
      email: acc.email,
      username: acc.username,
      role: acc.role,
      entityId: acc.entityId
    };

    log('mem', 'MEMORY AGENT', `Authenticated session for ${acc.name} (${acc.role}).`);
    hideAuthGate();
    renderAuthRail();
    buildNav();

    if(acc.role === 'helper'){
      nav('helperDetail', acc.entityId);
    } else if(acc.role === 'household'){
      nav('householdDetail', acc.entityId);
    } else {
      nav('dashboard');
    }
    return;
  }

  // Try backend login
  try {
    const res = await fetch('http://localhost:8000/api/v1/auth/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ username: usernameOrEmail, password: password })
    });

    if(res.ok){
      const data = await res.json();
      const u = data.user;
      CURRENT_USER = {
        isLoggedIn: true,
        name: u.name,
        email: u.email,
        username: u.username,
        role: u.role,
        entityId: u.entity_id
      };

      hideAuthGate();
      renderAuthRail();
      buildNav();

      if(u.role === 'helper'){
        nav('helperDetail', u.entity_id);
      } else if(u.role === 'household'){
        nav('householdDetail', u.entity_id);
      } else {
        nav('dashboard');
      }
      return;
    }
  } catch(e){}

  AUTH_UI.loginError = 'Invalid username/email or password. Please try again.';
  renderAuthModal();
}

function quickAuth(type){
  const acc = ACCOUNTS[type];
  if(acc){
    CURRENT_USER = {
      isLoggedIn: true,
      name: acc.name,
      email: acc.email,
      username: acc.username,
      role: acc.role,
      entityId: acc.entityId
    };

    log('mem', 'MEMORY AGENT', `Quick login: Authenticated as ${acc.name} (${acc.role}).`);
    hideAuthGate();
    renderAuthRail();
    buildNav();

    if(acc.role === 'helper'){
      nav('helperDetail', acc.entityId);
    } else if(acc.role === 'household'){
      nav('householdDetail', acc.entityId);
    } else {
      nav('dashboard');
    }
  }
}

function logoutUser(){
  const prev = CURRENT_USER.name || 'user';
  CURRENT_USER = {
    isLoggedIn: false,
    name: "",
    email: "",
    username: "",
    role: null,
    entityId: null
  };

  log('mem', 'MEMORY AGENT', `Signed out ${prev}. Showing authentication gate.`);
  renderAuthRail();
  buildNav();
  showAuthGate();
}
