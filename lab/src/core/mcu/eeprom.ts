import { AVREEPROM, EEPROMMemoryBackend, eepromConfig, type CPU } from 'avr8js';

// ATmega328P combined erase/write is about 3.4 ms at 16 MHz.
export const unoEepromConfig = { ...eepromConfig, eraseCycles: 27_200, writeCycles: 27_200 };

/** The ATmega328P implements only EEAR[9:0]. */
export class UnoEepromMemoryBackend extends EEPROMMemoryBackend {
  constructor() { super(1024); }
  override readMemory(addr: number): number { return super.readMemory(addr & 0x3ff); }
  override writeMemory(addr: number, value: number): void { super.writeMemory(addr & 0x3ff, value); }
  override eraseMemory(addr: number): void { super.eraseMemory(addr & 0x3ff); }
}

export function installUnoEeprom(cpu: CPU, backend: UnoEepromMemoryBackend): void {
  new AVREEPROM(cpu, backend, unoEepromConfig);
  const write = cpu.writeHooks[unoEepromConfig.EECR]!;
  cpu.writeHooks[unoEepromConfig.EECR] = (value, oldValue, address, mask) => {
    // EEPE belongs to the peripheral until its clock event completes. The
    // upstream hook lets a later EECR write clear it and even read while busy.
    if (cpu.data[address]! & 0x02) return true;
    return write(value, oldValue, address, mask);
  };
}
