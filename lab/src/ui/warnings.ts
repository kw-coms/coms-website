import type { PartKind, SimWarning } from '../core/types';

type Level = SimWarning['level'];
export const LEVEL_RANK: Record<Level, number> = { error: 3, warn: 2, info: 1 };
export const LEVEL_LABEL: Record<Level, string> = { error: '오류', warn: '경고', info: '안내' };

/** Pins that simply have nothing connected (UNO headers, breadboard holes) are normal, not warnings. */
const IDLE_PIN = /^(unconnected|floating)/;
const BOARDS = (k?: PartKind) => k === 'arduino-uno' || !!k?.startsWith('breadboard');

export function visibleWarnings(all: SimWarning[], kindOf: (partId: string) => PartKind | undefined): SimWarning[] {
  const seen = new Set<string>();
  return all.filter((w) => {
    if (seen.has(w.id)) return false;
    seen.add(w.id);
    return !(IDLE_PIN.test(w.id) && BOARDS(w.partId ? kindOf(w.partId) : undefined));
  });
}

export interface WarningGroup {
  partId?: string;
  items: SimWarning[];
  worst: Level;
}
/** One group per part (most severe first); warnings without a part go in a trailing group. */
export function groupWarnings(list: SimWarning[]): WarningGroup[] {
  const m = new Map<string, WarningGroup>();
  for (const w of list) {
    const key = w.partId ?? '';
    const g = m.get(key) ?? { partId: w.partId, items: [], worst: 'info' as Level };
    g.items.push(w);
    if (LEVEL_RANK[w.level] > LEVEL_RANK[g.worst]) g.worst = w.level;
    m.set(key, g);
  }
  return [...m.values()].sort((a, b) => LEVEL_RANK[b.worst] - LEVEL_RANK[a.worst] || (a.partId ? 0 : 1) - (b.partId ? 0 : 1));
}
export function countByLevel(list: SimWarning[]): Record<Level, number> {
  const c = { error: 0, warn: 0, info: 0 };
  for (const w of list) c[w.level]++;
  return c;
}
