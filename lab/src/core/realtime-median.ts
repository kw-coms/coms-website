/// <reference types="node" />
import process from 'node:process';
import { expect } from 'vitest';

export const REALTIME_RUNS = 3;

/**
 * Realtime acceptance gate: the median of REALTIME_RUNS measured windows must reach 1x.
 * Noise on shared CI runners (co-tenant load, throttling, GC) only ever slows a run down, so one
 * unlucky window cannot inflate the result; the median of 3 therefore never passes a genuinely
 * slow engine, it only stops a single stalled window from failing a fast one. The threshold is
 * unchanged, and all ratios are printed so a systematic regression stays visible.
 */
export function expectRealtimeMedian(id: string, ratios: number[], what = 'must sustain realtime including solves and frames'): void {
  const median = [...ratios].sort((a, b) => a - b)[Math.floor(ratios.length / 2)]!;
  process.stdout.write(`E2E ${id}: ratios=${ratios.map(ratio => `${ratio.toFixed(2)}x`).join(', ')} median=${median.toFixed(2)}x\n`);
  expect(median, `${id} ${what}`).toBeGreaterThanOrEqual(1);
}
