/**
 * Light / dark theme. The choice is kept in localStorage; on a first visit the OS preference
 * decides. index.html and helper.html set the theme in <head> before first paint; this file adds
 * the toggle buttons (sidebar footer, sign-in corner) and keeps everything in sync.
 */
const THEME_KEY = 'tm-theme';

function themeStored(){
  try { const v = localStorage.getItem(THEME_KEY); return v === 'dark' || v === 'light' ? v : null; } catch(e){ return null; }
}

function themePreferred(){
  const stored = themeStored();
  if(stored) return stored;
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch(e){ return 'light'; }
}

function themeCurrent(){
  const root = typeof document !== 'undefined' && document.documentElement;
  return root && root.dataset && root.dataset.theme === 'dark' ? 'dark' : 'light';
}

const THEME_ICONS = {
  // Shown when the theme is light: a moon ("switch to dark"); when dark: a sun.
  moon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  sun: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
};

function themeButtonHtml(){
  const dark = themeCurrent() === 'dark';
  return dark ? THEME_ICONS.sun : THEME_ICONS.moon;
}

function themeRefreshButtons(){
  if(typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
  const dark = themeCurrent() === 'dark';
  document.querySelectorAll('.theme-toggle').forEach(b => {
    b.innerHTML = themeButtonHtml();
    b.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    b.setAttribute('aria-label', b.title);
  });
}

function themeApply(theme, {animate = false} = {}){
  const root = typeof document !== 'undefined' && document.documentElement;
  if(!root || !root.dataset) return;
  if(animate && root.classList){
    root.classList.add('theme-anim');
    setTimeout(() => root.classList.remove('theme-anim'), 450);
  }
  root.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  themeRefreshButtons();
}

function themeToggle(){
  const next = themeCurrent() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch(e){ /* private mode: still switch for this page */ }
  themeApply(next, {animate: true});
}

/** Sidebar footer button next to "Reload data", and a corner button on the sign-in screens. */
function themeMountButtons(){
  if(typeof document === 'undefined' || typeof document.getElementById !== 'function' || typeof document.createElement !== 'function') return;
  const foot = document.querySelector && document.querySelector('#rail .rail-foot');
  if(foot && !document.getElementById('themeToggle')){
    const b = document.createElement('button');
    b.id = 'themeToggle'; b.type = 'button'; b.className = 'theme-toggle';
    b.onclick = themeToggle;
    foot.append(b);
  }
  if(document.body && !document.getElementById('themeToggleFloat')){
    const f = document.createElement('button');
    f.id = 'themeToggleFloat'; f.type = 'button'; f.className = 'theme-toggle';
    f.onclick = themeToggle;
    document.body.append(f);
  }
  themeRefreshButtons();
}

// Apply now (index.html's <head> already did, this covers pages that did not), then add buttons.
if(typeof document !== 'undefined' && document.documentElement && document.documentElement.dataset && !document.documentElement.dataset.theme){
  themeApply(themePreferred());
}
if(typeof document !== 'undefined' && typeof document.addEventListener === 'function'){
  if(document.readyState && document.readyState !== 'loading') themeMountButtons();
  else document.addEventListener('DOMContentLoaded', themeMountButtons);
}
// Follow the OS setting live, unless the user picked a theme here.
try {
  if(typeof matchMedia === 'function'){
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = e => { if(!themeStored()) themeApply(e.matches ? 'dark' : 'light', {animate: true}); };
    if(mq.addEventListener) mq.addEventListener('change', onChange);
  }
} catch(e){ /* older browsers */ }
