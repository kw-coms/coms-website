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

/**
 * The block types the toolbox offers (src/ui/blocks/defs.ts) and the generator handles (generate.ts HANDLED_TYPES);
 * generate.test.ts fails if the three drift apart. Anything else is refused before Blockly sees it.
 */
export const ALLOWED_BLOCK_TYPES: ReadonlySet<string> = new Set(
  ('controls_flow_statements controls_for controls_if controls_repeat_ext controls_whileUntil lab_analog_read lab_button lab_dht ' +
  'lab_digital_read lab_digital_write lab_every lab_ir lab_keypad lab_lcd_clear lab_lcd_cursor lab_lcd_print lab_loop lab_map ' +
  'lab_millis lab_no_tone lab_pixel_clear lab_pixel_color lab_pixel_rgb lab_pixel_show lab_pwm_write lab_seg_digit ' +
  'lab_serial_available lab_serial_print lab_serial_println lab_serial_read lab_serial_read_int lab_servo_write lab_setup ' +
  'lab_tmp36 lab_tone lab_tone_for lab_ultrasonic lab_wait logic_boolean logic_compare logic_negate logic_operation ' +
  'math_arithmetic math_change math_constrain math_modulo math_number math_random_int math_round math_single ' +
  'procedures_callnoreturn procedures_callreturn procedures_defnoreturn procedures_defreturn procedures_ifreturn ' +
  'text text_join text_length variables_get variables_set').split(' '));

/** Mutator sizes: Blockly allocates one input per item while loading, so these bound the work a crafted scene can ask for. */
export const MAX_TEXT_JOIN_ITEMS = 64;
export const MAX_ELSE_IFS = 32;
export const MAX_PROC_PARAMS = 32;
/** Sum of all mutator sizes in one workspace (real programs: a few dozen). */
export const MAX_MUTATION_TOTAL = 2000;

const isInt = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
const shortStr = (v: unknown): v is string => typeof v === 'string' && v.length <= 100;

/** extraState of one block against its type's schema. Returns the mutator size, or -1 when invalid. */
function mutationSize(type: string, es: unknown): number {
  if (es === undefined) return 0;
  switch (type) {
    case 'controls_if': {
      if (!isObject(es) || !hasOnlyKeys(es, ['elseIfCount', 'hasElse', 'elseif', 'else'])) return -1;
      const n = es.elseIfCount ?? es.elseif ?? 0;
      if (!isInt(n, MAX_ELSE_IFS) || (es.elseIfCount !== undefined && es.elseif !== undefined)) return -1;
      return [es.hasElse, es.else].every(v => v === undefined || typeof v === 'boolean') ? n : -1;
    }
    case 'text_join':
      return isObject(es) && hasOnlyKeys(es, ['itemCount']) && (es.itemCount === undefined || isInt(es.itemCount, MAX_TEXT_JOIN_ITEMS))
        ? (es.itemCount as number | undefined ?? 0) : -1;
    case 'procedures_defnoreturn':
    case 'procedures_defreturn': {
      if (!isObject(es) || !hasOnlyKeys(es, ['params', 'hasStatements']) ||
          (es.hasStatements !== undefined && typeof es.hasStatements !== 'boolean')) return -1;
      if (es.params === undefined) return 0;
      return Array.isArray(es.params) && es.params.length <= MAX_PROC_PARAMS &&
        es.params.every(p => isObject(p) && Object.values(p).every(shortStr) && hasOnlyKeys(p, ['name', 'id', 'argId', 'type']))
        ? es.params.length : -1;
    }
    case 'procedures_callnoreturn':
    case 'procedures_callreturn': {
      if (!isObject(es) || !hasOnlyKeys(es, ['name', 'params']) || (es.name !== undefined && !shortStr(es.name))) return -1;
      if (es.params === undefined) return 0;
      return Array.isArray(es.params) && es.params.length <= MAX_PROC_PARAMS && es.params.every(shortStr) ? es.params.length : -1;
    }
    case 'procedures_ifreturn':
      return typeof es === 'string' && /^<mutation value="[01]"><\/mutation>$/.test(es) ? 0 : -1;
    default:
      return -1; // every other block has no mutator
  }
}

/**
 * Shape check on top of validBlocks (which already bounded the depth, so this iterative walk is cheap): what Blockly's
 * loader and the generator will touch. Returns a Korean reason, or null when the workspace is acceptable.
 * BlocksEditor runs it again right before Blockly loads, so no path reaches the loader unchecked.
 */
export function blocksProblem(state: unknown): string | null {
  const bad = '블록 구조가 올바르지 않습니다.';
  if (!isObject(state)) return bad;
  const ws = state.blocks;
  if (ws !== undefined && (!isObject(ws) || (ws.blocks !== undefined && !Array.isArray(ws.blocks)))) return bad;
  if (state.variables !== undefined && (!Array.isArray(state.variables) || state.variables.length > 1000 ||
      !state.variables.every(v => isObject(v) && (v.id === undefined || typeof v.id === 'string') && (v.name === undefined || typeof v.name === 'string')))) return bad;
  const todo: unknown[] = isObject(ws) && Array.isArray(ws.blocks) ? [...ws.blocks] : [];
  let mutations = 0;
  for (let n = 0; todo.length; n++) {
    const b = todo.pop();
    if (n >= MAX_BLOCKS) return `블록은 ${MAX_BLOCKS.toLocaleString('ko-KR')}개 이하여야 합니다.`;
    if (!isObject(b) || typeof b.type !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(b.type) || b.type in Object.prototype) return bad;
    if (!ALLOWED_BLOCK_TYPES.has(b.type)) return `지원하지 않는 블록 종류입니다: ${b.type}`;
    const size = mutationSize(b.type, b.extraState);
    if (size < 0) return `블록 설정이 올바르지 않거나 너무 큽니다. (${b.type}: 문자열 항목 ${MAX_TEXT_JOIN_ITEMS}개, 그 외 가지·매개변수 ${MAX_ELSE_IFS}개 이하)`;
    mutations += size;
    if (mutations > MAX_MUTATION_TOTAL) return `블록 항목의 총합이 너무 큽니다. (${MAX_MUTATION_TOTAL.toLocaleString('ko-KR')}개 이하)`;
    if (b.fields !== undefined && !isObject(b.fields)) return bad;
    if (b.inputs !== undefined && !isObject(b.inputs)) return bad;
    if (b.next !== undefined && !isObject(b.next)) return bad;
    const slots = [...Object.values((b.inputs ?? {}) as object), b.next].filter(slot => slot !== undefined);
    for (const slot of slots) {
      if (!isObject(slot)) return bad;
      for (const child of [slot.block, slot.shadow]) if (child !== undefined) todo.push(child);
    }
  }
  return null;
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
  if (value.blocks !== undefined) {
    const problem = blocksProblem(value.blocks);
    if (problem) invalid(problem);
  }
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
