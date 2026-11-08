import { describe, expect, it } from 'vitest';
import { createGovernor, initialQuality, looksSoftware, softwareVerdict } from './quality';

describe('quality', () => {
  it('recognises software renderers', () => {
    expect(looksSoftware('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))')).toBe(true);
    expect(looksSoftware('llvmpipe (LLVM 15)')).toBe(true);
    expect(looksSoftware('Microsoft Basic Render Driver')).toBe(true);
    expect(looksSoftware('ANGLE (Apple, Apple M2, OpenGL 4.1)')).toBe(false);
    expect(looksSoftware('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(true);
  });
  it('does not mistake real GPUs behind ANGLE for software', () => {
    for (const r of [
      'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)',
      'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (AMD, AMD Radeon RX 6600 (0x000073FF) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Mesa Intel(R) UHD Graphics 620 (KBL GT2)',
      'Apple GPU',
    ]) expect(looksSoftware(r), r).toBe(false);
    expect(looksSoftware('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')).toBe(true);
  });
  it('trusts a hardware name over a performance-caveat refusal, but not a hidden name', () => {
    expect(softwareVerdict(false, 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
    expect(softwareVerdict(false, '')).toBe(true);
    expect(softwareVerdict(true, '')).toBe(false);
    expect(softwareVerdict(true, 'llvmpipe (LLVM 15)')).toBe(true);
  });
  it('picks the starting level', () => {
    expect(initialQuality('auto', true)).toBe('low');
    expect(initialQuality('auto', false)).toBe('high');
    expect(initialQuality('medium', true)).toBe('medium');
  });
  it('governor steps down after two slow windows and rarely up', () => {
    const g = createGovernor({ window: 4, upWindows: 2, maxUps: 1, downWindows: 2 });
    const feed = (ms: number, n: number) => { let r = null as string | null; for (let i = 0; i < n; i++) r = g.push(ms) ?? r; return r; };
    expect(feed(80, 4)).toBeNull();
    expect(feed(80, 4)).toBe('down');
    expect(feed(10, 4)).toBeNull();
    expect(feed(10, 4)).toBe('up');
    expect(feed(10, 40)).toBeNull(); // maxUps reached
  });
  it('by default needs three slow windows, and one spike inside a window never counts', () => {
    const g = createGovernor({ window: 5 });
    const feed = (ms: number[]) => { let r = null as string | null; for (const m of ms) r = g.push(m) ?? r; return r; };
    expect(feed([300, 10, 10, 10, 10])).toBeNull();
    expect(feed([80, 80, 80, 80, 80, 80, 80, 80, 80, 80])).toBeNull();
    expect(feed([80, 80, 80, 80, 80])).toBe('down');
  });
});
