import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const compose = readFileSync(new URL('../../compiler/docker-compose.yml', import.meta.url), 'utf8');
const dockerfile = readFileSync(new URL('../../compiler/Dockerfile', import.meta.url), 'utf8');
const guide = readFileSync(new URL('../../docs/DEPLOY.md', import.meta.url), 'utf8');

describe('production deployment contract', () => {
  it('restarts the compiler and creates its socket directory at boot', () => {
    expect(compose).toMatch(/^    restart: unless-stopped$/m);
    expect(guide).toContain('d /run/coms-lab 0750 10001 www-data -');
    expect(guide).toContain('systemd-tmpfiles --create /etc/tmpfiles.d/coms-lab.conf');
  });

  it('documents the pinned image and distinguishes measured from production limits', () => {
    const digest = dockerfile.match(/ARG NODE_IMAGE=(node:22-bookworm-slim@sha256:[a-f0-9]{64})/)?.[1];
    expect(digest).toBeDefined();
    expect(guide).toContain(digest);
    expect(guide).toContain('1 GiB tmpfs, CPU/RAM 제한 없음');
    for (const flag of ['--read-only', '--cap-drop ALL', '--memory 768m', '--cpus 1.0', '--pids-limit 128', 'size=256m,mode=1777']) {
      expect(guide).toContain(flag);
    }
    expect(guide).not.toContain('placeholder');
  });
});
