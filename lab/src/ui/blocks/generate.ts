// Blockly workspace JSON -> readable Arduino C++. Works on the serialized state (no Blockly needed),
// so it runs in the main bundle and in plain Node tests. Blockly stays a lazy chunk.

export interface GenOptions {
  /** LEDs on the NeoPixel strip (scene part prop `count`). */
  pixelCount?: number;
  /** I2C address of the LCD (scene part prop `address`). */
  lcdAddress?: number;
}
export interface GenResult { code: string; warnings: string[] }

type Ty = 'int' | 'long' | 'ulong' | 'float' | 'bool' | 'char' | 'String';
interface E { c: string; p: number; t: Ty; lit?: boolean }
interface B {
  type: string;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block?: B; shadow?: B }>;
  next?: { block?: B; shadow?: B };
  extraState?: Record<string, unknown>;
  enabled?: boolean;
}
interface Known { vars: Map<string, Ty>; fnRet: Map<string, Ty | 'void'>; fnParams: Map<string, Ty[]> }

// operator precedence classes (smaller binds tighter)
const ATOM = 0, UNARY = 3, MUL = 5, ADD = 6, REL = 9, EQ = 10, AND = 14, OR = 15;
const RANK: Ty[] = ['bool', 'int', 'long', 'ulong', 'float'];
const CTYPE: Record<Ty, string> = { int: 'int', long: 'long', ulong: 'unsigned long', float: 'float', bool: 'bool', char: 'char', String: 'String' };
const wide = (a: Ty, b: Ty): Ty => (a === 'String' || b === 'String' ? 'String' : RANK.indexOf(a) >= RANK.indexOf(b) ? a : b);
const num2 = (a: Ty, b: Ty): Ty => { const t = wide(a, b); return t === 'bool' || t === 'String' || t === 'char' ? 'int' : t; };
const wrap = (e: E, p: number, right = false) => (e.p > p || (e.p === p && right) ? `(${e.c})` : e.c);

const RESERVED = new Set(('setup loop delay millis micros pinMode digitalWrite digitalRead analogRead analogWrite tone noTone map abs min max round random ' +
  'randomSeed Serial lcd int long float double char bool byte void if else for while do break continue return true false HIGH LOW INPUT OUTPUT ' +
  'INPUT_PULLUP new delete class struct this const static switch case default word String Servo sq sqrt pow log exp constrain main auto short signed ' +
  'unsigned template typename namespace using register volatile goto enum union sizeof typedef public private protected virtual friend operator ' +
  'bit bitRead bitWrite cos sin tan floor ceil lowByte highByte pulseIn shiftOut shiftIn attachInterrupt isnan').split(' '));
const OWN = /^(servo|strip|dht|lastRun)\d*$|^(SEG_DIGITS|showDigit|readKeypad|readIrCode|readUltrasonicCm)$|^A\d+$|^D\d+$/;
const LOOP_VARS = ['i', 'j', 'k', 'l', 'm', 'n'];

function widenInto(m: Map<string, Ty>, key: string, t: Ty) {
  const old = m.get(key);
  m.set(key, old ? wide(old, t) : t);
}
const lit = (n: number): E => ({ c: String(n), p: n < 0 ? UNARY : ATOM, t: Number.isInteger(n) ? (Math.abs(n) <= 32767 ? 'int' : 'long') : 'float', lit: true });
const isLiteralNumber = (e: E) => e.lit && /^-?\d+(\.\d+)?$/.test(e.c);
const cStr = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;

class Ctx {
  includes = new Set<string>();
  objects = new Map<string, string>();
  helpers = new Map<string, string>();
  setupInit = new Map<string, string>();
  pinModes = new Map<string, string>();
  globals: string[] = [];
  warnings: string[] = [];
  known: Known;
  next: Known = { vars: new Map(), fnRet: new Map(), fnParams: new Map() };
  idents = new Map<string, string>();
  taken = new Set<string>();
  names: { orig: string; ident: string }[] = [];
  count = new Map<string, number>();
  varNames = new Map<string, string>(); // variable id -> original name
  forVars = new Set<string>();
  setVars = new Set<string>();
  getVars = new Set<string>();
  paramVars = new Set<string>();
  loopDepth = 0;
  everyN = 0;
  usesRandom = false;
  serial = false;

  constructor(public opts: GenOptions, known: Known) { this.known = known; }

  warn(msg: string) { if (!this.warnings.includes(msg)) this.warnings.push(msg); }
  include(h: string) { this.includes.add(h); }

  /** C identifier for a user name (variable / function). Korean names become var1, fn1... with a comment. */
  ident(name: string, prefix: string): string {
    const got = this.idents.get(prefix + name);
    if (got) return got;
    let id = name;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) id = `${prefix}${(this.count.get(prefix) ?? 0) + 1}`, this.count.set(prefix, (this.count.get(prefix) ?? 0) + 1);
    else if (RESERVED.has(id) || OWN.test(id)) id += '_';
    while (this.taken.has(id)) id += '_';
    this.taken.add(id);
    this.idents.set(prefix + name, id);
    this.names.push({ orig: name, ident: id });
    return id;
  }
  varIdent(b: B, field = 'VAR'): string {
    const f = b.fields?.[field];
    const id = typeof f === 'object' && f ? (f as { id?: string }).id : String(f ?? '');
    const name = (id && this.varNames.get(id)) || (typeof f === 'object' && f ? (f as { name?: string }).name : undefined) || id || 'x';
    return this.ident(name, 'var');
  }
  varType(ident: string): Ty { return this.known.vars.get(ident) ?? 'int'; }

  setPin(code: string, mode: string) { if (!this.pinModes.has(code)) this.pinModes.set(code, mode); }
  init(key: string, line: string) { if (!this.setupInit.has(key)) this.setupInit.set(key, line); }
  useSerial() {
    this.serial = true;
  }

  field(b: B, name: string, def = ''): string { return String(b.fields?.[name] ?? def); }
  pin(b: B, name: string, mode?: string): string {
    const v = this.field(b, name);
    if (!/^A?\d{1,2}$/.test(v)) { this.warn(`핀 "${v}"을(를) 알 수 없어요. 13번 핀으로 바꿨어요.`); return '13'; }
    if (mode) this.setPin(v, mode);
    return v;
  }
  /** value input -> expression; undefined when empty */
  input(b: B, name: string): E | undefined {
    const i = b.inputs?.[name];
    const c = i?.block ?? i?.shadow;
    return c && c.enabled !== false ? this.expr(c) : undefined;
  }
  val(b: B, name: string, def: E = lit(0), why = ''): E {
    const e = this.input(b, name);
    if (e) return e;
    this.warn(`비어 있는 칸이 있어서 ${why || '0'}(으)로 채웠어요.`);
    return def;
  }
  arg(b: B, name: string, def: E = lit(0)): string { return this.val(b, name, def).c; }
  body(b: B, name: string): string[] {
    const c = b.inputs?.[name]?.block;
    return c ? this.stack(c) : [];
  }
  stack(b: B | undefined): string[] {
    const out: string[] = [];
    for (let cur = b; cur; cur = cur.next?.block ?? cur.next?.shadow) {
      if (cur.enabled === false) continue;
      const h = S[cur.type];
      if (!h) { this.warn(`지원하지 않는 블록이에요: ${cur.type}`); continue; }
      out.push(...h(this, cur));
    }
    return out;
  }
  expr(b: B): E {
    const h = X[b.type];
    if (!h) { this.warn(`지원하지 않는 블록이에요: ${b.type}`); return lit(0); }
    return h(this, b);
  }
  fnIdent(name: string) { return this.ident(name, 'fn'); }
}

const ind = (lines: string[]) => lines.map((l) => (l ? `  ${l}` : l));
const block = (head: string, body: string[], tail = '}') => [`${head} {`, ...ind(body), tail];
const cmt = (s: string) => `  // ${s}`;

function obj(g: Ctx, kind: 'servo' | 'strip' | 'dht' | 'lcd', p = ''): string {
  if (kind === 'servo') {
    g.include('Servo.h');
    const n = `servo${p}`;
    g.objects.set(n, `Servo ${n};  // 핀 ${p}에 연결한 서보`);
    g.init(n, `${n}.attach(${p});`);
    return n;
  }
  if (kind === 'strip') {
    g.include('Adafruit_NeoPixel.h');
    const n = `strip${p}`;
    const count = g.opts.pixelCount ?? 8;
    g.objects.set(n, `Adafruit_NeoPixel ${n}(${count}, ${p}, NEO_GRB + NEO_KHZ800);  // 핀 ${p}에 연결한 NeoPixel ${count}개`);
    g.init(n, `${n}.begin();`);
    g.init(n + 'b', `${n}.setBrightness(40);  // 너무 밝지 않게 (0~255)`);
    return n;
  }
  if (kind === 'dht') {
    g.include('DHT.h');
    const n = `dht${p}`;
    g.objects.set(n, `DHT ${n}(${p}, DHT11);  // 핀 ${p}에 연결한 DHT11`);
    g.init(n, `${n}.begin();`);
    return n;
  }
  g.include('Wire.h');
  g.include('LiquidCrystal_I2C.h');
  g.objects.set('lcd', `LiquidCrystal_I2C lcd(0x${(g.opts.lcdAddress ?? 0x27).toString(16).toUpperCase()}, 16, 2);  // I2C LCD 16칸 x 2줄`);
  g.init('lcd', 'lcd.init();');
  g.init('lcd2', 'lcd.backlight();');
  return 'lcd';
}

const HELPERS = {
  ultrasonic: `// 초음파 센서로 거리를 cm로 재요. 못 쟀으면 0.
long readUltrasonicCm(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);  // 10마이크로초 동안 HIGH = "초음파 쏴!"
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  return pulseIn(echoPin, HIGH, 30000) / 58;  // 왕복 시간(µs) / 58 = cm
}`,
  seg: `// 7세그먼트: 숫자 0~9를 세그먼트 a~g의 켜짐 표로 바꿔 보여 줘요 (0~9가 아니면 모두 꺼요).
const byte SEG_DIGITS[10] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F};
void showDigit(int startPin, int n, bool commonAnode) {
  for (int s = 0; s < 7; s++) {
    bool on = (n >= 0 && n <= 9) && bitRead(SEG_DIGITS[n], s);
    digitalWrite(startPin + s, commonAnode ? !on : on);
  }
}`,
  keypad: `// 4x4 키패드: 행을 하나씩 LOW로 만들고 열을 읽어서 눌린 키를 찾아요. 아무것도 안 눌렸으면 0.
char readKeypad(int rowStart, int colStart) {
  const char keys[4][4] = {{'1', '2', '3', 'A'}, {'4', '5', '6', 'B'}, {'7', '8', '9', 'C'}, {'*', '0', '#', 'D'}};
  char found = 0;
  for (int c = 0; c < 4; c++) pinMode(colStart + c, INPUT_PULLUP);
  for (int r = 0; r < 4 && !found; r++) {
    pinMode(rowStart + r, OUTPUT);
    digitalWrite(rowStart + r, LOW);
    delayMicroseconds(10);
    for (int c = 0; c < 4; c++) {
      if (digitalRead(colStart + c) == LOW) found = keys[r][c];
    }
    pinMode(rowStart + r, INPUT);  // 다음 행을 읽기 전에 이 행은 놓아 줘요
  }
  return found;
}`,
  ir: `// IR 리모컨(NEC 방식) 코드를 읽어요. 받은 게 없으면 0.
unsigned long readIrCode(int pin) {
  if (digitalRead(pin) == HIGH) return 0;  // 수신기는 신호가 오면 LOW가 돼요
  unsigned long t = micros();
  while (digitalRead(pin) == LOW) if (micros() - t > 12000) return 0;
  if (micros() - t < 8000) return 0;  // 9ms짜리 시작 신호가 아니에요
  t = micros();
  while (digitalRead(pin) == HIGH) if (micros() - t > 6000) return 0;
  unsigned long code = 0;
  for (int i = 0; i < 32; i++) {
    t = micros();
    while (digitalRead(pin) == LOW) if (micros() - t > 1000) return 0;
    t = micros();
    while (digitalRead(pin) == HIGH) if (micros() - t > 2500) break;
    if (micros() - t > 1100) code |= 1UL << i;  // 긴 쉼 = 1, 짧은 쉼 = 0
  }
  return code ? code : 1;
}`,
};

// ---------- statement handlers ----------
type SH = (g: Ctx, b: B) => string[];
const S: Record<string, SH> = {
  lab_digital_write: (g, b) => { const p = g.pin(b, 'PIN', 'OUTPUT'); const s = g.field(b, 'STATE', 'HIGH'); return [`digitalWrite(${p}, ${s});${cmt(`핀 ${p} ${s === 'HIGH' ? '켜기' : '끄기'}`)}`]; },
  lab_pwm_write: (g, b) => { const p = g.pin(b, 'PIN', 'OUTPUT'); return [`analogWrite(${p}, ${g.arg(b, 'VALUE')});${cmt(`핀 ${p} 세기 정하기 (0~255)`)}`]; },
  lab_tone: (g, b) => { const p = g.pin(b, 'PIN', 'OUTPUT'); return [`tone(${p}, ${g.arg(b, 'FREQ', lit(440))});${cmt(`핀 ${p}에서 소리 내기`)}`]; },
  lab_tone_for: (g, b) => { const p = g.pin(b, 'PIN', 'OUTPUT'); return [`tone(${p}, ${g.arg(b, 'FREQ', lit(440))}, ${g.arg(b, 'MS', lit(500))});${cmt('정한 시간만 소리 내기')}`]; },
  lab_no_tone: (g, b) => { const p = g.pin(b, 'PIN', 'OUTPUT'); return [`noTone(${p});${cmt('소리 끄기')}`]; },
  lab_servo_write: (g, b) => { const p = g.pin(b, 'PIN'); return [`${obj(g, 'servo', p)}.write(${g.arg(b, 'ANGLE', lit(90))});${cmt('서보 각도')}`]; },
  lab_pixel_color: (g, b) => {
    const s = obj(g, 'strip', g.pin(b, 'PIN'));
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(g.field(b, 'COLOUR', '#ff0000'));
    const [r, gg, bl] = m ? [m[1]!, m[2]!, m[3]!].map((h) => parseInt(h, 16)) : [255, 0, 0];
    return [`${s}.setPixelColor(${g.arg(b, 'INDEX')}, ${s}.Color(${r}, ${gg}, ${bl}));${cmt('LED 색 정하기')}`];
  },
  lab_pixel_rgb: (g, b) => {
    const s = obj(g, 'strip', g.pin(b, 'PIN'));
    return [`${s}.setPixelColor(${g.arg(b, 'INDEX')}, ${s}.Color(${g.arg(b, 'R')}, ${g.arg(b, 'G')}, ${g.arg(b, 'B')}));${cmt('LED 색 정하기')}`];
  },
  lab_pixel_show: (g, b) => [`${obj(g, 'strip', g.pin(b, 'PIN'))}.show();${cmt('정한 색을 LED에 반영')}`],
  lab_pixel_clear: (g, b) => { const s = obj(g, 'strip', g.pin(b, 'PIN')); return [`${s}.clear();${cmt('모두 끄기')}`, `${s}.show();`]; },
  lab_lcd_print: (g, b) => [`${obj(g, 'lcd')}.print(${g.arg(b, 'TEXT', { c: '""', p: ATOM, t: 'String', lit: true })});${cmt('LCD에 출력')}`],
  lab_lcd_cursor: (g, b) => [`${obj(g, 'lcd')}.setCursor(${g.arg(b, 'COL')}, ${g.arg(b, 'ROW')});${cmt('커서 옮기기 (칸, 줄)')}`],
  lab_lcd_clear: (g) => [`${obj(g, 'lcd')}.clear();${cmt('LCD 지우기')}`],
  lab_seg_digit: (g, b) => {
    const start = Number(g.field(b, 'START', '2'));
    for (let k = 0; k < 7; k++) g.setPin(String(start + k), 'OUTPUT');
    g.helpers.set('seg', HELPERS.seg);
    return [`showDigit(${start}, ${g.arg(b, 'DIGIT')}, ${g.field(b, 'TYPE') === 'ANODE'});${cmt(`7세그먼트(핀 ${start}~${start + 6})에 숫자 표시`)}`];
  },
  lab_wait: (g, b) => {
    const t = g.val(b, 'TIME', lit(1000));
    if (g.field(b, 'UNIT', 'ms') !== 's') return [`delay(${t.c});${cmt(`${t.c} ms 기다리기`)}`];
    if (isLiteralNumber(t)) return [`delay(${Math.round(Number(t.c) * 1000)});${cmt(`${t.c}초 기다리기`)}`];
    return [`delay(${wrap(t, MUL)} * 1000L);${cmt('초 단위로 기다리기')}`];
  },
  lab_every: (g, b) => {
    const n = ++g.everyN;
    const ms = g.val(b, 'MS', lit(1000));
    g.globals.push(`unsigned long lastRun${n} = 0;  // "${ms.c} ms마다" 블록 ${n}번이 마지막으로 실행된 시각`);
    return [`// ${ms.c} ms마다 한 번씩 실행해요 (기다리지 않고 시간만 확인해서 다른 일을 막지 않아요)`,
      ...block(`if (millis() - lastRun${n} >= ${wrap(ms, REL, true)})`, [`lastRun${n} = millis();`, ...g.body(b, 'DO')])];
  },
  lab_serial_print: (g, b) => { g.useSerial(); return [`Serial.print(${g.arg(b, 'VALUE', { c: '""', p: ATOM, t: 'String', lit: true })});${cmt('시리얼 모니터에 출력')}`]; },
  lab_serial_println: (g, b) => { g.useSerial(); return [`Serial.println(${g.arg(b, 'VALUE', { c: '""', p: ATOM, t: 'String', lit: true })});${cmt('시리얼 모니터에 출력하고 줄 바꾸기')}`]; },

  controls_if: (g, b) => {
    const es = b.extraState ?? {};
    const elifs = Number(es.elseIfCount ?? es.elseif ?? 0);
    const hasElse = Boolean(es.hasElse ?? es.else);
    const out: string[] = [];
    for (let i = 0; i <= elifs; i++) {
      const c = g.val(b, `IF${i}`, { c: 'false', p: ATOM, t: 'bool' }, 'false');
      const body = ind(g.body(b, `DO${i}`));
      const head = `${i ? '} else if' : 'if'} (${c.c}) {`;
      out.push(head, ...body);
    }
    if (hasElse) out.push('} else {', ...ind(g.body(b, 'ELSE')));
    out.push('}');
    return out;
  },
  controls_repeat_ext: (g, b) => {
    const t = g.val(b, 'TIMES', lit(10));
    const v = LOOP_VARS.map((x, i) => (i < g.loopDepth ? '' : x)).find((x) => x && !g.taken.has(x)) ?? `i${g.loopDepth}`;
    g.loopDepth++;
    const body = g.body(b, 'DO');
    g.loopDepth--;
    return [`// ${t.c}번 반복`, ...block(`for (int ${v} = 0; ${v} < ${wrap(t, REL)}; ${v}++)`, body)];
  },
  controls_whileUntil: (g, b) => {
    const c = g.val(b, 'BOOL', { c: 'false', p: ATOM, t: 'bool' }, 'false');
    const cond = g.field(b, 'MODE') === 'UNTIL' ? `!${wrap(c, UNARY)}` : c.c;
    return block(`while (${cond})`, g.body(b, 'DO'));
  },
  controls_for: (g, b) => {
    const v = g.varIdent(b);
    const from = g.val(b, 'FROM', lit(1)), to = g.val(b, 'TO', lit(10)), by = g.val(b, 'BY', lit(1));
    const down = (isLiteralNumber(by) && Number(by.c) < 0) || (isLiteralNumber(from) && isLiteralNumber(to) && Number(from.c) > Number(to.c));
    const step = isLiteralNumber(by) ? Math.abs(Number(by.c)) : 0;
    const inc = down ? (step === 1 ? `${v}--` : `${v} -= ${step || wrap(by, ADD)}`) : step === 1 ? `${v}++` : `${v} += ${step || wrap(by, ADD)}`;
    return block(`for (int ${v} = ${from.c}; ${v} ${down ? '>=' : '<='} ${to.c}; ${inc})`, g.body(b, 'DO'));
  },
  controls_flow_statements: (g, b) => [g.field(b, 'FLOW') === 'CONTINUE' ? 'continue;' : 'break;'],
  variables_set: (g, b) => {
    const v = g.varIdent(b);
    const e = g.input(b, 'VALUE');
    if (!e) return [];
    widenInto(g.next.vars, v, e.t);
    const t = g.varType(v);
    return [`${v} = ${t === 'String' && e.t !== 'String' ? `String(${e.c})` : e.c};`];
  },
  math_change: (g, b) => {
    const v = g.varIdent(b);
    const d = g.val(b, 'DELTA', lit(1));
    widenInto(g.next.vars, v, d.t);
    return [isLiteralNumber(d) && d.c === '1' ? `${v}++;` : `${v} += ${d.c};`];
  },
  procedures_callnoreturn: (g, b) => [`${call(g, b)};`],
  // text blocks etc. that can appear as statements do not exist; keep the table closed.
};

function call(g: Ctx, b: B): string {
  const name = String(b.extraState?.name ?? b.fields?.NAME ?? '');
  const f = g.fnIdent(name);
  const params = (b.extraState?.params as unknown[] | undefined) ?? [];
  const args = params.map((_, i) => {
    const e = g.val(b, `ARG${i}`);
    const ps = g.next.fnParams.get(f) ?? [];
    ps[i] = ps[i] ? wide(ps[i]!, e.t) : e.t;
    g.next.fnParams.set(f, ps);
    return e.c;
  });
  return `${f}(${args.join(', ')})`;
}

// ---------- expression handlers ----------
type XH = (g: Ctx, b: B) => E;
const e = (c: string, t: Ty, p = ATOM): E => ({ c, t, p });
const X: Record<string, XH> = {
  math_number: (_g, b) => lit(Number(b.fields?.NUM ?? 0) || 0),
  logic_boolean: (_g, b) => e(b.fields?.BOOL === 'FALSE' ? 'false' : 'true', 'bool'),
  text: (_g, b) => ({ ...e(cStr(String(b.fields?.TEXT ?? '')), 'String'), lit: true }),
  text_join: (g, b) => {
    const n = Number(b.extraState?.itemCount ?? 2);
    const parts: E[] = [];
    for (let i = 0; i < n; i++) { const p = g.input(b, `ADD${i}`); if (p) parts.push(p); }
    if (!parts.length) return { ...e('""', 'String'), lit: true };
    if (parts.length === 1 && parts[0]!.t === 'String') return parts[0]!;
    const strs = parts.map((p) => (p.t === 'String' ? p.c : `String(${p.c})`));
    if (parts[0]!.t === 'String' && parts[0]!.lit) strs[0] = `String(${strs[0]})`; // "a" + x is not valid C++
    return e(strs.join(' + '), 'String', ADD);
  },
  text_length: (g, b) => { const t = g.val(b, 'VALUE', { ...e('""', 'String'), lit: true }); return e(`${t.t === 'String' && !t.lit ? wrap(t, ATOM) : `String(${t.c})`}.length()`, 'int'); },
  math_arithmetic: (g, b) => {
    const op = g.field(b, 'OP', 'ADD');
    const a = g.val(b, 'A'), c = g.val(b, 'B');
    if (op === 'POWER') return e(`pow(${a.c}, ${c.c})`, 'float');
    const sym = { ADD: '+', MINUS: '-', MULTIPLY: '*', DIVIDE: '/' }[op] ?? '+';
    const p = sym === '+' || sym === '-' ? ADD : MUL;
    if (sym === '/') {
      // integer / integer would cut off the decimals in C++; do the division with decimals
      const left = a.t === 'float' ? wrap(a, MUL) : `(float)${wrap(a, UNARY)}`;
      return e(`${left} / ${wrap(c, MUL, true)}`, 'float', MUL);
    }
    return e(`${wrap(a, p)} ${sym} ${wrap(c, p, true)}`, num2(a.t, c.t), p);
  },
  math_single: (g, b) => {
    const x = g.val(b, 'NUM');
    const op = g.field(b, 'OP', 'ABS');
    if (op === 'NEG') return e(`-${wrap(x, UNARY, true)}`, num2(x.t, 'int'), UNARY);
    if (op === 'POW10') return e(`pow(10, ${x.c})`, 'float');
    const fn = { ROOT: 'sqrt', ABS: 'abs', LN: 'log', LOG10: 'log10', EXP: 'exp' }[op] ?? 'abs';
    return e(`${fn}(${x.c})`, fn === 'abs' ? num2(x.t, 'int') : 'float');
  },
  math_round: (g, b) => {
    const fn = { ROUND: 'round', ROUNDUP: 'ceil', ROUNDDOWN: 'floor' }[g.field(b, 'OP', 'ROUND')] ?? 'round';
    return e(`(long)${fn}(${g.arg(b, 'NUM')})`, 'long', UNARY);
  },
  math_modulo: (g, b) => e(`${wrap(g.val(b, 'DIVIDEND'), MUL)} % ${wrap(g.val(b, 'DIVISOR', lit(1)), MUL, true)}`, 'int', MUL),
  math_constrain: (g, b) => { const v = g.val(b, 'VALUE'); return e(`constrain(${v.c}, ${g.arg(b, 'LOW')}, ${g.arg(b, 'HIGH', lit(100))})`, v.t === 'float' ? 'float' : 'long'); },
  math_random_int: (g, b) => {
    g.usesRandom = true;
    const to = g.val(b, 'TO', lit(100));
    return e(`random(${g.arg(b, 'FROM', lit(1))}, ${isLiteralNumber(to) ? Number(to.c) + 1 : `${wrap(to, ADD)} + 1`})`, 'long');
  },
  lab_map: (g, b) => e(`map(${g.arg(b, 'VALUE')}, ${g.arg(b, 'FROM_LOW')}, ${g.arg(b, 'FROM_HIGH', lit(1023))}, ${g.arg(b, 'TO_LOW')}, ${g.arg(b, 'TO_HIGH', lit(255))})`, 'long'),
  logic_compare: (g, b) => {
    const op = g.field(b, 'OP', 'EQ');
    const sym = { EQ: '==', NEQ: '!=', LT: '<', LTE: '<=', GT: '>', GTE: '>=' }[op] ?? '==';
    const p = op === 'EQ' || op === 'NEQ' ? EQ : REL;
    let a = g.val(b, 'A'), c = g.val(b, 'B');
    // a keypad / serial letter compared with a one-letter text: compare as a C++ char ('5'), not a string
    const asChar = (x: E) => (x.lit && x.t === 'String' && /^"(?:[^"\\]|\\.)"$/.test(x.c) ? e(`'${x.c.slice(1, -1) === "'" ? "\\'" : x.c.slice(1, -1)}'`, 'char') : x);
    if (a.t === 'char') c = asChar(c);
    if (c.t === 'char') a = asChar(a);
    return e(`${wrap(a, p)} ${sym} ${wrap(c, p, true)}`, 'bool', p);
  },
  logic_operation: (g, b) => {
    const and = g.field(b, 'OP') !== 'OR';
    const f = { c: 'false', p: ATOM, t: 'bool' } as E;
    const p = and ? AND : OR;
    return e(`${wrap(g.val(b, 'A', f, 'false'), p)} ${and ? '&&' : '||'} ${wrap(g.val(b, 'B', f, 'false'), p, true)}`, 'bool', p);
  },
  logic_negate: (g, b) => e(`!${wrap(g.val(b, 'BOOL', { c: 'false', p: ATOM, t: 'bool' }, 'false'), UNARY)}`, 'bool', UNARY),
  variables_get: (g, b) => {
    const v = g.varIdent(b);
    g.getVars.add(v);
    return e(v, g.varType(v));
  },
  procedures_callreturn: (g, b) => {
    const f = g.fnIdent(String(b.extraState?.name ?? ''));
    const t = g.known.fnRet.get(f);
    return e(call(g, b), t && t !== 'void' ? t : 'int');
  },

  lab_millis: () => e('millis()', 'ulong'),
  lab_digital_read: (g, b) => e(`digitalRead(${g.pin(b, 'PIN', g.field(b, 'PULL', 'INPUT'))})`, 'int'),
  lab_button: (g, b) => {
    const down = g.field(b, 'WIRING') === 'PULLDOWN';
    return e(`digitalRead(${g.pin(b, 'PIN', down ? 'INPUT' : 'INPUT_PULLUP')}) == ${down ? 'HIGH' : 'LOW'}`, 'bool', EQ);
  },
  lab_analog_read: (g, b) => e(`analogRead(${g.pin(b, 'PIN')})`, 'int'),
  lab_ultrasonic: (g, b) => {
    g.helpers.set('ultrasonic', HELPERS.ultrasonic);
    return e(`readUltrasonicCm(${g.pin(b, 'TRIG', 'OUTPUT')}, ${g.pin(b, 'ECHO', 'INPUT')})`, 'long');
  },
  lab_dht: (g, b) => { const p = g.pin(b, 'PIN'); return e(`${obj(g, 'dht', p)}.${g.field(b, 'WHAT') === 'HUM' ? 'readHumidity' : 'readTemperature'}()`, 'float'); },
  lab_tmp36: (g, b) => e(`(analogRead(${g.pin(b, 'PIN')}) * 5.0 / 1023.0 - 0.5) * 100.0`, 'float', MUL),
  lab_keypad: (g, b) => {
    const rows = g.field(b, 'ROWS', '2'), cols = g.field(b, 'COLS', '6');
    if (Math.abs(Number(rows) - Number(cols)) < 4) g.warn('키패드의 행 핀과 열 핀이 겹쳐요. 두 시작 핀은 4 이상 떨어뜨려 주세요.');
    g.helpers.set('keypad', HELPERS.keypad);
    return e(`readKeypad(${rows}, ${cols})`, 'char');
  },
  lab_ir: (g, b) => {
    g.helpers.set('ir', HELPERS.ir);
    return e(`readIrCode(${g.pin(b, 'PIN', 'INPUT')})`, 'ulong');
  },
  lab_serial_available: (g) => { g.useSerial(); return e('Serial.available() > 0', 'bool', REL); },
  lab_serial_read: (g) => { g.useSerial(); return e('(char)Serial.read()', 'char', UNARY); },
  lab_serial_read_int: (g) => { g.useSerial(); return e('Serial.parseInt()', 'long'); },
};

// ---------- program assembly ----------
function* walk(b: B | undefined): Generator<B> {
  for (let cur = b; cur; cur = cur.next?.block ?? cur.next?.shadow) {
    yield cur;
    for (const i of Object.values(cur.inputs ?? {})) { yield* walk(i.block); yield* walk(i.shadow); }
  }
}

const INCLUDE_ORDER = ['Wire.h', 'LiquidCrystal_I2C.h', 'Servo.h', 'Adafruit_NeoPixel.h', 'DHT.h'];
const PROGRAM_HEADER = '// 블록으로 만든 프로그램이에요. 블록을 바꾸면 이 코드도 자동으로 바뀝니다.';
export { PROGRAM_HEADER };

function run(tops: B[], varNames: Map<string, string>, opts: GenOptions, known: Known): { ctx: Ctx; code: string } {
  const g = new Ctx(opts, known);
  g.varNames = varNames;
  for (const n of varNames.values()) g.ident(n, 'var'); // reserve every variable name before picking loop counters
  for (const t of tops) for (const b of walk(t)) {
    if (b.type === 'controls_for') g.forVars.add(g.varIdent(b));
    else if (b.type === 'variables_set' || b.type === 'math_change') g.setVars.add(g.varIdent(b));
    else if (b.type === 'procedures_defnoreturn' || b.type === 'procedures_defreturn') {
      g.fnIdent(String(b.fields?.NAME ?? 'fn'));
      for (const p of (b.extraState?.params as { name?: string }[] | undefined) ?? []) if (p.name) g.paramVars.add(g.ident(p.name, 'var'));
    }
  }
  const setup: string[] = [], loop: string[] = [], fns: string[] = [], protos: string[] = [];
  let setups = 0, loops = 0;
  const orphans: string[] = [];
  for (const t of tops) {
    if (t.enabled === false) continue;
    if (t.type === 'lab_setup') { setups++; setup.push(...g.body(t, 'DO')); }
    else if (t.type === 'lab_loop') { loops++; loop.push(...g.body(t, 'DO')); }
    else if (t.type === 'procedures_defnoreturn' || t.type === 'procedures_defreturn') {
      const name = g.fnIdent(String(t.fields?.NAME ?? 'fn'));
      const pnames = ((t.extraState?.params as { name?: string }[] | undefined) ?? []).map((p) => g.ident(p.name ?? 'p', 'var'));
      const ptypes = pnames.map((_, i) => g.known.fnParams.get(name)?.[i] ?? 'int');
      const body = g.body(t, 'STACK');
      let ret = 'void';
      if (t.type === 'procedures_defreturn') {
        const r = g.input(t, 'RETURN');
        const rt: Ty = r?.t ?? 'int';
        g.next.fnRet.set(name, rt);
        body.push(`return ${r?.c ?? '0'};`);
        ret = CTYPE[g.known.fnRet.get(name) && g.known.fnRet.get(name) !== 'void' ? (g.known.fnRet.get(name) as Ty) : rt];
      } else g.next.fnRet.set(name, 'void');
      const sig = `${ret} ${name}(${pnames.map((p, i) => `${CTYPE[ptypes[i]!]} ${p}`).join(', ')})`;
      protos.push(`${sig};`);
      fns.push(...block(sig, body), '');
    } else if (S[t.type]) orphans.push(t.type);
  }
  if (orphans.length) g.warn('"처음 한 번 실행" 이나 "계속 반복" 안에 들어 있지 않은 블록은 실행되지 않아요.');
  if (setups > 1) g.warn('"처음 한 번 실행" 블록이 여러 개예요. 모두 합쳐서 실행해요.');
  if (loops > 1) g.warn('"계속 반복" 블록이 여러 개예요. 모두 합쳐서 실행해요.');

  // variables: every variable that is written, or read without being only a loop counter / function parameter
  const declared = new Set([...g.setVars, ...[...g.getVars].filter((v) => !g.forVars.has(v) && !g.paramVars.has(v))]);
  const origOf = new Map(g.names.map((n) => [n.ident, n.orig]));
  const vars = [...declared].map((v) => {
    const t = g.known.vars.get(v) ?? 'int';
    const init = t === 'String' ? '""' : t === 'bool' ? 'false' : t === 'float' ? '0.0' : '0';
    const o = origOf.get(v);
    return `${CTYPE[t]} ${v} = ${init};${o && o !== v ? `  // 변수 "${o}"` : ''}`;
  });
  for (const n of g.names) if (n.ident.startsWith('fn') && /[^\x00-\x7f]/.test(n.orig)) g.globals.push(`// 함수 "${n.orig}" = ${n.ident}`);

  const setupLines: string[] = [];
  if (g.serial) setupLines.push('Serial.begin(9600);  // 시리얼 통신 시작 (모니터와 같은 속도 9600)');
  for (const [p, m] of g.pinModes) setupLines.push(`pinMode(${p}, ${m});${cmt(`핀 ${p}: ${m === 'OUTPUT' ? '출력' : m === 'INPUT' ? '입력' : '풀업 입력'}`)}`);
  setupLines.push(...g.setupInit.values());
  if (g.usesRandom) setupLines.push('randomSeed(analogRead(A5));  // 연결 안 된 핀의 잡음으로 무작위 시작점 만들기');
  setupLines.push(...setup);

  const inc = [...g.includes].sort((a, b) => INCLUDE_ORDER.indexOf(a) - INCLUDE_ORDER.indexOf(b));
  const parts: string[][] = [[PROGRAM_HEADER]];
  if (inc.length) parts.push(inc.map((h) => `#include <${h}>`));
  if (vars.length || g.globals.length) parts.push(['// ---- 변수 ----', ...vars, ...g.globals]);
  if (g.objects.size) parts.push(['// ---- 부품 ----', ...g.objects.values()]);
  if (g.helpers.size) parts.push([...g.helpers.values()].join('\n\n').split('\n'));
  if (fns.length) parts.push([...protos, '', ...fns.slice(0, -1)]);
  parts.push(block('void setup()', setupLines.length ? setupLines : ['// 처음 한 번 실행할 블록이 없어요']));
  parts.push(block('void loop()', loop.length ? loop : ['// "계속 반복" 블록 안에 블록을 넣어 보세요']));
  return { ctx: g, code: parts.map((p) => p.join('\n')).join('\n\n') + '\n' };
}

export function generate(state: unknown, opts: GenOptions = {}): GenResult {
  const s = (state ?? {}) as { blocks?: { blocks?: B[] }; variables?: { id?: string; name?: string }[] };
  const tops = Array.isArray(s.blocks?.blocks) ? s.blocks.blocks : [];
  const varNames = new Map<string, string>();
  for (const v of s.variables ?? []) if (v.id && v.name) varNames.set(v.id, v.name);
  const first = run(tops, varNames, opts, { vars: new Map(), fnRet: new Map(), fnParams: new Map() });
  const second = run(tops, varNames, opts, first.ctx.next);
  return { code: second.code, warnings: second.ctx.warnings };
}

/** Block type names the generator can turn into code (tests compare this with defs.ts). */
export const HANDLED_TYPES = new Set([...Object.keys(S), ...Object.keys(X), 'lab_setup', 'lab_loop', 'procedures_defnoreturn', 'procedures_defreturn']);
/** True when `code` is exactly what the blocks generate (no hand edits yet). */
export const isGeneratedCode = (state: unknown, code: string, opts: GenOptions = {}) => generate(state, opts).code === code;
