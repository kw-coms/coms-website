import { CYCLES_PER_US } from './protocols';

export class WS2812Protocol {
  colors: [number, number, number][];
  private risingAt: number | null = null;
  private lowAt: number | null = null;
  private bits: number[] = [];

  constructor(count = 8) {
    const pixelCount = Math.max(1, Math.min(16, count));
    this.colors = Array.from({ length: pixelCount }, () => [0, 0, 0]);
  }

  onDataChange(level: 0 | 1, cycle: number): void {
    if (level) {
      if (this.lowAt !== null && cycle - this.lowAt >= 50 * CYCLES_PER_US) {
        this.latch();
      }
      this.risingAt = cycle;
    } else if (this.risingAt !== null) {
      const highCycles = cycle - this.risingAt;
      if (highCycles >= 3 && highCycles < 20 && this.bits.length < this.colors.length * 24) {
        this.bits.push(highCycles >= 9 ? 1 : 0);
      }
      this.risingAt = null;
      this.lowAt = cycle;
    }
  }

  /** WS2812 latches a frame after the data line stays low for at least 50 µs. */
  advance(cycle: number): void {
    if (this.lowAt !== null && cycle - this.lowAt >= 50 * CYCLES_PER_US && this.bits.length) {
      this.latch();
      this.lowAt = cycle;
    }
  }

  latch(): void {
    for (let pixel = 0; pixel < this.colors.length; pixel++) {
      const base = pixel * 24;
      if (this.bits.length < base + 24) break;
      const byte = (start: number) => {
        let value = 0;
        for (let bit = 0; bit < 8; bit++) value = value << 1 | this.bits[start + bit]!;
        return value;
      };
      this.colors[pixel] = [byte(base + 8), byte(base), byte(base + 16)];
    }
    this.bits = [];
  }

  reset(): void {
    this.bits = [];
    this.risingAt = null;
    this.lowAt = null;
    this.colors = this.colors.map(() => [0, 0, 0]);
  }
}
