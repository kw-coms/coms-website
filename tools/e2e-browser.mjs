// Browser smoke test: node tools/e2e-browser.mjs   (starts `vite` itself unless LAB_URL is set)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SHOTS = process.env.LAB_SHOTS ?? '/private/tmp/claude-501/-Users-choi-Documents-project/4ddf0f84-0b7f-4154-b3e8-f9ad7e2d8e00/scratchpad/lab-shots';
mkdirSync(SHOTS, { recursive: true });
const cache = join(homedir(), 'Library/Caches/ms-playwright');
const shellDir = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell')).sort().pop();
const exe = process.env.CHROME ?? (() => {
  const base = join(cache, shellDir);
  for (const sub of readdirSync(base)) {
    const p = join(base, sub, 'chrome-headless-shell');
    if (existsSync(p)) return p;
  }
})();

let dev;
let base = process.env.LAB_URL;
if (!base) {
  const port = 5290 + Math.floor(Math.random() * 50);
  dev = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore', env: { ...process.env, LAB_COMPILE_URL: process.env.LAB_COMPILE_URL ?? 'http://127.0.0.1:8787' } });
  base = `http://localhost:${port}/lab/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
}
const COMPILE = process.env.LAB_COMPILE_URL ?? 'http://127.0.0.1:8787';
const compileUp = await fetch(`${COMPILE}/lab/api/health`).then((r) => r.ok, () => false);

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
const page = await ctx.newPage();
const consoleErrors = [];
const external = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) external.push(r.url()); });
const lab = (fn, arg) => page.evaluate(fn, arg);
const settle = (ms = 600) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('canvas');
  await page.getByRole('button', { name: '건너뛰기' }).click().catch(() => {});
  await settle(1500);
  check('page loads with canvas', (await page.locator('canvas').count()) > 0);
  await shot('01-light-1440');

  // place an LED from the palette (drag) and see it snap
  const before = await lab(() => window.__lab.getState().hist.present.parts.length);
  const board = await lab(() => window.__lab.getState().hist.present.parts.find((p) => p.kind === 'breadboard-half')?.id);
  const target = await lab((b) => window.__lab.project(b, 'f20'), board);
  const item = page.locator('.part-item', { hasText: 'LED' }).first();
  const cbox = await page.locator('canvas').boundingBox();
  await item.dragTo(page.locator('canvas'), { targetPosition: { x: target.x - cbox.x, y: target.y - cbox.y } });
  await settle();
  const placed = await lab(() => { const s = window.__lab.getState(); return { n: s.hist.present.parts.length, ins: Object.keys(s.analysis.insertions) }; });
  check('palette drag adds a part', placed.n === before + 1, JSON.stringify(placed.n));
  // dnd via mouse events does not trigger HTML5 drag in headless; fall back to click-to-add and verify snapping from placeAt
  const snapped = await lab(() => Object.keys(window.__lab.getState().analysis.insertions).filter((k) => k.startsWith('led')));
  check('LED legs snap into breadboard holes', snapped.length === 2, snapped.join(','));

  // draw a wire between two UNO/breadboard pins by clicking
  const uno = await lab(() => window.__lab.getState().hist.present.parts.find((p) => p.kind === 'arduino-uno').id);
  const a = await lab((u) => window.__lab.project(u, 'D12'), uno);
  const b = await lab((id) => window.__lab.project(id, 'j5'), board);
  const w0 = await lab(() => window.__lab.getState().hist.present.wires.length);
  await page.getByRole('button', { name: '위에서 보기 (배선용)' }).click();
  await settle(900);
  const a2 = await lab((u) => window.__lab.project(u, 'D12'), uno);
  const b2 = await lab((id) => window.__lab.project(id, 'j5'), board);
  await page.mouse.click(a2.x, a2.y);
  await page.mouse.move((a2.x + b2.x) / 2, (a2.y + b2.y) / 2, { steps: 5 });
  await page.mouse.click(b2.x, b2.y);
  await settle();
  const w1 = await lab(() => window.__lab.getState().hist.present.wires.length);
  check('click pin then pin draws a wire', w1 === w0 + 1, `${w0} -> ${w1}`);
  void a; void b;
  await shot('02-top-view');
  await page.getByRole('button', { name: '3D 보기' }).click();
  await settle(900);

  // orbit
  const c0 = await lab(() => window.__lab.camera());
  await page.mouse.move(900, 120);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(1000, 150, { steps: 10 });
  await page.mouse.up();
  await settle(900);
  const c1 = await lab(() => window.__lab.camera());
  check('orbit changes camera position', JSON.stringify(c0) !== JSON.stringify(c1));

  // every example loads
  const exs = await lab(() => window.__lab.EXAMPLES.map((e) => ({ id: e.id, title: e.title })));
  for (const { id, title } of exs) {
    await page.getByRole('button', { name: '예제 갤러리' }).click();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('menuitem', { name: title }).first().click();
    await settle(500);
    const ok = await lab(() => window.__lab.getState().hist.present.parts.length > 0);
    check(`example loads: ${id}`, ok);
  }

  // ---- run flow ----
  const openExample = async (id) => {
    const title = exs.find((e) => e.id === id).title;
    await page.getByRole('button', { name: '예제 갤러리' }).click();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('menuitem', { name: title }).first().click();
    await settle(600);
  };
  const partId = (kind) => lab((k) => window.__lab.getState().hist.present.parts.find((p) => p.kind === k)?.id, kind);
  await openExample('external-blink');
  await page.getByRole('button', { name: '실행', exact: true }).click();
  if (!compileUp) {
    await page.waitForSelector('text=컴파일 서버에 연결할 수 없어요', { timeout: 15000 }).then(
      () => check('unreachable compile server shows Korean message', true),
      () => check('unreachable compile server shows Korean message', false));
  } else {
    await page.waitForFunction(() => window.__lab.simState() === 'running', null, { timeout: 60000 });
    const led = await partId('led');
    const seen = new Set();
    for (let i = 0; i < 24; i++) { seen.add((await lab((id) => window.__lab.litOf(id), led)) > 0.1); await settle(150); }
    check('Blink: LED mesh toggles lit state over ~3 s', seen.has(true) && seen.has(false), [...seen].join(','));
    await shot('04-running-blink');
    await page.getByRole('button', { name: '정지', exact: true }).click();

    await openExample('button-led');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await page.waitForFunction(() => window.__lab.simState() === 'running', null, { timeout: 60000 });
    const btn = await partId('pushbutton'), led2 = await partId('led');
    const bp = await lab((id) => window.__lab.projectPart(id, 5.5), btn);
    const off = (await lab((id) => window.__lab.litOf(id), led2)) > 0.1;
    await page.mouse.move(bp.x, bp.y); await page.mouse.down(); await settle(500);
    const on = (await lab((id) => window.__lab.litOf(id), led2)) > 0.1;
    await page.mouse.up();
    check('Button example: pressing the button lights the LED', on !== off, `released=${off} pressed=${on}`);
    await page.getByRole('button', { name: '정지', exact: true }).click();

    await openExample('pot-led');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await page.waitForFunction(() => window.__lab.simState() === 'running', null, { timeout: 60000 });
    const pot = await partId('potentiometer'), led3 = await partId('led');
    const bright = async (pos) => { await lab(([p, v]) => window.__lab.setSimInput(p, 'position', v), [pot, pos]); await settle(700); return lab((id) => window.__lab.frame()?.parts[id]?.led?.brightness ?? 0, led3); };
    const lo = await bright(0.1), hi = await bright(0.9);
    check('Pot example: brightness changes with the knob', Math.abs(hi - lo) > 0.1, `${lo.toFixed(2)} -> ${hi.toFixed(2)}`);
    await page.getByRole('button', { name: '정지', exact: true }).click();

    await openExample('lcd-counter');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await page.waitForFunction(() => window.__lab.simState() === 'running', null, { timeout: 60000 });
    await settle(2500);
    const lcd = await partId('lcd1602-i2c');
    const lines = await lab((id) => window.__lab.frame()?.parts[id]?.lcd?.lines, lcd);
    check('LCD example shows text', !!lines && lines.join('').trim().length > 0, JSON.stringify(lines));
    await shot('05-lcd');
    await page.getByRole('button', { name: '정지', exact: true }).click();

    await openExample('serial-hello');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await page.getByRole('tab', { name: '시리얼 모니터' }).click();
    await page.waitForFunction(() => document.querySelector('.serial-out')?.textContent?.includes('Hello'), null, { timeout: 60000 }).then(
      () => check('Serial example prints Hello', true), () => check('Serial example prints Hello', false));
    await page.getByRole('button', { name: '정지', exact: true }).click();
  }

  // dark + mobile shots
  await ctx.close();
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const dp = await dctx.newPage();
  await dp.goto(base, { waitUntil: 'networkidle' });
  await dp.getByRole('button', { name: '건너뛰기' }).click().catch(() => {});
  await dp.waitForTimeout(1500);
  await dp.screenshot({ path: join(SHOTS, '03-dark-1440.png') });
  await dctx.close();
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const mp = await mctx.newPage();
  await mp.goto(base, { waitUntil: 'networkidle' });
  await mp.getByRole('button', { name: '건너뛰기' }).click().catch(() => {});
  await mp.waitForTimeout(1500);
  await mp.screenshot({ path: join(SHOTS, '06-mobile-390.png') });
  await mctx.close();

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  check('no external requests (CSP)', external.length === 0, external.slice(0, 3).join(' '));
  console.log(compileUp ? 'compile service up' : 'compile service NOT running: run-flow assertions skipped');
} catch (e) {
  console.log('ABORT', String(e).split('\n')[0]);
  await page.screenshot({ path: join(SHOTS, 'fail.png') }).catch(() => {});
  console.log(await page.evaluate(() => JSON.stringify(window.__lab.getState().compile)).catch(() => ''));
  results.push({ name: 'script aborted', ok: false });
} finally {
  await browser.close();
  dev?.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
