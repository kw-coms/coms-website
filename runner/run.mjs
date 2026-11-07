import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { stripPaths, parseDiagnostics, detectJavaClass } from './diagnostics.mjs';

export const MAX_OUTPUT_BYTES = 64 * 1024;
export const CASE_OUTPUT_BYTES = 8 * 1024;
export const COMPILE_WALL_MS = 15_000;
export const RUN_WALL_MS = 10_000;
let poisoned = false;
export const runnerHealthy = () => !poisoned;
let active = false;
// /proc tick rate (USER_HZ) is the fixed ABI value 100 on every Linux architecture; no subprocess needed.
const CLOCK_TICKS = 100;
async function readCpuSeconds(pid) {
  const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
  // Fields after comm (which can itself contain spaces and parentheses) start at 3.
  const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
  return fields.slice(11, 15).reduce((sum, value) => sum + Number(value), 0) / CLOCK_TICKS;
}

// Jobs run as a dedicated uid/gid that owns nothing but /jobs and its own IPC objects.
// The server stays container-root with only SETUID/SETGID/KILL and drops to this id per spawn.
export const JOB_ID = 10100;
export const JOB_ROOT = '/jobs';
const JOB_WRITABLE = [JOB_ROOT, '/dev/shm', '/dev/mqueue'];
// setresuid root->10100 clears permitted/effective/ambient caps; the rest is belt and braces.
const JOB_PRIV = [`--reuid=${JOB_ID}`, `--regid=${JOB_ID}`, '--clear-groups', '--inh-caps=-all', '--ambient-caps=-all', '--no-new-privs'];
const CLEAN_ENV = { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' };
// Helper that must run AS the job uid (file wipe, IPC removal, workspace creation). Asynchronous with a hard
// deadline and SIGKILL, so a stopped or wedged helper can never block the event loop; a timeout rejects
// (the callers treat that as a cleanup failure). The supervisor kills every job process BEFORE using it.
export function asJob(command, args = [], { input = '', timeoutMs = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/setpriv', [...JOB_PRIV, '--', command, ...args], { env: CLEAN_ENV, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '', settled = false, timedOut = false;
    const finish = fn => { if (settled) return; settled = true; clearTimeout(timer); clearTimeout(backstop); fn(); };
    let backstop;
    const timer = setTimeout(() => {
      timedOut = true; child.kill('SIGKILL');
      // If something else keeps the pipes open after the kill, do not wait for 'close'.
      backstop = setTimeout(() => finish(() => { child.stdout.destroy(); child.stderr.destroy(); reject(Object.assign(new Error(`${command} timed out`), { timedOut: true })); }), 1000);
    }, timeoutMs);
    for (const [stream, sink] of [[child.stdout, chunk => { if (out.length < 65_536) out += chunk; }], [child.stderr, chunk => { if (err.length < 4096) err += chunk; }]]) {
      stream.setEncoding('utf8'); stream.on('data', sink); stream.on('error', () => {});
    }
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    child.once('error', error => finish(() => reject(error)));
    child.once('close', (code, signal) => finish(() => {
      if (code === 0 && !timedOut) resolve(out);
      else reject(Object.assign(new Error(timedOut ? `${command} timed out` : `${command} failed (${code ?? signal}): ${err.replace(/[\x00-\x1f]/g, ' ').slice(0, 200)}`), { timedOut, code }));
    }));
  });
}

export const NPROC = { c: 32, python: 32, java: 128 };
export function stageLimits(lang, stage, cpuOverride) {
  const cpu = cpuOverride ?? (stage === 'compile' ? 10 : lang === 'java' ? 6 : 3);
  // NPROC counts threads of the job uid only (the server has another uid). The JVM needs
  // ~30 threads even for hello world, so Java gets 128; the container pids limit still bounds all.
  const args = [`--cpu=${cpu}:${cpu + 1}`, `--nproc=${NPROC[lang]}:${NPROC[lang]}`, '--fsize=8388608:8388608', '--msgqueue=262144:262144', '--sigpending=512:512', '--locks=16:16', `--nofile=${lang === 'java' ? 256 : 64}:${lang === 'java' ? 256 : 64}`, '--core=0:0'];
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

// Every pid whose real, effective, saved or fs uid is the job uid (zombies awaiting tini included).
async function jobPids() {
  const pids = [];
  for (const pid of await readdir('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      const status = await readFile(`/proc/${pid}/status`, 'utf8');
      if (status.match(/^Uid:\s+(.*)$/m)?.[1].split(/\s+/).slice(0, 4).some(uid => Number(uid) === JOB_ID)) pids.push(Number(pid));
    } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error; }
  }
  return pids;
}

export async function killJobProcesses() {
  await assertContainer();
  // Reaping is done by the privileged supervisor itself (CAP_KILL): SIGKILL cannot be blocked, ignored or
  // stopped, so job processes (setsid/double-fork daemons, SIGSTOP-ing attackers) cannot interfere, and
  // nothing here blocks the event loop. Repeat until none remain: a dying process may still fork.
  const deadline = performance.now() + 6000;
  while (true) {
    if (!(await jobPids()).length) return;
    if (performance.now() >= deadline) throw new Error('Job processes did not terminate');
    // Step 1: kill(-1, SIGKILL) as the job uid. The kernel walks the whole task list under tasklist_lock,
    // so a fork-looping job cannot slip a new child past it. The helper itself can be SIGSTOPped by a job
    // process, hence the short SIGKILL deadline; it is only an accelerator.
    try { await asJob('/bin/sh', ['-c', 'kill -9 -1'], { timeoutMs: 150 }); } catch { /* exit 1: nothing left to kill, or the helper was stopped */ }
    // Step 2: the supervisor's own scan + SIGKILL catches whatever step 1 missed (e.g. a stopped helper).
    for (const pid of await jobPids()) {
      try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

function boundUtf8(value, maxBytes = MAX_OUTPUT_BYTES) {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= maxBytes) return { text: value, truncated: false };
  let end = maxBytes;
  // Back up over a partial character, never cut a multibyte sequence.
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return { text: bytes.subarray(0, end).toString('utf8'), truncated: true };
}

// Budget the JSON representation too: control characters can expand sixfold on the wire.
// Twenty case streams plus compile diagnostics must still fit the 200 KiB response contract.
function boundCaseOutput(value) {
  const bounded = boundUtf8(value, CASE_OUTPUT_BYTES);
  if (Buffer.byteLength(JSON.stringify(bounded.text)) - 2 <= CASE_OUTPUT_BYTES) return bounded;
  let text = '', size = 0;
  for (const char of bounded.text) {
    const cost = Buffer.byteLength(JSON.stringify(char)) - 2;
    if (size + cost > CASE_OUTPUT_BYTES) break;
    text += char; size += cost;
  }
  return { text, truncated: true };
}

function caseDiagnostics(stderr, options) {
  const diagnostics = parseDiagnostics(stderr, options);
  while (Buffer.byteLength(JSON.stringify(diagnostics)) > CASE_OUTPUT_BYTES) diagnostics.pop();
  return diagnostics;
}

function decodeBounded(buffer, maxBytes) {
  return boundUtf8(new TextDecoder().decode(buffer), maxBytes);
}

// ipcrm --all enumerates with permission checks and skips mode-0 objects, so enumerate
// /proc/sysvipc here (world-readable) and IPC_RMID each id explicitly as the job uid: the
// owner or creator may remove an object whatever its mode (even after IPC_SET gave away the uid).
// Run after the kill step so attached segments lose their attachers and actually vanish.
const IPC_KINDS = [['shm', '-m'], ['msg', '-q'], ['sem', '-s']];
async function jobIpcObjects(readFileImpl, uid) {
  const found = [];
  for (const [kind, flag] of IPC_KINDS) {
    const [header, ...rows] = (await readFileImpl(`/proc/sysvipc/${kind}`, 'utf8')).trim().split('\n');
    const columns = header.trim().split(/\s+/);
    const owners = ['uid', 'cuid'].map(name => columns.indexOf(name));
    if (owners[0] < 0 || columns.length < 2) throw new Error('System V IPC table unreadable');
    for (const row of rows) {
      const fields = row.trim().split(/\s+/);
      if (owners.some(i => i >= 0 && Number(fields[i]) === uid)) found.push([flag, fields[1]]);
    }
  }
  return found;
}
export async function clearSystemVIpc({ execImpl = asJob, readFileImpl = readFile, uid = JOB_ID } = {}) {
  const found = await jobIpcObjects(readFileImpl, uid);
  for (let i = 0; i < found.length; i += 100) {
    await execImpl('/usr/bin/ipcrm', found.slice(i, i + 100).flat(), { timeoutMs: 5000 });
  }
  if ((await jobIpcObjects(readFileImpl, uid)).length) throw new Error('System V IPC cleanup failed');
}

// Everything the job uid can write lives on the three mounts above. Deleting as the owner
// needs no capability, but mode-000 trees must be re-opened first (chmod -R is pre-order).
// argv only, no shell, so no quoting layer can swallow a terminator; asJob rejects on any
// non-zero exit or timeout, so a failed step can never be mistaken for success.
// chmod -R follows a command-line symlink, so symlinks are never handed to it (rm -rf removes them as links).
const ownEntries = (dir, notLink, ...action) => ['-P', dir, '-mindepth', '1', '-maxdepth', '1', '-user', String(JOB_ID), ...(notLink ? ['!', '-type', 'l'] : []), '-exec', ...action, '+'];
export async function wipeJobFiles({ run = asJob, readdirImpl = readdir, dirs = JOB_WRITABLE } = {}) {
  for (const dir of dirs) {
    try { await readdirImpl(dir); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    await run('/usr/bin/find', ownEntries(dir, true, 'chmod', '-R', 'u+rwx', '--', '{}'), { timeoutMs: 15_000 });
    await run('/usr/bin/find', ownEntries(dir, false, 'rm', '-rf', '--', '{}'), { timeoutMs: 15_000 });
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
  cpuLimit = stage === 'compile' ? 10 : lang === 'java' ? 6 : 3,
  maxOutputBytes = MAX_OUTPUT_BYTES,
} = {}) {
  return new Promise((resolve, reject) => {
    // cwd is entered by `env -C` after the uid switch: the 0700 job dir is unreadable to the server.
    // choom runs first, while still root with CAP_SYS_RESOURCE: writing 1000 with that capability also pins
    // oom_score_adj_min, so the job (non-root after setpriv) can never lower it again. A memcg OOM
    // therefore always picks job processes, never the server. cwd is entered by `env -C` after the uid
    // switch: the 0700 job dir is unreadable to the server. nice 19 (raising is unprivileged, lowering needs
    // CAP_SYS_NICE) keeps CPU-hungry jobs from starving the supervisor's reaper and health endpoint.
    const child = spawnImpl('/usr/bin/choom', ['-n', '1000', '--', '/usr/bin/setpriv', ...JOB_PRIV, '--', '/usr/bin/nice', '-n', '19', '/usr/bin/env', '-C', cwd,
      '/usr/bin/prlimit', ...stageLimits(lang, stage, cpuLimit), '--', command, ...args], {
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
        const remaining = maxOutputBytes - sizes[stream];
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
      const out = decodeBounded(Buffer.concat(buffers.stdout), maxOutputBytes);
      const err = decodeBounded(Buffer.concat(buffers.stderr), maxOutputBytes);
      resolve({ stdout: out.text, stderr: err.text,
        exitCode, signal: signal || null, timedOut: timedOut || cpuLimitReached || signal === 'SIGXCPU', truncated: truncated || out.truncated || err.truncated });
    });
    child.stdin.end(stdin);
  });
}

export async function runCode({ lang, code, stdin = '', tests }, {
  executor = executeStage, cleanup = killJobProcesses,
  clearIpc = cleanup === killJobProcesses ? clearSystemVIpc : async () => {}, tempRoot = '/tmp', now = () => performance.now(),
} = {}) {
  const real = cleanup === killJobProcesses;
  if (real) {
    await assertContainer();
    if (poisoned) throw new Error('Runner cleanup failed; restart required');
  }
  if (active) throw new Error('Runner already active');
  active = true;
  const started = now();
  const multi = tests !== undefined;
  const cleanBetween = async () => {
    try { await cleanup(); await clearIpc(); }
    catch (error) { poisoned = true; throw error; }
  };
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
      await asJob('/bin/sh', ['-c', 'umask 077; mkdir "$1" && cat > "$1/$2"', 'sh', work, file], { input: code });
    } else {
      work = await mkdtemp(join(tempRoot, 'coms-study-'));
      await writeFile(join(work, file), code, { mode: 0o600 });
    }
    let compile;
    const invoke = (command, args, stage, overrides = {}) => executor(command, args, { cwd: work, stdin: stage === 'run' ? stdin : '', lang, stage, ...overrides });
    const response = (result, stage) => {
      // stdout is the student's own output: only the job dir is removed, other text is left alone.
      const out = boundUtf8(stripPaths(result.stdout, { tempDir: work, redactSystemPaths: false }));
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
      if (compile.exitCode !== 0 || compile.truncated || compile.timedOut) {
        if (!multi) return response(compile, 'compile');
        const stderr = boundCaseOutput(stripPaths(compile.stderr, { tempDir: work })).text;
        return { ok: false, stage: 'compile', stderr, diagnostics: caseDiagnostics(stderr, { lang, tempDir: work }),
          timeMs: Math.max(0, Math.round(now() - started)) };
      }
      // No compiler-spawned daemon may overlap execution of the program.
      try { await cleanup(); } catch (error) { if (real) poisoned = true; throw error; }
    }
    const run = overrides => lang === 'c' ? invoke(join(work, 'program'), [], 'run', overrides) : lang === 'python'
      ? invoke('/usr/local/bin/python3', ['-I', '-u', 'main.py'], 'run', overrides)
      : invoke('/opt/java/openjdk/bin/java', ['-Xmx192m', '-Xss1m', '-XX:MaxMetaspaceSize=96m', ...jvm, '-cp', '.', className], 'run', overrides);
    if (!multi) return response(await run(), 'run');
    // Compilation is outside the shared run budget; inter-case reaping is inside it.
    const runStarted = now(), results = [];
    for (let index = 0; index < tests.length; index++) {
      if (index > 0) await cleanBetween();
      const remaining = RUN_WALL_MS - (now() - runStarted);
      if (remaining < 250) {
        results.push(...tests.slice(index).map(() => ({ skipped: true })));
        break;
      }
      const caseStarted = now();
      const result = await run({ stdin: tests[index], timeoutMs: Math.min(remaining, 4000),
        cpuLimit: lang === 'java' ? 4 : 2, maxOutputBytes: CASE_OUTPUT_BYTES });
      const out = boundCaseOutput(stripPaths(result.stdout, { tempDir: work, redactSystemPaths: false }));
      const err = boundCaseOutput(stripPaths(result.stderr, { tempDir: work }));
      results.push({ stdout: out.text, stderr: err.text, exitCode: result.exitCode, signal: result.signal,
        timedOut: result.timedOut, truncated: result.truncated || out.truncated || err.truncated,
        timeMs: Math.max(0, Math.round(now() - caseStarted)) });
    }
    const stderr = boundCaseOutput(stripPaths(compile?.stderr ?? '', { tempDir: work })).text;
    return { ok: true, stage: 'run', stderr, diagnostics: caseDiagnostics(stderr, { lang, tempDir: work }),
      timeMs: Math.max(0, Math.round(now() - started)), results };
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
