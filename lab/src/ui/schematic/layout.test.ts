import { describe, expect, it } from 'vitest';
import { PARTS } from '../../core/parts';
import type { Analysis, PartInstance } from '../../core/types';
import { layoutSchematic } from './layout';

const part = (id: string, kind: PartInstance['kind']): PartInstance => ({ id, kind, pos: [0, 0, 0], rotY: 0, props: {} });
const parts = [part('uno', 'arduino-uno'), part('board', 'breadboard-mini'), part('r1', 'resistor'), part('led1', 'led'), part('island', 'buzzer')];
const analysis: Analysis = {
  nets: [
    { id: 'n1', name: 'D13', pins: [{ partId: 'uno', pinId: 'D13' }, { partId: 'r1', pinId: '1' }] },
    { id: 'n2', pins: [{ partId: 'r1', pinId: '2' }, { partId: 'led1', pinId: 'anode' }] },
    { id: 'n3', name: 'GND', pins: [{ partId: 'uno', pinId: 'GND.2' }, { partId: 'led1', pinId: 'cathode' }] },
  ], pinToNet: {}, insertions: {}, warnings: [],
};

describe('automatic schematic layout', () => {
  it('places every electrical part once, excludes the breadboard, and keeps symbol boxes apart', () => {
    const layout = layoutSchematic(parts, PARTS, analysis);
    expect(layout.syms.map((s) => s.part.id).sort()).toEqual(['island', 'led1', 'r1', 'uno']);
    for (let i = 0; i < layout.syms.length; i++) for (let j = i + 1; j < layout.syms.length; j++) {
      const a = layout.syms[i]!, b = layout.syms[j]!;
      expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    }
    for (const s of layout.syms) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.x + s.w).toBeLessThanOrEqual(layout.width);
      expect(s.y + s.h).toBeLessThanOrEqual(layout.height);
    }
  });

  it('connects each named net to its exact pin as a wire endpoint or matching label', () => {
    const layout = layoutSchematic(parts, PARTS, analysis);
    const byId = new Map(layout.syms.map((s) => [s.part.id, s]));
    for (const net of analysis.nets) for (const ref of net.pins) {
      const symbol = byId.get(ref.partId)!;
      const pin = symbol.pins.find((p) => p.id === ref.pinId)!;
      const x = symbol.x + pin.x, y = symbol.y + pin.y;
      const wireAtPin = layout.wires.some((w) => w.key.startsWith(`${net.id}-`) && w.d.startsWith(`M${x} ${y}H`));
      const labelAtPin = layout.labels.some((l) => l.x === x && l.y === y && l.text === (net.name ?? `net ${net.id.replace(/\D/g, '')}`));
      expect(wireAtPin || labelAtPin, `${net.id} ${ref.partId}.${ref.pinId}`).toBe(true);
    }
    expect(layout.labels.filter((l) => l.text === 'GND')).toHaveLength(2);
  });

  it('returns identical geometry for identical inputs', () => {
    expect(layoutSchematic(parts, PARTS, analysis)).toEqual(layoutSchematic(parts, PARTS, analysis));
  });
});
