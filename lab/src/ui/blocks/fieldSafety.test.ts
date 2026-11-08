import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generate, cStringLiteral } from './generate';
import { CUSTOM_BLOCKS } from './defs';
import { hasFieldRule, readBlockField } from '../../core/blockFields';
import { workspace, type N } from './build';

const codeFor = (node: N) => generate(workspace([{ type: 'lab_loop', do: { DO: [node] } }]));
const expr = (node: N) => codeFor({ type: 'lab_serial_print', in: { VALUE: node } });

describe('untrusted fields cannot inject source', () => {
  it.each([
    ['lab_digital_write', 'STATE', 'HIGH', false],
    ['lab_digital_write', 'PIN', '13', false],
    ['lab_pwm_write', 'PIN', '3', false],
    ['lab_analog_read', 'PIN', 'A0', true],
    ['lab_keypad', 'ROWS', '2', true],
    ['lab_keypad', 'COLS', '6', true],
    ['lab_seg_digit', 'START', '2', false],
    ['lab_pixel_color', 'COLOUR', '#ff0000', false],
    ['math_number', 'NUM', 0, true],
    ['logic_boolean', 'BOOL', 'TRUE', true],
    ['math_arithmetic', 'OP', 'ADD', true],
    ['math_single', 'OP', 'ABS', true],
    ['math_round', 'OP', 'ROUND', true],
    ['logic_compare', 'OP', 'EQ', true],
    ['logic_operation', 'OP', 'AND', true],
    ['controls_whileUntil', 'MODE', 'WHILE', false],
    ['controls_flow_statements', 'FLOW', 'BREAK', false],
    ['text', 'TEXT', '', true],
  ] as const)('%s.%s falls back with a warning', (type, field, fallback, expression) => {
    const run = expression ? expr : codeFor;
    const attack = field === 'TEXT' ? { payload: 'evil();' } : 'HIGH); evil(); //';
    const result = run({ type, fields: { [field]: attack } } as N);
    expect(result.code).toBe(run({ type, fields: { [field]: fallback } }).code);
    expect(result.warnings.join()).toMatch(/필드|값/);
  });
  // Names are free text now (the editor lets a student type any of them): they may only ever appear inside one-line comments.
  const inertNames = ['x\nevil();', 'x*/evil();', 'x\\', 'x??/', 'x//evil();', 'x\u2028evil();', 'x\u202eevil();'];
  const insideComments = (code: string) => code.split('\n').every(line =>
    !line.includes('evil') || (line.indexOf('//') >= 0 && line.indexOf('//') < line.indexOf('evil')));
  it.each(inertNames)('hostile names stay inside one-line comments: %j', name => {
    const { code } = generate(workspace([
      { type: 'procedures_defnoreturn', fields: { NAME: name } },
      { type: 'lab_loop', do: { DO: [
        { type: 'variables_set', fields: { VAR: { name } }, in: { VALUE: 1 } },
        { type: 'procedures_callnoreturn', extra: { name, params: [] } },
      ] } },
    ]));
    expect(insideComments(code)).toBe(true);
    expect(code).not.toMatch(/\\$|\?\?\//m);
    expect(code).toMatch(/^void f_1\(\);$/m);
    expect(code).toMatch(/^int v_1 = 0;/m);
  });
  it.each(['Infinity', '1e999', '0x10', '1;evil()', {}, true])('rejects invalid numbers %j', NUM => {
    const result = expr({ type: 'math_number', fields: { NUM } } as N);
    expect(result.code).toBe(expr({ type: 'math_number', fields: { NUM: 0 } }).code);
    expect(result.warnings.join()).toMatch(/필드|값/);
  });
});

// Decode C escapes as bytes independently, including octal digit boundaries.
function decodeLiteral(literal: string): string {
  const bytes: number[] = [];
  const body = literal.slice(1, -1);
  for (let i = 0; i < body.length;) {
    if (body[i] !== '\\') {
      const ch = String.fromCodePoint(body.codePointAt(i)!);
      bytes.push(...new TextEncoder().encode(ch)); i += ch.length; continue;
    }
    const rest = body.slice(++i);
    const octal = /^[0-7]{1,3}/.exec(rest)?.[0];
    if (octal) { bytes.push(parseInt(octal, 8)); i += octal.length; }
    else { const ch = body[i++]!; bytes.push(({ n: 10, r: 13, t: 9 } as Record<string, number>)[ch] ?? ch.charCodeAt(0)); }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}


describe('all custom field definitions share generation validation', () => {
  for (const block of CUSTOM_BLOCKS) for (const field of block.args0 ?? []) {
    if (field.type !== 'field_dropdown' && field.type !== 'field_colour') continue;
    const name = String(field.name);
    it(`${block.type}.${name} rejects injection byte-identically`, () => {
      const fallback = readBlockField(block.type, name, undefined).value;
      const run = block.output !== undefined ? expr : codeFor;
      const bad = run({ type: block.type, fields: { [name]: '2); evil(); //' } });
      expect(bad.code).toBe(run({ type: block.type, fields: { [name]: fallback } }).code);
      expect(bad.warnings.join()).toMatch(/필드/);
    });
  }
});

describe('C string literals preserve data without creating source', () => {
  it.each(['\\"\n\r\t\0' + '123', '??/\n??= ??! ??\'', '한글 😀 */ // evil();',
    Array.from({ length: 160 }, (_, n) => String.fromCharCode(n)).join('')])('round trips %j', text => {
    const literal = cStringLiteral(text);
    expect(decodeLiteral(literal)).toBe(text);
    expect(literal.slice(1, -1)).not.toMatch(/[\x00-\x1f\x7f-\x9f]/);
    expect(literal).not.toContain('??');
    expect(expr({ type: 'text', fields: { TEXT: text } }).code).toContain(`Serial.print(${literal});`);
  });
  it('does not spill text expressions out of generated comments', () => {
    const result = codeFor({ type: 'lab_every', in: { MS: { type: 'text', fields: { TEXT: '*/\n??/\\' } } } });
    expect(result.code.split('\n').filter(line => line.includes('//')).join('\n')).not.toMatch(/\*\/|\?\?|\\$/m);
  });
  it.each(['8);evil();//', Infinity, -1, 1.5])('guards scene-derived generator options %j', value => {
    const state = workspace([{ type: 'lab_loop', do: { DO: [{ type: 'lab_pixel_show' }, { type: 'lab_lcd_clear' }] } }]);
    const bad = generate(state, { pixelCount: value, lcdAddress: value } as never);
    expect(bad.code).toBe(generate(state, { pixelCount: 8, lcdAddress: 0x27 }).code);
    expect(bad.warnings.join()).toMatch(/값/);
  });
});

it.each([['\0', '\\000'], ['\b', '\\010'], ['\x7f', '\\177'], ["'", "\\'"]])('keeps one-byte text comparable to serial/keypad chars: %j', (text, escaped) => {
  const result = expr({ type: 'logic_compare', fields: { OP: 'EQ' }, in: {
    A: { type: 'lab_serial_read' }, B: { type: 'text', fields: { TEXT: text } },
  } });
  expect(result.code).toContain(`(char)Serial.read() == '${escaped}'`);
});

it.each(['bad\nevil()', 'bad*/evil()', 'bad\\name', 'x'.repeat(100)])('workspace and parameter names are only comment text: %j', hostile => {
  const { code, warnings } = generate({
    variables: [{ id: 'v', name: hostile }],
    blocks: { blocks: [
      { type: 'procedures_defnoreturn', fields: { NAME: 'fnSafe' }, extraState: { params: [{ name: hostile, id: 'p' }] } },
      { type: 'lab_loop', inputs: { DO: { block: { type: 'variables_set', fields: { VAR: { id: 'v' } }, inputs: { VALUE: { block: { type: 'math_number', fields: { NUM: 1 } } } } } } } },
    ] },
  });
  expect(warnings).toEqual([]);
  expect(code.split('\n').every(line => !line.includes('evil') || (line.indexOf('//') >= 0 && line.indexOf('//') < line.indexOf('evil')))).toBe(true);
  expect(code).toMatch(/^int v_\w+ = 1?0?;/m);
});

it.each([null, 42, true, { payload: 'evil();' }])('validates function-call and parameter metadata names %j', name => {
  const run = (value: unknown) => generate({ blocks: { blocks: [
    { type: 'procedures_defreturn', fields: { NAME: 'fnSafe' }, extraState: { params: [{ name: value }] } },
    { type: 'lab_loop', inputs: { DO: { block: { type: 'lab_serial_print', inputs: { VALUE: { block: {
      type: 'procedures_callreturn', extraState: { name: value, params: [] },
    } } } } } } },
  ] } });
  expect(run(name).code).toBe(run('이름 없음').code);
  expect(run(name).warnings.join()).toMatch(/이름/);
});

describe('every field the generator reads has a validation rule', () => {
  // g.field(b, 'X') / g.pin(b, 'X') inside the handler tables must have a rule in blockFields.ts, or the field would reach
  // generated code unvalidated (readBlockField reports an unknown field as invalid and the generator falls back with a warning).
  const source = readFileSync(new URL('./generate.ts', import.meta.url), 'utf8');
  const handlers = [...source.matchAll(/^  (\w+): \(g(?:, b)?\) =>/gm)];
  it('finds the handlers', () => expect(handlers.length).toBeGreaterThan(40));
  it('has a rule for each g.field / g.pin name, per block type', () => {
    const missing: string[] = [];
    handlers.forEach((h, i) => {
      const body = source.slice(h.index!, handlers[i + 1]?.index ?? source.indexOf('\nfunction call('));
      for (const m of body.matchAll(/g\.(?:field|pin)\(b, '(\w+)'/g)) {
        if (!hasFieldRule(h[1]!, m[1]!)) missing.push(`${h[1]}.${m[1]}`);
      }
    });
    expect(missing).toEqual([]);
  });
});

describe('cStringLiteral hides nothing a reader cannot see', () => {
  it.each([
    ['bidi controls', '\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\u200e\u200f\u061c'],
    ['zero-width characters', 'a\u200b\u200c\u200d\u2060\ufeffb'],
    ['line separators', 'a\u2028b\u2029c'],
    ['a lone surrogate', 'a\ud800b\udfffc'],
  ])('escapes %s', (_name, text) => {
    const literal = cStringLiteral(text);
    expect(literal).not.toMatch(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\u061c\ufeff\u2028\u2029\ud800-\udfff]/);
    expect(literal).toMatch(/^"(?:\\[0-7]{3}|[a-c])+"$/);
  });
  it('writes a backslash as octal so "C:\\users" can never read as a universal character name', () => {
    expect(cStringLiteral('C:\\users\\u00e9')).toBe('"C:\\134users\\134u00e9"');
  });
  it.each([['a tag character', '\u{E0041}'], ['a variation selector supplement', '\u{E0100}'], ['a variation selector', '\uFE01'], ['both', 'x\u{E0041}y\u{E0100}z']])('escapes %s in literals and blanks it in comments', (_n, text) => {
    const literal = cStringLiteral(text);
    expect(literal).not.toMatch(/[\uFE00-\uFE0E\u{E0000}-\u{E01EF}]/u);
    expect(decodeLiteral(literal)).toBe(text);
    const { code } = codeFor({ type: 'lab_every', in: { MS: { type: 'text', fields: { TEXT: text } } } });
    expect(code).not.toMatch(/[\uFE00-\uFE0E\u{E0000}-\u{E01EF}]/u);
  });
  it('a ZWJ family emoji round-trips byte-identically in literals', () => {
    const family = '👨\u200d👩\u200d👧';
    expect(decodeLiteral(cStringLiteral(family))).toBe(family);
    expect(decodeLiteral(cStringLiteral('a😀b'))).toBe('a😀b');
  });
  it('keeps the emoji presentation selector: ❤️ stays intact in literals and comments', () => {
    expect(decodeLiteral(cStringLiteral('❤\uFE0F'))).toBe('❤\uFE0F');
    expect(cStringLiteral('❤\uFE0F')).toContain('\uFE0F');
    const { code } = codeFor({ type: 'lab_every', in: { MS: { type: 'text', fields: { TEXT: '❤\uFE0F' } } } });
    expect(code).toContain('❤\uFE0F');
  });
  it('keeps an emoji intact in literals and comments', () => {
    expect(cStringLiteral('a😀b')).toBe('"a😀b"');
    const { code } = codeFor({ type: 'lab_every', in: { MS: { type: 'text', fields: { TEXT: '😀' } } } });
    expect(code).toContain('😀');
  });
  it('blanks the same characters in comments', () => {
    const { code } = codeFor({ type: 'lab_every', in: { MS: { type: 'text', fields: { TEXT: 'a\u202eb\u200bc\u2028d' } } } });
    expect(code).not.toMatch(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\u061c\ufeff\u2028\u2029]/);
  });
});
