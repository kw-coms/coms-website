// Shared by the browser e2e scripts: Chromium lookup (the per-OS Playwright cache) and the screenshot
// directory (<tmpdir>/lab-shots).
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir, platform, tmpdir } from 'node:os';
import { join } from 'node:path';

/** The compile service is a local development container: loopback http only, rebuilt from validated parts. */
export function compileOrigin(value = process.env.LAB_COMPILE_URL ?? 'http://127.0.0.1:8787') {
  const url = new URL(value);
  const host = url.hostname === 'localhost' ? 'localhost' : url.hostname === '127.0.0.1' ? '127.0.0.1' : '';
  const port = Number(url.port || 80);
  if (url.protocol !== 'http:' || !host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`LAB_COMPILE_URL must be http://127.0.0.1:<port> or http://localhost:<port> (got ${value})`);
  }
  return `http://${host}:${port}`;
}

// Fixed locations only: the screenshot directory and the browser lookup take no path from the environment
// (they used to, and a path read from the environment into file-system calls is what CodeQL's
// js/path-injection reports). To use another browser, install it into the default Playwright cache.
export const SHOTS = join(tmpdir(), 'lab-shots');
mkdirSync(SHOTS, { recursive: true });

function cacheDir() {
  if (platform() === 'darwin') return join(homedir(), 'Library/Caches/ms-playwright');
  if (platform() === 'win32') return join(homedir(), 'AppData/Local/ms-playwright');
  return join(homedir(), '.cache/ms-playwright');
}

export function chromeExecutable() {
  const cache = cacheDir();
  const shellDir = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell')).sort().pop() : undefined;
  if (!shellDir) throw new Error(`no chromium_headless_shell in ${cache}: run "npx playwright-core install chromium-headless-shell"`);
  const base = join(cache, shellDir);
  for (const sub of readdirSync(base)) {
    for (const name of ['chrome-headless-shell', 'chrome-headless-shell.exe']) {
      const p = join(base, sub, name);
      if (existsSync(p)) return p;
    }
  }
  throw new Error(`chrome-headless-shell not found under ${base}`);
}

/** Software-GL flags so the suite runs without a GPU. */
export const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
