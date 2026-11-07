import { Lcd1602 } from './lcd';
import type { PartVisualState } from '../types';

/** Compatibility adapter for the PCF8574 protocol tests and standalone callers. */
export class LCD1602 {
  readonly address: number;
  private readonly decoder: Lcd1602;

  constructor(address = 0x27) {
    this.address = address;
    this.decoder = new Lcd1602(address);
  }

  writeI2c(address: number, byte: number): boolean {
    if (address !== this.address) return false;
    this.decoder.write(byte);
    return true;
  }

  visual(): NonNullable<PartVisualState['lcd']> {
    return this.decoder.state;
  }
}
