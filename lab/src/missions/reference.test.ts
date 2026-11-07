import { describe, expect, it, vi } from 'vitest';
import { LocalSimulator } from '../core/local-simulator';
import fixtures from './__fixtures__/missions-hex.json';
import { MISSIONS } from './catalog';
import { checkMission } from './runner';

// Every mission's reference solution, compiled once with the REAL compiler (tools/compile-mission-fixtures.mjs) and
// recorded in missions-hex.json, must pass its own checker on the real engine. CI needs no compiler.
const recorded = fixtures.missions as Record<string, { code: string; hex: string }>;

describe('mission reference solutions (recorded real HEX)', () => {
  it('covers all 10 missions', () => expect(MISSIONS).toHaveLength(10));
  for (const mission of MISSIONS) {
    it(`${mission.id} passes its checker`, async () => {
      const scene = structuredClone(mission.referenceScene);
      const fixture = recorded[mission.id];
      if (scene.parts.some(part => part.kind === 'arduino-uno')) {
        expect(fixture, `${mission.id}: no recorded HEX, run tools/compile-mission-fixtures.mjs`).toBeDefined();
        expect(fixture!.code, `${mission.id}: reference code changed, recompile the fixtures`).toBe(scene.code);
      }
      const result = await checkMission(mission, scene, fixture?.hex, {
        simulatorFactory: () => { const sim = new LocalSimulator(); sim.setSpeed(2); return sim; },
      });
      expect(result, `${mission.id}: step ${result.step}: ${result.message}`).toMatchObject({ passed: true });
    }, 60_000);
  }
});

it('pot-dimmer checker and electrical samples are independent of a 10x slower host clock', async () => {
  const mission = MISSIONS.find(candidate => candidate.id === 'pot-dimmer')!;
  const fixture = recorded[mission.id]!;
  const realNow = performance.now.bind(performance);
  const run = async (clockScale: number) => {
    const now = vi.spyOn(performance, 'now').mockImplementation(() => realNow() * clockScale);
    const samples: { timeMs: number; brightness: number | undefined; duty: number | undefined }[] = [];
    try {
      const result = await checkMission(mission, structuredClone(mission.referenceScene), fixture.hex, {
        simulatorFactory: () => {
          const sim = new LocalSimulator();
          sim.setSpeed(2);
          sim.onFrame(frame => samples.push({
            timeMs: frame.timeMs,
            brightness: frame.parts.led?.led?.brightness,
            duty: frame.pins.D9?.duty,
          }));
          return sim;
        },
      });
      return { result, samples };
    } finally { now.mockRestore(); }
  };
  const normal = await run(1);
  const slow = await run(10);
  expect(normal.result).toMatchObject({ passed: true, step: mission.checker.length });
  expect(slow.result).toEqual(normal.result);
  expect(slow.samples).toEqual(normal.samples);
}, 60_000);
