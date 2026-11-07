import { describe, expect, it } from 'vitest';
import { AvrMcu } from './avr';
import { Mcu } from './index';
import { wordsToHex } from './hex';

const ldi = (reg: number, value: number) => 0xe000 | ((value & 0xf0) << 4) | ((reg - 16) << 4) | (value & 15);
const sts = (reg: number, address: number) => [0x9200 | (reg << 4), address];
const lds = (reg: number, address: number) => [0x9000 | (reg << 4), address];
const sbi = (address: number, bit: number) => 0x9a00 | (address << 3) | bit;
const program = wordsToHex([
  ldi(16, 0x23), ...sts(16, 0x41), // EEARL
  ldi(16, 0x5a), ...sts(16, 0x40), // EEDR
  ldi(16, 0x04), ...sts(16, 0x3f), // EEMPE
  ldi(16, 0x02), ...sts(16, 0x3f), // EEPE, within four cycles
  0xcfff, // wait forever; test advances the peripheral clock
]);
const readProgram = wordsToHex([
  ldi(16, 0x23), ...sts(16, 0x41),
  ldi(16, 0x01), ...sts(16, 0x3f),
  ...lds(17, 0x40), ...sts(17, 0x100),
  0xcfff,
]);

describe.each([['simulation MCU', () => new Mcu()], ['standalone AVR', () => new AvrMcu()]])('%s EEPROM', (_name, create) => {
  it('writes from AVR opcodes, reports busy, then reads back and survives reset', () => {
    const mcu = create();
    mcu.loadHex(program);
    mcu.step(30);
    expect(mcu.cpu.readData(0x3f) & 0x02).toBe(0x02);
    expect(mcu.eeprom.memory[0x23]).toBe(0x5a);
    mcu.step(54_000);
    expect(mcu.cpu.readData(0x3f) & 0x02).toBe(0x02);
    mcu.step(2_000);
    expect(mcu.cpu.readData(0x3f) & 0x02).toBe(0);
    mcu.reset();
    mcu.loadHex(readProgram);
    mcu.step(50);
    expect(mcu.cpu.readData(0x100)).toBe(0x5a);
  });

  it('rejects an EEPE write without the four-cycle EEMPE window', () => {
    const mcu = create();
    mcu.cpu.writeData(0x41, 1);
    mcu.cpu.writeData(0x40, 0x42);
    mcu.cpu.writeData(0x3f, 0x02);
    expect(mcu.eeprom.memory[1]).toBe(0xff);
    expect(mcu.cpu.readData(0x3f) & 0x02).toBe(0);
    mcu.cpu.writeData(0x3f, 0x04);
    mcu.cpu.cycles += 5;
    mcu.cpu.writeData(0x3f, 0x02);
    expect(mcu.eeprom.memory[1]).toBe(0xff);
    expect(mcu.cpu.readData(0x3f) & 0x02).toBe(0);
  });

  it('keeps busy set and rejects reads or new writes during programming', () => {
    const mcu = create();
    mcu.loadHex(program);
    mcu.step(30);
    mcu.cpu.writeData(0x3f, 0);
    expect(mcu.cpu.readData(0x3f) & 0x02).toBe(0x02);
    mcu.cpu.writeData(0x40, 0x77);
    mcu.cpu.writeData(0x3f, 0x01);
    expect(mcu.cpu.readData(0x40)).toBe(0x77);
    mcu.cpu.writeData(0x3f, 0x06);
    expect(mcu.cpu.readData(0x3f) & 0x02).toBe(0x02);
    expect(mcu.eeprom.memory[0x23]).toBe(0x5a);
    mcu.step(56_000);
    expect(mcu.cpu.readData(0x3f) & 0x02).toBe(0);
  });

  it('ignores EEARH bits above the 1 KB address range', () => {
    const mcu = create();
    mcu.eeprom.memory[0x23] = 0x6c;
    mcu.cpu.writeData(0x41, 0x23);
    mcu.cpu.writeData(0x42, 0x04);
    mcu.cpu.writeData(0x3f, 0x01);
    expect(mcu.cpu.readData(0x40)).toBe(0x6c);
  });

  it('accepts the Arduino SBI EEMPE then SBI EEPE sequence', () => {
    const mcu = create();
    mcu.loadHex(wordsToHex([
      ldi(16, 0x31), ...sts(16, 0x41),
      ldi(16, 0xa5), ...sts(16, 0x40),
      sbi(0x1f, 2), sbi(0x1f, 1), 0xcfff,
    ]));
    mcu.step(30);
    expect(mcu.cpu.readData(0x3f) & 0x02).toBe(0x02);
    expect(mcu.eeprom.memory[0x31]).toBe(0xa5);
  });
});
