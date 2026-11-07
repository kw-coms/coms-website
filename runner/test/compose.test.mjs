// Static contract of the production compose file (`docker compose config`); skipped without docker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let service, skip = false;
try {
  const out = execFileSync('docker', ['compose', '-f', join(dir, 'docker-compose.yml'), 'config', '--format', 'json'],
    { encoding: 'utf8', env: { ...process.env, NGINX_GID: '101' }, stdio: ['ignore', 'pipe', 'ignore'] });
  service = JSON.parse(out).services.runner;
} catch { skip = 'docker compose unavailable'; }

test('production compose: isolation, capabilities and limits', { skip }, () => {
  assert.equal(service.network_mode, 'none');
  assert.equal(service.read_only, true);
  assert.equal(service.mem_limit, service.memswap_limit, 'no swap beyond memory');
  assert.deepEqual(service.cap_drop, ['ALL']);
  assert.deepEqual([...service.cap_add].sort(), ['KILL', 'SETGID', 'SETUID', 'SYS_RESOURCE']);
  assert.ok(service.security_opt.includes('no-new-privileges:true'));
  assert.equal(service.user, '0:101');
  assert.equal(service.ipc, 'private');
  assert.equal(service.restart, 'unless-stopped');
  assert.ok(service.pids_limit >= 128 && service.pids_limit <= 512);
  assert.equal(service.environment.TRUST_PROXY, '1');
  assert.match(service.environment.LISTEN_SOCKET, /^\/run\/coms-study\//);
  assert.ok(!service.ports, 'no TCP exposure');
});

test('production compose: seccomp profile exists, is Docker-default based and denies ptrace', { skip }, () => {
  const opt = service.security_opt.find(o => o.startsWith('seccomp='));
  assert.ok(opt, 'explicit seccomp profile');
  const path = resolve(dir, opt.slice('seccomp='.length));
  assert.ok(existsSync(path), path);
  const profile = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(profile.defaultAction, 'SCMP_ACT_ERRNO');
  const unconditional = profile.syscalls.filter(s => s.action === 'SCMP_ACT_ALLOW' && !s.includes?.caps).flatMap(s => s.names);
  for (const name of ['ptrace', 'process_vm_readv', 'mount', 'unshare', 'bpf', 'keyctl']) assert.ok(!unconditional.includes(name), name);
});

test('production compose: tmpfs, inode and IPC limits', { skip }, () => {
  const mounts = Object.fromEntries(service.tmpfs.map(m => [m.split(':')[0], m]));
  assert.match(mounts['/jobs'], /size=64m.*nr_inodes=4096.*mode=1777/);
  assert.match(mounts['/dev/shm'], /noexec.*size=8m.*nr_inodes=1024/);
  const s = service.sysctls;
  assert.ok(Number(s['kernel.shmall']) * 4096 <= 16 * 1024 * 1024);
  assert.ok(Number(s['kernel.shmmax']) <= 4 * 1024 * 1024);
  assert.ok(Number(s['kernel.shmmni']) <= 64 && Number(s['kernel.msgmni']) <= 64);
  for (const key of ['kernel.msgmnb', 'kernel.sem', 'fs.mqueue.queues_max', 'fs.mqueue.msg_max', 'fs.mqueue.msgsize_max']) assert.ok(s[key], key);
  assert.ok(service.volumes.some(v => v.target === '/var/lib/coms-study'), 'disk-backed state volume');
});

test('Dockerfile healthcheck, setuid removal and state dir permissions', () => {
  const file = readFileSync(join(dir, 'Dockerfile'), 'utf8');
  assert.match(file, /HEALTHCHECK/);
  assert.match(file, /find \/ -xdev -type f -perm \/6000 -delete/);
  assert.match(file, /chmod 0700 \/var\/lib\/coms-study/);
  assert.doesNotMatch(file, /PLACEHOLDER/);
});

test('production compose: explicit production volume names, overridable for tests', { skip }, () => {
  const out = JSON.parse(execFileSync('docker', ['compose', '-f', join(dir, 'docker-compose.yml'), 'config', '--format', 'json'],
    { encoding: 'utf8', env: { ...process.env, NGINX_GID: '101', RUNNER_SOCKET_VOLUME: '', RUNNER_STATE_VOLUME: '' }, stdio: ['ignore', 'pipe', 'ignore'] }));
  assert.deepEqual(Object.values(out.volumes).map(v => v.name).sort(), ['coms-study-runner-socket', 'coms-study-runner-state']);
  const overridden = JSON.parse(execFileSync('docker', ['compose', '-f', join(dir, 'docker-compose.yml'), 'config', '--format', 'json'],
    { encoding: 'utf8', env: { ...process.env, NGINX_GID: '101', RUNNER_SOCKET_VOLUME: 'x-socket', RUNNER_STATE_VOLUME: 'x-state' }, stdio: ['ignore', 'pipe', 'ignore'] }));
  assert.deepEqual(Object.values(overridden.volumes).map(v => v.name).sort(), ['x-socket', 'x-state']);
});
