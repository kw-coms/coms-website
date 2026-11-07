// Run directly under tini in a disposable image, NOT as a node --test child.
// The production cleanup intentionally kills every process of the job uid (10100).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir, access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { runCode, assertContainer, runnerHealthy, JOB_ID } from '../run.mjs';

const enabled = process.env.RUNNER_TOOLCHAIN_TESTS === '1';
let reason = enabled ? '' : 'requires disposable container; set RUNNER_TOOLCHAIN_TESTS=1';
if (enabled) {
  // Prevent kill(-1) from killing node --test's parent harness.
  if (process.env.NODE_TEST_CONTEXT) throw new Error('Use node test/toolchain.mjs directly, not node --test');
  await assertContainer();
}
const tools = { c: '/usr/bin/gcc', java: '/opt/java/openjdk/bin/javac', python: '/usr/local/bin/python3' };
const options = (lang, attack = false) => ({ skip: reason || (!existsSync(tools[lang]) && `${lang} toolchain missing`) || (attack && process.env.RUNNER_CONTAINER_ATTACK_TESTS !== '1' && 'set RUNNER_CONTAINER_ATTACK_TESTS=1') });
const run = (lang, code, stdin = '') => runCode({ lang, code, stdin });

for (const [lang, code] of [
  ['c', '#include <stdio.h>\nint main(void) { char b[100]; fgets(b,sizeof b,stdin); printf("hello %s",b); }'],
  ['java', 'import java.util.Scanner; public class Greeting { public static void main(String[] args) { System.out.println("hello " + new Scanner(System.in).nextLine()); }}'],
  ['python', 'print("hello " + input())'],
]) {
  test(`${lang}: real hello world and stdin`, options(lang), async () => {
    const r = await run(lang, code, 'COMS\n');
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.exitCode, 0, r.stderr);
    assert.equal(r.stdout, 'hello COMS\n');
  });
}

test('C: real compiler error with source diagnostic', options('c'), async () => {
  const r = await run('c', 'int main(void) { return unknown; }');
  assert.equal(r.ok, false); assert.equal(r.stage, 'compile'); assert.ok(r.diagnostics.length > 0); assert.ok(r.diagnostics[0].hintKo);
});
test('Java: real compiler error', options('java'), async () => {
  const r = await run('java', 'public class Main { public static void main(String[] args) { int x = "bad"; }}');
  assert.equal(r.ok, false); assert.equal(r.stage, 'compile'); assert.ok(r.diagnostics.some(d => d.hintKo));
});
test('Python: real traceback and Korean hint', options('python'), async () => {
  const r = await run('python', 'print(1 / 0)');
  assert.equal(r.ok, true); assert.equal(r.exitCode, 1); assert.match(r.diagnostics[0].hintKo, /0/);
});
test('Java: real NullPointerException', options('java'), async () => {
  const r = await run('java', 'public class Main { public static void main(String[] args) { String a=null; System.out.println(a.length()); }}');
  assert.equal(r.ok, true); assert.notEqual(r.exitCode, 0); assert.ok(r.diagnostics.some(d => /null/.test(d.hintKo)));
});
test('C: runtime failure is not compile failure', options('c'), async () => {
  const r = await run('c', 'int main(void) { return 42; }');
  assert.equal(r.ok, true); assert.equal(r.exitCode, 42); assert.equal(r.stage, 'run');
});
test('C: infinite loop hits CPU limit', options('c', true), async () => {
  const r = await run('c', 'int main(void) { for (;;) {} }');
  assert.equal(r.timedOut, true, JSON.stringify(r)); assert.equal(r.exitCode, null);
});
test('Python: sleeping program hits wall limit', options('python', true), async () => {
  const r = await run('python', 'import time\ntime.sleep(60)');
  assert.equal(r.timedOut, true); assert.equal(r.signal, 'SIGKILL');
});
test('Java: infinite loop hits Java CPU limit', options('java', true), async () => {
  const r = await run('java', 'public class Main { public static void main(String[] args) { while(true) {} }}');
  assert.equal(r.timedOut, true, JSON.stringify(r));
});
test('C: fork bomb attempt stops at NPROC, not merely wall timeout', options('c', true), async () => {
  const r = await run('c', '#define _POSIX_C_SOURCE 200809L\n#include <unistd.h>\n#include <stdio.h>\n#include <errno.h>\nint main(void) { int n; for(n=0;n<128;n++){pid_t p=fork(); if(p<0){printf("limited %d %d\\n",errno,n); return errno==EAGAIN?0:1;} if(p==0){for(;;) pause();}} return 2;}');
  assert.equal(r.exitCode, 0, JSON.stringify(r)); assert.match(r.stdout, /^limited 11 /); assert.equal(r.timedOut, false);
});
test('C: memory hog hits AS limit', options('c', true), async () => {
  const r = await run('c', '#include <stdlib.h>\n#include <stdio.h>\n#include <string.h>\nint main(void){for(int i=0;i<512;i++){void *p=malloc(1048576);if(!p){puts("limited");return 0;} memset(p,42,1048576);} return 1;}');
  assert.equal(r.exitCode, 0, JSON.stringify(r)); assert.equal(r.stdout, 'limited\n');
});
test('Java: heap hog is bounded', options('java', true), async () => {
  const r = await run('java', 'public class Main { public static void main(String[] args) { try { byte[] a=new byte[512*1024*1024]; System.out.println(a.length); } catch (OutOfMemoryError e) { System.out.println("limited"); } }}');
  assert.equal(r.exitCode, 0, JSON.stringify(r)); assert.equal(r.stdout, 'limited\n');
});
test('C: huge file hits FSIZE', options('c', true), async () => {
  const r = await run('c', '#include <fcntl.h>\n#include <unistd.h>\nint main(void){int f=open("huge",O_WRONLY|O_CREAT,0600); char b[4096]={0}; for(int i=0;i<4096;i++) if(write(f,b,sizeof b)<0) return 42; return 0;}');
  assert.equal(r.ok, true); assert.ok(r.signal === 'SIGXFSZ' || r.exitCode === 42, JSON.stringify(r));
});
test('Python: output flood is stopped at 64 KiB', options('python', true), async () => {
  const r = await run('python', 'print("x" * 1000000)');
  assert.equal(r.truncated, true); assert.ok(Buffer.byteLength(r.stdout) <= 65536);
});
test('Python: /etc/shadow cannot be read', options('python', true), async () => {
  const r = await run('python', 'try:\n open("/etc/shadow").read()\n print("UNSAFE")\nexcept PermissionError:\n print("denied")');
  assert.equal(r.stdout, 'denied\n'); assert.equal(r.exitCode, 0, JSON.stringify(r));
});
test('Python: network none leaves no routable interface and external connects fail', options('python', true), async () => {
  // Docker/linuxkit also create DOWN fallback tunnel devices (tunl0, gre0, sit0, ...) in a none-mode
  // netns; the property that matters is that only loopback is UP and no route/address exists.
  const names = await readdir('/sys/class/net');
  for (const name of names.filter(n => n !== 'bonding_masters')) {
    const flags = parseInt((await readFile(`/sys/class/net/${name}/flags`, 'utf8')).trim(), 16);
    assert.equal(Boolean(flags & 1), name === 'lo', `${name} must be ${name === 'lo' ? 'UP' : 'DOWN'}`);
  }
  assert.equal((await readFile('/proc/net/route', 'utf8')).trim().split('\n').length, 1, 'IPv4 route table must be empty');
  const r = await run('python', 'import socket,json\nout={}\nfor name,addr in [("v4",("1.1.1.1",53)),("v6",("2606:4700:4700::1111",53))]:\n s=socket.socket(socket.AF_INET if name=="v4" else socket.AF_INET6)\n s.settimeout(1)\n try:\n  s.connect(addr); out[name]="UNSAFE"\n except OSError as e: out[name]=e.errno\ntry:\n socket.getaddrinfo("example.com",80); out["dns"]="UNSAFE"\nexcept OSError: out["dns"]="denied"\nprint(json.dumps(out))');
  const out = JSON.parse(r.stdout);
  assert.ok(![out.v4, out.v6, out.dns].includes('UNSAFE'), r.stdout);
});
test('C: setsid background daemon is killed even after parent exits', options('c', true), async () => {
  const r = await run('c', '#define _POSIX_C_SOURCE 200809L\n#include <unistd.h>\n#include <stdio.h>\nint main(void){pid_t p=fork(); if(p==0){setsid();close(0);close(1);close(2);for(;;)pause();} printf("%d\\n",p);return p<0;}');
  assert.equal(r.exitCode, 0, JSON.stringify(r)); const pid = Number(r.stdout.trim()); assert.ok(pid > 1);
  await assert.rejects(access(`/proc/${pid}`));
  const next = await run('c', '#include <stdio.h>\nint main(void){puts("next");}');
  assert.equal(next.stdout, 'next\n');
});
test('C: ignored SIGXCPU is still classified as a timeout', options('c', true), async () => {
  const r = await run('c', '#include <signal.h>\nint main(void) { signal(SIGXCPU, SIG_IGN); for (;;) {} }');
  assert.equal(r.timedOut, true, JSON.stringify(r)); assert.equal(r.exitCode, null);
});

test('C: System V shared memory, messages and semaphores do not survive jobs', options('c', true), async () => {
  const headers = '#include <sys/ipc.h>\n#include <sys/shm.h>\n#include <sys/msg.h>\n#include <sys/sem.h>\n#include <stdio.h>\n';
  const first = await run('c', headers + 'int main(void){if(shmget(12341,4096,IPC_CREAT|0600)<0 || msgget(12342,IPC_CREAT|0600)<0 || semget(12343,1,IPC_CREAT|0600)<0)return 1; puts("created");}');
  assert.equal(first.stdout, 'created\n'); assert.equal(first.exitCode, 0, JSON.stringify(first));
  const next = await run('c', headers + 'int main(void){if(shmget(12341,4096,0600)>=0 || msgget(12342,0600)>=0 || semget(12343,1,0600)>=0)return 1;puts("clean");}');
  assert.equal(next.stdout, 'clean\n'); assert.equal(next.exitCode, 0, JSON.stringify(next));
});

// ---- Isolation of the job uid from the server (root + SETUID/SETGID/KILL only) and between jobs ----
const py = (code, stdin = '') => run('python', code, stdin);
const json = r => { assert.equal(r.exitCode, 0, JSON.stringify(r)); return JSON.parse(r.stdout); };
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('job process has uid/gid 10100, no groups, zero capability sets and no_new_privs', options('python', true), async () => {
  const o = json(await py('import json\nf={l.split(":")[0]:l.split(":",1)[1].split() for l in open("/proc/self/status")}\nprint(json.dumps(f))'));
  for (const key of ['Uid', 'Gid']) assert.deepEqual(o[key], Array(4).fill(String(JOB_ID)));
  assert.deepEqual(o.Groups, []);
  for (const key of ['CapInh', 'CapPrm', 'CapEff', 'CapAmb']) assert.match(o[key][0], /^0+$/, key);
  assert.deepEqual(o.NoNewPrivs, ['1']);
});

test('job cannot regain root or another uid', options('python', true), async () => {
  const o = json(await py('import os,json\nout=[]\nfor f in (lambda: os.setuid(0), lambda: os.setresuid(0,0,0), lambda: os.setgid(0), lambda: os.setuid(%d)):\n try: f(); out.append("UNSAFE")\n except PermissionError: out.append("denied")\nprint(json.dumps(out))'.replace('%d', String(process.getuid() + 10002))));
  assert.deepEqual(o, ['denied', 'denied', 'denied', 'denied']);
});

test('job cannot signal or ptrace the server, tini or another root process', options('python', true), async () => {
  const victim = spawn('/bin/sleep', ['60'], { stdio: 'ignore' });
  try {
    const pids = [process.pid, 1, victim.pid];
    const o = json(await py(`import os,json,ctypes\nout={}\nlibc=ctypes.CDLL(None,use_errno=True)\nfor pid in ${JSON.stringify(pids)}:\n  r={}\n  for sig in (9,15,0):\n    try: os.kill(pid,sig); r["kill"+str(sig)]="UNSAFE"\n    except PermissionError: r["kill"+str(sig)]="denied"\n  r["ptrace"]=libc.ptrace(16,pid,0,0)\n  for p in ("mem","environ","maps","fd","cwd","root","exe"):\n    try: open("/proc/%d/"%pid+p,"rb").read(1) if p in ("mem","environ","maps") else os.listdir("/proc/%d/"%pid+p) if p=="fd" else os.readlink("/proc/%d/"%pid+p); r[p]="UNSAFE"\n    except OSError: r[p]="denied"\n  out[pid]=r\ntry:\n  os.kill(-1,0)\nexcept OSError: pass\nprint(json.dumps(out))`));
    for (const pid of pids) {
      const r = o[pid];
      assert.deepEqual(Object.entries(r).filter(([k, v]) => k !== 'ptrace' && v !== 'denied'), [], `pid ${pid}: ${JSON.stringify(r)}`);
      assert.equal(r.ptrace, -1, `ptrace pid ${pid}`);
    }
    assert.ok(alive(process.pid) && alive(1) && alive(victim.pid));
    // The job's own wipe (kill -9 -1 as the job uid) must not have touched them either.
    assert.ok(alive(victim.pid));
  } finally { victim.kill('SIGKILL'); }
});

test('job environment carries nothing from the server', options('python', true), async () => {
  process.env.COMS_TEST_SECRET = 'hunter2';
  try {
    const o = json(await py('import os,json\nprint(json.dumps(sorted(os.environ)))'));
    assert.ok(!o.includes('COMS_TEST_SECRET') && !o.includes('RUNNER_CONTAINER') && !o.includes('NODE_ENV'), o.join(','));
  } finally { delete process.env.COMS_TEST_SECRET; }
});

test('job cannot write anywhere but its own dir and /dev/shm, cannot connect to the server socket', options('python', true), async () => {
  const socketPath = '/run/coms-study/run.sock';
  const socket = createServer();
  const oldMask = process.umask(0o117); // same as server.mjs
  try {
    await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(socketPath, resolve); });
    process.umask(oldMask);
    // Results are a list: stripPaths would turn path keys into "[경로]". /jobs itself is the job's own area.
    const o = json(await py('import os,json,socket\nout=[]\nfor p in ["/tmp/x","/var/tmp/x","/run/coms-study/x","/app/x","/etc/x","/usr/x","/opt/x","/x","/proc/sys/kernel/hostname","/dev/x","/sys/x"]:\n try: open(p,"w").write("x"); out.append("UNSAFE")\n except OSError: out.append("denied")\ns=socket.socket(socket.AF_UNIX)\ntry: s.connect("/run/coms-study/run.sock"); out.append("UNSAFE")\nexcept OSError as e: out.append("denied")\nprint(json.dumps({"out":out,"own":os.access(os.getcwd(),os.W_OK)}))'));
    assert.equal(o.own, true);
    assert.deepEqual(o.out, Array(12).fill('denied'));
  } finally { process.umask(oldMask); await new Promise(resolve => socket.close(resolve)); }
});

test('files, /dev/shm and POSIX queues from one job are gone for the next; previous source is unreadable', options('c', true), async () => {
  const head = '#define _POSIX_C_SOURCE 200809L\n#include <mqueue.h>\n#include <fcntl.h>\n#include <stdio.h>\n#include <sys/mman.h>\n#include <unistd.h>\n';
  const first = await run('c', head + '// SECRET-SOURCE-MARKER-4471\nint main(void){FILE*f=fopen("/dev/shm/leak","w");if(!f)return 1;fputs("SECRET-SOURCE-MARKER-4471",f);fclose(f);if(mq_open("/coms_q",O_CREAT|O_RDWR,0600,NULL)==(mqd_t)-1)return 2;if(shm_open("/coms_shm",O_CREAT|O_RDWR,0600)<0)return 3;FILE*g=fopen("hidden","w");fclose(g);puts("made");return 0;}');
  assert.equal(first.stdout, 'made\n', JSON.stringify(first));
  const next = await py('import os,json\nfound=[]\nfor root in ("/jobs","/dev/shm","/dev/mqueue"):\n for d,_,fs in os.walk(root):\n  for f in fs:\n   p=os.path.join(d,f)\n   if p.startswith("/jobs/") and p.endswith("main.py"): continue\n   found.append(p)\n  \nsrc=[]\nfor d,_,fs in os.walk("/jobs"):\n  for f in fs:\n    try:\n      if "SECRET-SOURCE-MARKER" in open(os.path.join(d,f),errors="ignore").read() and f!="main.py": src.append(f)\n    except OSError: pass\nprint(json.dumps({"found":found,"src":src,"jobs":len(os.listdir("/jobs"))}))');
  const o = json(next);
  assert.deepEqual(o.found, []); assert.deepEqual(o.src, []); assert.equal(o.jobs, 1);
});

test('System V IPC owned by the job uid is removed (ipcs shows nothing)', options('c', true), async () => {
  const r = await run('c', '#include <sys/ipc.h>\n#include <sys/shm.h>\n#include <stdio.h>\nint main(void){for(int i=0;i<20;i++) if(shmget(20000+i,4096,IPC_CREAT|0600)<0) return 1; puts("ok");}');
  assert.equal(r.stdout, 'ok\n');
  for (const kind of ['shm', 'msg', 'sem']) assert.equal((await readFile(`/proc/sysvipc/${kind}`, 'utf8')).trim().split('\n').length, 1, kind);
});

test('stdin flood to a program that never reads it does not hang or crash the runner', options('c', true), async () => {
  const started = Date.now();
  const r = await run('c', 'int main(void){return 7;}', 'x'.repeat(8 * 1024 * 1024));
  assert.equal(r.exitCode, 7, JSON.stringify(r)); assert.ok(Date.now() - started < 8000);
  const slow = await run('python', 'import time\ntime.sleep(30)', 'y'.repeat(8 * 1024 * 1024));
  assert.equal(slow.timedOut, true);
});

test('binary output is bounded, valid UTF-8 and free of control characters', options('python', true), async () => {
  const r = await py('import sys,os\nsys.stdout.buffer.write(os.urandom(300000))\nsys.stdout.flush()');
  assert.equal(r.truncated, true); assert.ok(Buffer.byteLength(r.stdout) <= 65536);
  assert.doesNotMatch(r.stdout, /[\x00-\x08\x0b-\x1f\x7f]/);
  assert.equal(JSON.parse(JSON.stringify(r)).stdout, r.stdout);
});

test('five-megabyte single line output is cut at 64 KiB; 60 KiB single-line source compiles', options('python', true), async () => {
  const r = await py('import sys\nsys.stdout.write("a"*5_000_000)');
  assert.equal(r.truncated, true); assert.ok(Buffer.byteLength(r.stdout) <= 65536);
  const c = await run('c', `int main(void){return 0;} /* ${'z'.repeat(60000)} */`);
  assert.equal(c.ok, true, JSON.stringify(c).slice(0, 300));
});

test('Java thread bomb (1000 threads) is stopped by NPROC and does not hurt the container', options('java', true), async () => {
  const r = await run('java', 'public class Main { public static void main(String[] a) throws Exception { int n=0; try { for(int i=0;i<1000;i++){ Thread t=new Thread(() -> { try { Thread.sleep(60000); } catch (Exception e) {} }); t.setDaemon(true); t.start(); n++; } System.out.println("UNSAFE "+n); } catch (Throwable e) { System.out.println("limited "+(n < 1000 ? "yes":"no")+" "+e.getClass().getSimpleName()); } }}');
  assert.match(r.stdout, /^limited yes OutOfMemoryError\n$/, JSON.stringify(r)); assert.equal(r.exitCode, 0); assert.equal(r.timedOut, false);
  assert.ok(runnerHealthy());
});

test('Python multiprocessing bomb stops at NPROC/NOFILE', options('python', true), async () => {
  const r = await py('import multiprocessing as mp, time, os, sys\nn=0\ntry:\n  for i in range(300):\n    p=mp.Process(target=time.sleep,args=(60,)); p.daemon=True; p.start(); n+=1\n  print("UNSAFE",n)\nexcept OSError as e:\n  print("limited",e.errno in (11,24),n<=32)\nsys.stdout.flush(); os._exit(0)');
  assert.match(r.stdout, /^limited True True\n$/, JSON.stringify(r)); assert.equal(r.timedOut, false);
});

test('after the whole attack suite no job-uid process survives and the runner is healthy', options('python', true), async () => {
  const next = await py('print("alive")');
  assert.equal(next.stdout, 'alive\n'); assert.ok(runnerHealthy());
  for (const pid of (await readdir('/proc')).filter(p => /^\d+$/.test(p))) {
    const status = await readFile(`/proc/${pid}/status`, 'utf8').catch(() => '');
    assert.doesNotMatch(status, new RegExp(`^Uid:\\s+${JOB_ID}`, 'm'), `pid ${pid} survived`);
  }
});
