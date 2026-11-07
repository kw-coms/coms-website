import { expect, it } from 'vitest';
import { analyze, EXAMPLES } from '../../core';
import { sceneContext } from './context';

const ctx = (id: string) => { const s = EXAMPLES.find((e) => e.id === id)!.scene; return sceneContext(s.parts, analyze(s)); };

it('pins are labelled with what the circuit has there (also through a resistor and the breadboard)', () => {
  const { hints } = ctx('distance-alarm');
  expect(hints['7']).toContain('HC-SR04');
  expect(hints['6']).toContain('HC-SR04');
  expect(hints['8']).toContain('부저');
  expect(hints['4']).toContain('LED'); // D4 -> 220 ohm -> LED
});
it('sizes come from the parts', () => {
  expect(ctx('neopixel-rainbow').opts.pixelCount).toBe(8);
  expect(ctx('builtin-blink').hints).toEqual({});
});
