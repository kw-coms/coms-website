import { CYCLES_PER_US, type Schedule, type Drive } from './protocols';

export class DHT11Protocol {
  busy = false;
  private lowSince: number | null = null;
  private generation = 0;

  constructor(
    private schedule: Schedule,
    private drive: Drive,
    private sample: () => { temperature: number; humidity: number },
  ) { }

  /** The host holds DATA low for at least 18 ms, then releases it. */
  onDataChange(level: 0 | 1, cycle: number, released = false): void {
    if (level === 0 && !released) {
      this.lowSince = cycle;
      return;
    }
    if (this.lowSince === null) return;
    const heldCycles = cycle - this.lowSince;
    this.lowSince = null;
    if (heldCycles >= 18_000 * CYCLES_PER_US && released) this.respond();
  }

  private respond(): void {
    const generation = ++this.generation;
    this.busy = true;
    const reading = this.sample();
    const humidity = Math.max(20, Math.min(90, Math.round(reading.humidity)));
    const temperature = Math.max(0, Math.min(50, Math.round(reading.temperature)));
    const bytes = [humidity, 0, temperature, 0, (humidity + temperature) & 255];
    let at = 20 * CYCLES_PER_US;
    const edge = (level: 0 | 1, delay: number) => {
      this.schedule(() => {
        if (generation === this.generation) this.drive(level);
      }, delay);
    };

    edge(0, at);
    at += 80 * CYCLES_PER_US;
    edge(1, at);
    at += 80 * CYCLES_PER_US;
    for (const byte of bytes) {
      for (let bit = 7; bit >= 0; bit--) {
        edge(0, at);
        at += 50 * CYCLES_PER_US;
        edge(1, at);
        at += (byte & (1 << bit) ? 70 : 27) * CYCLES_PER_US;
      }
    }
    edge(0, at);
    at += 50 * CYCLES_PER_US;
    edge(1, at);
    this.schedule(() => {
      if (generation === this.generation) this.busy = false;
    }, at);
  }

  reset(): void {
    this.generation++;
    this.lowSince = null;
    this.busy = false;
    this.drive(1);
  }
}
