import { describe, expect, it } from 'vitest';
import process from 'node:process';
import { SimulationEngine } from './engine';
import { V2_EXAMPLES } from './examples-v2';

describe('v2 analog-only realtime throughput', () => {
  for (const id of ['timer-555-blink', 'rc-oscilloscope']) {
    it(`${id} completes 2 seconds of simulation and sustains realtime in the serial gate`, () => {
      const example = V2_EXAMPLES.find(candidate => candidate.id === id)!;
      const engine = new SimulationEngine();
      const start = performance.now();
      engine.setScene(example.scene);
      let frame = engine.frame();
      for (let n = 0; n < 100; n++) frame = engine.step(20 * 16_000);
      const wallMs = performance.now() - start;
      const measured = frame.timeMs / wallMs;
      process.stdout.write(`${id}: ${frame.timeMs.toFixed(0)} simulated ms / ${wallMs.toFixed(1)} wall ms = ${measured.toFixed(2)}×; frame ${frame.realtimeRatio.toFixed(2)}×\n`);
      expect(frame.timeMs).toBeGreaterThanOrEqual(2000);
      if (process.env.LAB_REALTIME_TEST === '1') {
        expect(measured, `${id} must sustain realtime including scene construction`).toBeGreaterThanOrEqual(1);
        // Engine ratio excludes scene construction and the test's assertions.
        expect(Math.abs(frame.realtimeRatio / measured - 1)).toBeLessThan(.15);
      }
    }, 30_000);
  }
});
