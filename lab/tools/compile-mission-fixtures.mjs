// node tools/compile-mission-fixtures.mjs — compiles every mission reference sketch with the REAL compile service and
// rewrites src/missions/__fixtures__/missions-hex.json (consumed by src/missions/reference.test.ts, which runs the
// reference solutions through the checkers without needing the compiler). Needs LAB_COMPILE_URL (default http://127.0.0.1:8787).
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { compileOrigin } from './browser.mjs';

const COMPILE = compileOrigin();
const OUT = new URL('../src/missions/__fixtures__/missions-hex.json', import.meta.url);

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { MISSIONS } = await vite.ssrLoadModule('/src/missions/catalog.ts');
await vite.close();

const missions = {};
let failed = false;
for (const mission of MISSIONS) {
  const scene = mission.referenceScene;
  if (!scene.parts.some(part => part.kind === 'arduino-uno')) continue; // e.g. the 555 mission: no firmware
  const response = await fetch(`${COMPILE}/lab/api/compile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sketch: scene.code }),
  });
  const result = await response.json();
  if (!result.ok) {
    failed = true;
    console.log(`FAIL ${mission.id}: ${JSON.stringify(result.diagnostics ?? result.error ?? result).slice(0, 400)}`);
    continue;
  }
  missions[mission.id] = { code: scene.code, hex: result.hex, sizeBytes: result.sizeBytes };
  console.log(`ok   ${mission.id} ${result.sizeBytes} bytes`);
}
if (failed) process.exit(1);
writeFileSync(OUT, JSON.stringify({ missions }, null, 1) + '\n');
console.log(`wrote ${Object.keys(missions).length} missions`);
