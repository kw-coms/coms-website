import { describe, expect, it } from 'vitest';
import { Mcu, loadIntelHex, MCU_HZ } from './index';
import { Lcd1602 } from './lcd';

function hex(words: number[]): string {
  const bytes = words.flatMap(w => [w & 255, w >> 8]);
  const row = [bytes.length, 0, 0, 0, ...bytes];
  const checksum = (-row.reduce((a, b) => a + b, 0)) & 255;
  return ':' + [...row, checksum].map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('') + '\n:00000001FF';
}
const ldi = (reg: number, value: number) => 0xe000 | ((value & 0xf0) << 4) | ((reg - 16) << 4) | (value & 15);
const sbi = (addr: number, bit: number) => 0x9a00 | (addr << 3) | bit;
const cbi = (addr: number, bit: number) => 0x9800 | (addr << 3) | bit;
const sts = (reg: number, address: number) => [0x9200 | (reg << 4), address];
const rjmp = (offset: number) => 0xc000 | (offset & 0xfff);

describe('ATmega328P', () => {
  it('loads HEX and toggles PB5 / UNO D13', () => {
    const m = new Mcu();
    m.loadHex(hex([sbi(4, 5), sbi(5, 5), cbi(5, 5), rjmp(-3)]));
    m.step(2);
    m.step(2); expect(m.pins().D13?.level).toBe(1);
    m.step(2); expect(m.pins().D13?.level).toBe(0);
    m.step(100);
    expect(m.pins().D13?.duty).toBeGreaterThan(0);
    expect(m.pins().D13?.freq).toBeGreaterThan(0);
    expect(m.pins().D13?.mode).toBe('output');
    expect(m.cpu.cycles).toBeGreaterThanOrEqual(100);
  });
  it('transmits USART0 bytes from an AVR program', () => {
    let serial = '';
    const m = new Mcu(text => { serial += text; });
    m.loadHex(hex([ldi(16, 8), ...sts(16, 0xc1), ldi(16, 72), ...sts(16, 0xc6), rjmp(-1)]));
    m.step(200);
    expect(serial).toContain('H');
  });
  it('samples analog input via ADC at AVcc reference', () => {
    const m = new Mcu();
    m.loadHex(hex([ldi(16, 0x40), ...sts(16, 0x7c), ldi(16, 0xc7), ...sts(16, 0x7a), rjmp(-1)]));
    m.setADC(0, 2.5);
    m.step(5000);
    const adc = m.cpu.readData(0x78) | (m.cpu.readData(0x79) << 8);
    expect(adc).toBeGreaterThan(450); expect(adc).toBeLessThan(575);
  });
  it('measures SG90 pulse width', () => {
    const m = new Mcu();
    m.ports.B.setPin(1, true); m.step(Math.round(1500e-6 * MCU_HZ)); m.ports.B.setPin(1, false);
    // GPIO listener observes output states, so generate a CPU output pulse.
    m.cpu.writeData(0x24, 2); m.cpu.writeData(0x25, 2);
    m.step(Math.round(1500e-6 * MCU_HZ)); m.cpu.writeData(0x25, 0);
    expect(m.servoAngle('D9')).toBeCloseTo(92.7, 0);
  });
  it('reports driven input levels from PIN register and output callbacks', () => {
    const m = new Mcu();
    m.setVoltage('D2', 5);
    expect(m.pins().D2?.level).toBe(1);
    m.cpu.writeData(0x2b, 4); // PORTD pull-up on D2
    m.setVoltage('D2', 0);
    expect(m.pins().D2?.mode).toBe('input_pullup');
    expect(m.pins().D2?.level).toBe(0);
    const edges: number[] = [];
    m.onPinChange = (pin, level) => { if (pin === 'D13') edges.push(level); };
    m.cpu.writeData(0x24, 32); m.cpu.writeData(0x25, 32); m.cpu.writeData(0x25, 0);
    expect(edges).toEqual([1, 0]);
  });
  it('cancels pending echo events and preserves an unchanged sensor config', () => {
    const m = new Mcu(); m.triggerEcho('D8', 'D7', 10);
    m.cpu.writeData(0x24, 1); m.cpu.writeData(0x25, 1);
    m.step(160); m.triggerEcho('D8', 'D7', 10); m.cpu.writeData(0x25, 0);
    m.clearEcho(); m.step(3200 + 10 * 58e-6 * MCU_HZ);
    expect(m.isEchoActive('D7')).toBe(false);
    expect(m.cpu.readData(0x29) & 128).toBe(0);
  });
  it('schedules HC-SR04 echo after a 10us trigger pulse', () => {
    const m = new Mcu(); m.triggerEcho('D8', 'D7', 10);
    m.cpu.writeData(0x24, 1); m.cpu.writeData(0x25, 1);
    m.step(160); m.cpu.writeData(0x25, 0);
    m.step(3200); expect(m.cpu.readData(0x29) & 128).toBe(128);
    m.step(Math.round(10 * 58e-6 * MCU_HZ)); expect(m.cpu.readData(0x29) & 128).toBe(0);
  });
});

describe('PCF8574 + HD44780', () => {
  it('decodes LiquidCrystal_I2C four-bit init and print Hi', () => {
    const lcd = new Lcd1602();
    const nibble = (v: number, rs = 0) => { lcd.write(v | rs | 8 | 4); lcd.write(v | rs | 8); };
    [0x30, 0x30, 0x30, 0x20].forEach(v => nibble(v));
    const byte = (v: number, rs = 0) => { nibble(v & 0xf0, rs); nibble((v << 4) & 0xf0, rs); };
    [0x28, 0x08, 0x01, 0x06, 0x0c].forEach(v => byte(v));
    byte(72, 1); byte(105, 1);
    expect(lcd.state.lines[0].slice(0, 2)).toBe('Hi');
  });
  it('ACKs only the configured LCD address', () => {
    const m = new Mcu();
    m.setLcdAddress(0x27);
    m.twi.eventHandler.start(false);
    m.twi.eventHandler.connectToSlave(0x26, true);
    expect(m.cpu.data[0xb9]! & 0xf8).toBe(0x20);
    m.twi.eventHandler.stop();
    m.twi.eventHandler.start(false);
    m.twi.eventHandler.connectToSlave(0x27, true);
    expect(m.cpu.data[0xb9]! & 0xf8).toBe(0x18);
    m.setLcdAddress(null);
    m.twi.eventHandler.stop();
    m.twi.eventHandler.start(false);
    m.twi.eventHandler.connectToSlave(0x27, true);
    expect(m.cpu.data[0xb9]! & 0xf8).toBe(0x20);
  });
  it('rejects missing EOF, malformed checksums and out-of-flash segment addresses', () => {
    expect(() => loadIntelHex(':0100000000FF')).toThrow(/EOF/);
    expect(() => loadIntelHex(':0100000000FE\n:00000001FF')).toThrow(/체크섬/);
    expect(() => loadIntelHex(':020000020800F4\n:0100000000FF\n:00000001FF')).toThrow(/32 KB/);
    expect(loadIntelHex(':020000020001FB\n:01000000AA55\n:00000001FF')[8]).toBe(0xffaa);
  });
  it('keeps CGRAM writes separate from visible DDRAM text', () => {
    const lcd = new Lcd1602();
    const nibble = (v: number, rs = 0) => { lcd.write(v | rs | 8 | 4); lcd.write(v | rs | 8); };
    [0x30, 0x30, 0x30, 0x20].forEach(v => nibble(v));
    const byte = (v: number, rs = 0) => { nibble(v & 0xf0, rs); nibble((v << 4) & 0xf0, rs); };
    byte(0x40); byte(0xff, 1); byte(0x80); byte(72, 1);
    expect(lcd.state.lines[0].slice(0, 2)).toBe('H ');
  });
});
