// v2 browser e2e: node tools/e2e-v2.mjs  (needs the compile service at 127.0.0.1:8787; starts vite itself unless LAB_URL is set)
// Screenshots go to the fixed <lab>/shots-v2 directory.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { chromeExecutable, compileOrigin, GL_ARGS, outDir, saveScreenshot } from './browser.mjs';

const OUT = outDir('shots-v2');
const COMPILE = compileOrigin();
let dev, base = process.env.LAB_URL;
if (!base) {
  const port = 5500 + Math.floor(Math.random() * 90);
  dev = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore', env: { ...process.env, LAB_COMPILE_URL: COMPILE } });
  base = `http://localhost:${port}/lab/`;
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
}
if (!(await fetch(new URL('/lab/api/health', COMPILE), { redirect: 'error' }).then((r) => r.ok, () => false))) { console.log('FAIL compile service not reachable'); dev?.kill(); process.exit(2); }
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: GL_ARGS });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('dialog', (d) => d.accept().catch(() => {}));
const lab = (f, a) => page.evaluate(f, a);
const settle = (ms = 400) => page.waitForTimeout(ms);
const shot = (n) => saveScreenshot(page, join(OUT, `${n}.png`));
const until = async (f, a, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await lab(f, a)) return true; await settle(200); } return false; };

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('canvas');
  await page.getByRole('button', { name: '건너뛰기' }).click().catch(() => {});
  await settle(1200);
  await page.getByRole('button', { name: '확인' }).click({ timeout: 800 }).catch(() => {});

  // ---- palette: categories + Korean/English/part-number search ----
  const pal = page.locator('aside.palette:not(.in-sheet)');
  const heads = await pal.locator('h3').allTextContents();
  check('palette has the 10 categories', ['보드', '전원', '기본', '입력', '출력', '센서', '디스플레이', '반도체', 'IC', '측정'].every((c) => heads.includes(c)), heads.join(','));
  const find = async (q) => { await pal.getByLabel('부품 검색').fill(q); await settle(150); return pal.locator('.part-item').evaluateAll((els) => els.map((e) => e.dataset.kind)); };
  check('search "트랜지스터" finds npn+pnp', (await find('트랜지스터')).includes('npn'));
  check('search "2N2222" finds npn', (await find('2N2222')).includes('npn'));
  check('search "595" finds the shift register', (await find('595')).includes('shift-register-595'));
  check('search "scope" finds oscilloscope', (await find('scope')).includes('oscilloscope'));
  await pal.getByLabel('부품 검색').fill('');
  await pal.locator('.part-item[data-kind="diode"]').hover();
  check('hover shows the info card', await page.locator('.part-card').isVisible());
  await pal.locator('.part-row:has(.part-item[data-kind="diode"]) .part-info-btn').click();
  check('info popup shows what/wiring/mistakes', (await page.locator('.info-card').innerText()).includes('자주 하는 실수'));
  await shot('info-popup');
  await page.keyboard.press('Escape');
  await page.locator('.info-x').click().catch(() => {});

  // ---- place every new part ----
  const all = await lab(() => Object.keys(window.__lab.PARTS));
  const NEW = all.filter((k) => !['arduino-uno', 'breadboard-half', 'breadboard-full', 'led', 'rgb-led', 'resistor', 'pushbutton', 'slide-switch', 'potentiometer', 'photoresistor', 'buzzer', 'servo', 'hc-sr04', 'lcd1602-i2c', 'multimeter', 'dht11', 'joystick', 'seven-segment', 'neopixel-strip', 'l9110s', 'dc-motor'].includes(k));
  check('core provides the 44 new part kinds', NEW.length >= 44, String(NEW.length));
  await lab(() => window.__lab.loadScene({ version: 2, parts: [], wires: [], code: 'void setup(){}\nvoid loop(){}\n' }));
  const placed = await lab((ks) => { ks.forEach((k, i) => window.__lab.addPart(k, [(i % 8) * 120, -9, Math.floor(i / 8) * 120])); return window.__lab.getState().hist.present.parts.length; }, NEW);
  await settle(800);
  check('every new kind can be placed', placed === NEW.length, `${placed}/${NEW.length}`);
  const meshes = await lab((ks) => ks.filter((k) => { const id = window.__lab.getState().hist.present.parts.find((p) => p.kind === k)?.id; return id && window.__lab.partsBox([id]); }).length, NEW);
  check('every new kind renders a mesh', meshes === NEW.length, `${meshes}/${NEW.length}`);
  check('no page errors while placing', errs.length === 0, errs.slice(0, 2).join(' | '));
  await lab(() => window.__lab.frameAll());
  await settle(500);
  await shot('all-new-parts');

  // ---- instruments: RC curve on the oscilloscope ----
  const rc = await lab(() => {
    const P = window.__lab.PARTS;
    const pin = (k, re) => P[k].pins.find((p) => re.test(p.id))?.id;
    const parts = [
      { id: 'fg', kind: 'function-generator', pos: [-140, -9, 0], rotY: 0, props: { ...Object.fromEntries(P['function-generator'].props.map((p) => [p.key, p.default])) } },
      { id: 'r1', kind: 'resistor', pos: [-60, -9, 40], rotY: 0, props: { ohms: 10000 } },
      { id: 'c1', kind: 'capacitor-ceramic', pos: [0, -9, 40], rotY: 0, props: {} },
      { id: 'sc', kind: 'oscilloscope', pos: [80, -9, 0], rotY: 0, props: {} },
    ];
    const out = pin('function-generator', /^(OUT|SIG|\+|1)/i), gnd = pin('function-generator', /GND|-|2/i);
    const w = (id, a, b) => ({ id, from: { partId: a[0], pinId: a[1] }, to: { partId: b[0], pinId: b[1] }, color: 'blue' });
    const cp = P['capacitor-ceramic'].pins.map((p) => p.id);
    const sp = (re) => pin('oscilloscope', re);
    const wires = [
      w('w1', ['fg', out], ['r1', '1']), w('w2', ['r1', '2'], ['c1', cp[0]]), w('w3', ['c1', cp[1]], ['fg', gnd]),
      w('w4', ['sc', sp(/CH1|1/i)], ['fg', out]), w('w5', ['sc', sp(/CH2|2/i)], ['c1', cp[0]]), w('w6', ['sc', sp(/GND|-/i)], ['fg', gnd]),
    ];
    window.__lab.loadScene({ version: 2, parts, wires, code: 'void setup(){}\nvoid loop(){}\n' });
    return { out, gnd };
  });
  await settle(500);
  await page.getByRole('tab', { name: '계측' }).click();
  await page.getByRole('button', { name: '실행', exact: true }).click();
  const got = await until(() => (window.__lab.frame()?.scopes?.sc?.channels?.[0]?.length ?? 0) > 20);
  check('oscilloscope receives samples', got, JSON.stringify(rc));
  await settle(1500);
  check('scope panel canvas is shown', await page.locator('.inst-screen').first().isVisible());
  await shot('oscilloscope-rc');
  await page.getByRole('button', { name: '떼어내기' }).first().click();
  check('instrument can pop out', (await page.locator('.inst-card.floating').count()) === 1);
  await shot('instrument-floating');
  await page.getByRole('button', { name: '패널에 붙이기' }).click();
  await page.locator('button.tb[aria-label="정지"]').click();

  // ---- debugger ----
  await lab(() => { window.__lab.loadScene(window.__lab.EXAMPLES[0].scene); });
  await settle(400);
  await page.getByRole('tab', { name: '코드' }).click();
  const line = await lab(() => { const code = window.__lab.getState().code.split('\n'); return code.findIndex((l) => /digitalWrite/.test(l)) + 1; });
  await page.locator('.cm-bp-gutter .cm-gutterElement').nth(line - 1 + 1).click().catch(() => {});
  if (!(await lab(() => window.__lab.getState().breakpoints.length))) await lab((l) => window.__lab.toggleBreakpoint(l), line);
  check('breakpoint set', (await lab(() => window.__lab.getState().breakpoints.length)) > 0);
  await page.getByRole('button', { name: '실행', exact: true }).click();
  const paused = await until(() => window.__lab.getState().debug?.paused === true, undefined, 30000);
  check('debugger pauses at the breakpoint', paused);
  await settle(400);
  check('current-line highlight is drawn', (await page.locator('.cm-debug-line').count()) > 0);
  check('debug buttons enabled', await page.getByRole('button', { name: /한 줄씩/ }).isEnabled());
  await shot('debugger-paused');
  await page.getByRole('button', { name: /한 줄씩/ }).click();
  await settle(600);
  await page.getByRole('button', { name: /계속/ }).first().click().catch(() => {});
  await page.locator('button.tb[aria-label="정지"]').click();
  await lab(() => window.__lab.set({ breakpoints: [] }));

  // ---- missions ----
  await page.getByRole('tab', { name: '미션' }).click();
  check('mission list shows 10 missions', (await page.locator('.mission-item').count()) === 10, String(await page.locator('.mission-item').count()));
  await page.locator('.mission-item').first().click();
  await settle(500);
  check('mission view shows goal and check button', await page.getByRole('button', { name: '확인하기' }).isVisible());
  await shot('mission-view');
  await lab(() => { const m = window.__lab.MISSIONS[0]; window.__lab.loadScene(structuredClone(m.referenceScene)); });
  await page.getByRole('tab', { name: '미션' }).click();
  await page.getByRole('button', { name: '확인하기' }).click();
  const res = await until(() => !!document.querySelector('.mission-result'), undefined, 60000);
  const text = res ? await page.locator('.mission-result').innerText() : '';
  check('mission check returns a Korean result', res && /[가-힣]/.test(text), text);
  await shot('mission-result');

  // ---- schematic / notes / exports ----
  await lab(() => window.__lab.loadScene(window.__lab.EXAMPLES.find((e) => e.id === 'external-blink').scene));
  await page.getByRole('button', { name: '회로도 보기' }).click();
  await settle(500);
  check('schematic renders symbols and nets', (await page.locator('[data-testid="schematic-svg"] g').count()) > 5);
  await shot('schematic');
  await page.getByRole('button', { name: '회로도 닫기' }).click();
  await page.getByRole('button', { name: '메모 붙이기' }).click();
  await settle(500);
  const ta = page.getByLabel('메모 내용');
  await ta.fill('LED 확인하기');
  check('sticky note is editable and saved in the scene', (await lab(() => window.__lab.getState().hist.present.notes?.[0]?.text)) === 'LED 확인하기');
  await shot('note');

  // ---- mobile ----
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(800);
  await shot('mobile');
  check('no page errors overall', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  console.log('FAIL exception', e.message);
  await shot('zz-failure').catch(() => {});
  results.push(false);
} finally {
  await browser.close();
  dev?.kill();
  console.log(`${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
