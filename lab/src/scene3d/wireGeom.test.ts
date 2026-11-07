import { describe, expect, it } from 'vitest';
import { arcHeight, wirePoints } from './wireGeom';

describe('wirePoints', () => {
  it('arcs higher for longer wires, capped', () => {
    expect(arcHeight(10)).toBeLessThan(arcHeight(60));
    expect(arcHeight(1000)).toBe(45);
    const short = wirePoints([0, 0, 0], [10, 0, 0])[2]![1];
    const long = wirePoints([0, 0, 0], [80, 0, 0])[2]![1];
    expect(long).toBeGreaterThan(short);
  });
  it('routes through bends when present', () => {
    const p = wirePoints([0, 0, 0], [10, 0, 0], [[5, 9, 5]]);
    expect(p).toContainEqual([5, 9, 5]);
    expect(p.length).toBe(5);
  });
});
