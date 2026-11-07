import type { Analysis, PartInstance } from './types';
import { PARTS } from './parts';
import { pinWorldPos } from './geometry';

const cache = new WeakMap<PartInstance[], { placement: string; insertions: Analysis['insertions'] }>();
const isSocket = (part: PartInstance) => part.kind === 'arduino-uno' || part.kind.startsWith('breadboard-');

/** Share the expensive socket scan between store analysis and scene comparison.
 * Document wrappers change while their parts array is retained. The placement
 * signature also protects callers that mutate a scene in place (e.g. imports/tests).
 */
export function socketInsertions(parts: PartInstance[]): Analysis['insertions'] {
  const placement = JSON.stringify(parts.map(part => [part.id, part.kind, part.pos, part.rotY]));
  let entry = cache.get(parts);
  if (!entry || entry.placement !== placement) {
    const insertions: Analysis['insertions'] = {};
    const sockets = parts.filter(isSocket).flatMap(part => PARTS[part.kind].pins.map(pin => ({
      ref: { partId: part.id, pinId: pin.id }, pos: pinWorldPos(part, pin.id),
    })));
    for (const part of parts.filter(part => !isSocket(part))) {
      for (const pin of PARTS[part.kind].pins) {
        const pos = pinWorldPos(part, pin.id);
        let best: typeof sockets[number] | undefined;
        let nearest = 0.600000001;
        for (const socket of sockets) {
          const d = Math.hypot(pos[0] - socket.pos[0], pos[2] - socket.pos[2]);
          if (d <= nearest && pos[1] >= socket.pos[1] - 1e-9) {
            best = socket;
            nearest = d;
          }
        }
        if (best) insertions[`${part.id}:${pin.id}`] = best.ref;
      }
    }
    entry = { placement, insertions };
    cache.set(parts, entry);
  }
  // Analysis is public/mutable; never expose the cached map or its pin references.
  return Object.fromEntries(Object.entries(entry.insertions).map(([pin, socket]) => [pin, { ...socket }]));
}
