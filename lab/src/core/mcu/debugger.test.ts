import { describe, expect, it } from 'vitest';
import { Mcu } from './index';
import { wordsToHex } from './hex';

const info = {
  lines: [{ addr: 0, line: 1 }, { addr: 2, line: 2 }, { addr: 4, line: 3 }, { addr: 6, line: 4 }, { addr: 8, line: 5 }],
  globals: [
    { name: 'count', addr: 0x800100, size: 2, type: 'int' },
    { name: 'flags', addr: 0x800102, size: 3, type: 'byte[3]' },
  ],
  truncated: false,
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
    mcu.debugger.load({ lines: info.lines, truncated: false, globals: [
      { name: 'u', addr: 0x800110, size: 1, type: 'uint8_t' },
      { name: 's', addr: 0x800111, size: 1, type: 'int8_t' },
      { name: 'bad', addr: 0x800112, size: 1, type: 'uint32_t' },
    ] });
    mcu.cpu.data.set([255, 255, 255], 0x110);
    expect(mcu.debugger.state(mcu.cpu)?.globals?.map(g => g.value)).toEqual(['255', '-1', '?']);
  });

  it('formats AVR double scalars and arrays as four-byte floats', () => {
    const mcu = create();
    mcu.debugger.load({ lines: info.lines, truncated: false, globals: [
      { name: 'scalar', addr: 0x800120, size: 4, type: 'double' },
      { name: 'array', addr: 0x800124, size: 8, type: 'double[2]' },
      { name: 'short', addr: 0x80012c, size: 3, type: 'double' },
    ] });
    mcu.cpu.dataView.setFloat32(0x120, -12.5, true);
    mcu.cpu.dataView.setFloat32(0x124, 1.25, true);
    mcu.cpu.dataView.setFloat32(0x128, -0.5, true);
    expect(mcu.debugger.state(mcu.cpu)?.globals?.map(g => g.value))
      .toEqual(['-12.5', '[1.25, -0.5]', '?']);
  });

  it.each(['long long', 'int64_t', 'unsigned long long', 'uint64_t'])(
    'formats %s without losing 64-bit precision, including arrays', type => {
      const mcu = create();
      const unsigned = /unsigned|uint/.test(type);
      const first = unsigned ? 18446744073709551615n : -9223372036854775808n;
      const second = 9007199254740993n;
      mcu.debugger.load({ lines: info.lines, truncated: false, globals: [
        { name: 'scalar', addr: 0x800140, size: 8, type },
        { name: 'array', addr: 0x800140, size: 16, type: `${type}[2]` },
        { name: 'short', addr: 0x800150, size: 4, type },
      ] });
      mcu.cpu.dataView.setBigUint64(0x140, BigInt.asUintN(64, first), true);
      mcu.cpu.dataView.setBigUint64(0x148, second, true);
      expect(mcu.debugger.state(mcu.cpu)?.globals?.map(g => g.value))
        .toEqual([String(first), `[${first}, ${second}]`, '?']);
    },
  );

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
