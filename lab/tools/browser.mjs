// Shared by the browser e2e scripts: Chromium lookup (the per-OS Playwright cache) and the screenshot
// directory (contained in the lab directory, with no symlink traversal).
import { existsSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export { compileOrigin } from './compile-origin.mjs';

export const LAB_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** Resolve screenshot output below lab, rejecting escapes and every existing symlink. */
export function outDir(defaultName, value = process.env.SHOTS_OUT ?? defaultName) {
  const fail = () => { throw new Error('SHOTS_OUT은 lab 디렉터리 안의 경로여야 하며 심볼릭 링크를 사용할 수 없습니다.'); };
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) fail();
  const target = resolve(LAB_ROOT, value);
  const within = relative(LAB_ROOT, target);
  if (within.startsWith('..') || isAbsolute(within)) fail();
  let current = resolve(LAB_ROOT);
  const checkDirectory = path => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail();
  };
  checkDirectory(current);
  for (const component of within ? within.split(sep) : []) {
    current = join(current, component);
    try { mkdirSync(current); } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    // lstat also rejects dangling links and links pointing back inside lab.
    checkDirectory(current);
  }
  return target;
}

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
