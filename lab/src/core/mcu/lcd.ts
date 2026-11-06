import type { PartVisualState } from '../types';

/** PCF8574 P0=RS, P1=RW, P2=E, P3=backlight, P4..7=data. */
export class Lcd1602 {
  address: number;
  backlight = true;
  private ddram = Array.from({ length: 128 }, () => ' ');
  private addr = 0;
  private highNibble: number | null = null;
  private fourBit = false;
  private previous = 0;
  private display = true;
  private cursor = false;
  private entryIncrement = true;
  private entryShift = false;
  private displayOffset = 0;
  private cgram = false;
  private cgramAddr = 0;

  constructor(address = 0x27) {
    this.address = address;
  }
  write(value: number): void {
    this.backlight = !!(value & 8);
    if ((this.previous & 4) && !(value & 4) && !(value & 2)) {
      const nibble = value & 0xf0;
      const rs = !!(value & 1);
      if (!this.fourBit) {
        if (nibble === 0x20) this.fourBit = true;
        else this.execute(nibble, rs);
      } else if (this.highNibble === null) {
        this.highNibble = nibble;
      } else {
        this.execute(this.highNibble | (nibble >> 4), rs);
        this.highNibble = null;
      }
    }
    this.previous = value;
  }
  private execute(byte: number, rs: boolean): void {
    if (rs) {
      if (this.cgram) {
        this.cgramAddr = (this.cgramAddr + (this.entryIncrement ? 1 : -1)) & 0x3f;
        return;
      }
      this.ddram[this.addr & 0x7f] = String.fromCharCode(byte);
      this.addr = (this.addr + (this.entryIncrement ? 1 : -1)) & 0x7f;
      if (this.entryShift) this.displayOffset = (this.displayOffset + (this.entryIncrement ? -1 : 1) + 40) % 40;
    } else if (byte === 1) {
      this.ddram.fill(' ');
      this.addr = 0;
      this.displayOffset = 0;
    } else if (byte === 2) {
      this.addr = 0;
      this.displayOffset = 0;
    } else if (byte & 0x80) {
      this.cgram = false;
      this.addr = byte & 0x7f;
    } else if (byte & 0x40) {
      this.cgram = true;
      this.cgramAddr = byte & 0x3f;
    } else if (byte & 0x20) {
      // Function-set command does not change visible display state.
    } else if (byte & 0x10) {
      const delta = byte & 4 ? 1 : -1;
      if (byte & 8) this.displayOffset = (this.displayOffset + delta + 40) % 40;
      else this.addr = (this.addr + delta) & 0x7f;
    }
    else if (byte & 0x08) {
      this.display = !!(byte & 4);
      this.cursor = !!(byte & 2);
    } else if (byte & 0x04) {
      this.entryIncrement = !!(byte & 2);
      this.entryShift = !!(byte & 1);
    }
  }
  get state(): NonNullable<PartVisualState['lcd']> {
    const line = (start: number) => this.display
      ? Array.from({ length: 16 }, (_, index) => this.ddram[start + ((this.displayOffset + index) % 40)]).join('')
      : ' '.repeat(16);
    return {
      lines: [line(0), line(0x40)], backlight: this.backlight,
      cursor: { row: this.addr >= 0x40 ? 1 : 0, col: this.addr >= 0x40 ? this.addr - 0x40 : this.addr, visible: this.cursor }
    };
  }
}
