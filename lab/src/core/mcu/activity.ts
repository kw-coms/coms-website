import type { McuPinState } from '../types';

const MCU_HZ = 16_000_000;
const WINDOW_CYCLES = MCU_HZ / 50;

interface Transition {
  cycle: number;
  level: 0 | 1;
}

/** Tracks output edges over a 20 ms window and the last servo pulse width. */
export class PinActivity {
  private edges = new Map<string, Transition[]>();
  private lastWidth = new Map<string, number>();

  record(pin: string, level: 0 | 1, cycle: number): void {
    const transitions = this.edges.get(pin) ?? [{ cycle: 0, level: 0 }];
    const previous = transitions[transitions.length - 1]!;
    if (previous.level === level) return;
    if (previous.level === 1 && level === 0) {
      this.lastWidth.set(pin, (cycle - previous.cycle) / 16);
    }
    transitions.push({ cycle, level });
    this.edges.set(pin, transitions);
  }

  get(pin: string, cycle: number): Pick<McuPinState, 'duty' | 'freq'> {
    const transitions = this.edges.get(pin) ?? [{ cycle: 0, level: 0 }];
    const start = Math.max(0, cycle - WINDOW_CYCLES);
    let level = transitions[0]!.level;
    let cursor = start;
    let highCycles = 0;
    let rises = 0;
    let firstRelevant = 0;

    for (let index = 0; index < transitions.length; index++) {
      const edge = transitions[index]!;
      if (edge.cycle <= start) {
        level = edge.level;
        firstRelevant = index;
        continue;
      }
      if (edge.cycle > cycle) break;
      if (level) highCycles += edge.cycle - cursor;
      if (edge.level === 1) rises++;
      cursor = edge.cycle;
      level = edge.level;
    }
    if (level) highCycles += cycle - cursor;
    if (firstRelevant > 1) transitions.splice(0, firstRelevant - 1);

    return {
      duty: cycle > start ? highCycles / (cycle - start) : level,
      freq: rises * MCU_HZ / Math.max(1, cycle - start),
    };
  }

  pulseWidthUs(pin: string): number {
    return this.lastWidth.get(pin) ?? 0;
  }

  servoAngle(pin: string): number {
    const pulse = this.pulseWidthUs(pin);
    return Math.max(0, Math.min(180, (pulse - 544) * 180 / (2400 - 544)));
  }

  reset(): void {
    this.edges.clear();
    this.lastWidth.clear();
  }
}
