/* =========================================================================
   ui/people-page.js — one roster for helpers and households, as two tabs.
   Each person's detail page (helpers-page.js / households-page.js) is unchanged.
   ========================================================================= */

let peopleTab = 'helpers';

function pagePeople(tab){
  peopleTab = tab === 'households' ? 'households' : 'helpers';
  const tabBtn = (id, label, n) => `<button data-tab="${id}" class="${peopleTab === id ? 'active' : ''}" onclick="nav('people', '${id}')">${label} <span style="color:var(--ink-faint); font-weight:400;">(${n})</span></button>`;
  const body = peopleTab === 'helpers' ? pageHelpers() : pageHouseholds();
  return `
    <div class="tabs" style="margin-bottom:18px;">
      ${tabBtn('helpers', 'Helpers', S.helpers.length)}
      ${tabBtn('households', 'Households', S.households.length)}
    </div>
    ${body}`;
}

function wirePeople(){
  if(peopleTab === 'helpers' && typeof wireHelpers === 'function') wireHelpers();
  if(peopleTab === 'households' && typeof wireHouseholds === 'function') wireHouseholds();
}
