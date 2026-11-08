import { CUSTOM_BLOCKS } from '../ui/blocks/defs';

type FieldRule = { kind: 'enum'; values: readonly string[]; fallback: string }
  | { kind: 'number'; fallback: string }
  | { kind: 'colour'; fallback: string }
  | { kind: 'text'; fallback: string }
  | { kind: 'name'; fallback: string }
  | { kind: 'variable'; fallback: string };

const rules: Record<string, Record<string, FieldRule>> = Object.create(null);
const field = (type: string, name: string, rule: FieldRule) => { (rules[type] ??= Object.create(null))[name] = rule; };
const choice = (values: string[], fallback = values[0]!): FieldRule => ({ kind: 'enum', values, fallback });

// Custom dropdowns are sourced from the editor's definitions, so adding a new option
// changes the validator and the generated-code allowlist together.
for (const block of CUSTOM_BLOCKS) for (const arg of block.args0 ?? []) {
  if (arg.type === 'field_dropdown' && typeof arg.name === 'string' && Array.isArray(arg.options)) {
    const values = (arg.options as unknown[]).map(option => Array.isArray(option) ? option[1] : undefined)
      .filter((value): value is string => typeof value === 'string');
    field(block.type, arg.name, choice(values));
  } else if (arg.type === 'field_colour' && typeof arg.name === 'string') {
    field(block.type, arg.name, { kind: 'colour', fallback: '#ff0000' });
  }
}

field('lab_digital_write', 'PIN', choice((rules.lab_digital_write!.PIN as Extract<FieldRule, { kind: 'enum' }>).values.slice(), '13'));
field('lab_keypad', 'COLS', choice((rules.lab_keypad!.COLS as Extract<FieldRule, { kind: 'enum' }>).values.slice(), '6'));

for (const [type, name, values, fallback] of [
  ['controls_whileUntil', 'MODE', ['WHILE', 'UNTIL'], 'WHILE'],
  ['controls_flow_statements', 'FLOW', ['BREAK', 'CONTINUE'], 'BREAK'],
  ['math_arithmetic', 'OP', ['ADD', 'MINUS', 'MULTIPLY', 'DIVIDE', 'POWER'], 'ADD'],
  ['math_single', 'OP', ['ROOT', 'ABS', 'NEG', 'LN', 'LOG10', 'EXP', 'POW10'], 'ABS'],
  ['math_round', 'OP', ['ROUND', 'ROUNDUP', 'ROUNDDOWN'], 'ROUND'],
  ['logic_boolean', 'BOOL', ['TRUE', 'FALSE'], 'TRUE'],
  ['logic_compare', 'OP', ['EQ', 'NEQ', 'LT', 'LTE', 'GT', 'GTE'], 'EQ'],
  ['logic_operation', 'OP', ['AND', 'OR'], 'AND'],
] as const) field(type, name, choice([...values], fallback));

field('math_number', 'NUM', { kind: 'number', fallback: '0' });
field('text', 'TEXT', { kind: 'text', fallback: '' });
for (const type of ['variables_get', 'variables_set', 'math_change', 'controls_for'])
  field(type, 'VAR', { kind: 'variable', fallback: '이름 없음' });
for (const type of ['procedures_defnoreturn', 'procedures_defreturn', 'procedures_callnoreturn', 'procedures_callreturn'])
  field(type, 'NAME', { kind: 'name', fallback: '이름 없음' });

/** Longest TEXT field the importer accepts (the generated code has its own 64 KB cap). */
export const MAX_TEXT_FIELD = 2000;
/**
 * Names (variables, functions, parameters) are free text the editor itself lets students type ("눌렸나?", "a\\b"), so import
 * checks only type and length. What reaches generated code is neutralized there: comments by commentText, identifiers by
 * being derived from a counter or a plain [A-Za-z0-9_] name, never from the raw text.
 */
export const isValidName = (value: unknown): value is string => typeof value === 'string' && value.length <= 100;

/** Canonical decimal representation; only a finite decimal/exponent token produced by Number reaches C++. */
function canonicalNumber(value: unknown): string | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value);
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? String(Object.is(number, -0) ? 0 : number) : null;
}

/** True when the importer and generator know this field. */
export const hasFieldRule = (type: string, name: string): boolean =>
  Object.prototype.hasOwnProperty.call(rules, type) && rules[type]![name] !== undefined;

/** The generator uses the fallback; import validation rejects the same invalid value. */
export function readBlockField(type: string, name: string, value: unknown): { value: string; valid: boolean } {
  const rule = Object.prototype.hasOwnProperty.call(rules, type) ? rules[type]![name] : undefined;
  if (!rule) return { value: '', valid: false };
  if (value === undefined) return { value: rule.fallback, valid: true };
  switch (rule.kind) {
    case 'enum': return typeof value === 'string' && rule.values.includes(value)
      ? { value, valid: true } : { value: rule.fallback, valid: false };
    case 'number': { const n = canonicalNumber(value); return n === null
      ? { value: rule.fallback, valid: false } : { value: n, valid: true }; }
    case 'colour': return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
      ? { value, valid: true } : { value: rule.fallback, valid: false };
    case 'text': return typeof value === 'string' && value.length <= MAX_TEXT_FIELD
      ? { value, valid: true } : { value: rule.fallback, valid: false };
    case 'name': return isValidName(value)
      ? { value, valid: true } : { value: rule.fallback, valid: false };
    case 'variable': {
      const nameValue = typeof value === 'string' ? value : value && typeof value === 'object' && !Array.isArray(value)
        ? (value as { name?: unknown }).name : undefined;
      const id = value && typeof value === 'object' && !Array.isArray(value) ? (value as { id?: unknown }).id : undefined;
      const valid = (nameValue === undefined || isValidName(nameValue)) &&
        (id === undefined || typeof id === 'string' && id.length <= 100) &&
        (nameValue !== undefined || typeof id === 'string' && id.length > 0);
      return valid ? { value: String(nameValue ?? id), valid: true } : { value: rule.fallback, valid: false };
    }
  }
}

export function blockFieldsProblem(type: string, fields: unknown): string | null {
  if (fields === undefined) return null;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return '블록 필드가 올바르지 않습니다.';
  for (const [name, value] of Object.entries(fields)) {
    if (!readBlockField(type, name, value).valid) return `블록 필드 값이 올바르지 않습니다. (${type}.${name})`;
  }
  return null;
}
