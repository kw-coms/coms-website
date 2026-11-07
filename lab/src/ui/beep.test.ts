import { describe, expect, it, vi } from 'vitest';
import type { SimFrame } from '../core/types';
import { BEEP_HZ, continuityHolds, createBeeper } from './beep';

function mockAudio() {
  const log = { contexts: 0, resumed: 0, started: 0, stopped: 0, freq: [] as number[] };
  class MockContext {
    destination = {};
    constructor() { log.contexts++; }
    resume() { log.resumed++; return Promise.resolve(); }
    createGain() { return { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }; }
    createOscillator() {
      const osc = {
        type: '', frequency: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(),
        start: () => { log.started++; log.freq.push(osc.frequency.value); }, stop: () => { log.stopped++; },
      };
      return osc;
    }
  }
  return { log, ctor: () => MockContext as unknown as new () => AudioContext };
}

describe('continuity beep', () => {
  it('creates no AudioContext before a user gesture (no autoplay errors)', () => {
    const { log, ctor } = mockAudio();
    const beeper = createBeeper(ctor, () => false);
    beeper.set(true);
    expect(log.contexts).toBe(0);
  });

  it('beeps at ~2 kHz while continuity holds, once, and stops when it ends', () => {
    const { log, ctor } = mockAudio();
    let gesture = false;
    const beeper = createBeeper(ctor, () => gesture);
    beeper.set(true);
    gesture = true;
    beeper.set(true);
    beeper.set(true);
    expect(log).toMatchObject({ contexts: 1, started: 1, stopped: 0, freq: [BEEP_HZ] });
    expect(BEEP_HZ).toBe(2000);
    beeper.set(false);
    beeper.set(false);
    expect(log.stopped).toBe(1);
    beeper.set(true); // the same context is reused
    expect(log).toMatchObject({ contexts: 1, started: 2 });
  });

  it('survives a browser without Web Audio or a throwing context', () => {
    createBeeper(() => undefined, () => true).set(true);
    const broken = createBeeper(() => class { constructor() { throw new Error('blocked'); } } as unknown as new () => AudioContext, () => true);
    expect(() => { broken.set(true); broken.set(false); }).not.toThrow();
  });

  it('only a meter in continuity mode with a closed path asks for the tone (mode change, open probe: silent)', () => {
    const frame = (meter: object | undefined) => ({ parts: { m: meter ? { meter } : {} } }) as unknown as SimFrame;
    expect(continuityHolds(frame({ measurementMode: 'continuity', continuity: true, mode: 'V', reading: '도통' }))).toBe(true);
    expect(continuityHolds(frame({ measurementMode: 'continuity', continuity: false, mode: 'V', reading: '개방' }))).toBe(false);
    expect(continuityHolds(frame({ measurementMode: 'Ω', continuity: true, mode: 'V', reading: '1.0 Ω' }))).toBe(false);
    expect(continuityHolds(frame({ measurementMode: 'V', mode: 'V', reading: '5.00' }))).toBe(false);
    expect(continuityHolds(frame(undefined))).toBe(false);
  });
});
