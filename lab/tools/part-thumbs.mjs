// Renders every catalog part alone with the real three/r3f part models (dev-only `?partthumbs` stage)
// and writes public/parts/<kind>.webp (160x120) and <kind>-lg.webp (360x270). Regenerate: npm run parts:thumbs
// Starts `vite` itself unless LAB_URL is set.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { chromeExecutable, GL_ARGS, writeOutputFile } from './browser.mjs';

let dev;
let base = process.env.LAB_URL;
if (!base) {
  const port = 5340 + Math.floor(Math.random() * 50);
  dev = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  base = `http://localhost:${port}/lab/`;
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
}
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: GL_ARGS });
let failed = 0;
try {
  const page = await (await browser.newContext({ viewport: { width: 360, height: 270 }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  await page.goto(`${base}?partthumbs`);
  await page.waitForFunction(() => window.__thumbs?.ready, null, { timeout: 60000 });
  const kinds = await page.evaluate(() => window.__thumbs.kinds);
  for (const kind of kinds) {
    try {
      const out = await page.evaluate(async (k) => {
        const png = await window.__thumbs.render(k);
        const img = new Image();
        await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = png; });
        const enc = (w, h, q) => {
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const g = c.getContext('2d');
          g.imageSmoothingQuality = 'high';
          g.drawImage(img, 0, 0, w, h);
          return c.toDataURL('image/webp', q).split(',')[1];
        };
        return { sm: enc(160, 120, 0.8), lg: enc(360, 270, 0.82) };
      }, kind);
      await writeOutputFile(`public/parts/${kind}.webp`, Buffer.from(out.sm, 'base64'));
      await writeOutputFile(`public/parts/${kind}-lg.webp`, Buffer.from(out.lg, 'base64'));
      console.log(`ok ${kind} ${Buffer.from(out.sm, 'base64').length}B / ${Buffer.from(out.lg, 'base64').length}B`);
    } catch (e) { failed++; console.log(`FAIL ${kind}: ${e.message}`); }
  }
} finally {
  await browser.close();
  dev?.kill();
}
process.exit(failed ? 1 : 0);
