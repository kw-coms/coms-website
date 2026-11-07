import { describe, expect, it } from 'vitest';
import { fmtOhms, fmtVolts } from './format';

describe('format', () => {
  it('formats ohms', () => {
    expect(fmtOhms(220)).toBe('220Ω');
    expect(fmtOhms(4700)).toBe('4.7kΩ');
    expect(fmtOhms(1e6)).toBe('1MΩ');
    expect(fmtOhms(0.5)).toBe('0.5Ω');
  });
  it('formats volts without negative zero', () => {
    expect(fmtVolts(4.987)).toBe('4.99 V');
    expect(fmtVolts(-0.0001)).toBe('0.00 V');
  });
});
