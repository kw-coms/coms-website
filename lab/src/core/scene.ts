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

/** Validate untrusted imported scenes before analysis or rendering. */
export function validateScene(value: unknown): Scene {
  if (!isObject(value) || !hasOnlyKeys(value, ['version', 'title', 'parts', 'wires', 'code']) ||
      value.version !== 1 || !Array.isArray(value.parts) || !Array.isArray(value.wires) ||
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
  return value as unknown as Scene;
}
