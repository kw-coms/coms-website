import { describe, expect, it } from 'vitest';
import { createGovernor, initialQuality, looksSoftware } from './quality';

describe('quality', () => {
  it('recognises software renderers', () => {
    expect(looksSoftware('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))')).toBe(true);
    expect(looksSoftware('llvmpipe (LLVM 15)')).toBe(true);
    expect(looksSoftware('Microsoft Basic Render Driver')).toBe(true);
    expect(looksSoftware('ANGLE (Apple, Apple M2, OpenGL 4.1)')).toBe(false);
  });
  it('picks the starting level', () => {
    expect(initialQuality('auto', true)).toBe('low');
    expect(initialQuality('auto', false)).toBe('high');
    expect(initialQuality('medium', true)).toBe('medium');
  });
  it('governor steps down after two slow windows and rarely up', () => {
    const g = createGovernor({ window: 4, upWindows: 2, maxUps: 1 });
    const feed = (ms: number, n: number) => { let r = null as string | null; for (let i = 0; i < n; i++) r = g.push(ms) ?? r; return r; };
    expect(feed(80, 4)).toBeNull();
    expect(feed(80, 4)).toBe('down');
    expect(feed(10, 4)).toBeNull();
    expect(feed(10, 4)).toBe('up');
    expect(feed(10, 40)).toBeNull(); // maxUps reached
  });
});
