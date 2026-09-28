/**
 * Frontend smoke test: loads every script that index.html loads, in order, into one vm
 * context (like browser <script> tags sharing a global scope) with a minimal DOM stub,
 * then renders every page of the coordinator console. Catches syntax errors, missing
 * globals and pages that throw while rendering. No network: fetch rejects.
 */
require('./support');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../TrustMemory-AI-modular');

function scriptsFromIndex() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
}

function makeElement() {
  return {
    innerHTML: '', innerText: '', textContent: '', value: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    querySelectorAll: () => [], querySelector: () => null,
    addEventListener() {}, removeEventListener() {}, appendChild() {}, setAttribute() {}, focus() {}, scrollIntoView() {},
  };
}

function makeContext() {
  const elements = new Map();
  const document = {
    readyState: 'loading',
    getElementById: (id) => { if (!elements.has(id)) elements.set(id, makeElement()); return elements.get(id); },
    querySelectorAll: () => [], querySelector: () => null,
    createElement: () => makeElement(),
    addEventListener() {}, body: makeElement(),
  };
  const ctx = {
    document, console: { log() {}, warn() {}, error() {}, info() {} },
    fetch: () => Promise.reject(new Error('offline')),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: 'http://localhost:3000/', origin: 'http://localhost:3000', search: '', hash: '' },
    navigator: { userAgent: 'node' },
    alert() {}, confirm: () => true, scrollTo() {},
    URLSearchParams, URL, Date, Math, JSON, Promise,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  return ctx;
}

test('frontend: every script in index.html loads and every console page renders', () => {
  const ctx = makeContext();
  const scripts = scriptsFromIndex();
  assert.ok(scripts.length > 10);
  for (const src of scripts) {
    const code = fs.readFileSync(path.join(ROOT, src), 'utf8');
    vm.runInContext(code, ctx, { filename: src });
  }
  vm.runInContext('initApp()', ctx);

  const pages = ['dashboard', 'people', 'helpers', 'households', 'memory', 'matching', 'voice', 'activity'];
  for (const page of pages) {
    vm.runInContext(`nav(${JSON.stringify(page)}, null)`, ctx);
    const html = ctx.document.getElementById('content').innerHTML;
    assert.ok(html.length > 50, page + ' rendered');
    assert.doesNotMatch(html, /Not found\./, page);
  }
  vm.runInContext("nav('helperDetail', 'radha')", ctx);
  assert.match(ctx.document.getElementById('content').innerHTML, /Radha Kumari/);

  // Helpers and households share the People page as two tabs.
  vm.runInContext("nav('people', 'households')", ctx);
  assert.match(ctx.document.getElementById('content').innerHTML, /Iyer Residence/);
  // The removed pages are gone from the navigation.
  const navIds = vm.runInContext('NAV_ADMIN.map(n => n.id)', ctx);
  assert.deepEqual([...navIds], ['dashboard', 'people', 'memory', 'matching', 'voice', 'activity']);
});

test('frontend: simulated agents are gone and no script references them', () => {
  const removed = ['triggerEvent', 'findMatches', 'ensureBackupStaged', 'matchWhy', 'reflectOnRoleFit', 'classifySeverity', 'globalNetworkCount', 'ensureWorldMemory', 'NETWORK_META', 'EVENT_LABELS', 'labelForShort'];
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (/\.(js|html)$/.test(e.name)) files.push(p);
    }
  })(ROOT);
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const name of removed) assert.ok(!new RegExp('\\b' + name + '\\b').test(src), `${path.relative(ROOT, f)} still references ${name}`);
  }
  assert.ok(!fs.existsSync(path.join(ROOT, 'js/event-workflow.js')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'js/agents/matching-agent.js')));
});

// households-page.js (owned elsewhere) reads an undefined `h` in pageHouseholdDetail; flip this
// to a normal test once that is fixed.
test('frontend: household detail page renders', () => {
  const ctx = makeContext();
  for (const src of scriptsFromIndex()) vm.runInContext(fs.readFileSync(path.join(ROOT, src), 'utf8'), ctx, { filename: src });
  vm.runInContext("nav('householdDetail', 'h104')", ctx);
  assert.match(ctx.document.getElementById('content').innerHTML, /Iyer Residence/);
});
