/** Peripheral timing is expressed in ATmega clock cycles (16 MHz). */
export const CYCLES_PER_US = 16;
export type Schedule = (callback: () => void, delayCycles: number) => void;
export type Drive = (level: 0 | 1) => void;

export class LCD1602 {
  readonly address: number;
  private ddram = Array<string>(80).fill(' ');
  private cursorAddress = 0;
  private highNibble: number | null = null;
  private highRs = false;
  private previousEnable = false;
  private displayOn = true;
  private cursorOn = false;
  private backlightOn = true;
  private increment = true;
  private shift = 0;
  private fourBitReady = false;
  private cgramMode = false;
  private entryShift = false;
  constructor(address = 0x27) { this.address = address; }
  /** ACK only the configured PCF8574 address. */
  writeI2c(address: number, byte: number): boolean {
    if (address !== this.address) return false;
    this.backlightOn = !!(byte & 0x08);
    const enable = !!(byte & 0x04);
    if (this.previousEnable && !enable && !(byte & 0x02)) this.nibble(byte >> 4, !!(byte & 0x01));
    this.previousEnable = enable;
    return true;
  }
  private nibble(n: number, rs: boolean): void {
    n &= 15;
    // LiquidCrystal_I2C sends 0x03 three times, then 0x02 before 4-bit commands.
    if (!this.fourBitReady && !rs) {
      if (n === 3) return;
      if (n === 2) { this.fourBitReady = true; return; }
    }
    if (this.highNibble === null) { this.highNibble = n; this.highRs = rs; return; }
    const value = (this.highNibble << 4) | n;
    this.highNibble = null;
    if (this.highRs) this.data(value); else this.command(value);
  }
  private command(v: number): void {
    if (v === 1) { this.ddram.fill(' '); this.cursorAddress = 0; this.shift = 0; }
    else if (v === 2) { this.cursorAddress = 0; this.shift = 0; }
    else if (v & 0x80) { this.cgramMode = false; this.cursorAddress = v & 0x7f; }
    else if (v & 0x40) { this.cgramMode = true; }
    else if (v & 0x20) { this.fourBitReady = !(v & 0x10); }
    else if (v & 0x10) {
      if (v & 0x08) this.shift = (this.shift + (v & 0x04 ? -1 : 1) + 40) % 40;
      else this.cursorAddress = (this.cursorAddress + (v & 0x04 ? 1 : -1) + 128) % 128;
    } else if (v & 0x08) { this.displayOn = !!(v & 4); this.cursorOn = !!(v & 2); }
    else if (v & 0x04) { this.increment = !!(v & 2); this.entryShift = !!(v & 1); }
  }
  private data(v: number): void {
    if (this.cgramMode) return;
    const index = this.cursorAddress < 0x40 ? this.cursorAddress : 40 + this.cursorAddress - 0x40;
    if (index >= 0 && index < 80) this.ddram[index] = String.fromCharCode(v);
    const next = this.cursorAddress + (this.increment ? 1 : -1);
    this.cursorAddress = next === 0x28 ? 0x40 : next === 0x68 ? 0 : next < 0 ? 0x67 : next === 0x3f ? 0x27 : next;
    if (this.entryShift) this.shift = (this.shift + (this.increment ? 1 : -1) + 40) % 40;
  }
  visual(): { lines: [string,string]; backlight: boolean; cursor: { row: number; col: number; visible: boolean } } {
    const line = (offset: number) => Array.from({length:16},(_,i)=>this.ddram[offset+(i+this.shift)%40] ?? ' ').join('');
    const row = this.cursorAddress >= 0x40 ? 1 : 0;
    return { lines: this.displayOn ? [line(0),line(40)] : [' '.repeat(16),' '.repeat(16)], backlight: this.backlightOn, cursor: {row, col: (this.cursorAddress - (row ? 0x40 : 0) - this.shift + 40)%40, visible: this.displayOn && this.cursorOn} };
  }
}

export class DHT11Protocol {
  busy = false;
  private lowSince: number | null = null;
  private generation = 0;
  constructor(private schedule: Schedule, private drive: Drive, private sample: () => { temperature: number; humidity: number }) {}
  /** Call on every MCU DATA output transition; released is true when GPIO changes to input. */
  onDataChange(level: 0 | 1, cycle: number, released = false): void {
    if (level === 0 && !released) { this.lowSince = cycle; return; }
    if (this.lowSince === null) return;
    const held = cycle - this.lowSince;
    this.lowSince = null;
    if (held < 18_000 * CYCLES_PER_US || !released) return;
    this.respond();
  }
  private respond(): void {
    const seq = ++this.generation;
    this.busy = true;
    const s = this.sample();
    const h = Math.max(20, Math.min(90, Math.round(s.humidity)));
    const t = Math.max(0, Math.min(50, Math.round(s.temperature)));
    const bytes = [h,0,t,0,(h+t)&255];
    let at = 20 * CYCLES_PER_US;
    const edge = (level: 0 | 1, when: number) => this.schedule(() => { if (seq === this.generation) this.drive(level); }, when);
    edge(0, at); at += 80*CYCLES_PER_US; edge(1, at); at += 80*CYCLES_PER_US;
    for (const b of bytes) for (let bit=7;bit>=0;bit--) {
      edge(0,at); at += 50*CYCLES_PER_US; edge(1,at);
      at += (b & (1<<bit) ? 70 : 27)*CYCLES_PER_US;
    }
    // The 40th high bit is followed by a 50 µs low trailer before release.
    edge(0,at); at += 50*CYCLES_PER_US; edge(1,at);
    this.schedule(()=>{if(seq===this.generation)this.busy=false;},at);
  }
  reset(): void { this.generation++; this.lowSince=null; this.busy=false; this.drive(1); }
}

export class HCSR04Protocol {
  pinging = false;
  private highSince: number | null = null;
  private generation = 0;
  constructor(private schedule: Schedule, private drive: Drive, private distanceCm: () => number) {}
  onTrigChange(level: 0 | 1, cycle: number): void {
    if (level) { this.highSince = cycle; return; }
    if (this.highSince === null || cycle-this.highSince < 10*CYCLES_PER_US) return;
    this.highSince = null;
    const token = ++this.generation;
    this.pinging = true;
    this.schedule(()=>{if(token===this.generation)this.drive(1);},200*CYCLES_PER_US);
    const width = Math.max(2,Math.min(400,this.distanceCm()))*58*CYCLES_PER_US;
    this.schedule(()=>{if(token===this.generation){this.drive(0);this.pinging=false;}},200*CYCLES_PER_US+width);
  }
  reset(): void { this.generation++; this.highSince=null; this.pinging=false; this.drive(0); }
}

export class WS2812Protocol {
  colors: [number,number,number][];
  private risingAt: number | null = null;
  private lowAt: number | null = null;
  private bits: number[] = [];
  constructor(count = 8) { this.colors=Array.from({length:Math.max(1,Math.min(16,count))},()=>[0,0,0]); }
  onDataChange(level: 0 | 1, cycle: number): void {
    if (level) {
      if (this.lowAt !== null && cycle-this.lowAt >= 50*CYCLES_PER_US) this.latch();
      this.risingAt=cycle;
    } else if (this.risingAt !== null) {
      const duration=cycle-this.risingAt;
      if (duration >= 3 && duration < 20 && this.bits.length < this.colors.length*24) this.bits.push(duration >= 9 ? 1 : 0);
      this.risingAt=null; this.lowAt=cycle;
    }
  }
  /** Commit a frame after the reset-low interval, even if no new rising edge follows. */
  advance(cycle: number): void {
    if (this.lowAt !== null && cycle-this.lowAt >= 50*CYCLES_PER_US && this.bits.length) { this.latch(); this.lowAt = cycle; }
  }
  latch(): void {
    for(let i=0;i<this.colors.length;i++) {
      if(this.bits.length < (i+1)*24) break;
      const byte=(start:number)=>this.bits.slice(start,start+8).reduce((a,b)=>(a<<1)|b,0);
      const base=i*24; this.colors[i]=[byte(base+8),byte(base),byte(base+16)];
    }
    this.bits=[];
  }
  reset(): void { this.bits=[]; this.risingAt=null; this.lowAt=null; this.colors=this.colors.map(()=>[0,0,0]); }
}
export function servoAngleFromPulseUs(us: number): number { return Math.max(0,Math.min(180,(us-544)*180/(2400-544))); }
