import { describe, expect, it } from 'vitest';
import { LineBuffer, parseLine } from './plotter';

describe('plotter', () => {
  it('splits on space, comma and tab', () => {
    expect(parseLine('1 2.5\t-3,4')?.values).toEqual([1, 2.5, -3, 4]);
  });
  it('reads named series and caps at 6', () => {
    const s = parseLine('a:1,b:2,3,4,5,6,7,8')!;
    expect(s.names.slice(0, 3)).toEqual(['a', 'b', null]);
    expect(s.values.length).toBe(6);
  });
  it('rejects text lines', () => {
    expect(parseLine('Hello')).toBeNull();
    expect(parseLine('1 x')).toBeNull();
    expect(parseLine('   ')).toBeNull();
  });
  it('buffers partial lines', () => {
    const b = new LineBuffer();
    expect(b.push('12')).toEqual([]);
    expect(b.push('3\r\n45\n6')).toEqual(['123', '45']);
    expect(b.push('\n')).toEqual(['6']);
  });
});
