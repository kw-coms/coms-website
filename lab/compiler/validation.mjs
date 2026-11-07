export const ALLOWED_HEADERS = new Set([
  'Arduino.h', 'Wire.h', 'SPI.h', 'Servo.h', 'LiquidCrystal_I2C.h', 'DHT.h',
  'Adafruit_Sensor.h', 'Adafruit_NeoPixel.h', 'EEPROM.h', 'math.h', 'string.h',
  'stdlib.h', 'avr/pgmspace.h',
]);
export const MAX_SKETCH_BYTES = 64 * 1024;
const ALLOWED_DIRECTIVES = new Set(['define', 'undef', 'if', 'ifdef', 'ifndef', 'elif', 'else', 'endif', 'error', 'warning']);

// Translation phase 2 (line splicing) precedes phase 3 (comment removal).
// A block comment is whitespace, even across physical lines. Keep line-comment
// terminators and quoted literals intact; comment-like text in strings is data.
export function stripComments(source) {
  let result = '', state = 'code';
  // Recognize only the prefix that permits a header-name token. Track emitted
  // characters, since removed comments become whitespace in the logical line.
  let directive = 0;
  const include = 'include';
  function emit(c) {
    result += c;
    if (c === '\n') { directive = 0; return; }
    if (directive < 0) return;
    if (directive === 0) directive = /\s/.test(c) ? 0 : c === '#' ? 1 : -1;
    else if (directive === 1) directive = /\s/.test(c) ? 1 : c === 'i' ? 2 : -1;
    else if (directive < 8) directive = c === include[directive - 1] ? directive + 1 : -1;
    else directive = /\s/.test(c) ? 8 : -1;
  }
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (state === 'header') {
      if (c === '\n') throw new Error('unterminated header');
      emit(c);
      if (c === '>') state = 'code';
    } else if (state === 'line') {
      emit(c === '\n' ? '\n' : ' ');
      if (c === '\n') state = 'code';
    } else if (state === 'block') {
      if (c === '*' && next === '/') { emit(' '); emit(' '); i++; state = 'code'; }
      else emit(' ');
    } else if (state === '"' || state === "'") {
      if (c === '\n') throw new Error('multiline literal');
      emit(c);
      if (c === '\\' && next !== undefined) emit(source[++i]);
      else if (c === state) state = 'code';
    } else if (c === '<' && directive === 8) {
      // In a header-name token, /* and // are path characters, not comments.
      emit(c); state = 'header';
    } else if (c === '/' && (next === '/' || next === '*')) {
      emit(' '); emit(' '); i++; state = next === '/' ? 'line' : 'block';
    } else {
      emit(c);
      if (c === "'" && /[a-zA-Z0-9_]/.test(source[i - 1] || '')) throw new Error('unsupported digit separator or prefixed character');
      if (c === '"' || c === "'") state = c;
    }
  }
  if (state !== 'code' && state !== 'line') throw new Error('unterminated literal or comment');
  return result;
}

export function validateSketch(sketch) {
  if (typeof sketch !== 'string') return 'sketch는 문자열이어야 해요.';
  if (Buffer.byteLength(sketch, 'utf8') > MAX_SKETCH_BYTES) return '스케치는 64 KB 이하로 작성해 주세요.';
  // Reject alternate preprocessing spellings before interpreting any comments.
  const logical = sketch.replace(/\r\n?/g, '\n').replace(/\\[\t \v\f]*\n/g, '');
  // Check both forms: splicing can itself assemble a forbidden token. These
  // spellings are excluded everywhere, including comments and literal contents.
  for (const text of [sketch, logical]) {
    if (/\?\?[=/]|%:|\0/.test(text)) return '대체 전처리 기호나 NUL 문자는 사용할 수 없어요.';
    if (/\\[uU]/.test(text)) return '유니버설 문자 이름(UCN)은 사용할 수 없어요.';
    if (/__has_\w*/i.test(text)) return '파일 탐색 등 __has_ 계열 기능은 사용할 수 없어요.';
  }
  let source;
  try { source = stripComments(logical); }
  catch { return '따옴표·주석의 끝을 확인해 주세요. 숫자 구분자와 접두 문자 리터럴은 지원하지 않아요.'; }
  // Conservative teaching subset: forbid raw strings and all inline assembly/pragmas,
  // rather than attempting to interpret assembler string escapes or token pasting.
  if (/\b(?:u8|u|U|L)?R"|\b(?:_Pragma|__pragma|__asm__|__asm|asm|incbin)\b|##/i.test(source)) {
    return '파일 탐색, 인라인 어셈블리, pragma, 토큰 결합 또는 raw 문자열은 사용할 수 없어요.';
  }
  for (const line of source.split('\n')) {
    if (!/^\s*#/.test(line)) continue;
    const directive = line.match(/^\s*#\s*([a-zA-Z_][a-zA-Z_0-9]*)\b(.*)$/);
    if (!directive) return '지원하지 않는 전처리 지시문이에요.';
    const [, name, body] = directive;
    if (name === 'include') {
      const match = body.match(/^\s*<([^<>]+)>\s*$/);
      if (!match || !ALLOWED_HEADERS.has(match[1])) return '허용된 라이브러리만 #include <헤더.h> 형식으로 사용할 수 있어요.';
    } else if (!ALLOWED_DIRECTIVES.has(name)) {
      return 'include_next, import, pragma, line 등 지원하지 않는 전처리 지시문은 사용할 수 없어요.';
    }
  }
  return null;
}
