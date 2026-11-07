// Shared by the browser e2e scripts: Chromium lookup and output dirs, configurable through the environment.
//   CHROME=/path/to/chrome-headless-shell   explicit browser binary
//   PLAYWRIGHT_BROWSERS_PATH=/dir           Playwright browser cache (default: the per-OS Playwright cache)
//   LAB_SHOTS=/dir                          screenshot output (default: <tmpdir>/lab-shots)
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir, platform, tmpdir } from 'node:os';
import { basename, isAbsolute, join, resolve, sep } from 'node:path';

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

/** Scratch directories are confined to the temp dir or the user's home. */
function scratchDir(value, fallback) {
  const dir = resolve(value ?? fallback);
  const roots = [resolve(tmpdir()), resolve(homedir())];
  if (!isAbsolute(dir) || dir.includes('\0') || !roots.some((root) => dir === root || dir.startsWith(root + sep))) {
    throw new Error(`LAB_SHOTS must be inside ${roots.join(' or ')} (got ${dir})`);
  }
  return dir;
}

export const SHOTS = scratchDir(process.env.LAB_SHOTS, join(tmpdir(), 'lab-shots'));
mkdirSync(SHOTS, { recursive: true });

function cacheDir() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return scratchDirOrCache(process.env.PLAYWRIGHT_BROWSERS_PATH);
  if (platform() === 'darwin') return join(homedir(), 'Library/Caches/ms-playwright');
  if (platform() === 'win32') return join(process.env.LOCALAPPDATA ?? homedir(), 'ms-playwright');
  return join(homedir(), '.cache/ms-playwright');
}

function scratchDirOrCache(value) {
  const dir = resolve(value);
  if (!isAbsolute(dir) || dir.includes('\0')) throw new Error(`PLAYWRIGHT_BROWSERS_PATH must be an absolute path (got ${value})`);
  return dir;
}

export function chromeExecutable() {
  if (process.env.CHROME) {
    const explicit = resolve(process.env.CHROME);
    if (!/chrom/i.test(basename(explicit)) || !existsSync(explicit)) throw new Error(`CHROME must point at a Chromium executable (got ${explicit})`);
    return explicit;
  }
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
