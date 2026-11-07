// Blocks e2e: node tools/e2e-blocks.mjs [shotsDir]
// Builds a blink program from blocks with the mouse, runs it on the real compile service and checks that the LED toggles.
// Also checks: Blockly loads lazily, nothing leaves the origin and no CSP violation (the Lab's real CSP is applied to the page),
// the three modes, the one-way switch, light/dark, keyboard and touch. Needs the compile service (LAB_COMPILE_URL, default 127.0.0.1:8787).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { chromeExecutable, compileOrigin, GL_ARGS, outDir } from './browser.mjs';

const OUT = outDir('shots-blocks', process.argv[2]);
const COMPILE = compileOrigin();
if (!(await fetch(new URL('/lab/api/health', COMPILE), { redirect: 'error' }).then((r) => r.ok, () => false))) { console.log(`FAIL compile service not reachable at ${COMPILE}`); process.exit(2); }
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

// dev server (has the window.__lab test hooks) for the behaviour checks; `vite preview` of the production build (run `npm run build` first)
// for the CSP check, because the dev server needs inline scripts that the Lab's CSP forbids.
const servers = [];
const serve = async (args, port) => {
  servers.push(spawn('npx', ['vite', ...args, '--port', String(port), '--strictPort'], { stdio: 'ignore', env: { ...process.env, LAB_COMPILE_URL: COMPILE } }));
  const url = `http://localhost:${port}/lab/`;
  for (let i = 0; i < 80; i++) { try { if ((await fetch(url)).ok) break; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 250)); }
  return url;
};
const p0 = 5340 + Math.floor(Math.random() * 40);
const base = process.env.LAB_URL ?? await serve([], p0);
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };

const browser = await chromium.launch({ executablePath: chromeExecutable(), args: GL_ARGS });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
const noTour = () => localStorage.setItem('coms-lab:tutorial-done', '1');
await ctx.addInitScript(noTour);
const page = await ctx.newPage();
const bad = [], external = [], requests = [];
page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|blockly/i.test(m.text())) bad.push(m.text()); });
page.on('pageerror', (e) => bad.push(String(e)));
page.on('request', (r) => { requests.push(r.url()); const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) external.push(r.url()); });
const lab = (fn, arg) => page.evaluate(fn, arg);
const settle = (ms = 400) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) });
const st = () => lab(() => { const s = window.__lab.getState(); return { mode: s.hist.present.codeMode, blocks: s.hist.present.blocks, code: s.code }; });

try {
  await page.goto(base);
  await page.waitForFunction(() => window.__lab?.EXAMPLES, null, { timeout: 30000 });
  check('Blockly is not downloaded before Blocks mode is opened', !requests.some((u) => /BlocksEditor/.test(u)));
  // the builtin-blink circuit (UNO "L" LED on pin 13), empty block program
  await lab(() => { const ex = window.__lab.EXAMPLES.find((e) => e.id === 'builtin-blink').scene; window.__lab.loadScene({ ...ex, version: 2, codeMode: 'blocks', blocks: undefined }); });
  await page.getByRole('button', { name: '확인', exact: true }).click({ timeout: 8000 }).catch(() => {}); // the quality toast covers the panel tabs once the panel is wide
  await lab(() => window.__lab.set({ sideTab: 'code', sideOpen: true }));
  await page.waitForSelector('.blocklySvg', { timeout: 30000 });
  await settle(600);
  check('Blockly chunk loaded on demand', requests.some((u) => /BlocksEditor/.test(u)));
  let s = await st();
  check('a fresh block program has "처음 한 번 실행" and "계속 반복"', s.mode === 'blocks' && JSON.stringify(s.blocks).includes('lab_loop') && JSON.stringify(s.blocks).includes('lab_setup'));
  await shot('01-blocks-empty');

  // ---- build blink with the mouse: drag from the flyout into "계속 반복" (each drop lands at the top, so add in reverse) ----
  const loopBox = async () => page.locator('.blocklyWorkspace > .blocklyBlockCanvas > g.blocklyBlock', { hasText: '계속 반복' }).first().boundingBox();
  const drag = async (category, text) => {
    await page.locator('.blocklyToolboxCategory', { hasText: category }).first().click();
    await settle(350);
    const fb = page.locator('.blocklyFlyout g.blocklyBlock', { hasText: text }).first();
    await fb.waitFor({ timeout: 5000 });
    const b = await fb.boundingBox();
    const lb = await loopBox();
    const gx = b.x + 10, gy = b.y + b.height / 2;
    await page.mouse.move(gx, gy); await page.mouse.down();
    await page.mouse.move(gx + 30, gy + 10, { steps: 4 });
    await page.mouse.move(lb.x + 78, lb.y + 22 + b.height / 2, { steps: 12 });
    await page.mouse.up();
    await settle(300);
  };
  await drag('제어', '기다리기');
  await drag('출력', '디지털 출력');
  await drag('제어', '기다리기');
  await drag('출력', '디지털 출력');
  await shot('02-blocks-dragged');
  // the first digital write stays HIGH; set the second one (below the first wait) to LOW
  const writes = page.locator('.blocklyWorkspace > .blocklyBlockCanvas g.blocklyBlock[data-id]', { hasText: '디지털 출력' });
  await settle(500);
  s = await st();
  const types = [];
  const walk = (b) => { for (let c = b; c; c = c.next?.block) { types.push(c.type); for (const i of Object.values(c.inputs ?? {})) walk(i.block); } };
  for (const t of s.blocks.blocks.blocks) walk(t);
  check('the dragged blocks are in the document in order', JSON.stringify(types.filter((t) => /lab_(wait|digital_write)/.test(t))) === JSON.stringify(['lab_digital_write', 'lab_wait', 'lab_digital_write', 'lab_wait']), types.join(','));
  const field = page.locator('.blocklyDropdownField', { hasText: /HIGH/ }).last(); // the second write (nested blocks come later in the DOM)
  await field.click();
  await page.locator('.blocklyMenuItem', { hasText: '끄기 (LOW)' }).first().click();
  await settle(700);
  s = await st();
  check('generated code blinks pin 13', /digitalWrite\(13, HIGH\);[^\n]*\n\s*delay\(1000\);[^\n]*\n\s*digitalWrite\(13, LOW\);[^\n]*\n\s*delay\(1000\);/.test(s.code) && /pinMode\(13, OUTPUT\)/.test(s.code), '\n' + s.code);
  await shot('03-blink-blocks');

  // ---- run it: the UNO L LED must toggle ----
  await page.getByRole('button', { name: '실행', exact: true }).click();
  await page.waitForFunction(() => window.__lab.simState() === 'running', null, { timeout: 90000 });
  const samples = [];
  for (let i = 0; i < 30; i++) { samples.push(await lab(() => window.__lab.probe('uno').emissive > 1)); await settle(150); }
  check('LED toggles while the block program runs', samples.includes(true) && samples.includes(false), samples.map((x) => (x ? '#' : '.')).join(''));
  await shot('04-running');
  await page.getByRole('button', { name: '정지', exact: true }).click();
  await settle(300);

  // ---- modes ----
  await page.getByRole('button', { name: '블록+코드', exact: true }).click();
  await settle(600);
  s = await st();
  check('블록+코드 shows the generated code read-only next to the blocks', s.mode === 'blocks+text' && (await page.locator('.cm-content').first().innerText()).includes('digitalWrite(13, LOW)') && (await page.locator('.cm-content').first().getAttribute('contenteditable')) === 'false' || (await page.locator('.cm-content').first().getAttribute('aria-readonly')) === 'true');
  await shot('05-blocks-plus-code');

  await page.getByRole('button', { name: '코드', exact: true }).click();
  await settle(300);
  check('switching to code asks first (in the page) and keeps the mode until confirmed', (await page.getByRole('alertdialog').count()) === 1 && (await st()).mode === 'blocks+text');
  await shot('06-confirm');
  await page.getByRole('button', { name: '취소', exact: true }).click();
  check('cancel keeps the blocks', (await st()).mode === 'blocks+text');
  await page.getByRole('button', { name: '코드', exact: true }).click();
  await page.getByRole('button', { name: '코드로 바꾸기' }).click();
  await settle(400);
  check('confirmed: text mode', (await st()).mode === 'text');
  check('still the generated code: blocks can be restored', (await page.getByRole('button', { name: '블록', exact: true }).count()) === 1 && /돌아갈 수 있어요/.test(await page.locator('.mode-note').innerText()));
  await page.locator('.cm-content').first().click();
  await page.keyboard.press('End'); await page.keyboard.type(' // hi');
  await settle(400);
  check('after a hand edit the UI explains blocks are no longer available', /돌아갈 수 없어요/.test(await page.locator('.mode-note').innerText()));
  await shot('07-text-edited');
  await page.getByRole('button', { name: '블록', exact: true }).click();
  await settle(300);
  check('a hand-edited program is not turned back into blocks (offers a fresh start instead)', (await st()).mode === 'text' && (await page.getByRole('alertdialog', { name: /새 블록 프로그램/ }).count()) === 1);
  await shot('08-fresh-start');
  await page.getByRole('button', { name: '취소', exact: true }).click();

  // ---- examples open in Blocks mode ----
  for (const id of ['button-led', 'pot-led', 'servo-sweep', 'distance-alarm']) {
    await lab((i) => { const ex = window.__lab.EXAMPLES.find((e) => e.id === i).scene; window.__lab.loadScene({ ...ex, version: 2, codeMode: 'text' }); }, id);
    await settle(300);
    await page.getByRole('button', { name: '블록', exact: true }).click();
    await page.waitForSelector('.blocklySvg');
    await settle(700);
    s = await st();
    check(`example ${id} opens as blocks`, s.mode === 'blocks' && JSON.stringify(s.blocks).includes('lab_loop'));
    if (id === 'distance-alarm') await shot('09-example-distance-alarm');
  }

  // ---- theme ----
  await lab(() => window.__lab.set({ theme: 'dark' }));
  await settle(600);
  await shot('10-dark');
  await lab(() => window.__lab.set({ theme: 'light' }));

  // ---- keyboard: Tab from the mode switch into Blockly, then arrows move between blocks ----
  await page.getByRole('button', { name: '블록', exact: true }).focus();
  const where = () => lab(() => { const a = document.activeElement; return { tag: a?.tagName, cls: a?.getAttribute('class')?.slice(0, 50), inBlockly: !!a?.closest('.blocklySvg, .blocklyToolbox, .blocklyFlyout'), aria: a?.getAttribute('aria-label')?.slice(0, 60) }; });
  let tabs = 0, at = await where();
  while (!at.inBlockly && tabs < 12) { await page.keyboard.press('Tab'); tabs++; at = await where(); }
  console.log('INFO tabs to reach Blockly:', tabs, JSON.stringify(at));
  const seen = new Set();
  for (const k of ['ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft']) { await page.keyboard.press(k); await settle(150); seen.add(JSON.stringify(await where())); }
  console.log('INFO focus after arrows', [...seen].join(' ; '));
  check('keyboard: Tab reaches the blocks and arrow keys move the focus between them', at.inBlockly && seen.size > 1, `${tabs} tabs`);
  await shot('11-keyboard');

  check('no request leaves the origin', external.length === 0, external.join(' '));
  check('no Blockly error', bad.length === 0, bad.slice(0, 3).join(' | '));

  // ---- mobile + touch ----
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await mctx.addInitScript(noTour);
  const m = await mctx.newPage();
  await m.goto(base);
  await m.waitForFunction(() => window.__lab?.EXAMPLES, null, { timeout: 30000 });
  await m.evaluate(() => { const ex = window.__lab.EXAMPLES.find((e) => e.id === 'builtin-blink').scene; window.__lab.loadScene({ ...ex, version: 2, codeMode: 'blocks', blocks: undefined }); });
  await m.getByRole('tab', { name: '코드', exact: true }).click();
  await m.waitForSelector('.blocklySvg', { timeout: 30000 });
  await m.waitForTimeout(800);
  console.log('INFO mobile', await m.evaluate(() => { const b = document.querySelector('.side-body'); return [b?.getBoundingClientRect().height, getComputedStyle(b).height, b.matches('.sidepanel.sheet-open:has(.blocks-slot) .side-body'), window.matchMedia('(max-width: 768px)').matches, innerHeight, document.querySelector('.sidepanel')?.className, !!document.querySelector('.blocks-slot'), CSS.supports('selector(:has(a))'), [...document.styleSheets].flatMap((ss) => { try { return [...ss.cssRules].map((r) => r.cssText); } catch { return []; } }).filter((t) => t.includes('blocks-slot')).map((t) => t.slice(0, 160))]; }));
  await m.screenshot({ path: join(OUT, '12-mobile.png') });
  // touch drag: open a category and drag a block into the loop with touch events through CDP
  const cdp = await mctx.newCDPSession(m);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await m.locator('.blocklyToolboxCategory', { hasText: '출력' }).first().tap();
  await m.waitForTimeout(500);
  const fb = await m.locator('.blocklyFlyout g.blocklyBlock', { hasText: '디지털 출력' }).first().boundingBox();
  const lb = await m.locator('.blocklyWorkspace > .blocklyBlockCanvas > g.blocklyBlock', { hasText: '계속 반복' }).first().boundingBox();
  await touch('touchStart', fb.x + 10, fb.y + fb.height / 2);
  for (let i = 1; i <= 12; i++) { await touch('touchMove', fb.x + 10 + ((lb.x + 78 - fb.x - 10) * i) / 12, fb.y + fb.height / 2 + ((lb.y + 22 + fb.height / 2 - fb.y - fb.height / 2) * i) / 12); await m.waitForTimeout(16); }
  await touch('touchEnd');
  await m.waitForTimeout(600);
  const mcode = await m.evaluate(() => window.__lab.getState().code);
  check('touch: a block dragged with a finger lands in the loop', /void loop\(\) \{\n\s*digitalWrite\(13, HIGH\)/.test(mcode), mcode);
  await m.screenshot({ path: join(OUT, '13-mobile-touch.png') });

  // ---- production build under the Lab's real CSP: nothing blocked, nothing fetched from another origin ----
  const pbase = await serve(['preview'], p0 + 50);
  const pctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await pctx.addInitScript(noTour);
  await pctx.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const r = await route.fetch();
    await route.fulfill({ response: r, headers: { ...r.headers(), 'content-security-policy': CSP } });
  });
  const pp = await pctx.newPage();
  const csp = [], pext = [];
  pp.on('console', (m) => { if (/Content Security Policy|blockly/i.test(m.text())) csp.push(m.text()); });
  pp.on('pageerror', (e) => csp.push(String(e)));
  pp.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) pext.push(r.url()); });
  await pp.goto(pbase);
  await pp.getByRole('tab', { name: '코드', exact: true }).click();
  await pp.getByRole('button', { name: '블록', exact: true }).click();
  await pp.getByRole('button', { name: '새로 시작하기' }).click({ timeout: 1500 }).catch(() => {}); // only asked when the open program is hand-written
  await pp.waitForSelector('.blocklySvg', { timeout: 30000 });
  await pp.waitForTimeout(800);
  await pp.locator('.blocklyToolboxCategory', { hasText: '입력' }).first().click();
  await pp.waitForTimeout(500);
  await pp.screenshot({ path: join(OUT, '14-prod-csp.png') });
  check('production build under the Lab CSP: Blocks mode works, no CSP violation', csp.length === 0 && (await pp.locator('.blocklyFlyout g.blocklyBlock').count()) > 3, csp.slice(0, 2).join(' | '));
  check('production build: no request leaves the origin', pext.length === 0, pext.join(' '));
} catch (e) {
  check('blocks e2e', false, String(e).split('\n').slice(0, 2).join(' ') + ' @ ' + (String(e.stack).match(/e2e-blocks\.mjs:\d+/) ?? [''])[0]);
  await page.screenshot({ path: join(OUT, 'zz-failure.png') }).catch(() => {});
} finally {
  await browser.close();
  servers.forEach((x) => x.kill());
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
