// Run directly under tini in a disposable image, NOT as a node --test child.
// The production cleanup intentionally kills every process of the job uid (10100).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir, access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import http from 'node:http';
import { runCode, assertContainer, runnerHealthy, JOB_ID, asJob, executeStage, killJobProcesses, clearSystemVIpc, wipeJobFiles } from '../run.mjs';

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
  assert.deepEqual(o.Seccomp, ['2'], 'run the container with --security-opt seccomp=runner/seccomp.json');
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
  const next = await py('import os,json\nfound=[]\nfor root in ("/jobs","/dev/shm","/dev/mqueue"):\n for d,_,fs in os.walk(root):\n  for f in fs:\n   p=os.path.join(d,f)\n   if p.startswith("/jobs/") and p.endswith("main.py"): continue\n   found.append(p)\n  \nsrc=[]\nfor d,_,fs in os.walk("/jobs"):\n  for f in fs:\n    try:\n      if "SECRET-SOURCE-MARKER" in open(os.path.join(d,f),errors="ignore").read() and f!="main.py": src.append(f)\n    except OSError: pass\nprint(json.dumps({"found":found,"src":src}))');
  const o = json(next);
  assert.deepEqual(o.found, []); assert.deepEqual(o.src, []);
  assert.deepEqual(await readdir('/jobs'), []);
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

// ---- Cleanup robustness: a job must never be able to wedge the runner (regression tests) ----
// After every hostile job a normal job must succeed and every job-writable mount must be empty.
const afterwards = async label => {
  const next = await py('print("fine")');
  assert.equal(next.stdout, 'fine\n', `${label}: ${JSON.stringify(next)}`); assert.ok(runnerHealthy(), label);
  // The job above ran (and was wiped) too; the server owns /jobs and may list it.
  for (const dir of ['/jobs', '/dev/shm', '/dev/mqueue']) assert.deepEqual(await readdir(dir), [], `${label}: ${dir}`);
};
const hostile = [
  ['non-empty mode-000 directory tree and mode-000 files', 'import os\nos.makedirs("a/b/c")\nfor p in ("a/b/c/f","a/b/f","a/f","top"):\n  open(p,"w").write("x"); os.chmod(p,0)\nfor p in ("a/b/c","a/b","a"): os.chmod(p,0)\nprint("made")'],
  ['mode-000 working directory itself', 'import os\nos.makedirs("x/y"); open("x/y/f","w").close(); os.chmod("x/y",0); os.chmod("x",0); os.chmod(os.getcwd(),0)\nprint("made")'],
  ['chmod/rename/replace of the /jobs mount root and its entries', 'import os,json\nr=[]\nfor f in (lambda: os.chmod("/jobs",0), lambda: os.rename("/jobs","/jobs2"), lambda: os.rmdir("/jobs"), lambda: os.chown("/jobs",10100,10100)):\n  try: f(); r.append("UNSAFE")\n  except OSError: r.append("denied")\nd=os.getcwd(); os.chmod(d,0o700); os.rename(d,"/jobs/renamed"); os.symlink("/","/jobs/link-to-root"); open("/jobs/loose","w").write("x"); os.mkdir("/jobs/loosedir"); open("/jobs/loosedir/f","w").close(); os.chmod("/jobs/loosedir",0)\nprint(json.dumps(r))'],
  ['3000 levels of nested directories', 'import os\nfor i in range(3000):\n  os.mkdir("d"); os.chdir("d")\nprint("deep")'],
  ['inode exhaustion up to the tmpfs cap', 'import os\nn=0\ntry:\n  while True:\n    open("f%d"%n,"w").close(); n+=1\nexcept OSError as e:\n  print("full",e.errno,n>1000)'],
  ['FIFO, unix socket, hard link and symlink loops', 'import os,socket\nos.mkfifo("fifo"); s=socket.socket(socket.AF_UNIX); s.bind("sock")\nos.symlink("b","a"); os.symlink("a","b"); os.mkdir("dir"); os.symlink("..","dir/up"); os.symlink(".","self"); open("h","w").write("x"); os.link("h","h2")\nprint("made")'],
];
for (const [name, code] of hostile) {
  test(`cleanup survives: ${name}`, options('python', true), async () => {
    const r = await py(code);
    assert.equal(r.exitCode, 0, JSON.stringify(r)); assert.ok(!/UNSAFE/.test(r.stdout), r.stdout);
    await afterwards(name);
  });
}
test('cleanup survives: a background process holding files while the job exits', options('c', true), async () => {
  const r = await run('c', '#define _POSIX_C_SOURCE 200809L\n#include <unistd.h>\n#include <fcntl.h>\nint main(void){if(fork()==0){setsid();int f=open("held",O_CREAT|O_WRONLY,0);for(;;)pause();}return 0;}');
  assert.equal(r.exitCode, 0, JSON.stringify(r)); await afterwards('daemon holding mode-000 file');
});

test('unremovable leftover poisons the runner; server answers 503 and exits non-zero for a container restart', options('python', true), async () => {
  // A root-owned entry in the sticky /jobs cannot be deleted by uid 10100: real cleanup failure.
  const stuck = '/jobs/stuck'; const sock = '/run/coms-study/fault.sock';
  await writeFile(stuck, 'x');
  const child = spawn(process.execPath, ['server.mjs'], { cwd: '/app', stdio: ['ignore', 'ignore', 'pipe'],
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', RUNNER_CONTAINER: '1', LISTEN_SOCKET: sock, RATE_LIMIT_PER_MIN: '100' } });
  let stderr = ''; child.stderr.on('data', d => { stderr += d; });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  try {
    for (let i = 0; i < 100 && !(await access(sock).then(() => true, () => false)); i++) await new Promise(r => setTimeout(r, 50));
    const body = JSON.stringify({ lang: 'python', code: 'print(1)' });
    const response = await new Promise((resolve, reject) => {
      const req = http.request({ socketPath: sock, path: '/study/api/run', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
        res => { let data = ''; res.on('data', c => { data += c; }); res.on('end', () => resolve({ status: res.statusCode, data })); });
      req.on('error', reject); req.end(body);
    });
    assert.equal(response.status, 503, response.data); assert.equal(JSON.parse(response.data).error, 'unavailable');
    const result = await Promise.race([exited, new Promise(resolve => setTimeout(() => resolve('still running'), 6000))]);
    assert.deepEqual(result, { code: 70, signal: null }, stderr);
    assert.match(stderr, /job cleanup failed/);
  } finally { child.kill('SIGKILL'); await unlink(stuck).catch(() => {}); await unlink(sock).catch(() => {}); }
  await afterwards('after fault test');
});

// ---- IPC objects created with mode 0 (invisible to `ipcrm --all`) must not poison the runner ----
const ipcHead = '#define _GNU_SOURCE\n#include <sys/ipc.h>\n#include <sys/shm.h>\n#include <sys/msg.h>\n#include <sys/sem.h>\n#include <sys/mman.h>\n#include <mqueue.h>\n#include <fcntl.h>\n#include <stdio.h>\n#include <unistd.h>\n#include <signal.h>\n';
const ipcClean = async label => {
  const next = await run('c', '#include <stdio.h>\nint main(void){puts("fine");}');
  assert.equal(next.stdout, 'fine\n', `${label}: ${JSON.stringify(next)}`); assert.ok(runnerHealthy(), `${label}: poisoned`);
  for (const kind of ['shm', 'msg', 'sem']) assert.equal((await readFile(`/proc/sysvipc/${kind}`, 'utf8')).trim().split('\n').length, 1, `${label}: ${kind}`);
};
for (const [name, body] of [
  ['mode-000 shared memory, message queue and semaphore', 'if(shmget(IPC_PRIVATE,4096,IPC_CREAT|0)<0||msgget(IPC_PRIVATE,IPC_CREAT|0)<0||semget(IPC_PRIVATE,1,IPC_CREAT|0)<0) return 1;'],
  ['shm whose owner uid was given away with IPC_SET (creator uid remains)', 'int id=shmget(IPC_PRIVATE,4096,IPC_CREAT|0600); struct shmid_ds d; if(id<0||shmctl(id,IPC_STAT,&d)) return 1; d.shm_perm.uid=0; d.shm_perm.mode=0; if(shmctl(id,IPC_SET,&d)) return 2;'],
  ['mode-000 POSIX shm and message queue', 'if(shm_open("/z000",O_CREAT|O_RDWR,0)<0) return 1; if(mq_open("/z000q",O_CREAT|O_RDWR,0,NULL)==(mqd_t)-1) return 2;'],
  // Up to 500 objects; the compose sysctls (shmmni 64, msgmni 32, semmni 64) stop it earlier, which is fine.
  ['up to 500 SysV objects of all kinds with alternating modes', 'int n=0; for(int i=0;i<500;i++){int m=i%2?0:0600; int r=i%3==0?shmget(IPC_PRIVATE,4096,IPC_CREAT|m):i%3==1?msgget(IPC_PRIVATE,IPC_CREAT|m):semget(IPC_PRIVATE,1,IPC_CREAT|m); if(r<0)continue; n++;} if(n<20) return 1;'],
]) {
  test(`IPC cleanup survives: ${name}`, options('c', true), async () => {
    const r = await run('c', `${ipcHead}int main(void){${body} puts("made"); return 0;}`);
    assert.equal(r.stdout, 'made\n', JSON.stringify(r)); await ipcClean(name);
  });
}
test('IPC cleanup survives: attached shm segment whose attacher sleeps in a setsid daemon', options('c', true), async () => {
  const r = await run('c', `${ipcHead}int main(void){int id=shmget(IPC_PRIVATE,4096,IPC_CREAT|0); if(id<0) return 1; if(fork()==0){setsid(); shmat(id,0,0); for(;;) pause();} usleep(200000); puts("made"); return 0;}`);
  assert.equal(r.stdout, 'made\n', JSON.stringify(r)); await ipcClean('attached shm');
});

test('seccomp profile is active and denies user namespaces, mount and ptrace', options('python', true), async () => {
  const o = json(await py('import ctypes,json,os\nl=ctypes.CDLL(None,use_errno=True)\nr={}\nr["unshare_userns"]=l.unshare(0x10000000)\nr["mount"]=l.mount(b"none",b"/jobs",b"tmpfs",0,None)\nr["traceme"]=l.ptrace(0,0,0,0)\nprint(json.dumps(r))'));
  for (const [name, value] of Object.entries(o)) assert.equal(value, -1, name);
});

test('job oom_score_adj is 1000 (inherited by children), the server stays at 0', options('python', true), async () => {
  const o = json(await py('import subprocess,json\nprint(json.dumps([open("/proc/self/oom_score_adj").read().strip(), subprocess.run(["/bin/cat","/proc/self/oom_score_adj"],capture_output=True,text=True).stdout.strip()]))'));
  assert.deepEqual(o, ['1000', '1000']);
  assert.equal((await readFile('/proc/self/oom_score_adj', 'utf8')).trim(), '0');
  assert.equal((await readFile('/proc/1/oom_score_adj', 'utf8')).trim(), '0');
});

test('job cannot lower its oom_score_adj', options('python', true), async () => {
  const o = json(await py('import json\ntry:\n with open("/proc/self/oom_score_adj","w") as f: f.write("0")\n r="UNSAFE"\nexcept OSError: r="denied"\nprint(json.dumps([r, open("/proc/self/oom_score_adj").read().strip()]))'));
  assert.deepEqual(o, ['denied', '1000']);
});

test('multi-process memory hog is OOM-killed inside the job; the server survives and the next job runs', options('c', true), async () => {
  const hog = '#define _POSIX_C_SOURCE 200809L\n#include <stdlib.h>\n#include <string.h>\n#include <unistd.h>\n#include <sys/wait.h>\n#include <stdio.h>\nint main(void){for(int i=0;i<30;i++){if(fork()==0){char*p=malloc(48<<20);if(!p)_exit(3);memset(p,1,48<<20);sleep(30);_exit(0);}}int st,bad=0;while(wait(&st)>0)if(WIFSIGNALED(st))bad++;printf("killed %d\\n",bad);return 0;}';
  const r = await run('c', hog);
  // Either the OOM killer or the wall clock ends it; what matters is that it ended and nothing else did.
  assert.ok(r.timedOut || r.signal || /^killed [1-9]/.test(r.stdout), JSON.stringify(r));
  await ipcClean('memory hog'); // normal job succeeds, runner healthy
  assert.ok(Number((await readFile('/proc/self/stat', 'utf8')).split(' ')[0]) === process.pid);
});

test('SysV shm accumulation (attached, written, detached segments) is bounded by the IPC limits and does not hurt the server', options('c', true), async () => {
  const r = await run('c', `${ipcHead}#include <string.h>\nint main(void){long total=0;int n=0;for(int i=0;i<200;i++){int id=shmget(IPC_PRIVATE,1<<20,IPC_CREAT|0600);if(id<0)break;char*p=shmat(id,0,0);if(p==(void*)-1)break;memset(p,7,1<<20);shmdt(p);total+=1<<20;n++;}printf("%d %ld\\n",n,total);return 0;}`);
  assert.equal(r.exitCode, 0, JSON.stringify(r));
  const [n, total] = r.stdout.trim().split(' ').map(Number);
  assert.ok(n >= 1, r.stdout);
  const shmall = Number((await readFile('/proc/sys/kernel/shmall', 'utf8')).trim()) * 4096;
  assert.ok(total <= shmall, `${total} > shmall ${shmall}`);
  if (process.env.RUNNER_EXPECT_IPC_LIMITS === '1') assert.ok(total <= 16 * 1024 * 1024 && n <= 16, `unbounded: ${r.stdout}`);
  await ipcClean('shm accumulation');
});


// Shared hostile C programs: SIGSTOP attackers (comm "atk", spare each other and the job parent) and fork storms.
const ATTACKER_SOURCE = '#define _GNU_SOURCE\n#include <dirent.h>\n#include <signal.h>\n#include <stdlib.h>\n#include <stdio.h>\n#include <string.h>\n#include <unistd.h>\n#include <sys/prctl.h>\nint main(void){prctl(PR_SET_NAME,"atk");pid_t parent=getpid();for(int k=0;k<3;k++)if(fork()==0){setsid();close(0);close(1);close(2);prctl(PR_SET_NAME,"atk");pid_t me=getpid();for(;;){DIR*d=opendir("/proc");struct dirent*e;while(d&&(e=readdir(d))){int pid=atoi(e->d_name);if(pid<=1||pid==me||pid==parent)continue;char p[64],c[32]="";snprintf(p,sizeof p,"/proc/%d/comm",pid);FILE*f=fopen(p,"r");if(f){if(fgets(c,sizeof c,f)&&!strncmp(c,"atk",3)){fclose(f);continue;}fclose(f);}kill(pid,SIGSTOP);}if(d)closedir(d);usleep(200);}}usleep(300000);puts("armed");return 0;}';
const STORM_BASE = ATTACKER_SOURCE.replace('int main(void){prctl(PR_SET_NAME,"atk");pid_t parent=getpid();', 'int main(void){prctl(PR_SET_NAME,"atk");pid_t parent=getpid();for(int s=0;s<2;s++)if(fork()==0){setsid();close(0);close(1);close(2);prctl(PR_SET_NAME,"atk");for(;;){if(fork()==0){fork();_exit(0);}while(waitpid(-1,0,WNOHANG)>0);usleep(50);}}');
const STORM_SOURCE = STORM_BASE.replace('#include <sys/prctl.h>', '#include <sys/prctl.h>\n#include <sys/wait.h>');

test('SIGSTOP attackers plus fork storms cannot wedge cleanup or the event loop; cleanup < 1 s, health keeps answering, no restart', options('c', true), async () => {
  const sock = '/run/coms-study/watchdog.sock';
  const child = spawn(process.execPath, ['server.mjs'], { cwd: '/app', stdio: ['ignore', 'ignore', 'pipe'],
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', RUNNER_CONTAINER: '1', LISTEN_SOCKET: sock, RATE_LIMIT_PER_MIN: '100' } });
  let stderr = ''; child.stderr.on('data', d => { stderr += d; });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const call = (method, path, body, timeout = 30_000) => new Promise((resolve, reject) => {
    const payload = body && JSON.stringify(body);
    const req = http.request({ socketPath: sock, path, method, timeout, headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {} },
      res => { let data = ''; res.on('data', c => { data += c; }); res.on('end', () => resolve({ status: res.statusCode, data })); });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject); req.end(payload);
  });
  let watching = true, worst = 0, probes = 0, failures = [];
  try {
    for (let i = 0; i < 100 && !(await access(sock).then(() => true, () => false)); i++) await new Promise(r => setTimeout(r, 50));
    const watchdog = (async () => {
      while (watching) {
        const t0 = Date.now();
        try { const r = await call('GET', '/study/api/health', null, 2000); if (r.status !== 200) failures.push(r.status); } catch (e) { failures.push(e.message); }
        worst = Math.max(worst, Date.now() - t0); probes++;
        await new Promise(r => setTimeout(r, 100));
      }
    })();
    // Three busy attackers (comm "atk", they spare each other and the job's parent) SIGSTOP every other
    // uid-10100 pid as fast as they can scan /proc, so any helper that runs as uid 10100 gets stopped.
        // Two fork storms (each child forks again and exits, staying under NPROC) run together with the attackers.
    const stormSource = STORM_SOURCE;
    const timings = [];
    for (let round = 0; round < 6; round++) {
      const started = Date.now();
      const hostile = await call('POST', '/study/api/run', { lang: 'c', code: stormSource });
      timings.push(Date.now() - started);
      assert.equal(hostile.status, 200, `round ${round}: ${hostile.data} ${stderr}`);
      const next = await call('POST', '/study/api/run', { lang: 'python', code: 'print("after")' });
      assert.equal(next.status, 200, `round ${round}: ${next.data} ${stderr}`); assert.equal(JSON.parse(next.data).stdout, 'after\n');
    }
    // job (~0.35 s) + cleanup must stay far below the 3 s reaping deadline; cleanup itself < 1 s
    assert.ok(Math.max(...timings) < 1700, `slow cleanup under storm: ${timings}`);
    console.log(`# storm+attacker request times (ms): ${timings.join(', ')}`);
    watching = false; await watchdog;
    assert.deepEqual(failures, [], 'health must always answer'); assert.ok(probes >= 5, `only ${probes} probes`); assert.ok(worst < 2000, `health stalled ${worst} ms`);
    const survivors = [];
    for (const pid of (await readdir('/proc')).filter(p => /^\d+$/.test(p))) if ((await readFile(`/proc/${pid}/status`, 'utf8').catch(() => '')).match(new RegExp(`^Uid:\\s+${JOB_ID}`, 'm'))) survivors.push(pid);
    assert.deepEqual(survivors, [], 'no uid-10100 process may survive');
  } finally { watching = false; child.kill('SIGKILL'); await exited; await unlink(sock).catch(() => {}); }
  await afterwards('after SIGSTOP attacker');
});

test('no synchronous process spawning remains on request or cleanup paths', async () => {
  for (const file of ['run.mjs', 'server.mjs', 'limits.mjs', 'diagnostics.mjs']) {
    assert.doesNotMatch(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'), /execFileSync|spawnSync|execSync/, file);
  }
});

test('reaper: killJobProcesses finishes < 1 s against fork storms plus SIGSTOP attackers (repeated)', options('c', true), async () => {
  const dir = '/jobs/coms-reaper';
  const heavy = STORM_SOURCE;
  const timings = [];
  for (let round = 0; round < 6; round++) {
    await asJob('/bin/sh', ['-c', 'umask 077; mkdir "$1" && cat > "$1/$2"', 'sh', dir, 'main.c'], { input: heavy });
    const compiled = await executeStage('/usr/bin/gcc', ['-O1', 'main.c', '-o', 'storm'], { cwd: dir, lang: 'c', stage: 'compile' });
    assert.equal(compiled.exitCode, 0, compiled.stderr);
    const started = await executeStage(`${dir}/storm`, [], { cwd: dir, lang: 'c', stage: 'run' });
    assert.equal(started.stdout, 'armed\n', JSON.stringify(started));
    const t0 = performance.now();
    await killJobProcesses();
    timings.push(Math.round(performance.now() - t0));
    await clearSystemVIpc(); await wipeJobFiles();
  }
  console.log(`# reaper times under storm+attackers (ms): ${timings.join(', ')}`);
  assert.ok(Math.max(...timings) < 1000, `reaper too slow: ${timings}`);
  assert.ok(runnerHealthy());
});
