/* =========================================================================
   ui/render.js — router: nav(), renderCurrentPage(), highlightNav(), role guards
   ========================================================================= */

const ROUTABLE = ['dashboard', 'people', 'helpers', 'households', 'helperDetail', 'householdDetail', 'memory', 'matching', 'voice', 'activity'];

/** #/page or #/page/param -> {page, param}; null when the hash is empty or unknown. */
function routeFromHash(){
  if(typeof location === 'undefined') return null;
  const m = String(location.hash || '').match(/^#\/([A-Za-z]+)(?:\/([^/]+))?$/);
  if(!m || !ROUTABLE.includes(m[1])) return null;
  return {page: m[1], param: m[2] ? decodeURIComponent(m[2]) : null};
}

function writeHash(page, param){
  if(typeof location === 'undefined' || typeof history === 'undefined' || !history.pushState) return;
  const h = '#/' + page + (param ? '/' + encodeURIComponent(param) : '');
  if(location.hash !== h) history.pushState(null, '', h);
}

function nav(page, param, opts){
  // Check authentication gate
  if(!CURRENT_USER || !CURRENT_USER.isLoggedIn){
    showAuthGate();
    return;
  }

  // Role-based route enforcement
  if(CURRENT_USER.role === 'helper'){
    // Workers can only see their own profile, memory timeline, and settings
    if(page === 'helperDetail'){
      param = CURRENT_USER.entityId;
    } else {
      page = 'helperDetail';
      param = CURRENT_USER.entityId;
    }
  } else if(CURRENT_USER.role === 'household'){
    // Residencies can only see their own residence profile, placement history, and settings
    if(page === 'householdDetail'){
      param = CURRENT_USER.entityId;
    } else {
      page = 'householdDetail';
      param = CURRENT_USER.entityId;
    }
  }

  if(page === 'dashboard' && typeof dashData !== 'undefined') dashData = null; // fresh numbers on every visit
  route = {page, param};
  if(!(opts && opts.fromHash)) writeHash(page, param);
  renderCurrentPage();
  window.scrollTo(0, 0);
  highlightNav();
}

function renderCurrentPage(){
  const c = document.getElementById('content');
  if(!c) return;

  if(!CURRENT_USER || !CURRENT_USER.isLoggedIn){
    showAuthGate();
    c.innerHTML = `
      <div class="empty">
        <h3>Authentication Required</h3>
        <p>Please sign in or create an account to access TrustMemory AI.</p>
        <button class="btn brass" style="margin-top:14px;" onclick="showAuthGate()">Open Sign In Gate</button>
      </div>
    `;
    return;
  }

  switch(route.page){
    case 'dashboard':
      if(CURRENT_USER.role !== 'admin'){
        nav(CURRENT_USER.role === 'helper' ? 'helperDetail' : 'householdDetail', CURRENT_USER.entityId);
        return;
      }
      c.innerHTML = pageDashboard();
      if(typeof wireDashboard === 'function') wireDashboard();
      break;

    case 'people':
    case 'helpers':
    case 'households':
      if(CURRENT_USER.role !== 'admin'){
        nav(CURRENT_USER.role === 'helper' ? 'helperDetail' : 'householdDetail', CURRENT_USER.entityId);
        return;
      }
      c.innerHTML = pagePeople(route.page === 'households' ? 'households' : (route.page === 'helpers' ? 'helpers' : (route.param || peopleTab)));
      if(typeof wirePeople === 'function') wirePeople();
      break;

    case 'helperDetail':
      // If helper role, always lock to their own ID
      const targetHelperId = (CURRENT_USER.role === 'helper') ? CURRENT_USER.entityId : (route.param || 'anita');
      c.innerHTML = pageHelperDetail(targetHelperId);
      if(typeof wireHelperDetail === 'function') wireHelperDetail(targetHelperId);
      break;

    case 'householdDetail':
      // If household role, always lock to their own ID
      const targetHouseholdId = (CURRENT_USER.role === 'household') ? CURRENT_USER.entityId : (route.param || 'h101');
      c.innerHTML = pageHouseholdDetail(targetHouseholdId);
      if(typeof wireHouseholdDetail === 'function') wireHouseholdDetail(targetHouseholdId);
      break;


    case 'memory':
      c.innerHTML = pageMemory();
      if(typeof wireMemory === 'function') wireMemory();
      break;

    case 'matching':
      if(CURRENT_USER.role !== 'admin'){
        nav(CURRENT_USER.role === 'helper' ? 'helperDetail' : 'householdDetail', CURRENT_USER.entityId);
        return;
      }
      c.innerHTML = pageMatching();
      if(typeof wireMatching === 'function') wireMatching();
      break;


    case 'voice':
      if(CURRENT_USER.role !== 'admin'){
        nav(CURRENT_USER.role === 'helper' ? 'helperDetail' : 'householdDetail', CURRENT_USER.entityId);
        return;
      }
      c.innerHTML = pageVoice();
      if(typeof wireVoice === 'function') wireVoice();
      break;

    case 'activity':
      if(CURRENT_USER.role !== 'admin'){
        nav(CURRENT_USER.role === 'helper' ? 'helperDetail' : 'householdDetail', CURRENT_USER.entityId);
        return;
      }
      c.innerHTML = pageActivity();
      break;




    default:
      c.innerHTML = '<div class="empty">Not found.</div>';
  }
}

function highlightNav(){
  const navItems = getNavForCurrentUser();
  document.querySelectorAll('#navlist button').forEach(b => {
    const id = b.dataset.id;
    const isAct = id === route.page ||
      (route.page === 'helperDetail' && (id === 'people' || id === 'helperDetail')) ||
      (route.page === 'householdDetail' && (id === 'people' || id === 'householdDetail')) ||
      ((route.page === 'helpers' || route.page === 'households') && id === 'people');
    b.classList.toggle('active', isAct);
  });
}

function buildNav(){
  const el = document.getElementById('navlist');
  if(!el) return;

  const currentNav = getNavForCurrentUser();
  el.innerHTML = currentNav.map(n => `<button data-id="${n.id}"><span class="dot"></span>${n.label}</button>`).join('');

  el.querySelectorAll('button').forEach((b, i) => {
    b.onclick = () => {
      const item = currentNav[i];
      if(item.id === 'helperDetail'){
        nav('helperDetail', CURRENT_USER.entityId);
      } else if(item.id === 'householdDetail'){
        nav('householdDetail', CURRENT_USER.entityId);
      } else if(item.id === 'memory' && CURRENT_USER.role === 'helper'){
        nav('memory', CURRENT_USER.entityId);
      } else {
        nav(item.id, null);
      }
    };
  });
}
