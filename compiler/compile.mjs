import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseDiagnostics } from './diagnostics.mjs';

export const failure = (reason, message) => ({ ok: false, reason, errors: [{ line: 0, severity: 'error', message }] });
const MAX_OUTPUT = 256 * 1024;
const MAX_HEX = 192 * 1024;

// Real runner is injectable, so tests need neither Arduino CLI nor its toolchain.
export function runCli(args, { cwd, timeoutMs = 20_000, spawnImpl = spawn } = {}) {
  return new Promise((resolve, reject) => {
    // Go's CLI needs more virtual address space than native AVR tools. The
    // compiler.path wrappers apply tighter limits to GCC and its descendants.
    const child = spawnImpl('/usr/bin/prlimit', [
      '--as=2147483648:2147483648', '--cpu=15:15', '--fsize=16777216:16777216', '--core=0:0',
      '--', '/usr/local/bin/arduino-cli', ...args,
    ], {
      cwd, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      // Do not inherit secrets, loader hooks, GCC flags, proxy settings, or
      // arbitrary ARDUINO_* configuration from the server's environment.
      env: {
        PATH: '/usr/local/bin:/usr/bin:/bin', HOME: cwd || '/tmp', LANG: 'C',
        ARDUINO_DIRECTORIES_DATA: '/opt/arduino/data',
        ARDUINO_DIRECTORIES_USER: '/opt/arduino/user',
        ARDUINO_DIRECTORIES_DOWNLOADS: join(cwd || '/tmp', 'downloads'),
        ARDUINO_BUILD_CACHE_PATH: join(cwd || '/tmp', 'cache'),
        ARDUINO_UPDATER_ENABLE_NOTIFICATION: 'false',
      },
    });
    let stdout = '', stderr = '', bytes = 0, termination;
    const killGroup = () => {
      if (!child.pid) return;
      try { process.kill(-child.pid, 'SIGKILL'); } catch (error) {
        if (error.code !== 'ESRCH') child.kill('SIGKILL');
      }
    };
    const timer = setTimeout(() => { termination = 'timeout'; killGroup(); }, timeoutMs);
    function collect(stream, chunk) {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT) { termination ||= 'output-limit'; killGroup(); return; }
      if (stream === 'stdout') stdout += chunk.toString(); else stderr += chunk.toString();
    }
    child.stdout.on('data', chunk => collect('stdout', chunk));
    child.stderr.on('data', chunk => collect('stderr', chunk));
    child.once('error', error => { clearTimeout(timer); killGroup(); reject(error); });
    // Wait for close (stdio + children) before finally removes the working tree.
    child.once('close', code => {
      clearTimeout(timer);
      killGroup(); // Reap any lingering descendants even after a normal exit.
      if (termination) reject(Object.assign(new Error(termination), { code: termination }));
      else resolve({ code, stdout, stderr });
    });
  });
}

// Size of Intel HEX data records, not ASCII file length (nor the bootloader).
export function hexSize(hex) {
  let bytes = 0, eof = false;
  for (const line of hex.trim().split(/\r?\n/)) {
    if (!/^:[\da-f]+$/i.test(line) || line.length < 11 || line.length % 2 !== 1) throw new Error('invalid hex');
    const data = Buffer.from(line.slice(1), 'hex');
    if (data.length !== data[0] + 5 || data.reduce((a, b) => a + b, 0) % 256 !== 0 || eof) throw new Error('invalid hex');
    if (data[3] === 0) bytes += data[0];
    if (data[3] === 1) eof = true;
  }
  if (!eof) throw new Error('missing hex eof');
  return bytes;
}

export async function compileSketch(sketch, { runner = runCli, tempRoot = tmpdir(), timeoutMs = 20_000 } = {}) {
  let work;
  try {
    work = await mkdtemp(join(tempRoot, 'circuit-lab-'));
    await mkdir(join(work, 'sketch'));
    await writeFile(join(work, 'sketch', 'sketch.ino'), sketch, { mode: 0o600 });
    const result = await runner([
      'compile', '--fqbn', 'arduino:avr:uno', '--jobs', '1', '--warnings', 'all',
      '--build-property', 'compiler.path=/opt/avr-limited/bin/',
      '--build-path', join(work, 'build'), '--output-dir', join(work, 'out'), 'sketch',
    ], { cwd: work, timeoutMs });
    const messages = parseDiagnostics(`${result.stderr}\n${result.stdout}`, {
      tempDir: work, sketchLines: sketch.split('\n').length,
    });
    if (result.code !== 0) {
      const errors = messages.filter(m => m.severity === 'error');
      return errors.length ? { ok: false, reason: 'compile', errors } : failure('compile', '컴파일하지 못했어요. 코드와 라이브러리 사용법을 확인해 주세요.');
    }
    const files = await readdir(join(work, 'out'));
    // Never use the .with_bootloader.hex, whose reset vectors differ.
    const file = files.find(name => name === 'sketch.ino.hex');
    if (!file || (await stat(join(work, 'out', file))).size > MAX_HEX) throw new Error('missing/oversized hex');
    const hex = await readFile(join(work, 'out', file), 'utf8');
    return { ok: true, hex, warnings: messages.filter(m => m.severity === 'warning'), sizeBytes: hexSize(hex) };
  } catch (error) {
    if (error.code === 'timeout') return failure('timeout', '컴파일 시간이 20초를 초과했어요. 코드를 줄여 다시 시도해 주세요.');
    return failure('compile', '컴파일 서비스를 실행하지 못했어요. 잠시 후 다시 시도해 주세요.');
  } finally {
    if (work) await rm(work, { recursive: true, force: true });
  }
}
