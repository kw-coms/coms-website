import { describe, expect, it } from 'vitest';
import { Mcu } from './index';
import { wordsToHex } from './hex';

const info = {
  lines: [{ addr: 0, line: 1 }, { addr: 2, line: 2 }, { addr: 4, line: 3 }, { addr: 6, line: 4 }, { addr: 8, line: 5 }],
  globals: [
    { name: 'count', addr: 0x800100, size: 2, type: 'int' },
    { name: 'flags', addr: 0x800102, size: 3, type: 'byte[3]' },
  ],
};

describe('AVR line debugger', () => {
  const create = () => {
    const mcu = new Mcu();
    mcu.loadHex(wordsToHex([0xd002, 0x0000, 0xcfff, 0x0000, 0x9508]));
    mcu.debugger.load(info);
    mcu.cpu.SP = 0x8ff;
    return mcu;
  };

  it('maps line breakpoints to the first byte address and formats SRAM globals', () => {
    const mcu = create();
    mcu.debugger.setBreakpoints([1]);
    mcu.cpu.data[0x100] = 0xfe;
    mcu.cpu.data[0x101] = 0xff;
    mcu.cpu.data.set([1, 2, 3], 0x102);
    mcu.step(100);
    expect(mcu.cpu.pc).toBe(0);
    expect(mcu.debugger.state(mcu.cpu)).toMatchObject({ paused: true, line: 1, reason: 'breakpoint', globals: [
      { name: 'count', value: '-2' }, { name: 'flags', value: '[1, 2, 3]' },
    ] });
  });

  it('steps into a call, then out to its caller at line granularity', () => {
    const mcu = create();
    mcu.debugger.setBreakpoints([1]);
    mcu.step(10);
    mcu.debugger.stepInto(mcu.cpu);
    mcu.step(100);
    expect(mcu.debugger.state(mcu.cpu)).toMatchObject({ paused: true, line: 4, reason: 'step' });
    mcu.debugger.stepOut(mcu.cpu);
    mcu.step(100);
    expect(mcu.debugger.state(mcu.cpu)).toMatchObject({ paused: true, line: 2, reason: 'step' });
  });

  it('steps over a subroutine to the next source line', () => {
    const mcu = create();
    mcu.debugger.stepOver(mcu.cpu);
    mcu.step(100);
    expect(mcu.debugger.state(mcu.cpu)).toMatchObject({ paused: true, line: 2, reason: 'step' });
  });

  it('formats byte-sized signed and unsigned globals and rejects undersized scalars', () => {
    const mcu = create();
    mcu.debugger.load({ lines: info.lines, globals: [
      { name: 'u', addr: 0x800110, size: 1, type: 'uint8_t' },
      { name: 's', addr: 0x800111, size: 1, type: 'int8_t' },
      { name: 'bad', addr: 0x800112, size: 1, type: 'uint32_t' },
    ] });
    mcu.cpu.data.set([255, 255, 255], 0x110);
    expect(mcu.debugger.state(mcu.cpu)?.globals?.map(g => g.value)).toEqual(['255', '-1', '?']);
  });

  it('tracks interrupt entry and RETI as a nested frame for step over', () => {
    const mcu = create();
    const debug = mcu.debugger;
    debug.stepOver(mcu.cpu);
    // A NOP followed by avr8js interrupt service pushes a two-byte return PC.
    expect(debug.before(mcu.cpu)).toBe(true);
    debug.after(0x0000, 0x8ff, 0x8fd);
    mcu.cpu.pc = 3; // interrupt handler is a different source line
    expect(debug.before(mcu.cpu)).toBe(true);
    debug.after(0x9518, 0x8fd, 0x8ff); // RETI
    mcu.cpu.pc = 1;
    expect(debug.before(mcu.cpu)).toBe(false);
    expect(debug.state(mcu.cpu)).toMatchObject({ paused: true, line: 2, reason: 'step' });
  });
});
