/* =========================================================================
   ui/render.js — router: nav(), renderCurrentPage(), highlightNav(), role guards
   ========================================================================= */

function nav(page, param){
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
    } else if(page === 'memory'){
      param = CURRENT_USER.entityId;
    } else if(page !== 'settings'){
      page = 'helperDetail';
      param = CURRENT_USER.entityId;
    }
  } else if(CURRENT_USER.role === 'household'){
    // Residencies can only see their own residence profile, placement history, and settings
    if(page === 'householdDetail'){
      param = CURRENT_USER.entityId;
    } else if(page === 'placements'){
      // Allowed
    } else if(page !== 'settings'){
      page = 'householdDetail';
      param = CURRENT_USER.entityId;
    }
  }

  route = {page, param};
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

    case 'helpers':
      if(CURRENT_USER.role !== 'admin'){
        nav('helperDetail', CURRENT_USER.entityId);
        return;
      }
      c.innerHTML = pageHelpers();
      if(typeof wireHelpers === 'function') wireHelpers();
      break;

    case 'helperDetail':
      // If helper role, always lock to their own ID
      const targetHelperId = (CURRENT_USER.role === 'helper') ? CURRENT_USER.entityId : (route.param || 'anita');
      c.innerHTML = pageHelperDetail(targetHelperId);
      if(typeof wireHelperDetail === 'function') wireHelperDetail(targetHelperId);
      break;

    case 'households':
      if(CURRENT_USER.role !== 'admin'){
        nav('householdDetail', CURRENT_USER.entityId);
        return;
      }
      c.innerHTML = pageHouseholds();
      if(typeof wireHouseholds === 'function') wireHouseholds();
      break;

    case 'householdDetail':
      // If household role, always lock to their own ID
      const targetHouseholdId = (CURRENT_USER.role === 'household') ? CURRENT_USER.entityId : (route.param || 'h101');
      c.innerHTML = pageHouseholdDetail(targetHouseholdId);
      if(typeof wireHouseholdDetail === 'function') wireHouseholdDetail(targetHouseholdId);
      break;

    case 'placements':
      c.innerHTML = pagePlacements();
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

    case 'insights':
      if(CURRENT_USER.role !== 'admin'){
        nav(CURRENT_USER.role === 'helper' ? 'helperDetail' : 'householdDetail', CURRENT_USER.entityId);
        return;
      }
      c.innerHTML = pageInsights();
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

    case 'demo':
      if(CURRENT_USER.role !== 'admin'){
        nav(CURRENT_USER.role === 'helper' ? 'helperDetail' : 'householdDetail', CURRENT_USER.entityId);
        return;
      }
      c.innerHTML = pageDemo();
      if(typeof wireDemo === 'function') wireDemo();
      break;

    case 'architecture':
      c.innerHTML = pageArchitecture();
      break;

    case 'settings':
      c.innerHTML = pageSettings();
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
      (route.page === 'helperDetail' && (id === 'helpers' || id === 'helperDetail')) ||
      (route.page === 'householdDetail' && (id === 'households' || id === 'householdDetail'));
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
