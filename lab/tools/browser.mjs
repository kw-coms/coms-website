// Shared by the browser e2e scripts: Chromium lookup (the per-OS Playwright cache) and the screenshot
// directory (contained in the lab directory, with no symlink traversal).
import { constants, existsSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
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

/** Write an output file without following an existing symlink at the leaf. */
export async function writeOutputFile(file, data) {
  if (typeof file !== 'string' || !file || basename(file) === '.' || basename(file) === '..') {
    throw new Error('출력 파일 경로가 올바르지 않습니다.');
  }
  const dir = outDir('unused', dirname(file));
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
