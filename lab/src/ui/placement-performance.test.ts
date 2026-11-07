import { afterEach, describe, expect, it, vi } from 'vitest';
import process from 'node:process';
import * as geometry from '../core/geometry';
import * as analyzer from '../core/analyze';
import { PARTS } from '../core/parts';
import { sameCircuit } from '../core/scene';
import type { PartInstance, Scene } from '../core/types';
import { sim } from './simHost';
import { getState, loadScene, updateParts } from './store';

function largeScene(boards: number, resistors: number): Scene {
  const hole = PARTS['breadboard-half'].pins.find(pin => pin.id === 'a10')!.pos;
  const lead = PARTS.resistor.pins.find(pin => pin.id === '1')!.pos;
  const parts: PartInstance[] = Array.from({ length: boards }, (_, i) => ({
    id: `board-${i}`, kind: 'breadboard-half', pos: [i * 1000, 0, 0], rotY: 0, props: {},
  }));
  parts.push(...Array.from({ length: resistors }, (_, i) => ({
    id: `r-${i}`, kind: 'resistor' as const,
    pos: i === 0 ? [hole[0] - lead[0], 0, hole[2] - lead[2]] as [number, number, number]
      : [10_000 + i * 20, 0, 0] as [number, number, number],
    rotY: 0 as const, props: { ohms: 1000 },
  })));
  return { version: 2, code: '', parts, wires: [] };
}

describe.skipIf(process.env.LAB_REALTIME_TEST !== '1')('large committed placements reuse the store insertion scan', () => {
  afterEach(() => vi.restoreAllMocks());

  for (const [boards, resistors] of [[3, 296], [10, 289]] as const) {
    for (const changed of [false, true]) {
      it(`${boards} boards / ${resistors} resistors, ${changed ? 'changed' : 'unchanged'} insertion`, () => {
        // Keep the LocalSimulator out of the measured UI path from scene load onward.
        const setScene = vi.spyOn(sim, 'setScene').mockImplementation(() => getState().analysis);
        loadScene(largeScene(boards, resistors));
        setScene.mockClear();
        const current = getState().hist.present;
        const original = current.parts[boards]!;
        const moved: PartInstance = {
          ...original,
          pos: [original.pos[0] + (changed ? 100 : .1), original.pos[1], original.pos[2]],
        };
        const pinWorldPos = vi.spyOn(geometry, 'pinWorldPos');
        const analyze = vi.spyOn(analyzer, 'analyze');
        // A fresh parts array measures the work one uncached analysis would do.
        analyzer.analyze({ ...current, code: '', parts: current.parts.map(part =>
          part.id === moved.id ? moved : part) });
        const singleAnalysisCalls = pinWorldPos.mock.calls.length;
        expect(singleAnalysisCalls).toBeGreaterThan(0);
        pinWorldPos.mockClear();
        analyze.mockClear();

        expect(updateParts([moved])).toBeNull();
        const commitCalls = pinWorldPos.mock.calls.length;
        expect(analyze).toHaveBeenCalledTimes(1);
        expect(commitCalls).toBeLessThanOrEqual(singleAnalysisCalls);
        expect(getState().analysis.insertions[`${moved.id}:1`] !== undefined).toBe(!changed);
        expect(setScene).toHaveBeenCalledTimes(changed ? 1 : 0);
        expect(sameCircuit(current, getState().hist.present)).toBe(!changed);
        expect(pinWorldPos).toHaveBeenCalledTimes(commitCalls);
        expect(analyze).toHaveBeenCalledTimes(1);
        process.stdout.write(`${boards} boards, ${resistors} resistors, ${changed ? 'changed' : 'unchanged'} insertion: `
          + `${commitCalls}/${singleAnalysisCalls} placement calls (commit/single analysis)\n`);
      }, 30_000);
    }
  }
});
