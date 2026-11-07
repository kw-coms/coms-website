// End-to-end check through the production compose file (needs docker; run: node test/compose-e2e.mjs).
// Not part of `node --test`: it starts and kills a real container.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = 'studye2e', container = `${project}-runner-1`;
const env = { ...process.env, NGINX_GID: '101' };
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', env, cwd: dir, ...opts });
const compose = (...args) => sh('docker', ['compose', '-p', project, '-f', 'docker-compose.yml', ...args]);
const exec = (...args) => sh('docker', ['exec', container, ...args]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (label, fn, tries = 120) => { for (let i = 0; i < tries; i++) { try { const v = fn(); if (v) return v; } catch { /* retry */ } await sleep(250); } throw new Error(`timeout: ${label}`); };

// Posts through the unix socket inside the container, like nginx would.
const CLIENT = `import http from 'node:http';
const [member, lang, code] = process.argv.slice(1);
const body = JSON.stringify({ lang, code });
const headers = { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...(member === '-' ? {} : { 'x-runner-client': member }) };
http.request({ socketPath: '/run/coms-study/run.sock', path: '/study/api/run', method: 'POST', headers }, res => {
  let data = ''; res.on('data', c => { data += c; });
  res.on('end', () => console.log(JSON.stringify({ status: res.statusCode, retryAfter: res.headers['retry-after'], body: JSON.parse(data) })));
}).end(body);`;
const post = (member, lang, code) => JSON.parse(exec('node', '--input-type=module', '-e', CLIENT, member, lang, code));

try { compose('down', '-v'); } catch { /* nothing to remove */ }
compose('up', '-d', '--build');
try {
  await until('healthy', () => sh('docker', ['inspect', '-f', '{{.State.Health.Status}}', container]).trim() === 'healthy', 240);
  // Seccomp filter active on the supervisor, and on a job
  assert.match(exec('grep', 'Seccomp:', '/proc/1/status'), /Seccomp:\s+2/);
  const job = post('alice', 'python', 'print([l for l in open("/proc/self/status") if l.startswith(("Seccomp:","Uid:"))])');
  assert.equal(job.status, 200); assert.match(job.body.stdout, /Seccomp:\\t2/); assert.match(job.body.stdout, /Uid:\\t10100/);
  console.log('ok seccomp (supervisor + job)');

  // Member key: required, per-member
  assert.equal(post('-', 'python', 'print(1)').status, 401);
  assert.equal(post('bad key!', 'python', 'print(1)').status, 401);
  assert.equal(post('bob', 'python', 'print(2)').body.stdout, '2\n');
  console.log('ok member key');

  // Abrupt death (SIGKILL of the server process) while a job of "victim" is running: no finally/onFatal runs.
  const long = spawn('docker', ['exec', container, 'node', '--input-type=module', '-e', CLIENT, 'victim', 'python', 'import time\ntime.sleep(8)'], { stdio: 'ignore' });
  await until('inflight record', () => exec('cat', '/var/lib/coms-study/inflight.json').includes('m:victim'));
  const started = sh('docker', ['inspect', '-f', '{{.State.StartedAt}}', container]).trim();
  // SIGKILL the Node supervisor (tini's child) like the OOM killer would. `docker kill` is not used:
  // Docker treats it as a manual stop and skips the restart policy.
  const serverPid = exec('cat', '/proc/1/task/1/children').trim().split(/\s+/)[0];
  exec('node', '-e', `process.kill(${serverPid}, 9)`);
  long.kill();
  await until('restart', () => sh('docker', ['inspect', '-f', '{{.State.StartedAt}} {{.State.Health.Status}}', container]).trim() !== `${started} healthy` && sh('docker', ['inspect', '-f', '{{.State.Health.Status}}', container]).trim() === 'healthy', 240);
  const restarts = sh('docker', ['inspect', '-f', '{{.RestartCount}}', container]).trim();
  assert.ok(Number(restarts) >= 1, `restart count ${restarts}`);
  assert.match(exec('cat', '/var/lib/coms-study/denylist.json'), /"m:victim"/);
  assert.throws(() => exec('cat', '/var/lib/coms-study/inflight.json'), /No such file/);
  assert.match(sh('docker', ['logs', container], { stdio: ['ignore', 'pipe', 'pipe'] }), /recovered-inflight/);
  const denied = post('victim', 'python', 'print(1)');
  assert.equal(denied.status, 429); assert.ok(Number(denied.retryAfter) > 0 && Number(denied.retryAfter) <= 900, denied.retryAfter);
  assert.equal(post('alice', 'python', 'print(3)').body.stdout, '3\n');
  console.log(`ok abrupt kill: restart count ${restarts}, victim denied (retry-after ${denied.retryAfter}s), others served`);
} finally { try { console.log(compose('logs', '--no-color', '--tail', '8').trim().split('\n').map(l => l.slice(0, 200)).join('\n')); } catch {} compose('down', '-v'); }
