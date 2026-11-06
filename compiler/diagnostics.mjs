import { basename } from 'node:path';

export const MAX_DIAGNOSTICS = 30;
const MAX_TEXT = 800;
export function sanitizeText(text, tempDir = '') {
  let clean = String(text).replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
  if (tempDir) {
    clean = clean.split(tempDir).join('[작업폴더]');
    clean = clean.split(basename(tempDir)).join('[작업폴더]');
  }
  // Redact Unix, Windows drive and UNC absolute paths, including quoted paths
  // with spaces. Do not return compiler source snippets or unfiltered stdout.
  clean = clean.replace(/(["'`])(?:[A-Za-z]:[\\/]|\/|\\\\)[^\n]*?\1/g, '[경로]');
  clean = clean.replace(/(?:[A-Za-z]:[\\/]|\\\\|\/)[^\s<>"'`;,)]*/g, '[경로]');
  return clean.slice(0, MAX_TEXT);
}
export function hintFor(message) {
  if (/['‘]OUTPUT['’].*was not declared|['‘]output['’].*was not declared/.test(message)) return '핀 모드는 대소문자를 구분해요. OUTPUT을 모두 대문자로 써 주세요.';
  if (/digitalwrite|digitalWrite.*did you mean/i.test(message)) return '함수 이름은 대소문자를 구분해요. digitalWrite처럼 W를 대문자로 써 주세요.';
  if (/expected ['‘];['’] before|expected ['‘];['’] at end/.test(message)) return '명령문 끝에 세미콜론(;)이 빠졌는지 앞줄도 확인해 주세요.';
  if (/was not declared in this scope/.test(message)) return '변수/함수 이름 철자, 선언 위치, 라이브러리 include를 확인해 주세요.';
  if (/expected.*['‘][{}]['’]|expected.*(?:closing|opening).*brace/.test(message)) return '중괄호 { 와 }의 짝과 함수 시작·끝을 확인해 주세요.';
  if (/undefined reference to.*(?:setup|loop)/.test(message)) return 'void setup()와 void loop() 함수를 모두 만들어 주세요.';
  if (/expected primary-expression/.test(message)) return '괄호 안의 값이나 식, 쉼표 뒤에 빠진 인수가 없는지 확인해 주세요.';
  if (/invalid conversion/.test(message)) return '값의 자료형이 맞는지 확인해 주세요. 숫자, 문자열, 포인터는 서로 달라요.';
  if (/too many arguments/.test(message)) return '함수에 전달한 인수의 개수를 확인해 주세요.';
  if (/sketch too big|text section exceeds|region .*overflowed|will not fit in region/i.test(message)) return 'UNO의 플래시 용량을 초과했어요. 큰 배열·문자열이나 사용하지 않는 코드를 줄여 주세요.';
}
export function parseDiagnostics(output, { tempDir = '', sketchLines = Infinity } = {}) {
  const errors = [], warnings = [];
  for (const raw of String(output).split(/\r?\n/)) {
    // Arduino preserves user locations via #line in its generated .ino.cpp.
    const match = raw.match(/(?:^|[\\/])sketch\.ino:(\d+)(?::(\d+))?:\s*(?:fatal )?(error|warning):\s*(.*)$/);
    const generic = !match && raw.match(/(?:^|\s)(?:fatal )?(error|warning):\s*(.*)$/);
    let diagnostic;
    if (match) {
      const line = Number(match[1]);
      diagnostic = { line: line > 0 && line <= sketchLines ? line : 0,
        ...(match[2] ? { column: Number(match[2]) } : {}), severity: match[3], message: match[4] };
    } else if (generic) {
      diagnostic = { line: 0, severity: generic[1], message: generic[2] };
    } else if (/undefined reference to|sketch too big|text section exceeds|region .*overflowed|will not fit in region/i.test(raw)) {
      diagnostic = { line: 0, severity: 'error', message: raw };
    }
    if (!diagnostic) continue;
    const hintKo = hintFor(diagnostic.message);
    diagnostic.message = sanitizeText(diagnostic.message, tempDir);
    if (hintKo) diagnostic.hintKo = hintKo;
    const target = diagnostic.severity === 'error' ? errors : warnings;
    if (target.length < MAX_DIAGNOSTICS) target.push(diagnostic);
  }
  return [...errors, ...warnings].slice(0, MAX_DIAGNOSTICS);
}
