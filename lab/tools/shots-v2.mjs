// Screenshot gallery of the v2 parts and UI: node tools/shots-v2.mjs  (starts vite itself unless LAB_URL is set).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { chromeExecutable, GL_ARGS } from './browser.mjs';

const OUT = process.env.SHOTS_OUT ?? join(process.cwd(), 'shots-v2');
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });
let dev, base = process.env.LAB_URL;
if (!base) {
  const port = 5400 + Math.floor(Math.random() * 90);
  dev = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  base = `http://localhost:${port}/lab/`;
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
}
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: GL_ARGS });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
page.on('dialog', (d) => d.accept().catch(() => {}));
const lab = (f, a) => page.evaluate(f, a);
const shot = (n) => page.screenshot({ path: join(OUT, `${n}.png`) });
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '건너뛰기' }).click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '확인' }).click({ timeout: 800 }).catch(() => {});
  await lab(() => window.__lab.set({ sideOpen: false }));
  const NEW = process.env.KINDS?.split(',');
  const groups = NEW ? [NEW] : [
    ['battery-9v', 'battery-aa-pack', 'coin-cell-3v', 'capacitor-ceramic', 'capacitor-electrolytic', 'diode', 'zener', 'inductor'],
    ['dip-switch-4', 'keypad-4x4', 'tilt-switch', 'breadboard-mini', 'tmp36', 'pir', 'flex-sensor', 'force-sensor', 'soil-moisture', 'gas-sensor', 'ir-receiver'],
    ['light-bulb', 'vibration-motor', 'gearmotor', 'neopixel-ring', 'seven-segment-4digit', 'lcd1602-parallel', 'relay-spdt'],
    ['npn', 'pnp', 'nmos', 'tip120', 'regulator-7805', 'l293d', 'shift-register-595', 'logic-7400', 'logic-7408', 'logic-7432', 'logic-7486', 'logic-7404', 'timer-555', 'optocoupler-4n35'],
    ['power-supply', 'oscilloscope', 'function-generator', 'logic-analyzer'],
  ];
  const chunks = groups.flatMap((g) => Array.from({ length: Math.ceil(g.length / 4) }, (_, i) => g.slice(i * 4, i * 4 + 4)));
  let n = 0;
  for (const g of chunks) {
    n++;
    const ids = await lab((k) => window.__lab.gallery(k), g);
    for (const [name, az, el] of [['a', 20, 42], ['b', 200, 28]]) {
      await lab(([i, a, e]) => window.__lab.viewAngle(i, a, e, 0.92), [ids, az, el]);
      await page.waitForTimeout(500);
      await shot(`gallery-${n}${name}`);
    }
  }
} finally {
  console.log('errors:', errs.slice(0, 8));
  await browser.close();
  dev?.kill();
}
