import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// The site's compose file (repo root) runs the compiler next to coms-frontend; compiler/docker-compose.dev.yml is local dev only.
const rootCompose = readFileSync(new URL('../../../docker-compose.yml', import.meta.url), 'utf8');
const compose = rootCompose.slice(rootCompose.indexOf('  coms-lab-compiler:'), rootCompose.indexOf('  coms-frontend:'));
const dockerfile = readFileSync(new URL('../../compiler/Dockerfile', import.meta.url), 'utf8');
const guide = readFileSync(new URL('../../docs/DEPLOY.md', import.meta.url), 'utf8');

describe('production deployment contract', () => {
  it('restarts the compiler and shares its socket directory with nginx through a volume', () => {
    expect(compose).toMatch(/^    restart: unless-stopped$/m);
    expect(compose).toMatch(/^      - lab-sock:\/run\/coms-lab$/m);
    expect(compose).toMatch(/^    user: "10001:101"$/m);
    expect(dockerfile).toContain('chown 10001:101 /run/coms-lab');
    expect(guide).toContain('lab-sock');
    expect(guide).not.toContain('systemd-tmpfiles');
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
