/// <reference types="node" />
import { it, expect } from 'vitest';
import { timer0Config } from 'avr8js';
import { SimulationEngine } from './engine';
import { EXAMPLES } from './examples';
import fixtures from './__fixtures__/examples-hex.json';

it('preserves the stock pulseIn interrupt undercount instead of stretching the sensor echo', () => {
  const firstReading = (overflowInterrupt: boolean): number => {
    let time = 0;
    const engine = new SimulationEngine(() => time);
    engine.setScene(EXAMPLES.find(example => example.id === 'ultrasonic')!.scene);
    engine.loadHex(fixtures.examples.ultrasonic.hex);
    engine.setInput({ partId: 'sonar', key: 'distanceCm', value: 350 });
    if (!overflowInterrupt) {
      const hook = engine.mcu.cpu.writeHooks[timer0Config.TIMSK]!;
      engine.mcu.cpu.writeHooks[timer0Config.TIMSK] = (value, old, address, mask) => {
        const withoutOverflow = value & ~timer0Config.TOIE;
        hook(withoutOverflow, old, address, mask);
        engine.mcu.cpu.data[address] = withoutOverflow;
        return true;
      };
    }
    let serial = '';
    engine.onSerial = text => { serial += text; };
    for (let step = 0; step < 5 && !serial.includes('\n'); step++) {
      time += 20;
      engine.step(320_000);
    }
    return Number(serial.split('\r\n')[0]);
  };

  // The compiled pulseIn loop counts its own iterations, excluding timer0 ISR
  // execution. Removing only that interrupt recovers the exact 58 us/cm pulse.
  expect(firstReading(true)).toBeCloseTo(347.93, 1);
  expect(firstReading(false)).toBeCloseTo(350, 1);
});
