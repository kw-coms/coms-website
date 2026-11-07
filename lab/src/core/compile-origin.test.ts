import { describe, expect, it, vi } from 'vitest';
import { compileOrigin } from './compile-origin.mjs';

describe('local compiler origin', () => {
  it.each([
    ['http://127.0.0.1:8787', 'http://127.0.0.1:8787'],
    ['https://localhost:8443/subpath', 'https://localhost:8443'],
    ['http://[::1]:8787', 'http://[::1]:8787'],
  ])('accepts a local HTTP(S) service and discards its path: %s', (input, origin) => {
    expect(compileOrigin(input)).toBe(origin);
    expect(new URL('/lab/api/compile', compileOrigin(input)).href).toBe(`${origin}/lab/api/compile`);
  });

  it.each([
    'http://example.com:8787', 'http://127.0.0.2:8787', 'http://[::2]:8787',
    'file:///tmp/compile', 'ftp://localhost:8787', 'http://user:pass@localhost:8787',
    'http://localhost:8787/?next=example.com', 'http://localhost:8787/#compile', 'not a URL',
  ])('rejects non-local, credentialed, or malformed input: %s', input => {
    expect(() => compileOrigin(input)).toThrow(/LAB_COMPILE_URL.*로컬/);
  });

  it('reads and validates LAB_COMPILE_URL when no argument is provided', () => {
    vi.stubEnv('LAB_COMPILE_URL', 'https://[::1]:9443');
    expect(compileOrigin()).toBe('https://[::1]:9443');
    vi.stubEnv('LAB_COMPILE_URL', 'https://remote.example');
    expect(() => compileOrigin()).toThrow(/로컬/);
    vi.unstubAllEnvs();
  });
});
