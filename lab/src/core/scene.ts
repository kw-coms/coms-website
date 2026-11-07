import { PARTS } from './parts';
import type { PartInstance, PinRef, Scene } from './types';

const WIRE_COLORS = new Set(['red', 'black', 'blue', 'green', 'yellow', 'orange', 'white', 'purple', 'gray']);
const FORBIDDEN_IDS = new Set(['__proto__', 'constructor', 'prototype']);

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isVec3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(
    coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate) && Math.abs(coordinate) <= 1e5,
  );
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}

/** Ids of parts and wires become object keys: a short allowlist, and never the names that reach Object.prototype. */
export function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) && !FORBIDDEN_IDS.has(value);
}

function invalid(message: string): never {
  throw new Error(message);
}

/**
 * Blockly workspace JSON limits. A chain of N stacked blocks nests ~2N JSON levels (`next.block.next.block...`),
 * so 1,000 levels allows ~450 stacked blocks; real programs have a few dozen blocks in total.
 */
export const MAX_BLOCKS = 5000;
const MAX_BLOCKS_JSON_DEPTH = 1000;

function validBlocks(value: unknown): boolean {
  const seen = new Set<object>();
  const visit = (entry: unknown, depth: number): boolean => {
    if (depth > MAX_BLOCKS_JSON_DEPTH) return false;
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return true;
    if (typeof entry === 'number') return Number.isFinite(entry);
    if (typeof entry !== 'object' || seen.has(entry)) return false;
    if (!Array.isArray(entry) && (Object.getPrototypeOf(entry) !== Object.prototype && Object.getPrototypeOf(entry) !== null)) return false;
    seen.add(entry);
    const valid = Object.entries(entry).every(([key, child]) =>
      !FORBIDDEN_IDS.has(key) && visit(child, depth + 1));
    seen.delete(entry);
    return valid;
  };
  try {
    return visit(value, 0) && new TextEncoder().encode(JSON.stringify(value)).length <= 256 * 1024;
  } catch {
    return false;
  }
}

/** Shape check on top of validBlocks (which already bounded the depth, so this iterative walk is cheap): what Blockly's loader and the generator will touch. */
function validBlockShape(state: unknown): boolean {
  if (!isObject(state)) return false;
  const ws = state.blocks;
  if (ws !== undefined && (!isObject(ws) || (ws.blocks !== undefined && !Array.isArray(ws.blocks)))) return false;
  if (state.variables !== undefined && (!Array.isArray(state.variables) || state.variables.length > 1000 ||
      !state.variables.every(v => isObject(v) && (v.id === undefined || typeof v.id === 'string') && (v.name === undefined || typeof v.name === 'string')))) return false;
  const todo: unknown[] = isObject(ws) && Array.isArray(ws.blocks) ? [...ws.blocks] : [];
  for (let n = 0; todo.length; n++) {
    const b = todo.pop();
    // `in Object.prototype` rejects "constructor", "toString", "__proto__" ... as block types
    if (n >= MAX_BLOCKS || !isObject(b) || typeof b.type !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(b.type) || b.type in Object.prototype) return false;
    if (b.fields !== undefined && !isObject(b.fields)) return false;
    if (b.inputs !== undefined && !isObject(b.inputs)) return false;
    if (b.next !== undefined && !isObject(b.next)) return false;
    const slots = [...Object.values((b.inputs ?? {}) as object), b.next].filter(slot => slot !== undefined);
    for (const slot of slots) {
      if (!isObject(slot)) return false;
      for (const child of [slot.block, slot.shadow]) if (child !== undefined) todo.push(child);
    }
  }
  return true;
}

/** Validate untrusted imported scenes before analysis or rendering. */
export function validateScene(value: unknown): Scene {
  if (!isObject(value) || !hasOnlyKeys(value, ['version', 'title', 'parts', 'wires', 'code', 'blocks', 'codeMode', 'notes', 'mission']) ||
      (value.version !== 1 && value.version !== 2) || !Array.isArray(value.parts) || !Array.isArray(value.wires) ||
      typeof value.code !== 'string') {
    invalid('장면 형식이 올바르지 않습니다.');
  }
  if (value.parts.length > 300 || value.wires.length > 600) {
    invalid('부품 또는 전선 개수 제한을 초과했습니다.');
  }
  if (new TextEncoder().encode(value.code).length > 64 * 1024) {
    invalid('코드는 64 KB 이하이어야 합니다.');
  }
  if (value.title !== undefined && (typeof value.title !== 'string' || value.title.length > 200)) {
    invalid('장면 제목이 올바르지 않습니다.');
  }
  if (value.blocks !== undefined && !validBlocks(value.blocks)) invalid('블록 데이터는 올바른 JSON이며 256 KB 이하, 1,000단계 이하의 깊이이어야 합니다.');
  if (value.blocks !== undefined && !validBlockShape(value.blocks)) invalid(`블록 구조가 올바르지 않습니다. 블록 종류는 문자열이어야 하고, 블록은 ${MAX_BLOCKS.toLocaleString('ko-KR')}개 이하여야 합니다.`);
  if (value.codeMode !== undefined && !['blocks', 'blocks+text', 'text'].includes(value.codeMode as string)) {
    invalid('코드 모드가 올바르지 않습니다.');
  }
  if (value.mission !== undefined && !isSafeId(value.mission)) invalid('미션 ID가 올바르지 않습니다.');
  if (value.notes !== undefined) {
    if (!Array.isArray(value.notes) || value.notes.length > 100) invalid('메모는 100개 이하이어야 합니다.');
    const ids = new Set<string>();
    for (const note of value.notes) {
      if (!isObject(note) || !hasOnlyKeys(note, ['id', 'pos', 'text', 'color']) ||
          !isSafeId(note.id) || ids.has(note.id) || !isVec3(note.pos) ||
          typeof note.text !== 'string' || note.text.length > 500 ||
          (note.color !== undefined && !['yellow', 'blue', 'green', 'pink'].includes(note.color as string))) {
        invalid('메모 정보가 올바르지 않습니다.');
      }
      ids.add(note.id);
    }
  }

  const parts = new Map<string, PartInstance>();
  for (const candidate of value.parts) {
    if (!isObject(candidate) || !hasOnlyKeys(candidate, ['id', 'kind', 'pos', 'rotY', 'props']) ||
        !isSafeId(candidate.id) || parts.has(candidate.id) || typeof candidate.kind !== 'string' ||
        !Object.hasOwn(PARTS, candidate.kind) || !isVec3(candidate.pos) ||
        ![0, 90, 180, 270].includes(candidate.rotY as number) || !isObject(candidate.props)) {
      invalid('부품 정보가 올바르지 않습니다.');
    }
    const definition = PARTS[candidate.kind as keyof typeof PARTS];
    for (const [key, propertyValue] of Object.entries(candidate.props)) {
      const property = definition.props.find(item => item.key === key);
      const wrongType = property && property.type !== 'enum' &&
        typeof propertyValue !== (property.type === 'boolean' ? 'boolean' : 'number');
      const invalidNumber = typeof propertyValue === 'number' &&
        (!Number.isFinite(propertyValue) ||
         (property?.min !== undefined && propertyValue < property.min) ||
         (property?.max !== undefined && propertyValue > property.max) ||
         (candidate.kind === 'neopixel-strip' && key === 'count' && !Number.isInteger(propertyValue)));
      const invalidChoice = property?.type === 'enum' && property.options &&
        !property.options.some(option => option.value === propertyValue);
      if (!property || wrongType || invalidNumber || invalidChoice) {
        invalid(`${candidate.id}의 속성 ${key} 값이 올바르지 않습니다.`);
      }
    }
    parts.set(candidate.id, candidate as unknown as PartInstance);
  }

  const validPin = (candidate: unknown): candidate is PinRef => {
    if (!isObject(candidate) || !hasOnlyKeys(candidate, ['partId', 'pinId']) ||
        typeof candidate.partId !== 'string' || typeof candidate.pinId !== 'string') return false;
    const part = parts.get(candidate.partId);
    return !!part && PARTS[part.kind].pins.some(pin => pin.id === candidate.pinId);
  };
  const wireIds = new Set<string>();
  for (const wire of value.wires) {
    if (!isObject(wire) || !hasOnlyKeys(wire, ['id', 'from', 'to', 'color', 'bends']) ||
        !isSafeId(wire.id) || wireIds.has(wire.id) || !validPin(wire.from) || !validPin(wire.to) ||
        !WIRE_COLORS.has(wire.color as string) ||
        (wire.bends !== undefined && (!Array.isArray(wire.bends) || wire.bends.length > 20 ||
                                      !wire.bends.every(isVec3)))) {
      invalid('전선 정보 또는 핀 참조가 올바르지 않습니다.');
    }
    wireIds.add(wire.id);
  }
  return value.version === 1
    ? { ...(value as unknown as Scene), version: 2, codeMode: value.codeMode as Scene['codeMode'] ?? 'text' }
    : value as unknown as Scene;
}
