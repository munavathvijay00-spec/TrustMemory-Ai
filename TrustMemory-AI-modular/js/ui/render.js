/* =========================================================================
   ui/render.js — router: nav(), renderCurrentPage(), highlightNav(), role guards
   ========================================================================= */

const ROUTABLE = ['dashboard', 'people', 'helpers', 'households', 'helperDetail', 'householdDetail', 'memory', 'matching', 'voice', 'activity', 'helperHome', 'householdHome'];
const ADMIN_ONLY = ['dashboard', 'people', 'helpers', 'households', 'helperDetail', 'householdDetail', 'memory', 'matching', 'voice', 'activity'];

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
  // Signed out: the sign-in screen. Helpers and households only ever see their own home page.
  if(!CURRENT_USER || !CURRENT_USER.isLoggedIn){
    showAuthGate();
    return;
  }
  if(CURRENT_USER.role !== 'admin'){
    const home = homePageFor();
    // A typed or bookmarked coordinator URL: show the home page and correct the address bar too.
    if(page !== home && opts && opts.fromHash && typeof history !== 'undefined' && history.replaceState) history.replaceState(null, '', '#/' + home);
    page = home;
    param = null;
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
    return;
  }
  // A helper or household that lands on a coordinator page (old link, typed hash) goes home.
  if(CURRENT_USER.role !== 'admin' && ADMIN_ONLY.includes(route.page)){
    nav(homePageFor());
    return;
  }
  if(CURRENT_USER.role === 'admin' && (route.page === 'helperHome' || route.page === 'householdHome')){
    nav('dashboard');
    return;
  }

  switch(route.page){
    case 'dashboard':
      c.innerHTML = pageDashboard();
      if(typeof wireDashboard === 'function') wireDashboard();
      break;

    case 'people':
    case 'helpers':
    case 'households':
      c.innerHTML = pagePeople(route.page === 'households' ? 'households' : (route.page === 'helpers' ? 'helpers' : (route.param || peopleTab)));
      if(typeof wirePeople === 'function') wirePeople();
      break;

    case 'helperDetail':
      const targetHelperId = route.param || 'anita';
      c.innerHTML = pageHelperDetail(targetHelperId);
      if(typeof wireHelperDetail === 'function') wireHelperDetail(targetHelperId);
      break;

    case 'householdDetail':
      const targetHouseholdId = route.param || 'h101';
      c.innerHTML = pageHouseholdDetail(targetHouseholdId);
      if(typeof wireHouseholdDetail === 'function') wireHouseholdDetail(targetHouseholdId);
      break;


    case 'memory':
      c.innerHTML = pageMemory();
      if(typeof wireMemory === 'function') wireMemory();
      break;

    case 'matching':
      c.innerHTML = pageMatching();
      if(typeof wireMatching === 'function') wireMatching();
      break;


    case 'voice':
      c.innerHTML = pageVoice();
      if(typeof wireVoice === 'function') wireVoice();
      break;

    case 'activity':
      c.innerHTML = pageActivity();
      break;




    case 'helperHome':
      c.innerHTML = pageHelperHome();
      if(typeof wireHelperHome === 'function') wireHelperHome();
      break;

    case 'householdHome':
      c.innerHTML = pageHouseholdHome();
      if(typeof wireHouseholdHome === 'function') wireHouseholdHome();
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
    b.onclick = () => nav(currentNav[i].id, null);
  });
}
