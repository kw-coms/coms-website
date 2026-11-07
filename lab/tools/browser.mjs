// Shared by the browser e2e scripts: Chromium lookup (the per-OS Playwright cache) and the screenshot
// directory (contained in the lab directory, with no symlink traversal).
import { constants, existsSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { userInfo, platform } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export { compileOrigin } from './compile-origin.mjs';

export const LAB_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** Create an internal, fixed-name output directory; environment and argv are never consulted. */
export function outDir(name) {
  if (typeof name !== 'string' || !/^[a-z0-9-]+$/.test(name) || name.trim() !== name) {
    throw new Error('출력 디렉터리 이름은 영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.');
  }
  const target = join(LAB_ROOT, name);
  ensureDirectory(target);
  return target;
}

/** Shared filesystem checks for fixed output directories and script-owned fixture paths. */
function ensureDirectory(target) {
  const fail = () => { throw new Error('출력 경로는 lab 디렉터리 안에 있어야 하며 심볼릭 링크를 사용할 수 없습니다.'); };
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
    checkDirectory(current);
  }
}

/**
 * Write an output file without following an existing symlink at the leaf.
 * Not race-safe against a concurrent process swapping a parent directory between ensureDirectory()'s
 * check and open(): accepted, because these are local dev/CI tools and anyone who can mutate
 * the worktree can already change the code they run.
 */
export async function writeOutputFile(file, data) {
  if (typeof file !== 'string' || !file || basename(file) === '.' || basename(file) === '..') {
    throw new Error('출력 파일 경로가 올바르지 않습니다.');
  }
  const dir = resolve(LAB_ROOT, dirname(file));
  ensureDirectory(dir);
  const target = join(dir, basename(file));
  if (typeof constants.O_NOFOLLOW !== 'number') throw new Error('이 환경은 심볼릭 링크를 막는 안전한 파일 쓰기를 지원하지 않습니다.');
  try {
    const existing = lstatSync(target);
    if (existing.isSymbolicLink()) throw new Error('출력 파일에 심볼릭 링크를 사용할 수 없습니다.');
    if (!existing.isFile()) throw new Error('출력 파일은 일반 파일이어야 합니다.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let handle;
  try {
    handle = await open(target, constants.O_CREAT | constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(data);
  } catch (error) {
    if (error.code === 'ELOOP') throw new Error('출력 파일에 심볼릭 링크를 사용할 수 없습니다.');
    throw error;
  } finally {
    await handle?.close();
  }
}

/** Playwright's path option follows symlinks; capture to memory before safe writing. */
export async function saveScreenshot(target, file) {
  await writeOutputFile(file, await target.screenshot());
}

function cacheDir() {
  const home = userInfo().homedir; // OS account directory, independent of HOME/USERPROFILE overrides.
  if (platform() === 'darwin') return join(home, 'Library/Caches/ms-playwright');
  if (platform() === 'win32') return join(home, 'AppData/Local/ms-playwright');
  return join(home, '.cache/ms-playwright');
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
