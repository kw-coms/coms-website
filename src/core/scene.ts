import { PARTS } from './parts';
import type { Scene, PartInstance, PinRef } from './types';

const object = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const vec3 = (x: unknown): x is [number, number, number] => Array.isArray(x) && x.length === 3 && x.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e5);
const fail = (message: string): never => { throw new Error(message); };
const allowed = (x: Record<string, unknown>, keys: readonly string[]) => Object.keys(x).every(key => keys.includes(key));
const safeId = (id: unknown): id is string => typeof id === 'string' && /^[\w-]{1,80}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
const colors = new Set(['red', 'black', 'blue', 'green', 'yellow', 'orange', 'white', 'purple', 'gray']);

/** Validate untrusted imported scenes before analysis or rendering. */
export function validateScene(x: unknown): Scene {
  if (!object(x)) throw new Error('장면 형식이 올바르지 않습니다.');
  if (!allowed(x, ['version', 'title', 'parts', 'wires', 'code']) || x.version !== 1 || !Array.isArray(x.parts) || !Array.isArray(x.wires) || typeof x.code !== 'string') throw new Error('장면 형식이 올바르지 않습니다.');
  if (x.parts.length > 300 || x.wires.length > 600) fail('부품 또는 전선 개수 제한을 초과했습니다.');
  if (new TextEncoder().encode(x.code).length > 65536) fail('코드는 64 KB 이하이어야 합니다.');
  if (x.title !== undefined && (typeof x.title !== 'string' || x.title.length > 200)) fail('장면 제목이 올바르지 않습니다.');
  const parts = new Map<string, PartInstance>();
  for (const p of x.parts) {
    if (!object(p) || !allowed(p, ['id', 'kind', 'pos', 'rotY', 'props']) || !safeId(p.id) || parts.has(p.id) || typeof p.kind !== 'string' || !Object.hasOwn(PARTS, p.kind) || !vec3(p.pos) || ![0,90,180,270].includes(p.rotY as number) || !object(p.props)) fail('부품 정보가 올바르지 않습니다.');
    const def = PARTS[p.kind as keyof typeof PARTS];
    for (const [key, value] of Object.entries(p.props)) {
      const prop = def.props.find(d => d.key === key);
      if (!prop || (prop.type !== 'enum' && typeof value !== (prop.type === 'boolean' ? 'boolean' : 'number')) || (typeof value === 'number' && (!Number.isFinite(value) || (prop.min !== undefined && value < prop.min) || (prop.max !== undefined && value > prop.max))) || (prop.type === 'enum' && prop.options && !prop.options.some(o => o.value === value))) fail(`${p.id}의 속성 ${key} 값이 올바르지 않습니다.`);
    }
    parts.set(p.id, p as unknown as PartInstance);
  }
  const validRef = (r: unknown): r is PinRef => object(r) && allowed(r, ['partId', 'pinId']) && typeof r.partId === 'string' && typeof r.pinId === 'string' && !!parts.get(r.partId) && PARTS[parts.get(r.partId)!.kind].pins.some(pin => pin.id === r.pinId);
  const wireIds = new Set<string>();
  for (const w of x.wires) {
    if (!object(w) || !allowed(w, ['id', 'from', 'to', 'color', 'bends']) || !safeId(w.id) || wireIds.has(w.id) || !validRef(w.from) || !validRef(w.to) || !colors.has(w.color as string) || (w.bends !== undefined && (!Array.isArray(w.bends) || w.bends.length > 20 || !w.bends.every(vec3)))) fail('전선 정보 또는 핀 참조가 올바르지 않습니다.');
    wireIds.add(w.id);
  }
  return x as unknown as Scene;
}
