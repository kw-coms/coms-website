import { describe, expect, it } from 'vitest';
import { countByLevel, groupWarnings, visibleWarnings } from './warnings';

const w = (id: string, level: 'error' | 'warn' | 'info', partId?: string) => ({ id, level, partId, message: id });
describe('warnings', () => {
  it('drops unconnected pins on boards but keeps them on other parts', () => {
    const kinds: Record<string, 'arduino-uno' | 'led'> = { u: 'arduino-uno', l: 'led' };
    const out = visibleWarnings([w('unconnected:u:D3', 'info', 'u'), w('unconnected:l:anode', 'info', 'l'), w('hard-short:u', 'error', 'u'), w('hard-short:u', 'error', 'u')], (id) => kinds[id]);
    expect(out.map((x) => x.id)).toEqual(['unconnected:l:anode', 'hard-short:u']);
  });
  it('groups by part, worst level first, and counts', () => {
    const list = [w('a', 'info', 'p1'), w('b', 'error', 'p2'), w('c', 'warn', 'p1')];
    const g = groupWarnings(list);
    expect(g.map((x) => x.partId)).toEqual(['p2', 'p1']);
    expect(g[1]!.items).toHaveLength(2);
    expect(countByLevel(list)).toEqual({ error: 1, warn: 1, info: 1 });
  });
});
