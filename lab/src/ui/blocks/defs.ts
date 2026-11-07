// Block definitions (Blockly JSON) and the toolbox, as plain data. No Blockly import here, so the
// generator and its tests never load the editor. Every `lab_*` type needs a handler in generate.ts
// (generate.test.ts checks that both lists agree). Built-in Blockly blocks (math_*, logic_*, text,
// variables_*, controls_*, procedures_*) are used as they are and handled in generate.ts too.

export type PinKind = 'digital' | 'pwm' | 'analog' | 'start';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
const opts = (values: string[]) => values.map((v) => [v, v]);
export const PIN_VALUES: Record<PinKind, string[]> = {
  digital: [...range(2, 13), ...range(0, 5).map((n) => `A${n}`)],
  pwm: ['3', '5', '6', '9', '10', '11'],
  analog: range(0, 5).map((n) => `A${n}`),
  // first pin of a run of consecutive pins (7-segment: 7 pins, keypad: 4 pins)
  start: range(2, 7),
};

// Tinkercad-like family colours (all pass 4.5:1 against white block text).
export const COLOUR = {
  output: '#1565C0', input: '#00796B', control: '#D84315', math: '#5E35B1',
  text: '#7B1FA2', variable: '#C62828', serial: '#455A64', func: '#6D4C41',
} as const;

export interface BlockJson {
  type: string;
  message0: string;
  args0?: Record<string, unknown>[];
  previousStatement?: null;
  nextStatement?: null;
  output?: string | null;
  colour: string;
  tooltip: string;
  inputsInline?: boolean;
}

const pin = (name: string, kind: PinKind) => ({ type: 'field_dropdown', name, options: opts(PIN_VALUES[kind]), pinKind: kind });
const val = (name: string) => ({ type: 'input_value', name });
const drop = (name: string, options: string[][]) => ({ type: 'field_dropdown', name, options });
const stmt = (o: Partial<BlockJson> & Pick<BlockJson, 'type' | 'message0' | 'colour' | 'tooltip'>): BlockJson => ({ previousStatement: null, nextStatement: null, ...o });
const value = (o: Partial<BlockJson> & Pick<BlockJson, 'type' | 'message0' | 'colour' | 'tooltip'>): BlockJson => ({ output: null, ...o });

const { output: O, input: I, control: C, math: M, serial: S } = COLOUR;
const HL = [['켜기 (HIGH)', 'HIGH'], ['끄기 (LOW)', 'LOW']];

export const CUSTOM_BLOCKS: BlockJson[] = [
  // ---- 제어 ----
  { type: 'lab_setup', message0: '처음 한 번 실행 %1', args0: [{ type: 'input_statement', name: 'DO' }], colour: C, tooltip: '프로그램이 시작될 때 딱 한 번 실행돼요 (setup).' },
  { type: 'lab_loop', message0: '계속 반복 %1', args0: [{ type: 'input_statement', name: 'DO' }], colour: C, tooltip: '안에 있는 블록을 끝없이 되풀이해요 (loop).' },
  stmt({ type: 'lab_wait', message0: '기다리기 %1 %2', args0: [val('TIME'), drop('UNIT', [['밀리초', 'ms'], ['초', 's']])], colour: C, tooltip: '정해진 시간 동안 다음 블록으로 넘어가지 않고 기다려요 (delay).', inputsInline: true }),
  stmt({ type: 'lab_every', message0: '%1 ms 마다 %2', args0: [val('MS'), { type: 'input_statement', name: 'DO' }], colour: C, tooltip: '기다리지 않고, 정해진 시간이 지날 때마다 한 번씩 안의 블록을 실행해요 (millis).' }),
  value({ type: 'lab_millis', message0: '켜진 뒤 지난 시간 (ms)', colour: C, tooltip: '보드가 켜진 뒤 지난 시간을 밀리초로 알려 줘요 (millis).' }),

  // ---- 출력 ----
  stmt({ type: 'lab_digital_write', message0: '디지털 출력 핀 %1 을(를) %2', args0: [pin('PIN', 'digital'), drop('STATE', HL)], colour: O, tooltip: '핀에 5V(켜기) 또는 0V(끄기)를 내보내요 (digitalWrite).' }),
  stmt({ type: 'lab_pwm_write', message0: 'PWM 출력 핀 %1 세기 %2 (0~255)', args0: [pin('PIN', 'pwm'), val('VALUE')], colour: O, tooltip: 'LED 밝기나 모터 속도를 0~255로 정해요 (analogWrite). ~ 표시가 있는 핀만 쓸 수 있어요.', inputsInline: true }),
  stmt({ type: 'lab_tone', message0: '소리 내기 핀 %1 높이 %2 Hz', args0: [pin('PIN', 'digital'), val('FREQ')], colour: O, tooltip: '부저에서 소리를 계속 내요 (tone). 멈추려면 "소리 끄기"를 쓰세요.', inputsInline: true }),
  stmt({ type: 'lab_tone_for', message0: '소리 내기 핀 %1 높이 %2 Hz, %3 ms 동안', args0: [pin('PIN', 'digital'), val('FREQ'), val('MS')], colour: O, tooltip: '정해진 시간만 소리를 내요. 기다리지 않고 바로 다음 블록으로 넘어가요.', inputsInline: true }),
  stmt({ type: 'lab_no_tone', message0: '소리 끄기 핀 %1', args0: [pin('PIN', 'digital')], colour: O, tooltip: '부저 소리를 멈춰요 (noTone).' }),
  stmt({ type: 'lab_servo_write', message0: '서보 핀 %1 각도 %2 (0~180)', args0: [pin('PIN', 'digital'), val('ANGLE')], colour: O, tooltip: '서보 모터의 팔을 정한 각도로 움직여요 (Servo.write).', inputsInline: true }),
  stmt({ type: 'lab_pixel_color', message0: 'NeoPixel 핀 %1 의 %2 번째 색을 %3 로', args0: [pin('PIN', 'digital'), val('INDEX'), { type: 'field_colour', name: 'COLOUR', colour: '#ff0000' }], colour: O, tooltip: '번호는 0부터 시작해요. "NeoPixel 보이기"를 불러야 실제로 켜져요.', inputsInline: true }),
  stmt({ type: 'lab_pixel_rgb', message0: 'NeoPixel 핀 %1 의 %2 번째 색 빨강 %3 초록 %4 파랑 %5', args0: [pin('PIN', 'digital'), val('INDEX'), val('R'), val('G'), val('B')], colour: O, tooltip: '빨강·초록·파랑을 0~255로 섞어 색을 정해요.', inputsInline: true }),
  stmt({ type: 'lab_pixel_show', message0: 'NeoPixel 핀 %1 보이기', args0: [pin('PIN', 'digital')], colour: O, tooltip: '정한 색을 LED에 실제로 반영해요 (show).' }),
  stmt({ type: 'lab_pixel_clear', message0: 'NeoPixel 핀 %1 모두 끄기', args0: [pin('PIN', 'digital')], colour: O, tooltip: '모든 LED를 끄고 반영해요.' }),
  stmt({ type: 'lab_lcd_print', message0: 'LCD에 출력 %1', args0: [val('TEXT')], colour: O, tooltip: '커서 위치부터 글자나 숫자를 보여 줘요. (I2C LCD, 주소 0x27)' }),
  stmt({ type: 'lab_lcd_cursor', message0: 'LCD 커서 칸 %1 줄 %2', args0: [val('COL'), val('ROW')], colour: O, tooltip: '칸은 0~15, 줄은 0(위) 또는 1(아래)이에요.', inputsInline: true }),
  stmt({ type: 'lab_lcd_clear', message0: 'LCD 지우기', colour: O, tooltip: 'LCD 화면을 모두 지워요.' }),
  stmt({ type: 'lab_seg_digit', message0: '7세그먼트 (a~g 시작 핀 %1, %2) 숫자 %3 표시', args0: [pin('START', 'start'), drop('TYPE', [['공통 캐소드', 'CATHODE'], ['공통 애노드', 'ANODE']]), val('DIGIT')], colour: O, tooltip: '세그먼트 a~g가 시작 핀부터 차례로 연결돼 있어야 해요. 0~9가 아니면 끕니다.', inputsInline: true }),

  // ---- 입력 ----
  value({ type: 'lab_digital_read', message0: '디지털 읽기 핀 %1 %2', args0: [pin('PIN', 'digital'), drop('PULL', [['일반', 'INPUT'], ['풀업', 'INPUT_PULLUP']])], colour: I, tooltip: '핀이 HIGH(1)인지 LOW(0)인지 알려 줘요 (digitalRead).' }),
  value({ type: 'lab_button', message0: '버튼 핀 %1 이 눌렸나? (%2)', args0: [pin('PIN', 'digital'), drop('WIRING', [['풀업: 반대쪽 GND', 'PULLUP'], ['풀다운: 반대쪽 5V', 'PULLDOWN']])], output: 'Boolean', colour: I, tooltip: '버튼을 누르고 있으면 참이에요.' }),
  value({ type: 'lab_analog_read', message0: '아날로그 읽기 핀 %1', args0: [pin('PIN', 'analog')], output: 'Number', colour: I, tooltip: '0~5V를 0~1023으로 읽어요 (analogRead).' }),
  value({ type: 'lab_ultrasonic', message0: '초음파 거리 (cm) 트리거 핀 %1 에코 핀 %2', args0: [pin('TRIG', 'digital'), pin('ECHO', 'digital')], output: 'Number', colour: I, tooltip: 'HC-SR04가 잰 거리를 cm로 알려 줘요. 못 쟀으면 0이에요.' }),
  value({ type: 'lab_dht', message0: 'DHT11 핀 %1 의 %2', args0: [pin('PIN', 'digital'), drop('WHAT', [['온도 (°C)', 'TEMP'], ['습도 (%)', 'HUM']])], output: 'Number', colour: I, tooltip: '온습도 센서 값을 읽어요. 읽기에 실패하면 숫자가 아닌 값(NaN)이 나와요.' }),
  value({ type: 'lab_tmp36', message0: 'TMP36 온도 (°C) 핀 %1', args0: [pin('PIN', 'analog')], output: 'Number', colour: I, tooltip: 'TMP36 센서의 전압을 섭씨 온도로 바꿔 줘요.' }),
  value({ type: 'lab_keypad', message0: '키패드 누른 키 (행 핀 %1 부터 4개, 열 핀 %2 부터 4개)', args0: [pin('ROWS', 'start'), pin('COLS', 'start')], colour: I, tooltip: '4x4 키패드에서 눌린 글자를 알려 줘요. 안 눌렸으면 아무 글자도 아니에요(0).' }),
  value({ type: 'lab_ir', message0: 'IR 리모컨 코드 핀 %1', args0: [pin('PIN', 'digital')], colour: I, tooltip: '리모컨 버튼 코드를 알려 줘요. 받은 게 없으면 0이에요.' }),

  // ---- 시리얼 ----
  stmt({ type: 'lab_serial_print', message0: '시리얼 출력 %1', args0: [val('VALUE')], colour: S, tooltip: '시리얼 모니터에 글자나 숫자를 보내요 (줄을 바꾸지 않아요).' }),
  stmt({ type: 'lab_serial_println', message0: '시리얼 줄바꿈 출력 %1', args0: [val('VALUE')], colour: S, tooltip: '시리얼 모니터에 보내고 줄을 바꿔요 (println).' }),
  value({ type: 'lab_serial_available', message0: '시리얼로 받은 글자가 있나?', output: 'Boolean', colour: S, tooltip: '시리얼 모니터에서 보낸 글자가 기다리고 있으면 참이에요.' }),
  value({ type: 'lab_serial_read', message0: '시리얼 글자 한 개 읽기', colour: S, tooltip: '받은 글자를 하나 꺼내요.' }),
  value({ type: 'lab_serial_read_int', message0: '시리얼 숫자 읽기', output: 'Number', colour: S, tooltip: '받은 글자들을 숫자 하나로 읽어요 (parseInt).' }),

  // ---- 수학 ----
  value({ type: 'lab_map', message0: '%1 을(를) %2~%3 범위에서 %4~%5 범위로 바꾸기', args0: [val('VALUE'), val('FROM_LOW'), val('FROM_HIGH'), val('TO_LOW'), val('TO_HIGH')], output: 'Number', colour: M, tooltip: '예: 센서 값 0~1023을 LED 밝기 0~255로 바꿀 때 써요 (map).', inputsInline: true }),
];

// ---------- toolbox ----------

type Shadow = Record<string, number | string>;
const num = (n: number | string) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });
/** A toolbox block entry. `nums` fills value inputs with number shadows; `fields` presets dropdowns. */
const blk = (type: string, nums?: Shadow, fields?: Record<string, string>, extraState?: unknown) => ({
  kind: 'block', type,
  ...(fields ? { fields } : {}),
  ...(nums ? { inputs: Object.fromEntries(Object.entries(nums).map(([k, v]) => [k, num(v)])) } : {}),
  ...(extraState ? { extraState } : {}),
});
const txt = (s: string) => ({ shadow: { type: 'text', fields: { TEXT: s } } });
const cat = (name: string, colour: string, contents: unknown[], extra: Record<string, unknown> = {}) => ({ kind: 'category', name, colour, contents, ...extra });

export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    cat('출력', COLOUR.output, [
      blk('lab_digital_write', undefined, { PIN: '13' }),
      blk('lab_pwm_write', { VALUE: 128 }),
      blk('lab_tone', { FREQ: 440 }),
      blk('lab_tone_for', { FREQ: 440, MS: 500 }),
      blk('lab_no_tone'),
      blk('lab_servo_write', { ANGLE: 90 }),
      blk('lab_pixel_color', { INDEX: 0 }),
      blk('lab_pixel_rgb', { INDEX: 0, R: 255, G: 80, B: 0 }),
      blk('lab_pixel_show'),
      blk('lab_pixel_clear'),
      { kind: 'block', type: 'lab_lcd_print', inputs: { TEXT: txt('안녕!') } },
      blk('lab_lcd_cursor', { COL: 0, ROW: 1 }),
      blk('lab_lcd_clear'),
      blk('lab_seg_digit', { DIGIT: 5 }),
    ]),
    cat('입력', COLOUR.input, [
      blk('lab_digital_read'),
      blk('lab_button', undefined, { PIN: '2' }),
      blk('lab_analog_read'),
      blk('lab_ultrasonic', undefined, { TRIG: '7', ECHO: '6' }),
      blk('lab_dht', undefined, { PIN: '2' }),
      blk('lab_tmp36'),
      blk('lab_keypad', undefined, { ROWS: '2', COLS: '6' }),
      blk('lab_ir', undefined, { PIN: '2' }),
    ]),
    cat('제어', COLOUR.control, [
      blk('lab_setup'),
      blk('lab_loop'),
      blk('lab_wait', { TIME: 1000 }),
      blk('controls_repeat_ext', { TIMES: 10 }),
      blk('controls_if'),
      blk('controls_if', undefined, undefined, { hasElse: true }),
      { kind: 'block', type: 'controls_whileUntil' },
      blk('controls_for', { FROM: 1, TO: 10, BY: 1 }),
      blk('lab_every', { MS: 500 }),
      { kind: 'block', type: 'controls_flow_statements' },
      blk('lab_millis'),
    ]),
    cat('수학', COLOUR.math, [
      blk('math_number'),
      blk('math_arithmetic', { A: 1, B: 1 }),
      blk('math_modulo', { DIVIDEND: 10, DIVISOR: 3 }),
      blk('math_single', { NUM: 9 }),
      blk('math_round', { NUM: 3.1 }),
      blk('math_constrain', { VALUE: 50, LOW: 1, HIGH: 100 }),
      blk('math_random_int', { FROM: 1, TO: 100 }),
      blk('lab_map', { VALUE: 512, FROM_LOW: 0, FROM_HIGH: 1023, TO_LOW: 0, TO_HIGH: 255 }),
      { kind: 'label', text: '비교와 논리' },
      blk('logic_compare'),
      { kind: 'block', type: 'logic_operation' },
      { kind: 'block', type: 'logic_negate' },
      { kind: 'block', type: 'logic_boolean' },
    ]),
    cat('텍스트', COLOUR.text, [
      { kind: 'block', type: 'text' },
      { kind: 'block', type: 'text_join' },
      { kind: 'block', type: 'text_length', inputs: { VALUE: txt('abc') } },
    ]),
    cat('변수', COLOUR.variable, [], { custom: 'VARIABLE' }),
    cat('시리얼', COLOUR.serial, [
      { kind: 'block', type: 'lab_serial_print', inputs: { VALUE: txt('안녕') } },
      { kind: 'block', type: 'lab_serial_println', inputs: { VALUE: txt('안녕') } },
      blk('lab_serial_available'),
      blk('lab_serial_read'),
      blk('lab_serial_read_int'),
    ]),
    cat('함수', COLOUR.func, [], { custom: 'PROCEDURE' }),
  ],
};
