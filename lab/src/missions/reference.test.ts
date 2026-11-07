import { describe, expect, it } from 'vitest';
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
