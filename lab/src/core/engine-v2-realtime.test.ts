import { describe, expect, it } from 'vitest';
import process from 'node:process';
import { SimulationEngine } from './engine';
import { V2_EXAMPLES } from './examples-v2';
import { expectRealtimeMedian, REALTIME_RUNS } from './realtime-median';

describe('v2 analog-only realtime throughput', () => {
  for (const id of ['timer-555-blink', 'rc-oscilloscope']) {
    it(`${id} completes 2 seconds of simulation and sustains realtime in the serial gate`, () => {
      const example = V2_EXAMPLES.find(candidate => candidate.id === id)!;
      const realtime = process.env.LAB_REALTIME_TEST === '1';
      const ratios: number[] = [];
      for (let attempt = 0; attempt < (realtime ? REALTIME_RUNS : 1); attempt++) {
        const engine = new SimulationEngine();
        const start = performance.now();
        engine.setScene(example.scene);
        let frame = engine.frame();
        for (let n = 0; n < 100; n++) frame = engine.step(20 * 16_000);
        const wallMs = performance.now() - start;
        const measured = frame.timeMs / wallMs;
        ratios.push(measured);
        process.stdout.write(`${id}: ${frame.timeMs.toFixed(0)} simulated ms / ${wallMs.toFixed(1)} wall ms = ${measured.toFixed(2)}×; frame ${frame.realtimeRatio.toFixed(2)}×\n`);
        expect(frame.timeMs).toBeGreaterThanOrEqual(2000);
        // Engine ratio excludes scene construction and the test's assertions.
        if (realtime) expect(Math.abs(frame.realtimeRatio / measured - 1)).toBeLessThan(.15);
      }
      if (realtime) expectRealtimeMedian(id, ratios, 'must sustain realtime including scene construction');
    }, 30_000);
  }
});
