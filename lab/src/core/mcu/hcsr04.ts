import { CYCLES_PER_US, type Schedule, type Drive } from './protocols';

export class HCSR04Protocol {
  pinging = false;
  private highSince: number | null = null;
  private generation = 0;

  constructor(
    private schedule: Schedule,
    private drive: Drive,
    private distanceCm: () => number,
  ) { }

  onTrigChange(level: 0 | 1, cycle: number): void {
    if (level) {
      this.highSince = cycle;
      return;
    }
    if (this.highSince === null || cycle - this.highSince < 10 * CYCLES_PER_US) return;
    this.highSince = null;
    const generation = ++this.generation;
    this.pinging = true;
    this.schedule(() => {
      if (generation === this.generation) this.drive(1);
    }, 200 * CYCLES_PER_US);
    const distance = Math.max(2, Math.min(400, this.distanceCm()));
    const echoCycles = distance * 58 * CYCLES_PER_US;
    this.schedule(() => {
      if (generation === this.generation) {
        this.drive(0);
        this.pinging = false;
      }
    }, 200 * CYCLES_PER_US + echoCycles);
  }

  reset(): void {
    this.generation++;
    this.highSince = null;
    this.pinging = false;
    this.drive(0);
  }
}
