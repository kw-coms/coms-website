// Complete block programs: the generator must produce clean code for each, and when the compile
// service is running (127.0.0.1:8787, or LAB_COMPILE_URL) every program must compile with the real AVR toolchain.
import { beforeAll, describe, expect, it } from 'vitest';
import { workspace, type N } from './build';
import { generate } from './generate';
import { STARTER_BLOCKS } from './starters';
import { compileOrigin } from '../../../tools/compile-origin.mjs';

const loop = (...s: N[]): N => ({ type: 'lab_loop', do: { DO: s } });
const setup = (...s: N[]): N => ({ type: 'lab_setup', do: { DO: s } });
const wait = (ms: number): N => ({ type: 'lab_wait', fields: { UNIT: 'ms' }, in: { TIME: ms } });
const get = (v: string): N => ({ type: 'variables_get', fields: { VAR: v } });
const set = (v: string, value: N | number | string): N => ({ type: 'variables_set', fields: { VAR: v }, in: { VALUE: value } });
const println = (v: N | number | string): N => ({ type: 'lab_serial_println', in: { VALUE: v } });
const join = (...items: (N | number | string)[]): N => ({ type: 'text_join', extra: { itemCount: items.length }, in: Object.fromEntries(items.map((x, i) => [`ADD${i}`, x])) });
const cmp = (op: string, a: N | number | string, b: N | number | string): N => ({ type: 'logic_compare', fields: { OP: op }, in: { A: a, B: b } });
const when = (c: N, ...s: N[]): N => ({ type: 'controls_if', in: { IF0: c }, do: { DO0: s } });

export const PROGRAMS: Record<string, ReturnType<typeof workspace>> = {
  ...STARTER_BLOCKS,
  'lcd counter': workspace([
    setup({ type: 'lab_lcd_print', in: { TEXT: 'Hello COMs!' } }),
    loop(
      { type: 'lab_lcd_cursor', in: { COL: 0, ROW: 1 } },
      { type: 'lab_lcd_print', in: { TEXT: join('횟수 ', get('count'), '   ') } },
      { type: 'math_change', fields: { VAR: 'count' }, in: { DELTA: 1 } },
      { type: 'lab_wait', fields: { UNIT: 's' }, in: { TIME: 1 } },
    ),
  ], ['count']),
  'dht to serial and lcd': workspace([loop(
    set('t', { type: 'lab_dht', fields: { PIN: '2', WHAT: 'TEMP' } }),
    set('h', { type: 'lab_dht', fields: { PIN: '2', WHAT: 'HUM' } }),
    { type: 'lab_lcd_clear' },
    { type: 'lab_lcd_print', in: { TEXT: join('온도 ', get('t'), ' 습도 ', get('h')) } },
    println(join(get('t'), ' / ', get('h'))),
    { type: 'lab_wait', fields: { UNIT: 's' }, in: { TIME: 2 } },
  )], ['t', 'h']),
  'neopixel chase': workspace([loop(
    { type: 'controls_for', fields: { VAR: 'p' }, in: { FROM: 0, TO: 7, BY: 1 }, do: { DO: [
      { type: 'lab_pixel_clear', fields: { PIN: '6' } },
      { type: 'lab_pixel_color', fields: { PIN: '6', COLOUR: '#00ff80' }, in: { INDEX: get('p') } },
      { type: 'lab_pixel_rgb', fields: { PIN: '6' }, in: { INDEX: { type: 'math_modulo', in: { DIVIDEND: { type: 'math_arithmetic', fields: { OP: 'ADD' }, in: { A: get('p'), B: 4 } }, DIVISOR: 8 } }, R: 255, G: 0, B: 40 } },
      { type: 'lab_pixel_show', fields: { PIN: '6' } },
      wait(80),
    ] } },
  )], ['p']),
  'seven segment countdown': workspace([loop(
    { type: 'controls_for', fields: { VAR: 'n' }, in: { FROM: 9, TO: 0, BY: -1 }, do: { DO: [
      { type: 'lab_seg_digit', fields: { START: '2', TYPE: 'CATHODE' }, in: { DIGIT: get('n') } },
      wait(1000),
    ] } },
  )], ['n']),
  'keypad ir tmp36 serial': workspace([loop(
    set('key', { type: 'lab_keypad', fields: { ROWS: '2', COLS: '6' } }),
    when(cmp('EQ', get('key'), '5'), println('다섯!')),
    when(cmp('NEQ', get('key'), 0), { type: 'lab_serial_print', in: { VALUE: join('키 ', get('key')) } }),
    set('code', { type: 'lab_ir', fields: { PIN: '11' } }),
    when(cmp('GT', get('code'), 0), println(get('code'))),
    println({ type: 'lab_tmp36', fields: { PIN: 'A1' } }),
    wait(200),
  )], ['key', 'code']),
  'functions, every, random, while': workspace([
    { type: 'procedures_defnoreturn', fields: { NAME: '깜빡' }, extra: { params: [{ name: 'times', id: 'id_times' }] }, do: { STACK: [
      { type: 'controls_repeat_ext', in: { TIMES: get('times') }, do: { DO: [
        { type: 'lab_digital_write', fields: { PIN: '13', STATE: 'HIGH' } }, wait(100),
        { type: 'lab_digital_write', fields: { PIN: '13', STATE: 'LOW' } }, wait(100),
      ] } },
    ] } },
    { type: 'procedures_defreturn', fields: { NAME: 'half' }, extra: { params: [{ name: 'x', id: 'id_x' }] }, in: { RETURN: { type: 'math_arithmetic', fields: { OP: 'DIVIDE' }, in: { A: get('x'), B: 2 } } } },
    setup({ type: 'lab_serial_println', in: { VALUE: '시작' } }),
    loop(
      { type: 'lab_every', in: { MS: 1000 }, do: { DO: [{ type: 'procedures_callnoreturn', extra: { name: '깜빡', params: ['times'] }, in: { ARG0: { type: 'math_random_int', in: { FROM: 1, TO: 3 } } } }] } },
      { type: 'lab_every', in: { MS: 250 }, do: { DO: [println({ type: 'procedures_callreturn', extra: { name: 'half', params: ['x'] }, in: { ARG0: { type: 'lab_analog_read', fields: { PIN: 'A0' } } } })] } },
      { type: 'controls_whileUntil', fields: { MODE: 'UNTIL' }, in: { BOOL: { type: 'lab_serial_available' } }, do: { DO: [{ type: 'controls_flow_statements', fields: { FLOW: 'BREAK' } }] } },
      when({ type: 'lab_serial_available' }, set('level', { type: 'lab_serial_read_int' }), { type: 'lab_pwm_write', fields: { PIN: '9' }, in: { VALUE: { type: 'math_constrain', in: { VALUE: get('level'), LOW: 0, HIGH: 255 } } } }),
      when(cmp('GT', { type: 'lab_millis' }, 60000), { type: 'lab_tone_for', fields: { PIN: '8' }, in: { FREQ: 880, MS: 100 } }),
      { type: 'lab_no_tone', fields: { PIN: '8' } },
    ),
  ], ['times', 'x', 'level']),
};

const COMPILE_ORIGIN = compileOrigin();
let up = false;
beforeAll(async () => {
  try { up = (await fetch(new URL('/lab/api/health', COMPILE_ORIGIN), { signal: AbortSignal.timeout(1500), redirect: 'error' })).ok; } catch { up = false; }
  if (!up) console.warn('컴파일 서버가 꺼져 있어 실제 컴파일 검사는 건너뜁니다 (생성 코드 검사만 실행).');
});

async function compile(sketch: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(new URL('/lab/api/compile', COMPILE_ORIGIN), { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sketch }) });
    const body = await res.json() as { ok: boolean; reason?: string; errors?: { line: number; message: string }[] };
    if (body.reason !== 'rate-limited' && body.reason !== 'busy') return body;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error('컴파일 서버가 계속 바빠요');
}

describe.each(Object.entries(PROGRAMS))('program: %s', (_name, ws) => {
  const { code, warnings } = generate(ws);
  it('generates clean code', () => {
    expect(warnings).toEqual([]);
    expect(code).toMatch(/void setup\(\) \{/);
    expect(code).toMatch(/void loop\(\) \{/);
    expect(code.endsWith('}\n')).toBe(true);
  });
  it('compiles with the real toolchain', async (ctx) => {
    if (!up) return ctx.skip();
    const r = await compile(code);
    expect(r.ok, `${JSON.stringify(r.errors)}\n${code}`).toBe(true);
  }, 60000);
});
