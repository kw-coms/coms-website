// Browser e2e: node tools/e2e-browser.mjs
// Starts `vite` itself unless LAB_URL is set. Needs the real compile service (LAB_COMPILE_URL, default http://127.0.0.1:8787).
// LAB_SOFTWARE=1 runs Chromium with --disable-gpu (SwiftShader) to exercise the low-quality path. Screenshots go to <tmpdir>/lab-shots.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { chromeExecutable, compileOrigin, GL_ARGS, SHOTS } from './browser.mjs';

const exe = chromeExecutable();

let dev;
let base = process.env.LAB_URL;
const COMPILE = compileOrigin();
if (!base) {
  const port = 5290 + Math.floor(Math.random() * 50);
  dev = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore', env: { ...process.env, LAB_COMPILE_URL: COMPILE } });
  base = `http://localhost:${port}/lab/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
}
const compileUp = await fetch(`${COMPILE}/lab/api/health`).then((r) => r.ok, () => false);
if (!compileUp) { console.log(`FAIL compile service not reachable at ${COMPILE}: start it (see docs/DEPLOY.md); this e2e does not mock it`); dev?.kill(); process.exit(2); }

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };
const args = process.env.LAB_SOFTWARE
  ? ['--disable-gpu', '--disable-gpu-compositing', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  : GL_ARGS;
const browser = await chromium.launch({ executablePath: exe, args });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
const page = await ctx.newPage();
const consoleErrors = [];
const external = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) external.push(r.url()); });
// replacing a dirty document asks for confirmation: accept every dialog (once, here)
page.on('dialog', (d) => d.accept().catch(() => {}));
page.on('crash', () => console.log('PAGE CRASHED'));
const lab = (fn, arg) => page.evaluate(fn, arg);
const settle = (ms = 500) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
const sample = async (fn, arg, n = 24, dt = 150) => { const out = []; for (let i = 0; i < n; i++) { out.push(await lab(fn, arg)); await settle(dt); } return out; };
const distinct = (a) => new Set(a.map((x) => JSON.stringify(x))).size;
const frameTimes = async (label) => {
  await lab(() => { window.__ft = []; let last = performance.now(); const f = (t) => { window.__ft.push(t - last); last = t; window.__raf = requestAnimationFrame(f); }; window.__raf = requestAnimationFrame(f); });
  const box = await page.locator('canvas').boundingBox();
  const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.5;
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let i = 0; i < 60; i++) { await page.mouse.move(cx + Math.sin(i / 6) * 160, cy + Math.cos(i / 9) * 60); await settle(16); }
  await page.mouse.up();
  const ft = (await lab(() => { cancelAnimationFrame(window.__raf); return window.__ft.slice(2); })).sort((a, b) => a - b);
  const q = (x) => ft[Math.min(ft.length - 1, Math.floor(ft.length * x))];
  console.log(`INFO orbit frame times (${label}): p50=${q(0.5).toFixed(1)}ms p95=${q(0.95).toFixed(1)}ms n=${ft.length}`);
  return q(0.5);
};

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('canvas');
  await page.getByRole('button', { name: '건너뛰기' }).click().catch(() => {});
  await settle(1500);
  await page.getByRole('button', { name: '확인' }).click({ timeout: 1000 }).catch(() => {}); // low-quality notice
  check('page loads with canvas', (await page.locator('canvas').count()) > 0);
  const q0 = await lab(() => window.__lab.getState().quality);
  check('quality is auto-detected', ['high', 'medium', 'low'].includes(q0), q0);
  check('data-perf attribute is set', ['lite', 'full'].includes(await lab(() => document.documentElement.dataset.perf)));
  const fill = await lab(() => window.__lab.fillRatio());
  check('bench is auto-framed to fill 60-95% of the canvas', fill > 0.6 && fill < 0.95, fill.toFixed(2));
  await shot('01-light-1440');

  // ---- layout ----
  const tabNames = await page.getByRole('tab').allTextContents();
  check('right panel has 코드/속성/경고/부품 목록 tabs', ['코드', '속성', '경고', '부품 목록'].every((t) => tabNames.some((n) => n.startsWith(t))), tabNames.join('|'));
  const wCanvas = (await page.locator('canvas').boundingBox()).width;
  check('3D canvas dominates (>55% of the window width)', wCanvas > 1440 * 0.55, String(Math.round(wCanvas)));

  // ---- placing, wiring, camera ----
  const before = await lab(() => window.__lab.getState().hist.present.parts.length);
  const board = await lab(() => window.__lab.getState().hist.present.parts.find((p) => p.kind === 'breadboard-full' || p.kind === 'breadboard-half')?.id);
  const target = await lab((b) => window.__lab.project(b, 'f20'), board);
  const cbox = await page.locator('canvas').boundingBox();
  await page.locator('.part-item', { hasText: 'LED' }).first().dragTo(page.locator('canvas'), { targetPosition: { x: target.x - cbox.x, y: target.y - cbox.y } });
  await settle();
  const placed = await lab(() => window.__lab.getState().hist.present.parts.length);
  check('palette drag adds a part', placed === before + 1, `${before} -> ${placed}`);
  check('selecting the new part opens the 속성 tab', await lab(() => window.__lab.getState().sideTab === 'props'));
  const snapped = await lab(() => Object.keys(window.__lab.getState().analysis.insertions).filter((k) => k.startsWith('led-') || k.startsWith('led')));
  check('LED legs snap into breadboard holes', snapped.length >= 2, snapped.join(','));

  const uno = await lab(() => window.__lab.getState().hist.present.parts.find((p) => p.kind === 'arduino-uno').id);
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
  const fillTop = await lab(() => window.__lab.fillRatio());
  check('top view is auto-framed too', fillTop > 0.55 && fillTop < 0.98, fillTop.toFixed(2));
  await shot('03-top-view');

  // multi-select: drag-box in the top view, then delete the bend point of a wire via double-click, context menu
  const c0 = await lab(() => window.__lab.projectWorld(-1000, 0, -1000));
  void c0;
  const cb = await page.locator('canvas').boundingBox();
  await page.mouse.move(cb.x + 6, cb.y + 6); await page.mouse.down();
  await page.mouse.move(cb.x + cb.width - 6, cb.y + cb.height - 6, { steps: 8 }); await page.mouse.up();
  await settle();
  const nMulti = await lab(() => window.__lab.getState().multi.length);
  check('drag-box in top view multi-selects parts', nMulti > 1, String(nMulti));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '3D 보기' }).click();
  await settle(900);

  // shift+click multi-select in 3D
  const ids = await lab(() => window.__lab.getState().hist.present.parts.filter((p) => p.kind === 'led' || p.kind === 'resistor').map((p) => p.id));
  if (ids.length >= 1) {
    await lab(() => window.__lab.set({ selection: null, multi: [] }));
    const led = ids.find((i) => i.startsWith('led'));
    const p1 = await lab((id) => window.__lab.projectPart(id, 5), uno);
    const p2 = await lab((id) => window.__lab.projectPart(id, 5), led);
    await page.keyboard.down('Shift');
    await page.mouse.click(p1.x, p1.y);
    await page.mouse.click(p2.x, p2.y);
    await page.keyboard.up('Shift');
    await settle(300);
    check('Shift+click multi-selects', (await lab(() => window.__lab.getState().multi.length)) === 2);
    await page.keyboard.press('Escape');
  }

  // context menu on a part: duplicate
  {
    const led = await lab(() => window.__lab.getState().hist.present.parts.find((p) => p.kind === 'led').id);
    const p = await lab((id) => window.__lab.projectPart(id, 6.5), led);
    const n0 = await lab(() => window.__lab.getState().hist.present.parts.length);
    await page.mouse.click(p.x, p.y, { button: 'right' });
    await settle(300);
    const menu = await page.locator('.ctx-menu').count();
    check('right-click opens the context menu', menu === 1);
    await page.getByRole('menuitem', { name: /복제/ }).click().catch(() => {});
    await settle(300);
    check('context menu 복제 duplicates the part', (await lab(() => window.__lab.getState().hist.present.parts.length)) === n0 + 1);
    await lab(() => window.__lab.getState().hist.present.parts.length);
  }

  // delete a single bend point by double-click
  {
    const wid = await lab(() => window.__lab.getState().hist.present.wires[0].id);
    const wire = await lab((id) => window.__lab.getState().hist.present.wires.find((w) => w.id === id), wid);
    const pa = await lab(([p, pin]) => { const L = window.__lab; const part = L.getState().hist.present.parts.find((x) => x.id === p); return part ? L.projectWorld(part.pos[0], part.pos[1] + 20, part.pos[2]) : null; }, [wire.from.partId, wire.from.pinId]);
    void pa;
    await lab(([id]) => window.__lab.updateWire(id, { bends: [[10, 20, 10], [30, 24, 20]] }), [wid]);
    await lab(([id]) => window.__lab.set({ selection: { kind: 'wire', id } }), [wid]);
    await settle(400);
    const bp = await lab(() => window.__lab.projectWorld(10, 20, 10));
    await page.mouse.dblclick(bp.x, bp.y);
    await settle(400);
    const left = await lab((id) => window.__lab.getState().hist.present.wires.find((w) => w.id === id).bends?.length ?? 0, wid);
    check('double-click deletes one bend point', left === 1, String(left));
  }

  // orbit
  const o0 = await lab(() => window.__lab.camera());
  await page.mouse.move(900, 120); await page.mouse.down({ button: 'left' });
  await page.mouse.move(1000, 150, { steps: 10 }); await page.mouse.up();
  await settle(900);
  check('orbit changes camera position', JSON.stringify(o0) !== JSON.stringify(await lab(() => window.__lab.camera())));
  await frameTimes(`${q0} quality`);

  // ---- every example, end to end through the UI ----
  const exs = await lab(() => window.__lab.EXAMPLES.map((e) => ({ id: e.id, title: e.title })));
  const open = async (id) => {
    const title = exs.find((e) => e.id === id).title;
    await page.getByRole('button', { name: '예제 갤러리' }).click();
    await page.getByRole('menuitem', { name: title }).first().click();
    await settle(900);
  };
  const run = async () => {
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await page.waitForFunction(() => window.__lab.simState() === 'running', null, { timeout: 90000 });
    await settle(400);
  };
  const stop = async () => { await page.getByRole('button', { name: '정지', exact: true }).click(); await settle(300); };
  const pid = (kind) => lab((k) => window.__lab.getState().hist.present.parts.find((p) => p.kind === k)?.id, kind);
  const front = (id) => lab((i) => { const f = window.__lab.frame(); return f?.parts[i]; }, id);
  const setIn = (id, key, v) => lab(([i, k, x]) => window.__lab.setSimInput(i, k, x), [id, key, v]);
  const probe = (id) => lab((i) => window.__lab.probe(i), id);
  const shots = { 'external-blink': '07-running-blink', 'lcd-counter': '08-lcd', 'neopixel-rainbow': '09-neopixel', 'servo-sweep': '10-servo', 'motor-direction': '11-motor' };
  const checks = {
    'builtin-blink': async () => {
      const s = await sample(() => window.__lab.probe('uno').emissive > 1, null, 24, 150);
      check('builtin-blink: UNO L LED toggles lit', s.includes(true) && s.includes(false));
    },
    'external-blink': async () => {
      const led = await pid('led');
      const s = await sample((id) => window.__lab.litOf(id) > 0.1, led);
      check('external-blink: LED mesh toggles lit state', s.includes(true) && s.includes(false));
    },
    'button-led': async () => {
      const btn = await pid('pushbutton'), led = await pid('led');
      const bp = await lab((id) => window.__lab.projectPart(id, 5.5), btn);
      const off = (await lab((id) => window.__lab.litOf(id), led)) > 0.1;
      await page.mouse.move(bp.x, bp.y); await page.mouse.down(); await settle(500);
      const on = (await lab((id) => window.__lab.litOf(id), led)) > 0.1;
      await page.mouse.up();
      check('button-led: pressing the button lights the LED', on && !off, `released=${off} pressed=${on}`);
    },
    'serial-hello': async () => {
      await page.getByRole('tab', { name: '코드', exact: true }).click();
      await page.getByRole('tab', { name: '시리얼 모니터' }).click();
      await page.waitForFunction(() => document.querySelector('.serial-out')?.textContent?.includes('Hello'), null, { timeout: 20000 }).then(
        () => check('serial-hello: serial monitor prints Hello', true), () => check('serial-hello: serial monitor prints Hello', false));
    },
    'pot-led': async () => {
      const pot = await pid('potentiometer'), led = await pid('led');
      const br = async (v) => { await setIn(pot, 'position', v); await settle(800); return lab((id) => window.__lab.frame()?.parts[id]?.led?.brightness ?? 0, led); };
      const lo = await br(0.1), hi = await br(0.9);
      const pr = await probe(led);
      check('pot-led: brightness follows the knob', Math.abs(hi - lo) > 0.1, `${lo.toFixed(2)} -> ${hi.toFixed(2)}`);
      check('pot-led: LED glow is visible at high setting', pr.sprite > 0.2 || pr.emissive > 0.5, JSON.stringify(pr));
    },
    'night-light': async () => {
      const cds = await pid('photoresistor'), led = await pid('led');
      const br = async (v) => { await setIn(cds, 'lux', v); await settle(800); return lab((id) => window.__lab.frame()?.parts[id]?.led?.brightness ?? 0, led); };
      const dark = await br(2), bright = await br(5000);
      check('night-light: LED brighter in the dark', dark > bright + 0.1, `dark=${dark.toFixed(2)} bright=${bright.toFixed(2)}`);
    },
    'rgb-cycle': async () => {
      const rgb = await pid('rgb-led');
      const s = await sample((id) => { const c = window.__lab.frame()?.parts[id]?.rgb; return c ? ['r', 'g', 'b'][[c.r, c.g, c.b].indexOf(Math.max(c.r, c.g, c.b))] : null; }, rgb, 30, 150);
      check('rgb-cycle: RGB LED shows several colours', new Set(s.filter(Boolean)).size >= 2, [...new Set(s)].join(','));
    },
    'servo-sweep': async () => {
      const sv = await pid('servo');
      const s = await sample((id) => window.__lab.probe(id).horn, sv, 30, 120);
      const nums = s.filter((x) => typeof x === 'number');
      check('servo-sweep: servo horn rotates', Math.max(...nums) - Math.min(...nums) > 0.4, `${Math.min(...nums).toFixed(2)}..${Math.max(...nums).toFixed(2)} rad`);
    },
    'melody': async () => {
      const bz = await pid('buzzer');
      const s = await sample((id) => window.__lab.frame()?.parts[id]?.buzzer?.freq ?? 0, bz, 30, 120);
      check('melody: buzzer plays several notes', new Set(s.filter((f) => f > 0).map((f) => Math.round(f / 20))).size >= 2, [...new Set(s)].join(','));
    },
    'ultrasonic': async () => {
      const hc = await pid('hc-sr04');
      await page.getByRole('tab', { name: '코드', exact: true }).click();
      await page.getByRole('tab', { name: '시리얼 모니터' }).click();
      const read = async (cm) => { await setIn(hc, 'distanceCm', cm); await lab(() => (window.__lab.serialClear?.(), 0)); await settle(1600); const raw = await lab(() => window.__lab.serial()); const t = raw.slice(0, raw.lastIndexOf('\n') + 1); /* complete lines only: the serial arrives one byte at a time (9600 baud), a sample can land inside "29.98" and read "2" */ const m = [...t.matchAll(/(\d+(?:\.\d+)?)/g)].map((x) => Number(x[1])); return m[m.length - 1]; };
      const a = await read(30), b = await read(120);
      check('ultrasonic: serial distance follows the sensor', Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - 30) < 8 && Math.abs(b - 120) < 15, `30->${a} 120->${b}`);
      // drag the obstacle block in the 3D view
      const part = await lab((id) => window.__lab.getState().hist.present.parts.find((p) => p.id === id), hc);
      const t = (part.rotY * Math.PI) / 180;
      const at = (cm) => [part.pos[0] + Math.sin(t) * (16 + cm * 0.8), part.pos[1] + 14, part.pos[2] + Math.cos(t) * (16 + cm * 0.8)];
      const from = await lab(([x, y, z]) => window.__lab.projectWorld(x, y, z), at(120));
      const to = await lab(([x, y, z]) => window.__lab.projectWorld(x, y, z), at(40));
      await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 10 }); await page.mouse.up();
      await settle(400);
      const d = await lab((id) => window.__lab.getState().inputs[id]?.distanceCm, hc);
      check('ultrasonic: dragging the obstacle block sets the distance', typeof d === 'number' && d < 80, String(d));
    },
    'lcd-counter': async () => {
      const lcd = await pid('lcd1602-i2c');
      const s = await sample((id) => window.__lab.frame()?.parts[id]?.lcd?.lines.join('|'), lcd, 16, 250);
      check('lcd-counter: LCD shows changing text', s.some((x) => x && x.replace(/\|/g, '').trim().length > 0) && distinct(s) > 1, s.at(-1));
    },
    'distance-alarm': async () => {
      const hc = await pid('hc-sr04'), led = await pid('led'), bz = await pid('buzzer');
      const st = async (cm) => { await setIn(hc, 'distanceCm', cm); await settle(1800); return lab(([l, b]) => ({ led: window.__lab.frame()?.parts[l]?.led?.brightness > 0.2, buzz: !!window.__lab.frame()?.parts[b]?.buzzer?.on || (window.__lab.frame()?.parts[b]?.buzzer?.freq ?? 0) > 0 }), [led, bz]); };
      const near = await st(10), far = await st(150);
      check('distance-alarm: LED + buzzer on when near, off when far', near.led && near.buzz && !far.led, JSON.stringify({ near, far }));
    },
    'dht-lcd': async () => {
      const lcd = await pid('lcd1602-i2c');
      await settle(2500);
      const l = await lab((id) => window.__lab.frame()?.parts[id]?.lcd?.lines.join('|'), lcd);
      check('dht-lcd: LCD shows readings', /\d/.test(l ?? ''), l);
    },
    'joystick-direction': async () => {
      const js = await pid('joystick');
      await page.getByRole('tab', { name: '코드', exact: true }).click();
      await page.getByRole('tab', { name: '시리얼 모니터' }).click();
      await setIn(js, 'x', 0.05); await settle(1400);
      const a = await lab(() => window.__lab.serial().slice(-60));
      await setIn(js, 'x', 0.95); await settle(1400);
      const b = await lab(() => window.__lab.serial().slice(-60));
      check('joystick-direction: serial output changes with stick', a !== b, `${JSON.stringify(a.slice(-24))} -> ${JSON.stringify(b.slice(-24))}`);
    },
    'seven-count': async () => {
      const seg = await pid('seven-segment');
      const s = await sample((id) => (window.__lab.frame()?.parts[id]?.sevenSeg?.segments ?? []).join(''), seg, 24, 250);
      const pr = await probe(seg);
      check('seven-count: 7-segment digit changes and lights', distinct(s) > 2 && pr.emissive > 0.5, `${distinct(s)} patterns`);
    },
    'neopixel-rainbow': async () => {
      const np = await pid('neopixel-strip');
      const s = await sample((id) => JSON.stringify(window.__lab.frame()?.parts[id]?.pixels?.colors?.slice(0, 3)), np, 6, 200);
      const cols = await lab((id) => window.__lab.frame()?.parts[id]?.pixels?.colors ?? [], np);
      check('neopixel-rainbow: pixels light in different colours', cols.length >= 8 && new Set(cols.map((c) => c.join())).size >= 4 && distinct(s) > 1, `${cols.length} px`);
    },
    'motor-direction': async () => {
      const mt = await pid('dc-motor');
      const s = await sample((id) => window.__lab.probe(id).shaft, mt, 12, 150);
      const m = await lab((id) => window.__lab.frame()?.parts[id]?.motor, mt);
      check('motor-direction: motor spins (shaft rotates)', !!m && m.rpm > 0 && distinct(s) > 3, JSON.stringify(m));
    },
  };
  for (const { id } of process.env.LAB_SHOTS_ONLY ? [] : exs) {
    try {
      await open(id);
      const fitEx = await lab(() => window.__lab.fillRatio());
      check(`example ${id}: auto-framed`, fitEx > 0.5 && fitEx < 1, fitEx.toFixed(2));
      await run();
      await (checks[id] ?? (async () => check(`example ${id}: runs`, true)))();
      if (shots[id]) { await settle(300); await shot(shots[id]); }
      await stop();
    } catch (e) {
      check(`example ${id}: end-to-end`, false, String(e).split('\n')[0]);
      await page.getByRole('button', { name: '정지', exact: true }).click({ timeout: 2000 }).catch(() => {});
    }
  }

  // ---- compile error shows diagnostics and opens the code tab ----
  if (!process.env.LAB_SHOTS_ONLY) await open('builtin-blink');
  await lab(() => window.__lab.setCode('void setup() { pinMode(13, OUTPUT) }\nvoid loop() {}\n'));
  await page.getByRole('tab', { name: '속성' }).click();
  await page.getByRole('button', { name: '실행', exact: true }).click();
  await page.waitForSelector('.compile-msg', { timeout: 60000 }).then(() => check('compile error opens the 코드 tab with the message', true), () => check('compile error opens the 코드 tab with the message', false));

  // ---- warnings are grouped and the UNO gets no badge for idle pins ----
  await open('external-blink');
  await page.getByRole('tab', { name: /^경고/ }).click();
  const badgesOnUno = await lab(() => { const w = window.__lab.getState().analysis.warnings; return w.filter((x) => /unconnected/.test(x.id) && x.partId === 'uno').length; });
  check('warnings tab lists grouped warnings (no idle UNO pin noise)', (await page.locator('.warn-group').count()) >= 0 && (await page.locator('.warn-group', { hasText: '아두이노' }).filter({ hasText: '핀이 연결되지' }).count()) === 0, `core idle-pin warnings on UNO: ${badgesOnUno}`);

  // ---- gallery of every part: 3 angles ----
  await page.getByRole('tab', { name: '속성' }).click();
  await lab(() => window.__lab.set({ sideOpen: false, paletteCollapsed: true }));
  await settle(500);
  await lab(() => window.__lab.gallery());
  await settle(900);
  const shotStage = async (n) => { await settle(600); await page.locator('.stage').screenshot({ path: join(SHOTS, `${n}.png`) }); };
  await lab(() => window.__lab.viewAngle(undefined, 0, 42));
  await shotStage('04-gallery-front');
  await lab(() => window.__lab.viewAngle(undefined, 55, 30));
  await shotStage('05-gallery-side');
  await lab(() => window.__lab.viewAngle(undefined, 0, 88));
  await shotStage('06-gallery-top');

  // ---- dark, low quality, mobile ----
  // ---- long session: GPU resources must return to baseline after switching examples and adding/deleting parts ----
  {
    const ids = await lab(() => window.__lab.EXAMPLES.map((e) => e.id));
    const cycle = async () => {
      for (const id of ids) {
        await lab((i) => window.__lab.loadScene(window.__lab.EXAMPLES.find((e) => e.id === i).scene), id);
        await settle(120);
      }
    };
    const home = async () => {
      await lab((i) => window.__lab.loadScene(window.__lab.EXAMPLES.find((e) => e.id === i).scene), ids[0]);
      await settle(400);
      return lab(() => window.__lab.memory());
    };
    await cycle(); // warm-up: shared textures are created once per kind
    const base = await home();
    await cycle();
    await cycle();
    for (let round = 0; round < 5; round++) {
      const added = await lab(async (round) => {
        const out = [];
        for (let i = 0; i < 10; i++) out.push(window.__lab.addPart(['led', 'resistor', 'lcd1602-i2c', 'breadboard-half', 'multimeter'][i % 5], [i * 30, 0, 300 + round * 40]));
        await new Promise((r) => setTimeout(r, 150));
        return out.filter(Boolean);
      }, round);
      await lab((ids2) => window.__lab.removeParts(ids2), added);
      await settle(150);
    }
    const end = await home();
    check('long session: geometries return to baseline', end.geometries - base.geometries <= 10, `${base.geometries} -> ${end.geometries}`);
    check('long session: textures return to baseline', end.textures - base.textures <= 3, `${base.textures} -> ${end.textures}`);
  }

  await ctx.close();
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const dp = await dctx.newPage();
  await dp.goto(base, { waitUntil: 'networkidle' });
  await dp.evaluate(() => { localStorage.setItem('coms-lab:tutorial-done', '1'); localStorage.setItem('coms-lab:perf-notice', '1'); });
  await dp.reload({ waitUntil: 'networkidle' });
  await dp.waitForTimeout(1800);
  await dp.screenshot({ path: join(SHOTS, '02-dark-1440.png') });
  await dp.evaluate(() => localStorage.setItem('coms-lab:quality', 'low'));
  await dp.reload({ waitUntil: 'networkidle' });
  await dp.evaluate(() => { window.__lab.loadScene(window.__lab.EXAMPLES.find((e) => e.id === 'external-blink').scene); });
  await dp.waitForTimeout(2000);
  await dp.screenshot({ path: join(SHOTS, '12-low-quality.png') });
  check('low quality renders (screenshot saved)', (await dp.evaluate(() => window.__lab.getState().quality)) === 'low');
  await dctx.close();
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const mp = await mctx.newPage();
  await mp.goto(base, { waitUntil: 'networkidle' });
  await mp.evaluate(() => { localStorage.setItem('coms-lab:tutorial-done', '1'); localStorage.setItem('coms-lab:perf-notice', '1'); });
  await mp.reload({ waitUntil: 'networkidle' });
  await mp.waitForTimeout(1800);
  const overflow = await mp.evaluate(() => ({ doc: document.documentElement.scrollWidth - innerWidth, bar: (() => { const t = document.querySelector('.toolbar'); return t.scrollWidth - t.clientWidth; })() }));
  check('mobile 390px: toolbar and page do not scroll sideways', overflow.doc <= 0 && overflow.bar <= 0, JSON.stringify(overflow));
  await mp.screenshot({ path: join(SHOTS, '13-mobile-390.png') });
  await mctx.close();

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  check('no external requests (CSP)', external.length === 0, external.slice(0, 3).join(' '));
} catch (e) {
  console.log('ABORT', String(e).split('\n')[0]);
  await page.screenshot({ path: join(SHOTS, 'fail.png') }).catch(() => {});
  results.push({ name: 'script aborted', ok: false });
} finally {
  await browser.close();
  dev?.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
