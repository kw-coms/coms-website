/// <reference types="node" />
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import fixtures from './__fixtures__/examples-hex.json';
import { SimulationEngine } from './engine';
import { EXAMPLES } from './examples';
import type { SimFrame, SimInput } from './types';

// Collapse formatting whitespace between C++ tokens, preserving strings, character
// literals, and operators. Comments must never hide a changed compiled program.
export function normalizedSketch(code: string): string {
  return (code.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_]\w*|\d+(?:\.\d+)?|\+\+|--|<<|>>|<=|>=|==|!=|&&|\|\||[^\s]/g) ?? [])
    .filter(token => !token.startsWith('//') && !token.startsWith('/*'))
    .join(' ');
}

class SketchRun {
  private clock = 0;
  readonly engine = new SimulationEngine(() => this.clock);
  serial = '';
  frame!: SimFrame;
  private realMs = 0;

  constructor(id: string) {
    const example = EXAMPLES.find(item => item.id === id)!;
    const fixture = fixtures.examples[id as keyof typeof fixtures.examples];
    expect(normalizedSketch(example.scene.code), '예제 코드가 바뀌었으니 fixture를 다시 컴파일해야 합니다')
      .toBe(normalizedSketch(fixture.code));
    this.engine.setScene(example.scene);
    this.engine.onSerial = text => { this.serial += text; };
    this.engine.loadHex(fixture.hex);
  }

  run(ms: number, observe?: (frame: SimFrame) => void): SimFrame {
    const start = performance.now();
    for (let elapsed = 0; elapsed < ms; elapsed += 20) {
      this.clock += 20;
      this.frame = this.engine.step(Math.min(20, ms - elapsed) * 16_000);
      expect(this.frame.warnings.filter(warning => warning.level === 'error')).toEqual([]);
      observe?.(this.frame);
    }
    this.realMs += performance.now() - start;
    return this.frame;
  }

  input(partId: string, key: SimInput['key'], value: number | boolean): void {
    this.engine.setInput({ partId, key, value });
  }

  report(id: string): void {
    const simulatedMs = this.engine.mcu.cpu.cycles / 16_000;
    const ratio = simulatedMs / this.realMs;
    process.stdout.write(`E2E ${id}: simulated=${simulatedMs.toFixed(0)}ms real=${this.realMs.toFixed(1)}ms ratio=${ratio.toFixed(2)}x\n`);
    expect(ratio, `${id} must sustain realtime including solves and frames`).toBeGreaterThanOrEqual(1);
  }
}

const checks: Record<string, (run: SketchRun) => void> = {
  'builtin-blink': run => checkBlink(run, 'uno'),
  'external-blink': run => checkBlink(run, 'led'),
  'button-led': run => {
    expect(run.run(100).parts.led!.led!.brightness).toBeLessThan(.01);
    run.input('button', 'pressed', true);
    expect(run.run(100).parts.led!.led!.brightness).toBeGreaterThan(.4);
    run.input('button', 'pressed', false);
    expect(run.run(100).parts.led!.led!.brightness).toBeLessThan(.01);
  },
  'serial-hello': run => {
    run.run(1200);
    expect(run.serial.match(/Hello/g)?.length).toBeGreaterThanOrEqual(2);
  },
  'pot-led': run => {
    const brightness = [0, .25, .5, .75, 1].map(position => {
      run.input('pot', 'position', position);
      return run.run(160).parts.led!.led!.brightness;
    });
    expect(brightness[0]).toBeLessThan(.01);
    expect(brightness[4]).toBeGreaterThan(.9);
    for (let index = 1; index < brightness.length; index++) {
      expect(brightness[index]!).toBeGreaterThan(brightness[index - 1]! + .08);
    }
  },
  'night-light': run => {
    run.input('cds', 'lux', 1);
    const dark = run.run(200).parts.led!.led!.brightness;
    run.input('cds', 'lux', 10000);
    const bright = run.run(200).parts.led!.led!.brightness;
    expect(dark).toBeGreaterThan(.4);
    expect(bright).toBeLessThan(.04);
  },
  'rgb-cycle': run => {
    for (const active of ['r', 'g', 'b'] as const) {
      const rgb = run.run(active === 'r' ? 200 : 500).parts.rgb!.rgb!;
      expect(rgb[active]).toBeGreaterThan(.3);
      for (const channel of ['r', 'g', 'b'] as const) {
        if (channel !== active) expect(rgb[channel]).toBeLessThan(.01);
      }
    }
  },
  'servo-sweep': run => {
    const angles: number[] = [];
    run.run(5500, frame => angles.push(frame.parts.servo!.servo!.angle));
    expect(Math.min(...angles)).toBeLessThan(3);
    expect(Math.max(...angles)).toBeGreaterThan(177);
    expect(angles.at(-1)!).toBeLessThan(5);
  },
  melody: run => {
    const frequencies: number[] = [];
    run.run(1200, frame => { if (frame.parts.piezo!.buzzer!.on) frequencies.push(frame.parts.piezo!.buzzer!.freq); });
    for (const note of [262, 330, 392, 523]) {
      expect(frequencies.some(frequency => Math.abs(frequency - note) / note < .03), `tone ${note}`).toBe(true);
    }
  },
  ultrasonic: run => {
    for (const distance of [5, 50, 100]) {
      run.input('sonar', 'distanceCm', distance);
      run.run(100);
      run.serial = '';
      run.run(500);
      const values = run.serial.trim().split(/\r?\n/).map(Number);
      expect(values.length).toBeGreaterThan(0);
      expect(Math.abs(values.at(-1)! - distance)).toBeLessThanOrEqual(1);
    }
  },
  'lcd-counter': run => {
    const first = run.run(1200).parts.lcd!.lcd!.lines;
    expect(first[0]).toContain('Hello COMs!');
    expect(first[1].trim()).toBe('0');
    expect(run.run(1100).parts.lcd!.lcd!.lines[1].trim()).toBe('1');
  },
  'distance-alarm': run => {
    for (const [distance, alarm] of [[100, false], [10, true], [25, false]] as const) {
      run.input('sonar', 'distanceCm', distance);
      const frame = run.run(250);
      expect(frame.parts.led!.led!.brightness > .4).toBe(alarm);
      expect(frame.parts.piezo!.buzzer!.on).toBe(alarm);
      if (alarm) expect(frame.parts.piezo!.buzzer!.freq).toBeCloseTo(1000, -1);
    }
  },
  'dht-lcd': run => {
    run.input('dht', 'temperature', 31);
    run.input('dht', 'humidity', 67);
    const first = run.run(1200).parts.lcd!.lcd!.lines;
    expect(first[0]).toContain('31.00');
    expect(first[1]).toContain('67.00');
    expect(run.serial).toContain('31.00 C 67.00');
    run.input('dht', 'temperature', 19);
    run.input('dht', 'humidity', 42);
    const second = run.run(2200).parts.lcd!.lcd!.lines;
    expect(second[0]).toContain('19.00');
    expect(second[1]).toContain('42.00');
  },
  'joystick-direction': run => {
    for (const [x, y, direction] of [[.5, .5, 'CENTER CENTER'], [0, .5, 'LEFT CENTER'], [1, .5, 'RIGHT CENTER'], [.5, 0, 'CENTER DOWN'], [.5, 1, 'CENTER UP']] as const) {
      run.input('stick', 'x', x);
      run.input('stick', 'y', y);
      run.run(100);
      run.serial = '';
      run.run(200);
      expect(run.serial).toContain(direction);
    }
    run.input('stick', 'pressed', true);
    run.serial = '';
    run.run(200);
    expect(run.serial).toContain('PRESSED');
  },
  'seven-count': run => {
    for (const [index, mask] of [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f].entries()) {
      const segments = run.run(index === 0 ? 200 : 1000).parts.digit!.sevenSeg!.segments;
      expect(segments).toEqual(Array.from({ length: 8 }, (_, bit) => Boolean(mask & (1 << bit))));
    }
  },
  'neopixel-rainbow': run => {
    const first = structuredClone(run.run(100).parts.pixels!.pixels!.colors);
    expect(first).toHaveLength(8);
    expect(first.every(color => color.some(value => value > 0))).toBe(true);
    const next = run.run(500).parts.pixels!.pixels!.colors;
    expect(next.every((color, index) => color.some((value, channel) => value !== first[index]![channel]))).toBe(true);
  },
  'motor-direction': run => {
    const forward = run.run(500).parts.motor!.motor!;
    expect(forward.direction).toBe(1);
    expect(forward.rpm).toBeGreaterThan(100);
    const reverse = run.run(2000).parts.motor!.motor!;
    expect(reverse.direction).toBe(-1);
    expect(reverse.rpm).toBeGreaterThan(forward.rpm);
    expect(run.run(1700).parts.motor!.motor!.rpm).toBeLessThan(1);
  },
};

function checkBlink(run: SketchRun, partId: string): void {
  run.run(100); // Let setup and the first solver update complete.
  const edges: number[] = [];
  let previous: boolean | undefined;
  run.run(2200, frame => {
    const on = frame.parts[partId]!.led!.brightness > .3;
    if (previous !== undefined && on !== previous) edges.push(frame.timeMs);
    previous = on;
  });
  expect(edges.length).toBe(4);
  for (let index = 1; index < edges.length; index++) {
    expect(edges[index]! - edges[index - 1]!).toBeGreaterThan(470);
    expect(edges[index]! - edges[index - 1]!).toBeLessThan(530);
  }
}

describe('real arduino-cli sketches: visible output and realtime throughput', () => {
  it('covers every fixture and gallery example', () => {
    expect(Object.keys(checks).sort()).toEqual(EXAMPLES.map(example => example.id).sort());
    expect(Object.keys(fixtures.examples).sort()).toEqual(Object.keys(checks).sort());
  });
  for (const example of EXAMPLES) {
    it(example.id, () => {
      const run = new SketchRun(example.id);
      checks[example.id]!(run);
      run.report(example.id);
    }, 60_000);
  }
});
