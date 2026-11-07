// node tools/compile-fixtures.mjs — recompiles every gallery example with the REAL compile service and rewrites
// src/core/__fixtures__/examples-hex.json (guarded by src/core/examples.e2e.test.ts).
// Needs the service (LAB_COMPILE_URL, default http://127.0.0.1:8787), see docs/DEPLOY.md.
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileOrigin, writeOutputFile } from './browser.mjs';

const COMPILE = compileOrigin();
const OUT = new URL('../src/core/__fixtures__/examples-hex.json', import.meta.url);

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { EXAMPLES } = await vite.ssrLoadModule('/src/core/examples.ts');
await vite.close();

const { compiler } = JSON.parse(readFileSync(OUT, 'utf8'));
const examples = {};
let failed = false;
for (const example of EXAMPLES) {
  const response = await fetch(new URL('/lab/api/compile', COMPILE), {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sketch: example.scene.code }),
  });
  const result = await response.json();
  if (!result.ok) {
    failed = true;
    console.log(`FAIL ${example.id}: ${JSON.stringify(result.diagnostics ?? result.error ?? result).slice(0, 400)}`);
    continue;
  }
  examples[example.id] = { title: example.title, code: example.scene.code, hex: result.hex, sizeBytes: result.sizeBytes };
  console.log(`ok   ${example.id} ${result.sizeBytes} bytes`);
}
if (failed) process.exit(1);
await writeOutputFile(fileURLToPath(OUT), JSON.stringify({ compiler, examples }, null, 1) + '\n');
console.log(`wrote ${Object.keys(examples).length} examples`);
