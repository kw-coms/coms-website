import { describe, expect, it } from 'vitest';
import { buildIndex, snapPart, type SnapTarget } from './snap';

const P = 2.54;
const grid: SnapTarget[] = [];
for (let c = 0; c < 10; c++) for (let r = 0; r < 5; r++) grid.push({ partId: 'bb', pinId: `${r}-${c}`, pos: [c * P, 0, r * P] });
const index = buildIndex(grid);
const led = [
  { id: 'anode', pos: [-1.27, 0, 0] as [number, number, number] },
  { id: 'cathode', pos: [1.27, 0, 0] as [number, number, number] },
];

describe('snapPart', () => {
  it('snaps both LED legs to adjacent holes', () => {
    const r = snapPart(led, 0, [P * 3 + 0.2 + 0.0, P * 2 - 0.4], index)!;
    expect(r).not.toBeNull();
    expect(r.matches.length).toBe(2);
    const [a, c] = r.matches.map((m) => m.target.pos);
    expect(Math.abs(a![0] - c![0])).toBeCloseTo(P);
  });
  it('rotates pins with rotY 90', () => {
    const r = snapPart(led, 90, [P * 4, P * 2], index)!;
    expect(r.matches.length).toBe(2);
    expect(r.matches[0]!.target.pos[0]).toBeCloseTo(r.matches[1]!.target.pos[0]);
  });
  it('returns null far from any hole', () => {
    expect(snapPart(led, 0, [200, 200], index)).toBeNull();
  });
  it('rejects a part that cannot land both legs', () => {
    const wide = [
      { id: 'a', pos: [0, 0, 0] as [number, number, number] },
      { id: 'b', pos: [3.1, 0, 0] as [number, number, number] },
    ];
    expect(snapPart(wide, 0, [P * 2, P * 2], index)).toBeNull();
  });
});
