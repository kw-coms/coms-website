import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { access, readFile } from 'node:fs/promises';
import { executeStage, runCode, stageLimits, MAX_OUTPUT_BYTES } from '../run.mjs';

function fakeProcess(action) {
  const child = new EventEmitter();
  child.pid = 12345;
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  const calls = [];
  return {
    child, calls,
    spawnImpl(command, args, options) {
      calls.push({ command, args, options });
      queueMicrotask(() => action(child));
      return child;
    },
    killImpl(pid, signal) { calls.push({ pid, signal }); },
  };
}
const finish = (c, code = 0, signal = null) => { c.emit('exit', code, signal); c.emit('close', code, signal); };

test('stage passes stdin exactly and launches prlimit without inherited environment or shell', async () => {
  let input = '';
  const fake = fakeProcess(c => { input = c.stdin.read().toString(); c.stdout.write('안녕'); finish(c); });
  const result = await executeStage('/usr/bin/gcc', ['main.c'], { ...fake, cwd: '/tmp/work', stdin: 'hello\n', lang: 'c', stage: 'compile' });
  assert.equal(input, 'hello\n'); assert.equal(result.stdout, '안녕'); assert.equal(result.exitCode, 0);
  const call = fake.calls[0];
  // oom pin (choom, still root), uid switch (setpriv), then env -C enters the 0700 job dir, then prlimit, then the program.
  assert.equal(call.command, '/usr/bin/choom'); assert.equal(call.options.shell, false);
  assert.deepEqual(call.args.slice(0, 4), ['-n', '1000', '--', '/usr/bin/setpriv']);
  assert.deepEqual(call.args.slice(4, 11), ['--reuid=10100', '--regid=10100', '--clear-groups', '--inh-caps=-all', '--ambient-caps=-all', '--no-new-privs', '--']);
  assert.deepEqual(call.args.slice(11, 18), ['/usr/bin/nice', '-n', '19', '/usr/bin/env', '-C', '/tmp/work', '/usr/bin/prlimit']);
  assert.deepEqual(call.args.slice(-3), ['--', '/usr/bin/gcc', 'main.c']);
  assert.equal(call.options.detached, true);
  assert.deepEqual(call.options.env, { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', HOME: '/tmp/work', TMPDIR: '/tmp/work' });
  assert.ok(call.args.includes('--as=1073741824:1073741824'));
  assert.ok(call.args.includes('--nproc=32:32'));
});

test('output is byte bounded per stream and overflow kills and stops reading', async () => {
  const fake = fakeProcess(c => { c.stdout.write(Buffer.alloc(MAX_OUTPUT_BYTES + 1, 120)); c.stderr.write('err'); finish(c, null, 'SIGKILL'); });
  const result = await executeStage('program', [], { ...fake, cwd: '/tmp/work', lang: 'c', stage: 'run' });
  assert.equal(Buffer.byteLength(result.stdout), MAX_OUTPUT_BYTES);
  assert.equal(result.truncated, true); assert.equal(result.timedOut, false);
  assert.ok(fake.child.stdout.destroyed); assert.ok(fake.calls.some(x => x.pid === -12345));
});

test('streams may each reach cap and split UTF8 is decoded without replacement', async () => {
  const fake = fakeProcess(c => { const b = Buffer.from('한'); c.stdout.write(b.subarray(0, 1)); c.stdout.write(b.subarray(1)); c.stderr.write(Buffer.alloc(MAX_OUTPUT_BYTES, 120)); finish(c); });
  const r = await executeStage('program', [], { ...fake, cwd: '/tmp/work', lang: 'python', stage: 'run' });
  assert.equal(r.stdout, '한'); assert.equal(r.truncated, false); assert.equal(r.stderr.length, MAX_OUTPUT_BYTES);
});

test('wall clock kills process group and reports timedOut using injected timer', async () => {
  let timeout;
  const fake = fakeProcess(c => { timeout(); finish(c, null, 'SIGKILL'); });
  const r = await executeStage('program', [], { ...fake, cwd: '/tmp/work', lang: 'c', stage: 'run', setTimeoutImpl: fn => { timeout = fn; return 1; }, clearTimeoutImpl() {} });
  assert.equal(r.timedOut, true); assert.equal(r.exitCode, null); assert.equal(r.signal, 'SIGKILL');
});

test('CPU soft limit signal is a timeout; java virtual address space remains uncapped', async () => {
  const fake = fakeProcess(c => finish(c, null, 'SIGXCPU'));
  const r = await executeStage('java', [], { ...fake, cwd: '/tmp/work', lang: 'java', stage: 'run' });
  assert.equal(r.timedOut, true);
  assert.equal(stageLimits('java', 'run').some(x => x.startsWith('--as=')), false);
  assert.equal(stageLimits('java', 'compile').some(x => x.startsWith('--as=')), false);
  assert.ok(stageLimits('java', 'run').includes('--cpu=6:7'));
  assert.ok(stageLimits('java', 'run').includes('--nproc=128:128')); assert.ok(stageLimits('c', 'run').includes('--nproc=32:32')); assert.ok(stageLimits('python', 'compile').includes('--nproc=32:32'));
});

const success = { stdout: '', stderr: '', exitCode: 0, signal: null, timedOut: false, truncated: false };
test('runCode compiles Java matching filename, feeds stdin only to run, strips paths and wipes directory', async () => {
  const calls = [], cleaned = [];
  const r = await runCode({ lang: 'java', code: 'public class Hello { public static void main(String[] args) {} }', stdin: '입력\n' }, {
    executor: async (command, args, options) => {
      calls.push({ command, args, options });
      assert.match(await readFile(`${options.cwd}/Hello.java`, 'utf8'), /class Hello/);
      return { ...success, stdout: command.endsWith('/java') ? `${options.cwd}/Hello.java\n` : '' };
    }, cleanup: async () => { cleaned.push(true); },
  });
  assert.equal(r.ok, true); assert.equal(r.stage, 'run'); assert.equal(r.stdout, 'Hello.java\n');
  assert.equal(calls[0].options.stdin, ''); assert.equal(calls[1].options.stdin, '입력\n');
  assert.ok(calls[1].args.includes('-Xmx192m'));
  assert.equal(cleaned.length, 2); await assert.rejects(access(calls[0].options.cwd));
});

test('compile failure returns normal compile response and never starts program', async () => {
  let calls = 0, work, cleaned = false;
  const r = await runCode({ lang: 'c', code: 'bad', stdin: '' }, {
    executor: async (cmd, args, opts) => { work = opts.cwd; calls++; return { ...success, exitCode: 1, stderr: `${work}/main.c:1:2: error: expected ';'\n` }; },
    cleanup: async () => { cleaned = true; },
  });
  assert.equal(r.ok, false); assert.equal(r.stage, 'compile'); assert.equal(calls, 1);
  assert.equal(r.diagnostics[0].line, 1); assert.ok(cleaned); await assert.rejects(access(work));
});

test('runtime failure still has ok true, executor errors still clean job files', async () => {
  let work, cleaned = 0;
  const r = await runCode({ lang: 'python', code: '1/0' }, { executor: async () => ({ ...success, exitCode: 1, stderr: 'ZeroDivisionError: division by zero' }), cleanup: async () => {} });
  assert.equal(r.ok, true); assert.equal(r.stage, 'run'); assert.equal(r.exitCode, 1);
  await assert.rejects(runCode({ lang: 'python', code: '' }, { executor: async (cmd, args, opt) => { work = opt.cwd; throw new Error('spawn failed'); }, cleanup: async () => { cleaned++; } }));
  assert.equal(cleaned, 1); await assert.rejects(access(work));
});

test('default execution fails closed outside dedicated container', async () => {
  if (process.env.RUNNER_CONTAINER === '1') return;
  await assert.rejects(runCode({ lang: 'python', code: 'print(1)' }), /container/i);
});

test('invalid UTF8 and path redaction remain byte bounded', async () => {
  const fake = fakeProcess(c => { c.stdout.write(Buffer.alloc(MAX_OUTPUT_BYTES, 255)); finish(c); });
  const decoded = await executeStage('program', [], { ...fake, cwd: '/tmp/work', lang: 'c', stage: 'run' });
  assert.ok(Buffer.byteLength(decoded.stdout) <= MAX_OUTPUT_BYTES);
  const r = await runCode({ lang: 'python', code: '' }, { executor: async () => ({ ...success, stderr: '/usr '.repeat(8000) }), cleanup: async () => {} });
  assert.ok(Buffer.byteLength(r.stderr) <= MAX_OUTPUT_BYTES);
  assert.equal(r.truncated, true);
});

test('CPU polling catches an ignored SIGXCPU without classifying unrelated SIGKILL as timeout', async () => {
  let poll;
  const fake = fakeProcess(async c => { await poll(); finish(c, null, 'SIGKILL'); });
  const r = await executeStage('program', [], { ...fake, cwd: '/tmp/work', lang: 'c', stage: 'run', cpuSeconds: async () => 3.1, setIntervalImpl: fn => { poll = fn; return 1; }, clearIntervalImpl() {} });
  assert.equal(r.timedOut, true);
  const killed = fakeProcess(c => finish(c, null, 'SIGKILL'));
  const other = await executeStage('program', [], { ...killed, cwd: '/tmp/work', lang: 'c', stage: 'run' });
  assert.equal(other.timedOut, false);
});

test('System V IPC cleanup removes each owned or created object by id and rejects survivors', async () => {
  const { clearSystemVIpc } = await import('../run.mjs');
  const calls = [];
  let removed = false;
  const table = { shm: 'key shmid perms uid gid cuid cgid\n0 11 0 0 0 10100 0\n0 12 600 5 5 5 5\n', msg: 'key msqid perms uid gid cuid cgid\n0 21 0 10100 1 1 1\n', sem: 'key semid perms uid gid cuid cgid\n' };
  const reader = async path => removed ? table[path.split('/').pop()].split('\n')[0] + '\n' : table[path.split('/').pop()];
  await clearSystemVIpc({ execImpl: (...args) => { calls.push(args); removed = true; }, readFileImpl: reader, uid: 10100 });
  assert.equal(calls.length, 1); assert.equal(calls[0][0], '/usr/bin/ipcrm');
  assert.deepEqual(calls[0][1], ['-m', '11', '-q', '21']); // other users' objects are never touched
  await assert.rejects(clearSystemVIpc({ execImpl() {}, readFileImpl: async path => table[path.split('/').pop()], uid: 10100 }), /IPC/);
  calls.length = 0;
  await clearSystemVIpc({ execImpl: (...args) => calls.push(args), readFileImpl: async path => path.endsWith('/shm') ? 'key shmid uid cuid\n' : 'key id uid cuid\n', uid: 10100 });
  assert.equal(calls.length, 0);
});

test('student stdout keeps slashes, dates and URLs; stderr still loses system paths', async () => {
  const text = '1/2 = 0.5\n2024/11/07 and/or http://x.y/z /usr/bin/x';
  const r = await runCode({ lang: 'python', code: '' }, { executor: async () => ({ ...success, stdout: text, stderr: `${text}\n  File "/app/x.py", line 1` }), cleanup: async () => {} });
  assert.equal(r.stdout, text);
  assert.equal(r.stderr.split('\n')[0], '1/2 = 0.5'); assert.match(r.stderr, /^2024\/11\/07 and\/or http:\/\/x\.y\/z \[경로\]$/m); assert.doesNotMatch(r.stderr, /\/app/);
});

test('multi-case compiles once, preserves order, reaps processes then IPC between cases', async () => {
  const events = [], calls = [];
  let time = 0;
  const r = await runCode({ lang: 'c', code: '', tests: ['first', 'second', 'third'] }, {
    now: () => time,
    executor: async (command, args, options) => {
      calls.push(options); events.push(options.stage === 'compile' ? 'compile' : options.stdin);
      time += options.stage === 'compile' ? 15000 : 100;
      return { ...success, stdout: options.stdin, stderr: options.stage === 'compile' ? 'warning' : '' };
    }, cleanup: async () => { events.push('kill'); }, clearIpc: async () => { events.push('ipc'); },
  });
  assert.deepEqual(events, ['compile', 'kill', 'first', 'kill', 'ipc', 'second', 'kill', 'ipc', 'third', 'kill']);
  assert.deepEqual(r.results.map(x => x.stdout), ['first', 'second', 'third']);
  assert.deepEqual(r.results.map(x => x.timeMs), [100, 100, 100]);
  assert.equal(r.stderr, 'warning'); assert.equal(r.timeMs, 15300);
  assert.deepEqual(Object.keys(r).sort(), ['diagnostics', 'ok', 'results', 'stage', 'stderr', 'timeMs']);
  assert.equal(calls.filter(x => x.stage === 'compile').length, 1);
  for (const options of calls.slice(1)) {
    assert.equal(options.cpuLimit, 2); assert.equal(options.timeoutMs, 4000); assert.equal(options.maxOutputBytes, 8192);
  }
  assert.equal(new Set(calls.map(x => x.cwd)).size, 1);
});

test('shared run deadline includes cleanup, splits wall time and skips the suffix', async () => {
  let time = 0;
  const walls = [];
  const r = await runCode({ lang: 'python', code: '', tests: ['1', '2', '3', '4', '5'] }, {
    now: () => time, cleanup: async () => { time += 100; }, clearIpc: async () => { time += 100; },
    executor: async (cmd, args, opt) => {
      walls.push(opt.timeoutMs); time += opt.timeoutMs;
      return { ...success, timedOut: true, exitCode: null, signal: 'SIGKILL' };
    },
  });
  assert.deepEqual(walls, [4000, 4000, 1600]);
  assert.deepEqual(r.results.slice(3), [{ skipped: true }, { skipped: true }]);
  assert.ok(r.results.slice(0, 3).every(x => x.timedOut));
});

test('multi-case compile failure has no results and does not run any case', async () => {
  let calls = 0;
  const r = await runCode({ lang: 'c', code: '', tests: ['1', '2'] }, {
    executor: async () => { calls++; return { ...success, exitCode: 1, stderr: 'main.c:1:2: error: bad' }; }, cleanup: async () => {},
  });
  assert.equal(calls, 1); assert.equal(r.ok, false); assert.equal(r.stage, 'compile');
  assert.equal('results' in r, false); assert.equal(r.diagnostics[0].line, 1);
});

test('multi-case output caps apply after UTF8 decoding and redaction; single shape stays unchanged', async () => {
  const r = await runCode({ lang: 'python', code: '', tests: [''] }, {
    executor: async (cmd, args, opt) => ({ ...success, stdout: `${opt.cwd}/x /usr/bin/x ` + '한'.repeat(4000), stderr: '/usr '.repeat(4000) }), cleanup: async () => {},
  });
  const c = r.results[0];
  assert.ok(Buffer.byteLength(c.stdout) <= 8192); assert.ok(Buffer.byteLength(c.stderr) <= 8192);
  assert.match(c.stdout, /^x \/usr\/bin\/x /); assert.doesNotMatch(c.stderr, /\/usr/);
  assert.equal(c.truncated, true); assert.equal(c.stdout.includes('\ufffd'), false);
  const single = await runCode({ lang: 'python', code: '', stdin: '' }, { executor: async () => success, cleanup: async () => {} });
  assert.deepEqual(Object.keys(single).sort(), ['diagnostics', 'exitCode', 'ok', 'signal', 'stage', 'stderr', 'stdout', 'timeMs', 'timedOut', 'truncated']);
});

test('per-case CPU override reaches prlimit and polling; per-case stream overflow kills', async () => {
  for (const [lang, cpuLimit] of [['c', 2], ['java', 4]]) {
    let poll;
    const fake = fakeProcess(async c => { await poll(); finish(c, null, 'SIGKILL'); });
    const r = await executeStage('program', [], { ...fake, cwd: '/tmp/work', lang, stage: 'run', cpuLimit,
      cpuSeconds: async () => cpuLimit, setIntervalImpl: fn => { poll = fn; return 1; }, clearIntervalImpl() {} });
    assert.ok(fake.calls[0].args.includes(`--cpu=${cpuLimit}:${cpuLimit + 1}`)); assert.equal(r.timedOut, true);
  }
  for (const stream of ['stdout', 'stderr']) {
    const fake = fakeProcess(c => { c[stream].write(Buffer.alloc(8193, 255)); finish(c, null, 'SIGKILL'); });
    const r = await executeStage('program', [], { ...fake, cwd: '/tmp/work', lang: 'python', stage: 'run', maxOutputBytes: 8192 });
    assert.ok(Buffer.byteLength(r[stream]) <= 8192); assert.equal(r.truncated, true);
    assert.ok(fake.calls.some(x => x.pid === -12345));
  }
});

test('mid-loop process or IPC cleanup failure poisons runner even if final cleanup succeeds', async () => {
  for (const failing of ['kill', 'ipc']) {
    // Separate module state: poisoning must remain latched without affecting other tests.
    const runner = await import(`../run.mjs?poison-${failing}`);
    let ran = 0, kills = 0;
    await assert.rejects(runner.runCode({ lang: 'python', code: '', tests: ['1', '2'] }, {
      executor: async () => { ran++; return success; },
      cleanup: async () => { if (++kills === 1 && failing === 'kill') throw new Error('kill failed'); },
      clearIpc: async () => { if (failing === 'ipc') throw new Error('ipc failed'); },
    }), /failed/);
    assert.equal(ran, 1); assert.equal(kills, 2); assert.equal(runner.runnerHealthy(), false);
  }
});

test('ten escaped-output cases keep the serialized response below 200 KB', async () => {
  for (const output of ['\n'.repeat(8192), '\t'.repeat(8192), '"\\'.repeat(4096)]) {
    const r = await runCode({ lang: 'python', code: '', tests: Array(10).fill('') }, {
      executor: async () => ({ ...success, stdout: output, stderr: output }), cleanup: async () => {},
    });
    assert.equal(r.results.length, 10);
    assert.ok(Buffer.byteLength(JSON.stringify(r)) <= 200_000);
    assert.ok(r.results.every(x => x.truncated));
  }
});

test('Java cases receive four CPU seconds while compilation keeps its original limits', async () => {
  const calls = [];
  await runCode({ lang: 'java', code: 'class Main {}', tests: ['', ''] }, {
    executor: async (cmd, args, opt) => { calls.push(opt); return success; }, cleanup: async () => {},
  });
  assert.equal(calls[0].stage, 'compile'); assert.equal(calls[0].cpuLimit, undefined);
  assert.ok(calls.slice(1).every(x => x.cpuLimit === 4 && x.timeoutMs <= 4000));
  assert.ok(stageLimits('c', 'run').includes('--cpu=3:4'));
  assert.ok(stageLimits('java', 'compile').includes('--cpu=10:11'));
});

test('compile diagnostics and escaped output together fit the multi-response bound', async () => {
  const r = await runCode({ lang: 'c', code: '', tests: Array(10).fill('') }, {
    executor: async (cmd, args, opt) => opt.stage === 'compile'
      ? { ...success, stderr: "main.c:1:1: warning: expected ';'\n".repeat(100) }
      : { ...success, stdout: '\n'.repeat(8192), stderr: '\n'.repeat(8192) }, cleanup: async () => {},
  });
  assert.ok(r.diagnostics.length > 0);
  assert.ok(Buffer.byteLength(JSON.stringify(r)) <= 200_000);
});
