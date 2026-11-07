// Production acceptance: node tools/e2e-prod.mjs   (npm run e2e:prod)
// Builds the app, serves dist/ at /lab/ with the production CSP header, proxies /lab/api to the real compile service
// (LAB_COMPILE_URL, default http://127.0.0.1:8787) and drives Blink in a real browser WITHOUT the dev-only window.__lab.
// Asserts: no CSP violations (securitypolicyviolation events + console), simulator worker starts, Blink compiles and the LED blinks.
//
// Production CSP (the main site must send at least this for /lab/):
//   default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
//   worker-src 'self' blob:; connect-src 'self'
// style-src needs 'unsafe-inline' because CodeMirror injects <style> elements and three/R3F set inline styles; the
// index.html favicon is a data: URI (img-src data:); the simulator runs in a same-origin module Worker (worker-src 'self').
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromeExecutable, compileOrigin, GL_ARGS } from './browser.mjs';

export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'";
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const COMPILE = new URL(compileOrigin());
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };

if (!process.env.LAB_SKIP_BUILD) execSync('npm run build', { cwd: root, stdio: 'inherit' });
const compileUp = await fetch(`${COMPILE.origin}/lab/api/health`).then((r) => r.ok, () => false);
if (!compileUp) { console.log(`FAIL compile service not reachable at ${COMPILE.origin} (see docs/DEPLOY.md)`); process.exit(2); }

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/lab/api/')) {
    const up = httpRequest({ host: COMPILE.hostname, port: COMPILE.port, path: url.pathname + url.search, method: req.method, headers: { ...req.headers, host: COMPILE.host } }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on('error', () => { res.writeHead(502).end(); });
    req.pipe(up);
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname.replace(/^\/lab\/?/, ''))).replace(/^(\.\.[/\\])+/, '');
  let file = join(dist, rel);
  if (!url.pathname.startsWith('/lab') || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': CSP, 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/lab/`;

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: GL_ARGS });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    localStorage.setItem('coms-lab:tutorial-done', '1');
    localStorage.setItem('coms-lab:perf-notice', '1');
  });
  const page = await ctx.newPage();
  const consoleMsgs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleMsgs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => consoleMsgs.push(`pageerror: ${e}`));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas');
  check('production build has no dev hook', !(await page.evaluate(() => '__lab' in window)));

  await page.getByRole('button', { name: '실행', exact: true }).click();
  await page.waitForSelector('.chip.run', { timeout: 60_000 });
  check('Blink compiled through the proxied /lab/api and is running', true);
  check('simulator worker started', page.workers().length > 0, `workers=${page.workers().length}`);
  const seen = new Set();
  for (let i = 0; i < 60 && seen.size < 2; i++) {
    seen.add(await page.locator('#led-status').getAttribute('data-lit'));
    await page.waitForTimeout(100);
  }
  check('LED turns on and off (accessibility state)', seen.size >= 2, JSON.stringify([...seen]));

  const csp = await page.evaluate(() => window.__csp);
  const cspConsole = consoleMsgs.filter((m) => /content security policy|refused to/i.test(m));
  check('no CSP violation events', csp.length === 0, csp.slice(0, 3).join(' | '));
  check('no CSP errors in console', cspConsole.length === 0, cspConsole.slice(0, 3).join(' | '));
  check('no console errors', consoleMsgs.filter((m) => m.startsWith('error') || m.startsWith('pageerror')).length === 0, consoleMsgs.slice(0, 3).join(' | '));
} catch (e) {
  console.log('ABORT', String(e).split('\n')[0]);
  results.push({ name: 'script aborted', ok: false });
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
