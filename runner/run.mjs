import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { stripPaths, parseDiagnostics, detectJavaClass } from './diagnostics.mjs';

export const MAX_OUTPUT_BYTES = 64 * 1024;
export const COMPILE_WALL_MS = 15_000;
export const RUN_WALL_MS = 10_000;
let poisoned = false;
export const runnerHealthy = () => !poisoned;
let active = false;
let clockTicks;
async function readCpuSeconds(pid) {
  if (!clockTicks) {
    clockTicks = Number(execFileSync('/usr/bin/getconf', ['CLK_TCK'], { encoding: 'utf8', timeout: 1000, env: { PATH: '/usr/bin:/bin', LANG: 'C' } }).trim());
    if (!Number.isFinite(clockTicks) || clockTicks <= 0) throw new Error('Invalid CPU clock tick rate');
  }
  const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
  // Fields after comm (which can itself contain spaces and parentheses) start at 3.
  const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
  return fields.slice(11, 15).reduce((sum, value) => sum + Number(value), 0) / clockTicks;
}

// Jobs run as a dedicated uid/gid that owns nothing but /jobs and its own IPC objects.
// The server stays container-root with only SETUID/SETGID/KILL and drops to this id per spawn.
export const JOB_ID = 10100;
export const JOB_ROOT = '/jobs';
const JOB_WRITABLE = [JOB_ROOT, '/dev/shm', '/dev/mqueue'];
// setresuid root->10100 clears permitted/effective/ambient caps; the rest is belt and braces.
const JOB_PRIV = [`--reuid=${JOB_ID}`, `--regid=${JOB_ID}`, '--clear-groups', '--inh-caps=-all', '--ambient-caps=-all', '--no-new-privs'];
const CLEAN_ENV = { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' };
export const asJob = (command, args = [], options = {}) => execFileSync('/usr/bin/setpriv',
  [...JOB_PRIV, '--', command, ...args], { timeout: 10_000, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], env: CLEAN_ENV, encoding: 'utf8', ...options });

export const NPROC = { c: 32, python: 32, java: 128 };
export function stageLimits(lang, stage) {
  const cpu = stage === 'compile' ? 10 : lang === 'java' ? 6 : 3;
  // NPROC counts threads of the job uid only (the server has another uid). The JVM needs
  // ~30 threads even for hello world, so Java gets 128; the container pids limit still bounds all.
  const args = [`--cpu=${cpu}:${cpu + 1}`, `--nproc=${NPROC[lang]}:${NPROC[lang]}`, '--fsize=8388608:8388608', `--nofile=${lang === 'java' ? 256 : 64}:${lang === 'java' ? 256 : 64}`, '--core=0:0'];
  // Both JVMs reserve far more address space than their heaps. Container memory
  // is the ceiling; javac uses -J-Xmx256m and java uses -Xmx192m instead of AS.
  if (lang !== 'java') {
    const bytes = stage === 'compile' ? 1024 ** 3 : 256 * 1024 ** 2;
    args.push(`--as=${bytes}:${bytes}`);
  }
  return args;
}

// Never allow the uid-wide kill on a developer machine or in a shared PID namespace.
export async function assertContainer() {
  if (process.platform !== 'linux' || process.env.RUNNER_CONTAINER !== '1' || process.getuid?.() !== 0 ||
      (await readFile('/proc/1/comm', 'utf8')).trim() !== 'tini') {
    throw new Error('Execution requires the dedicated runner container (server uid 0 with SETUID/SETGID/KILL only, tini PID 1)');
  }
}

async function jobProcessesRemain() {
  for (const pid of await readdir('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      const status = await readFile(`/proc/${pid}/status`, 'utf8');
      // Any of real/effective/saved uid; a zombie awaiting tini still counts.
      if (status.match(/^Uid:\s+(.*)$/m)?.[1].split(/\s+/).slice(0, 3).some(uid => Number(uid) === JOB_ID)) return true;
    } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error; }
  }
  return false;
}

export async function killJobProcesses() {
  await assertContainer();
  // kill(-1) AS the job uid reaches every job-uid process (setsid/double-fork daemons
  // included) and cannot reach the server, which has another uid. Repeat: a dying
  // process may still fork.
  const deadline = performance.now() + 2000;
  while (true) {
    try { asJob('/bin/sh', ['-c', 'kill -9 -1']); } catch { /* exit 1 when there was nothing to kill */ }
    if (!(await jobProcessesRemain())) return;
    if (performance.now() >= deadline) throw new Error('Job processes did not terminate');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

function boundUtf8(value) {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= MAX_OUTPUT_BYTES) return { text: value, truncated: false };
  let end = MAX_OUTPUT_BYTES;
  // Back up over a partial character, never cut a multibyte sequence.
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return { text: bytes.subarray(0, end).toString('utf8'), truncated: true };
}

function decodeBounded(buffer) {
  return boundUtf8(new TextDecoder().decode(buffer));
}

export async function clearSystemVIpc({ execImpl = asJob, readFileImpl = readFile, uid = JOB_ID } = {}) {
  // Dedicated private IPC namespace only: SysV objects survive their creators.
  // Run as the job uid, which owns every object a job can create.
  execImpl('/usr/bin/ipcrm', ['--all'], { timeout: 1000, stdio: 'ignore' });
  for (const kind of ['shm', 'msg', 'sem']) {
    const [header, ...rows] = (await readFileImpl(`/proc/sysvipc/${kind}`, 'utf8')).trim().split('\n');
    const columns = header.trim().split(/\s+/);
    const owners = ['uid', 'cuid'].map(name => columns.indexOf(name));
    if (owners[0] < 0 || rows.some(row => { const f = row.trim().split(/\s+/); return owners.some(i => i >= 0 && Number(f[i]) === uid); })) {
      throw new Error('System V IPC cleanup failed');
    }
  }
}

// Everything the job uid can write lives on the three mounts above. Deleting as the owner
// needs no capability, but mode-000 trees must be re-opened first (chmod -R is pre-order).
// argv only, no shell, so no quoting layer can swallow a terminator; execFileSync throws on any
// non-zero exit or timeout, so a failed step can never be mistaken for success.
// chmod -R follows a command-line symlink, so symlinks are never handed to it (rm -rf removes them as links).
const ownEntries = (dir, notLink, ...action) => ['-P', dir, '-mindepth', '1', '-maxdepth', '1', '-user', String(JOB_ID), ...(notLink ? ['!', '-type', 'l'] : []), '-exec', ...action, '+'];
export async function wipeJobFiles({ run = asJob, readdirImpl = readdir, dirs = JOB_WRITABLE } = {}) {
  for (const dir of dirs) {
    try { await readdirImpl(dir); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    run('/usr/bin/find', ownEntries(dir, true, 'chmod', '-R', 'u+rwx', '--', '{}'), { timeout: 20_000 });
    run('/usr/bin/find', ownEntries(dir, false, 'rm', '-rf', '--', '{}'), { timeout: 20_000 });
  }
  // The server owns /jobs (root, 1777: the job uid must be able to list it to clean up, but as a
  // non-owner it can't chmod/rename the root or touch others' entries), so it can list every mount root: nothing may remain,
  // job-owned or otherwise (an entry the job uid cannot delete is a cleanup failure too).
  for (const dir of dirs) {
    let names;
    try { names = await readdirImpl(dir); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (names.length) throw new Error(`Job files survived cleanup in ${dir}`);
  }
}

export function executeStage(command, args, {
  cwd, stdin = '', lang, stage, spawnImpl = spawn, killImpl = process.kill.bind(process),
  setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout,
  setIntervalImpl = setInterval, clearIntervalImpl = clearInterval, cpuSeconds = readCpuSeconds,
  timeoutMs = stage === 'compile' ? COMPILE_WALL_MS : RUN_WALL_MS,
} = {}) {
  return new Promise((resolve, reject) => {
    // cwd is entered by `env -C` after the uid switch: the 0700 job dir is unreadable to the server.
    const child = spawnImpl('/usr/bin/setpriv', [...JOB_PRIV, '--', '/usr/bin/env', '-C', cwd,
      '/usr/bin/prlimit', ...stageLimits(lang, stage), '--', command, ...args], {
      cwd: '/', shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', HOME: cwd, TMPDIR: cwd },
    });
    const buffers = { stdout: [], stderr: [] }, sizes = { stdout: 0, stderr: 0 };
    let timedOut = false, truncated = false, settled = false;
    const killGroup = () => {
      if (!child.pid) return;
      try { killImpl(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') { try { killImpl(child.pid, 'SIGKILL'); } catch {} } }
    };
    const stop = () => {
      killGroup();
      // Escaped descendants must not keep pipe handles alive indefinitely.
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
    };
    const timer = setTimeoutImpl(() => { timedOut = true; stop(); }, timeoutMs);
    const cpuLimit = stage === 'compile' ? 10 : lang === 'java' ? 6 : 3;
    let cpuLimitReached = false;
    // An ignored SIGXCPU ends in SIGKILL, otherwise indistinguishable from OOM.
    // Observe CPU usage during the one-second soft/hard gap; also stop promptly
    // at the soft budget instead of allowing a handler to evade it.
    const cpuTimer = setIntervalImpl(async () => {
      if (!child.pid || settled) return;
      try {
        if (await cpuSeconds(child.pid) >= cpuLimit && !settled) {
          cpuLimitReached = true; timedOut = true; stop();
        }
      } catch { /* /proc may disappear on exit; kernel prlimit remains enforced. */ }
    }, 100);
    cpuTimer?.unref?.();
    for (const stream of ['stdout', 'stderr']) {
      child[stream].on('data', chunk => {
        if (truncated || settled) return;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = MAX_OUTPUT_BYTES - sizes[stream];
        buffers[stream].push(bytes.subarray(0, remaining));
        sizes[stream] += Math.min(bytes.length, remaining);
        if (bytes.length > remaining) { truncated = true; stop(); }
      });
      child[stream].on('error', () => { stop(); });
    }
    child.stdin.on('error', () => {}); // Early-exiting programs legitimately close stdin.
    child.once('error', error => {
      settled = true; clearTimeoutImpl(timer); clearIntervalImpl(cpuTimer); stop(); reject(error);
    });
    child.once('exit', killGroup);
    child.once('close', (exitCode, signal) => {
      if (settled) return;
      settled = true; clearTimeoutImpl(timer); clearIntervalImpl(cpuTimer); killGroup();
      const out = decodeBounded(Buffer.concat(buffers.stdout));
      const err = decodeBounded(Buffer.concat(buffers.stderr));
      resolve({ stdout: out.text, stderr: err.text,
        exitCode, signal: signal || null, timedOut: timedOut || cpuLimitReached || signal === 'SIGXCPU', truncated: truncated || out.truncated || err.truncated });
    });
    child.stdin.end(stdin);
  });
}

export async function runCode({ lang, code, stdin = '' }, {
  executor = executeStage, cleanup = killJobProcesses, tempRoot = '/tmp', now = () => performance.now(),
} = {}) {
  const real = cleanup === killJobProcesses;
  if (real) {
    await assertContainer();
    if (poisoned) throw new Error('Runner cleanup failed; restart required');
  }
  if (active) throw new Error('Runner already active');
  active = true;
  const started = now();
  let work;
  try {
    // A prior server crash may have interrupted its finally block. Reset the
    // container's process/IPC/file state before accepting the first new source too.
    if (real) {
      await killJobProcesses();
      await clearSystemVIpc();
      await wipeJobFiles();
    }
    const className = lang === 'java' ? detectJavaClass(code) : null;
    const file = lang === 'c' ? 'main.c' : lang === 'python' ? 'main.py' : `${className}.java`;
    if (real) {
      work = join(JOB_ROOT, `coms-${randomBytes(6).toString('hex')}`);
      // The job-owned 0700 dir is created and filled as the job uid; the server never needs access.
      asJob('/bin/sh', ['-c', 'umask 077; mkdir "$1" && cat > "$1/$2"', 'sh', work, file], { input: code });
    } else {
      work = await mkdtemp(join(tempRoot, 'coms-study-'));
      await writeFile(join(work, file), code, { mode: 0o600 });
    }
    let compile;
    const invoke = (command, args, stage) => executor(command, args, { cwd: work, stdin: stage === 'run' ? stdin : '', lang, stage });
    const response = (result, stage) => {
      const out = boundUtf8(stripPaths(result.stdout, { tempDir: work }));
      const err = boundUtf8(stripPaths(result.stderr, { tempDir: work }));
      const stdout = out.text, stderr = err.text;
      return { ok: stage === 'run', stage, stdout, stderr, exitCode: result.exitCode,
        signal: result.signal, timedOut: result.timedOut, truncated: result.truncated || out.truncated || err.truncated,
        timeMs: Math.max(0, Math.round(now() - started)),
        diagnostics: parseDiagnostics(`${compile && stage === 'run' ? compile.stderr : ''}\n${stderr}`, { lang, tempDir: work }) };
    };
    // JVM flags: one GC/compiler thread keeps the thread count (NPROC 128) and memory small.
    const jvm = ['-XX:+UseSerialGC', '-XX:TieredStopAtLevel=1', '-XX:CICompilerCount=1', '-XX:ActiveProcessorCount=1',
      '-XX:-UsePerfData', '-XX:+DisableAttachMechanism', '-Xshare:auto', '-Xlog:disable', `-Djava.io.tmpdir=${work}`];
    if (lang === 'c') compile = await invoke('/usr/bin/gcc', ['-std=c17', '-O1', '-Wall', '-Wextra', 'main.c', '-o', 'program', '-lm'], 'compile');
    else if (lang === 'java') compile = await invoke('/opt/java/openjdk/bin/javac', [...jvm.map(x => `-J${x}`), '-J-Xmx256m', '-J-Xss2m', '-J-XX:MaxMetaspaceSize=128m', '-encoding', 'UTF-8', file], 'compile');
    else if (lang !== 'python') throw new Error('Unknown language');
    if (compile) {
      if (compile.exitCode !== 0 || compile.truncated || compile.timedOut) return response(compile, 'compile');
      // No compiler-spawned daemon may overlap execution of the program.
      try { await cleanup(); } catch (error) { if (real) poisoned = true; throw error; }
    }
    const result = lang === 'c' ? await invoke(join(work, 'program'), [], 'run') : lang === 'python'
      ? await invoke('/usr/local/bin/python3', ['-I', '-u', 'main.py'], 'run')
      : await invoke('/opt/java/openjdk/bin/java', ['-Xmx192m', '-Xss1m', '-XX:MaxMetaspaceSize=96m', ...jvm, '-cp', '.', className], 'run');
    return response(result, 'run');
  } finally {
    try {
      // Always reap before deleting files or releasing the single-job slot.
      await cleanup();
      if (real) {
        await clearSystemVIpc();
        await wipeJobFiles();
      } else if (work) await rm(work, { recursive: true, force: true });
    } catch (error) { if (real) poisoned = true; throw error; }
    finally { active = false; }
  }
}
