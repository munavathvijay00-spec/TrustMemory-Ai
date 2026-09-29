/* global document, location, window -- used inside page.evaluate(), which runs in Chrome */
/**
 * Real-browser test: the app in headless Chrome, signed in with the one-click demo buttons as each
 * role, every page opened. Fails on a JavaScript error, a resource the Content Security Policy
 * blocks, a server error (5xx), text like "undefined" or "NaN" on screen, or a page wider than a
 * phone. Groq and Hindsight are not configured, so nothing leaves the machine and the app runs on
 * its local data.
 *
 *   npm run test:browser        (CHROME_PATH overrides where Chrome is found)
 */
process.env.TRUSTMEMORY_DB = ':memory:';
for (const k of ['GROQ_API_KEYS', 'GROQ_API_KEY', 'HINDSIGHT_API_KEY', 'HINDSIGHT_API_URL', 'AZURE_SPEECH_KEY']) process.env[k] = '';
process.env.DEMO_COORDINATOR_PASSWORD = 'BrowserCoord2026';
process.env.DEMO_HELPER_PASSWORD = 'BrowserHelper2026';
process.env.DEMO_HOUSEHOLD_PASSWORD = 'BrowserHome2026';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { createApp } = require('../server/app');

const CHROME = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => p && fs.existsSync(p));

const COORDINATOR_PAGES = ['dashboard', 'people', 'people/households', 'helperDetail/radha', 'householdDetail/h105', 'memory', 'matching', 'voice', 'activity', 'helperDetail/nobody'];
const wait = ms => new Promise(r => setTimeout(r, ms));

test('browser: every page, as every role, on desktop and phone, renders cleanly', { skip: !CHROME && 'Chrome not found (set CHROME_PATH)', timeout: 240_000 }, async () => {
  const server = await new Promise(resolve => { const s = createApp({ port: 0 }).listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const problems = [];
  try {
    const visit = async (role, pages, viewport) => {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.setViewport(viewport);
      const where = () => `${role}@${viewport.width} ${page.url().replace(base, '')}`;
      page.on('pageerror', e => problems.push(`${where()} JS error: ${e.message}`));
      page.on('console', m => { if (/Content Security Policy|Refused to/.test(m.text())) problems.push(`${where()} blocked: ${m.text().slice(0, 160)}`); });
      page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 500 && r.status() !== 503) problems.push(`${where()} ${r.status()} ${r.url().replace(base, '')}`); });

      await page.goto(base + '/', { waitUntil: 'networkidle0' });
      await page.waitForSelector(`[data-demo="${role}"]`, { timeout: 10_000 });
      await page.click(`[data-demo="${role}"]`);
      await page.waitForFunction(() => !document.querySelector('.auth-card'), { timeout: 15_000 });
      for (const p of pages) {
        if (p) await page.evaluate(h => { location.hash = '#/' + h; }, p);
        await wait(1200);
        const r = await page.evaluate(() => {
          const text = (document.getElementById('content') || document.body).innerText;
          return {
            length: text.length,
            bad: (text.match(/[^\n]{0,30}\b(undefined|NaN|\[object Object\])[^\n]{0,30}/g) || []).slice(0, 2),
            overflow: document.documentElement.scrollWidth - window.innerWidth,
          };
        });
        if (r.length < 40) problems.push(`${where()} nearly empty (${r.length} chars)`);
        if (r.bad.length) problems.push(`${where()} shows ${JSON.stringify(r.bad)}`);
        if (r.overflow > 4) problems.push(`${where()} is ${r.overflow}px wider than the screen`);
      }
      await ctx.close();
    };
    const desktop = { width: 1366, height: 800 };
    const phone = { width: 390, height: 844, isMobile: true, hasTouch: true };
    await visit('coordinator', COORDINATOR_PAGES, desktop);
    await visit('coordinator', ['dashboard', 'helperDetail/radha', 'householdDetail/h105', 'voice'], phone);
    for (const role of ['helper', 'household']) {
      await visit(role, [''], desktop);
      await visit(role, [''], phone);
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  assert.deepEqual(problems, []);
});
