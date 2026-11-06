// Shared by the browser e2e scripts: Chromium lookup and output dirs, configurable through the environment.
//   CHROME=/path/to/chrome-headless-shell   explicit browser binary
//   PLAYWRIGHT_BROWSERS_PATH=/dir           Playwright browser cache (default: the per-OS Playwright cache)
//   LAB_SHOTS=/dir                          screenshot output (default: <tmpdir>/lab-shots)
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir, platform, tmpdir } from 'node:os';
import { join } from 'node:path';

export const SHOTS = process.env.LAB_SHOTS ?? join(tmpdir(), 'lab-shots');
mkdirSync(SHOTS, { recursive: true });

function cacheDir() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (platform() === 'darwin') return join(homedir(), 'Library/Caches/ms-playwright');
  if (platform() === 'win32') return join(process.env.LOCALAPPDATA ?? homedir(), 'ms-playwright');
  return join(homedir(), '.cache/ms-playwright');
}

export function chromeExecutable() {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = cacheDir();
  const shellDir = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell')).sort().pop() : undefined;
  if (!shellDir) throw new Error(`no chromium_headless_shell in ${cache}: run "npx playwright-core install chromium-headless-shell" or set CHROME / PLAYWRIGHT_BROWSERS_PATH`);
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
