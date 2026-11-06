// Pure undo/redo reducer. `present` is replaced on commit; past is capped.
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}
export const HISTORY_LIMIT = 100;

export const initHistory = <T,>(present: T): History<T> => ({ past: [], present, future: [] });

export function commit<T>(h: History<T>, next: T, limit = HISTORY_LIMIT): History<T> {
  if (Object.is(next, h.present)) return h;
  return { past: [...h.past, h.present].slice(-limit), present: next, future: [] };
}
export function undo<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1];
  if (prev === undefined) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}
export function redo<T>(h: History<T>): History<T> {
  const next = h.future[0];
  if (next === undefined) return h;
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
}
