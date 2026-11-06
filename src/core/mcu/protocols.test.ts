import { expect, it } from 'vitest';
import {
  LCD1602, DHT11Protocol, HCSR04Protocol, WS2812Protocol,
  servoAngleFromPulseUs,
} from './protocols';

function clock() {
  let now = 0;
  const events: { at: number; fn: () => void }[] = [];
  return {
    get now() { return now; },
    schedule(fn: () => void, delay: number) {
      events.push({ at: now + delay, fn });
    },
    advance(to: number) {
      while (true) {
        events.sort((first, second) => first.at - second.at);
        const event = events[0];
        if (!event || event.at > to) break;
        events.shift();
        now = event.at;
        event.fn();
      }
      now = to;
    },
  };
}

it('LiquidCrystal_I2C initialization, printing and address ACK', () => {
  const lcd = new LCD1602(0x27);
  const nibble = (value: number, rs = false) => {
    const byte = value << 4 | 8 | (rs ? 1 : 0);
    expect(lcd.writeI2c(0x27, byte | 4)).toBe(true);
    lcd.writeI2c(0x27, byte);
  };
  const byte = (value: number, rs = false) => {
    nibble(value >> 4, rs);
    nibble(value & 15, rs);
  };
  expect(lcd.writeI2c(0x3f, 0)).toBe(false);
  [3, 3, 3, 2].forEach(value => nibble(value));
  byte(0x28);
  byte(0x0c);
  byte(0x01);
  byte(0x80);
  byte('H'.charCodeAt(0), true);
  byte('i'.charCodeAt(0), true);
  expect(lcd.visual().lines[0]).toBe('Hi' + ' '.repeat(14));
  byte(0xc0);
  byte('!'.charCodeAt(0), true);
  expect(lcd.visual().lines[1].startsWith('!')).toBe(true);
});

it('DHT11 responds with 80/80 µs start and 40 checksum bits', () => {
  const timer = clock();
  const edges: { at: number; level: number }[] = [];
  const protocol = new DHT11Protocol(
    timer.schedule.bind(timer),
    level => edges.push({ at: timer.now, level }),
    () => ({ temperature: 25, humidity: 60 }),
  );
  protocol.onDataChange(0, 0);
  timer.advance(300000);
  protocol.onDataChange(1, timer.now, true);
  timer.advance(400000);
  expect(edges[0]).toEqual({ at: 300320, level: 0 });
  expect(edges[1]).toEqual({ at: 301600, level: 1 });
  expect(edges.length).toBe(84);
  expect(edges[83]!.level).toBe(1);
  expect(edges[83]!.at - edges[82]!.at).toBe(800);
  expect(protocol.busy).toBe(false);
  const highs: number[] = [];
  for (let index = 2; index < 82; index += 2) {
    highs.push(Math.round((edges[index + 2]!.at - edges[index + 1]!.at) / 16));
  }
  const bytes = Array.from({ length: 5 }, (_, index) =>
    highs.slice(index * 8, index * 8 + 8)
      .reduce((value, width) => value << 1 | (width > 50 ? 1 : 0), 0),
  );
  expect(bytes).toEqual([60, 0, 25, 0, 85]);
});

it('HC-SR04 echo width is distance times 58 µs', () => {
  const timer = clock();
  const edges: { at: number; level: number }[] = [];
  const protocol = new HCSR04Protocol(
    timer.schedule.bind(timer),
    level => edges.push({ at: timer.now, level }),
    () => 100,
  );
  protocol.onTrigChange(1, 0);
  protocol.onTrigChange(0, 160);
  timer.advance(100000);
  expect(edges).toEqual([{ at: 3200, level: 1 }, { at: 96000, level: 0 }]);
  expect(protocol.pinging).toBe(false);
});

it('WS2812 decodes GRB pulse widths and latches pixels', () => {
  const protocol = new WS2812Protocol(1);
  let cycle = 0;
  for (const value of [0x22, 0x11, 0x33]) {
    for (let bit = 7; bit >= 0; bit--) {
      protocol.onDataChange(1, cycle);
      cycle += value & (1 << bit) ? 13 : 6;
      protocol.onDataChange(0, cycle);
      cycle += 14;
    }
  }
  cycle += 800;
  protocol.onDataChange(1, cycle);
  expect(protocol.colors).toEqual([[0x11, 0x22, 0x33]]);
  expect(servoAngleFromPulseUs(544)).toBe(0);
  expect(servoAngleFromPulseUs(2400)).toBe(180);
});
