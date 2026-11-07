import { describe, expect, it } from 'vitest';
import { workspace, type N } from './build';
import { CUSTOM_BLOCKS, TOOLBOX } from './defs';
import { generate, HANDLED_TYPES, isGeneratedCode } from './generate';
import { STARTER_BLOCKS } from './starters';

const loop = (...s: N[]): N => ({ type: 'lab_loop', do: { DO: s } });
const setup = (...s: N[]): N => ({ type: 'lab_setup', do: { DO: s } });
const gen = (tops: N[], vars: string[] = []) => generate(workspace(tops, vars));
const inLoop = (s: N, vars: string[] = []) => gen([loop(s)], vars);
const loopBody = (code: string) => code.slice(code.indexOf('void loop() {'));
const txt = (t: string): N => ({ type: 'text', fields: { TEXT: t } });
const expr = (n: N, vars: string[] = []) => /Serial\.print\((.*)\);/.exec(loopBody(inLoop({ type: 'lab_serial_print', in: { VALUE: n } }, vars).code))![1]!;

describe('every custom block has a generator, and vice versa', () => {
  it('lists agree', () => {
    const custom = CUSTOM_BLOCKS.map((b) => b.type).sort();
    const handled = [...HANDLED_TYPES].filter((t) => t.startsWith('lab_')).sort();
    expect(handled).toEqual(custom);
  });
  it('the toolbox only offers blocks that can be generated', () => {
    const types: string[] = [];
    const visit = (x: unknown) => {
      if (Array.isArray(x)) x.forEach(visit);
      else if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>;
        if (o.kind === 'block' && typeof o.type === 'string') types.push(o.type);
        Object.values(o).forEach(visit);
      }
    };
    visit(TOOLBOX);
    expect(types.length).toBeGreaterThan(40);
    for (const t of types) if (t.startsWith('lab_') || t === 'text' || t.startsWith('math_') || t.startsWith('logic_') || t.startsWith('controls_') || t.startsWith('text_')) {
      expect(HANDLED_TYPES.has(t), t).toBe(true);
    }
  });
});

describe('program structure', () => {
  it('an empty workspace is a valid empty sketch', () => {
    const { code } = generate(undefined);
    expect(code).toContain('void setup() {');
    expect(code).toContain('void loop() {');
  });
  it('infers pinMode once, declares libraries and objects once', () => {
    const { code } = gen([loop(
      { type: 'lab_digital_write', fields: { PIN: '8', STATE: 'HIGH' } },
      { type: 'lab_digital_write', fields: { PIN: '8', STATE: 'LOW' } },
      { type: 'lab_servo_write', fields: { PIN: '9' }, in: { ANGLE: 10 } },
      { type: 'lab_servo_write', fields: { PIN: '9' }, in: { ANGLE: 20 } },
    )]);
    expect(code.match(/pinMode\(8, OUTPUT\)/g)).toHaveLength(1);
    expect(code.match(/#include <Servo\.h>/g)).toHaveLength(1);
    expect(code.match(/Servo servo9;/g)).toHaveLength(1);
    expect(code.match(/servo9\.attach\(9\)/g)).toHaveLength(1);
    expect(code.indexOf('pinMode(8')).toBeLessThan(code.indexOf('servo9.attach'));
  });
  it('setup blocks come after the generated initialisation', () => {
    const { code } = gen([setup({ type: 'lab_serial_println', in: { VALUE: txt('시작') } }), loop({ type: 'lab_digital_write', fields: { PIN: '4', STATE: 'HIGH' } })]);
    const s = code.slice(code.indexOf('void setup()'), code.indexOf('void loop()'));
    expect(s.indexOf('Serial.begin(9600)')).toBeLessThan(s.indexOf('pinMode(4'));
    expect(s.indexOf('pinMode(4')).toBeLessThan(s.indexOf('Serial.println("시작")'));
  });
  it('warns about blocks outside setup/loop and ignores them', () => {
    const r = gen([{ type: 'lab_digital_write', fields: { PIN: '3', STATE: 'HIGH' } }]);
    expect(r.warnings.join()).toContain('안에 들어 있지 않은 블록');
    expect(r.code).not.toContain('digitalWrite');
  });
  it('skips disabled blocks and reports unknown ones', () => {
    const ws = workspace([loop({ type: 'lab_no_tone', fields: { PIN: '8' } })]);
    (ws.blocks.blocks[0] as any).inputs.DO.block.enabled = false;
    expect(generate(ws).code).not.toContain('noTone');
    const r = gen([loop({ type: 'nope_block' })]);
    expect(r.warnings.join()).toContain('nope_block');
  });
  it('detects hand edits', () => {
    const ws = STARTER_BLOCKS['builtin-blink'];
    const { code } = generate(ws);
    expect(isGeneratedCode(ws, code)).toBe(true);
    expect(isGeneratedCode(ws, code + '// 내 메모\n')).toBe(false);
  });
});

describe('statement blocks', () => {
  const cases: [string, N, string[]][] = [
    ['lab_digital_write HIGH', { type: 'lab_digital_write', fields: { PIN: '13', STATE: 'HIGH' } }, ['pinMode(13, OUTPUT);', 'digitalWrite(13, HIGH);']],
    ['lab_digital_write LOW on an analog pin', { type: 'lab_digital_write', fields: { PIN: 'A1', STATE: 'LOW' } }, ['pinMode(A1, OUTPUT);', 'digitalWrite(A1, LOW);']],
    ['lab_pwm_write', { type: 'lab_pwm_write', fields: { PIN: '9' }, in: { VALUE: 128 } }, ['pinMode(9, OUTPUT);', 'analogWrite(9, 128);']],
    ['lab_tone', { type: 'lab_tone', fields: { PIN: '8' }, in: { FREQ: 440 } }, ['pinMode(8, OUTPUT);', 'tone(8, 440);']],
    ['lab_tone_for', { type: 'lab_tone_for', fields: { PIN: '8' }, in: { FREQ: 880, MS: 250 } }, ['tone(8, 880, 250);']],
    ['lab_no_tone', { type: 'lab_no_tone', fields: { PIN: '8' } }, ['noTone(8);']],
    ['lab_servo_write', { type: 'lab_servo_write', fields: { PIN: '9' }, in: { ANGLE: 90 } }, ['#include <Servo.h>', 'Servo servo9;', 'servo9.attach(9);', 'servo9.write(90);']],
    ['lab_pixel_color', { type: 'lab_pixel_color', fields: { PIN: '6', COLOUR: '#ff8000' }, in: { INDEX: 2 } }, ['#include <Adafruit_NeoPixel.h>', 'Adafruit_NeoPixel strip6(8, 6, NEO_GRB + NEO_KHZ800);', 'strip6.begin();', 'strip6.setPixelColor(2, strip6.Color(255, 128, 0));']],
    ['lab_pixel_rgb', { type: 'lab_pixel_rgb', fields: { PIN: '6' }, in: { INDEX: 0, R: 1, G: 2, B: 3 } }, ['strip6.setPixelColor(0, strip6.Color(1, 2, 3));']],
    ['lab_pixel_show', { type: 'lab_pixel_show', fields: { PIN: '6' } }, ['strip6.show();']],
    ['lab_pixel_clear', { type: 'lab_pixel_clear', fields: { PIN: '6' } }, ['strip6.clear();', 'strip6.show();']],
    ['lab_lcd_print', { type: 'lab_lcd_print', in: { TEXT: '안녕' } }, ['#include <Wire.h>', '#include <LiquidCrystal_I2C.h>', 'LiquidCrystal_I2C lcd(0x27, 16, 2);', 'lcd.init();', 'lcd.backlight();', 'lcd.print("안녕");']],
    ['lab_lcd_cursor', { type: 'lab_lcd_cursor', in: { COL: 3, ROW: 1 } }, ['lcd.setCursor(3, 1);']],
    ['lab_lcd_clear', { type: 'lab_lcd_clear' }, ['lcd.clear();']],
    ['lab_seg_digit cathode', { type: 'lab_seg_digit', fields: { START: '2', TYPE: 'CATHODE' }, in: { DIGIT: 7 } }, ['showDigit(2, 7, false);', 'pinMode(2, OUTPUT);', 'pinMode(8, OUTPUT);', 'void showDigit(int startPin, int n, bool commonAnode)']],
    ['lab_seg_digit anode', { type: 'lab_seg_digit', fields: { START: '4', TYPE: 'ANODE' }, in: { DIGIT: 1 } }, ['showDigit(4, 1, true);']],
    ['lab_wait ms', { type: 'lab_wait', fields: { UNIT: 'ms' }, in: { TIME: 250 } }, ['delay(250);']],
    ['lab_wait seconds (literal)', { type: 'lab_wait', fields: { UNIT: 's' }, in: { TIME: 2 } }, ['delay(2000);']],
    ['lab_wait seconds (decimal)', { type: 'lab_wait', fields: { UNIT: 's' }, in: { TIME: 0.5 } }, ['delay(500);']],
    ['lab_wait seconds (expression)', { type: 'lab_wait', fields: { UNIT: 's' }, in: { TIME: { type: 'math_arithmetic', fields: { OP: 'ADD' }, in: { A: 1, B: 2 } } } }, ['delay((1 + 2) * 1000L);']],
    ['lab_serial_print', { type: 'lab_serial_print', in: { VALUE: 5 } }, ['Serial.begin(9600);', 'Serial.print(5);']],
    ['lab_serial_println', { type: 'lab_serial_println', in: { VALUE: 'hi "x"' } }, ['Serial.println("hi \\"x\\"");']],
  ];
  it.each(cases)('%s', (_n, block, expected) => {
    const { code, warnings } = inLoop(block);
    for (const e of expected) expect(code, e).toContain(e);
    expect(warnings).toEqual([]);
  });

  it('lab_every is millis based and does not block', () => {
    const { code } = inLoop({ type: 'lab_every', in: { MS: 500 }, do: { DO: [{ type: 'lab_digital_write', fields: { PIN: '13', STATE: 'HIGH' } }] } });
    expect(code).toContain('unsigned long lastRun1 = 0;');
    expect(code).toContain('if (millis() - lastRun1 >= 500) {');
    expect(code).toContain('lastRun1 = millis();');
    expect(code).not.toContain('delay(');
  });
  it('two lab_every blocks get separate timers', () => {
    const { code } = gen([loop(
      { type: 'lab_every', in: { MS: 100 }, do: { DO: [{ type: 'lab_no_tone', fields: { PIN: '8' } }] } },
      { type: 'lab_every', in: { MS: 900 }, do: { DO: [{ type: 'lab_no_tone', fields: { PIN: '8' } }] } },
    )]);
    expect(code).toContain('lastRun1');
    expect(code).toContain('lastRun2');
  });
  it('empty value inputs are filled and reported', () => {
    const r = inLoop({ type: 'lab_pwm_write', fields: { PIN: '9' } });
    expect(r.code).toContain('analogWrite(9, 0);');
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('NeoPixel and LCD take their size from the scene', () => {
    const ws = workspace([loop({ type: 'lab_pixel_show', fields: { PIN: '6' } }, { type: 'lab_lcd_clear' } as N)]);
    const { code } = generate(ws, { pixelCount: 16, lcdAddress: 0x3f });
    expect(code).toContain('strip6(16, 6,');
    expect(code).toContain('lcd(0x3F, 16, 2)');
  });
});

describe('value blocks', () => {
  const cases: [string, N, string, string[]][] = [
    ['lab_digital_read', { type: 'lab_digital_read', fields: { PIN: '2', PULL: 'INPUT' } }, 'digitalRead(2)', ['pinMode(2, INPUT);']],
    ['lab_digital_read pullup', { type: 'lab_digital_read', fields: { PIN: '3', PULL: 'INPUT_PULLUP' } }, 'digitalRead(3)', ['pinMode(3, INPUT_PULLUP);']],
    ['lab_button pullup', { type: 'lab_button', fields: { PIN: '2', WIRING: 'PULLUP' } }, 'digitalRead(2) == LOW', ['pinMode(2, INPUT_PULLUP);']],
    ['lab_button pulldown', { type: 'lab_button', fields: { PIN: '2', WIRING: 'PULLDOWN' } }, 'digitalRead(2) == HIGH', ['pinMode(2, INPUT);']],
    ['lab_analog_read', { type: 'lab_analog_read', fields: { PIN: 'A0' } }, 'analogRead(A0)', []],
    ['lab_ultrasonic', { type: 'lab_ultrasonic', fields: { TRIG: '7', ECHO: '6' } }, 'readUltrasonicCm(7, 6)', ['pinMode(7, OUTPUT);', 'pinMode(6, INPUT);', 'long readUltrasonicCm(int trigPin, int echoPin)', 'pulseIn(echoPin, HIGH, 30000) / 58']],
    ['lab_dht temperature', { type: 'lab_dht', fields: { PIN: '2', WHAT: 'TEMP' } }, 'dht2.readTemperature()', ['#include <DHT.h>', 'DHT dht2(2, DHT11);', 'dht2.begin();']],
    ['lab_dht humidity', { type: 'lab_dht', fields: { PIN: '2', WHAT: 'HUM' } }, 'dht2.readHumidity()', []],
    ['lab_tmp36', { type: 'lab_tmp36', fields: { PIN: 'A1' } }, '(analogRead(A1) * 5.0 / 1023.0 - 0.5) * 100.0', []],
    ['lab_keypad', { type: 'lab_keypad', fields: { ROWS: '2', COLS: '6' } }, 'readKeypad(2, 6)', ['char readKeypad(int rowStart, int colStart)']],
    ['lab_ir', { type: 'lab_ir', fields: { PIN: '11' } }, 'readIrCode(11)', ['unsigned long readIrCode(int pin)', 'pinMode(11, INPUT);']],
    ['lab_millis', { type: 'lab_millis' }, 'millis()', []],
    ['lab_serial_available', { type: 'lab_serial_available' }, 'Serial.available() > 0', ['Serial.begin(9600);']],
    ['lab_serial_read', { type: 'lab_serial_read' }, '(char)Serial.read()', []],
    ['lab_serial_read_int', { type: 'lab_serial_read_int' }, 'Serial.parseInt()', []],
    ['lab_map', { type: 'lab_map', in: { VALUE: 5, FROM_LOW: 0, FROM_HIGH: 10, TO_LOW: 100, TO_HIGH: 200 } }, 'map(5, 0, 10, 100, 200)', []],
  ];
  it.each(cases)('%s', (_n, block, text, extra) => {
    const { code } = inLoop({ type: 'lab_serial_print', in: { VALUE: block } });
    expect(code).toContain(`Serial.print(${text});`);
    for (const e of extra) expect(code, e).toContain(e);
  });
  it('keypad rows and columns that overlap are reported', () => {
    expect(inLoop({ type: 'lab_serial_print', in: { VALUE: { type: 'lab_keypad', fields: { ROWS: '2', COLS: '4' } } } }).warnings.join()).toContain('겹쳐요');
  });
});

describe('built-in blocks', () => {
  const ar = (op: string, a: N | number, b: N | number): N => ({ type: 'math_arithmetic', fields: { OP: op }, in: { A: a, B: b } });
  it('arithmetic with precedence', () => {
    expect(expr(ar('ADD', 1, 2))).toBe('1 + 2');
    expect(expr(ar('MULTIPLY', ar('ADD', 1, 2), 3))).toBe('(1 + 2) * 3');
    expect(expr(ar('ADD', 1, ar('MULTIPLY', 2, 3)))).toBe('1 + 2 * 3');
    expect(expr(ar('MINUS', 10, ar('MINUS', 3, 2)))).toBe('10 - (3 - 2)');
    expect(expr(ar('MINUS', 5, -3))).toBe('5 - -3');
  });
  it('integer division keeps its decimals', () => {
    expect(expr(ar('DIVIDE', 7, 2))).toBe('(float)7 / 2');
    expect(expr(ar('DIVIDE', 7.5, 2))).toBe('7.5 / 2');
    expect(expr(ar('POWER', 2, 8))).toBe('pow(2, 8)');
  });
  it('math_modulo, single, round, constrain, random', () => {
    expect(expr({ type: 'math_modulo', in: { DIVIDEND: 10, DIVISOR: 3 } })).toBe('10 % 3');
    expect(expr({ type: 'math_single', fields: { OP: 'ROOT' }, in: { NUM: 9 } })).toBe('sqrt(9)');
    expect(expr({ type: 'math_single', fields: { OP: 'ABS' }, in: { NUM: -4 } })).toBe('abs(-4)');
    expect(expr({ type: 'math_single', fields: { OP: 'NEG' }, in: { NUM: -4 } })).toBe('-(-4)');
    expect(expr({ type: 'math_round', fields: { OP: 'ROUNDUP' }, in: { NUM: 3.2 } })).toBe('(long)ceil(3.2)');
    expect(expr({ type: 'math_constrain', in: { VALUE: 50, LOW: 1, HIGH: 10 } })).toBe('constrain(50, 1, 10)');
    const r = inLoop({ type: 'lab_serial_print', in: { VALUE: { type: 'math_random_int', in: { FROM: 1, TO: 6 } } } });
    expect(r.code).toContain('Serial.print(random(1, 7));');
    expect(r.code).toContain('randomSeed(analogRead(A5));');
  });
  it('comparison and logic', () => {
    const cmp = (op: string, a: N | number, b: N | number): N => ({ type: 'logic_compare', fields: { OP: op }, in: { A: a, B: b } });
    expect(expr(cmp('EQ', 1, 2))).toBe('1 == 2');
    expect(expr(cmp('NEQ', 1, 2))).toBe('1 != 2');
    expect(expr(cmp('LT', 1, 2))).toBe('1 < 2');
    expect(expr(cmp('LTE', 1, 2))).toBe('1 <= 2');
    expect(expr(cmp('GT', 1, 2))).toBe('1 > 2');
    expect(expr(cmp('GTE', 1, 2))).toBe('1 >= 2');
    expect(expr({ type: 'logic_operation', fields: { OP: 'AND' }, in: { A: cmp('GT', 1, 0), B: cmp('LT', 1, 5) } })).toBe('1 > 0 && 1 < 5');
    expect(expr({ type: 'logic_operation', fields: { OP: 'OR' }, in: { A: { type: 'logic_boolean', fields: { BOOL: 'TRUE' } }, B: { type: 'logic_boolean', fields: { BOOL: 'FALSE' } } } })).toBe('true || false');
    expect(expr({ type: 'logic_negate', in: { BOOL: cmp('EQ', 1, 2) } })).toBe('!(1 == 2)');
  });
  it('a keypad key compares with a one-letter text as a char', () => {
    const k: N = { type: 'lab_keypad', fields: { ROWS: '2', COLS: '6' } };
    expect(expr({ type: 'logic_compare', fields: { OP: 'EQ' }, in: { A: k, B: '5' } })).toBe("readKeypad(2, 6) == '5'");
  });
  it('text: join converts numbers, length', () => {
    expect(expr({ type: 'text_join', extra: { itemCount: 3 }, in: { ADD0: '온도 ', ADD1: 25, ADD2: '도' } })).toBe('String("온도 ") + String(25) + "도"');
    expect(expr({ type: 'text_join', extra: { itemCount: 2 }, in: { ADD0: 7, ADD1: '개' } })).toBe('String(7) + "개"');
    expect(expr({ type: 'text_length', in: { VALUE: 'abc' } })).toBe('String("abc").length()');
    expect(expr(txt('줄\n바꿈'))).toBe('"줄\\n바꿈"');
  });
  it('if / else if / else', () => {
    const { code } = inLoop({
      type: 'controls_if', extra: { elseIfCount: 1, hasElse: true },
      in: { IF0: { type: 'logic_boolean', fields: { BOOL: 'TRUE' } }, IF1: { type: 'logic_boolean', fields: { BOOL: 'FALSE' } } },
      do: { DO0: [{ type: 'lab_no_tone', fields: { PIN: '3' } }], DO1: [{ type: 'lab_no_tone', fields: { PIN: '4' } }], ELSE: [{ type: 'lab_no_tone', fields: { PIN: '5' } }] },
    });
    expect(loopBody(code)).toMatch(/if \(true\) \{\n {4}noTone\(3\);.*\n {2}\} else if \(false\) \{\n {4}noTone\(4\);.*\n {2}\} else \{\n {4}noTone\(5\);.*\n {2}\}/);
  });
  it('an if without a condition is reported', () => {
    expect(inLoop({ type: 'controls_if' }).warnings.length).toBeGreaterThan(0);
  });
  it('repeat uses fresh counters when nested', () => {
    const inner: N = { type: 'controls_repeat_ext', in: { TIMES: 2 }, do: { DO: [{ type: 'lab_no_tone', fields: { PIN: '8' } }] } };
    const { code } = inLoop({ type: 'controls_repeat_ext', in: { TIMES: 3 }, do: { DO: [inner] } });
    expect(code).toContain('for (int i = 0; i < 3; i++) {');
    expect(code).toContain('for (int j = 0; j < 2; j++) {');
  });
  it('repeat never reuses a user variable name', () => {
    const { code } = inLoop({ type: 'controls_repeat_ext', in: { TIMES: 3 }, do: { DO: [{ type: 'variables_set', fields: { VAR: 'i' }, in: { VALUE: 1 } }] } }, ['i']);
    expect(code).toContain('for (int j = 0; j < 3; j++) {');
  });
  it('while and until', () => {
    const c: N = { type: 'lab_button', fields: { PIN: '2', WIRING: 'PULLUP' } };
    expect(inLoop({ type: 'controls_whileUntil', fields: { MODE: 'WHILE' }, in: { BOOL: c } }).code).toContain('while (digitalRead(2) == LOW) {');
    expect(inLoop({ type: 'controls_whileUntil', fields: { MODE: 'UNTIL' }, in: { BOOL: c } }).code).toContain('while (!(digitalRead(2) == LOW)) {');
  });
  it('for counts up and down', () => {
    expect(inLoop({ type: 'controls_for', fields: { VAR: 'n' }, in: { FROM: 1, TO: 10, BY: 1 } }).code).toContain('for (int n = 1; n <= 10; n++) {');
    expect(inLoop({ type: 'controls_for', fields: { VAR: 'n' }, in: { FROM: 0, TO: 100, BY: 10 } }).code).toContain('for (int n = 0; n <= 100; n += 10) {');
    expect(inLoop({ type: 'controls_for', fields: { VAR: 'n' }, in: { FROM: 10, TO: 0, BY: 1 } }).code).toContain('for (int n = 10; n >= 0; n--) {');
    expect(inLoop({ type: 'controls_for', fields: { VAR: 'n' }, in: { FROM: 9, TO: 0, BY: -3 } }).code).toContain('n -= 3');
  });
  it('break and continue', () => {
    const body = (flow: string) => inLoop({ type: 'controls_repeat_ext', in: { TIMES: 2 }, do: { DO: [{ type: 'controls_flow_statements', fields: { FLOW: flow } }] } }).code;
    expect(body('BREAK')).toContain('break;');
    expect(body('CONTINUE')).toContain('continue;');
  });
});

describe('variables and functions', () => {
  it('declares globals with inferred types', () => {
    const { code } = inLoop({ type: 'variables_set', fields: { VAR: 'score' }, in: { VALUE: 3 } }, ['score']);
    expect(code).toContain('int score = 0;');
    expect(code).toContain('score = 3;');
    expect(generate(workspace([loop({ type: 'variables_set', fields: { VAR: 'ratio' }, in: { VALUE: 0.5 } })])).code).toContain('float ratio = 0.0;');
    expect(generate(workspace([loop({ type: 'variables_set', fields: { VAR: 'msg' }, in: { VALUE: '안녕' } })])).code).toContain('String msg = "";');
    expect(generate(workspace([loop({ type: 'variables_set', fields: { VAR: 'on' }, in: { VALUE: { type: 'logic_boolean', fields: { BOOL: 'TRUE' } } } })])).code).toContain('bool on = false;');
  });
  it('a variable set from a sensor takes the sensor type', () => {
    const { code } = inLoop({ type: 'variables_set', fields: { VAR: 'd' }, in: { VALUE: { type: 'lab_ultrasonic', fields: { TRIG: '7', ECHO: '6' } } } });
    expect(code).toContain('long d = 0;');
  });
  it('text join with a numeric variable, and a number stored in a String variable', () => {
    const { code } = gen([loop(
      { type: 'variables_set', fields: { VAR: 'n' }, in: { VALUE: 5 } },
      { type: 'variables_set', fields: { VAR: 'label' }, in: { VALUE: 'a' } },
      { type: 'variables_set', fields: { VAR: 'label' }, in: { VALUE: { type: 'variables_get', fields: { VAR: 'n' } } } },
    )]);
    expect(code).toContain('String label = "";');
    expect(code).toContain('label = String(n);');
  });
  it('change by 1 becomes ++', () => {
    expect(inLoop({ type: 'math_change', fields: { VAR: 'count' }, in: { DELTA: 1 } }).code).toMatch(/count\+\+;/);
    expect(inLoop({ type: 'math_change', fields: { VAR: 'count' }, in: { DELTA: 5 } }).code).toMatch(/count \+= 5;/);
  });
  it('a for counter is local, not a global', () => {
    const { code } = inLoop({ type: 'controls_for', fields: { VAR: 'k' }, in: { FROM: 1, TO: 3, BY: 1 }, do: { DO: [{ type: 'lab_serial_print', in: { VALUE: { type: 'variables_get', fields: { VAR: 'k' } } } }] } });
    expect(code).not.toMatch(/^int k = 0;/m);
    expect(code).toContain('Serial.print(k);');
  });
  it('Korean and reserved names become valid C++ names with the original in a comment', () => {
    const { code } = inLoop({ type: 'math_change', fields: { VAR: '점수' }, in: { DELTA: 1 } });
    expect(code).toContain('int var1 = 0;  // 변수 "점수"');
    expect(code).toContain('var1++;');
    expect(inLoop({ type: 'math_change', fields: { VAR: 'delay' }, in: { DELTA: 1 } }).code).toContain('int delay_ = 0;');
  });
  it('procedures with and without a result', () => {
    const def: N = { type: 'procedures_defnoreturn', fields: { NAME: 'blinkTwice' }, do: { STACK: [{ type: 'lab_digital_write', fields: { PIN: '13', STATE: 'HIGH' } }] } };
    const def2: N = { type: 'procedures_defreturn', fields: { NAME: 'double' }, extra: { params: [{ name: 'x', id: 'id_x' }] }, in: { RETURN: { type: 'math_arithmetic', fields: { OP: 'MULTIPLY' }, in: { A: { type: 'variables_get', fields: { VAR: 'x' } }, B: 2 } } } };
    const { code } = gen([def, def2, loop(
      { type: 'procedures_callnoreturn', extra: { name: 'blinkTwice', params: [] } },
      { type: 'lab_serial_println', in: { VALUE: { type: 'procedures_callreturn', extra: { name: 'double', params: ['x'] }, in: { ARG0: 21 } } } },
    )], ['x']);
    expect(code).toContain('void blinkTwice();');
    expect(code).toContain('void blinkTwice() {');
    expect(code).toContain('int double_(int x);');
    expect(code).toContain('return x * 2;');
    expect(code).toContain('blinkTwice();');
    expect(code).toContain('Serial.println(double_(21));');
    expect(code).not.toMatch(/^int x = 0;/m);
  });
});

describe('starters', () => {
  it.each(Object.keys(STARTER_BLOCKS))('%s generates without warnings', (id) => {
    const r = generate(STARTER_BLOCKS[id]);
    expect(r.warnings).toEqual([]);
    expect(r.code).toContain('void loop() {');
  });
  it('blink matches the hand-written example', () => {
    const { code } = generate(STARTER_BLOCKS['external-blink']);
    expect(code).toContain('pinMode(8, OUTPUT);');
    expect(loopBody(code)).toMatch(/digitalWrite\(8, HIGH\);[^\n]*\n {2}delay\(500\);[^\n]*\n {2}digitalWrite\(8, LOW\);[^\n]*\n {2}delay\(500\);/);
  });
});
