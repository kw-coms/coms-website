import { basename } from 'node:path';

export const MAX_DIAGNOSTICS = 100;

// Redact paths before compiler messages or program stderr leave the container. The job's own
// temp dir is always removed; elsewhere only Windows-style paths and absolute paths under
// known system prefixes are rewritten, so ordinary text such as `1/2`, `2024/11/07`,
// `and/or` or `http://x.y/z` survives. Program stdout passes redactSystemPaths: false.
const SYSTEM_PATH = String.raw`\/(?:jobs|tmp|usr|opt|proc|app|run|etc|var|home|dev|sys|root|bin|sbin|lib|lib64|mnt|srv|boot)(?:\/[^\s<>"'\x60;,):]*)?`;
export function stripPaths(text, { tempDir = '', redactSystemPaths = true } = {}) {
  let value = String(text).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
  if (tempDir) {
    value = value.split(`${tempDir}/`).join('');
    value = value.split(`${tempDir}\\`).join('');
    value = value.split(tempDir).join('[작업폴더]');
    value = value.split(basename(tempDir)).join('[작업폴더]');
  }
  if (!redactSystemPaths) return value;
  const redact = path => {
    const leaf = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
    return /^(?:main\.c|main\.py|[A-Za-z_$][\w$]*\.java)$/.test(leaf) ? leaf : '[경로]';
  };
  const system = new RegExp(`(?<![\\w.:/~-])${SYSTEM_PATH}`, 'g');
  value = value.replace(/(["'\x60])((?:(?<!\w)[A-Za-z]:[\\/]|\\\\)[^\n]*?)\1/g, (_, quote, path) => `${quote}${redact(path)}${quote}`);
  return value.replace(/(?:(?<!\w)[A-Za-z]:[\\/]|\\\\)[^\s<>"'\x60;,):]*/g, redact).replace(system, redact);
}

export function hintFor(message) {
  if (/expected [‘'`]?[;][’'`]?|';' expected|missing semicolon/i.test(message)) return '명령문 끝에 세미콜론(;)이 빠졌는지 확인해 주세요.';
  if (/undeclared|was not declared|cannot find symbol|NameError/i.test(message)) return '변수나 함수 이름의 철자와 선언 위치를 확인해 주세요.';
  if (/incompatible types|type mismatch|invalid conversion|incompatible pointer/i.test(message)) return '값과 변수의 자료형이 맞는지 확인해 주세요.';
  if (/missing return statement|control reaches end of non-void function/i.test(message)) return '반환값이 필요한 함수의 모든 경로에서 값을 반환해 주세요.';
  if (/IndentationError|unexpected indent|expected an indented block/i.test(message)) return '들여쓰기의 깊이와 탭·공백 사용을 확인해 주세요.';
  if (/SyntaxError/i.test(message)) return '괄호, 콜론, 따옴표와 문법을 앞줄부터 확인해 주세요.';
  if (/ZeroDivisionError|\/ by zero/i.test(message)) return '나누는 값이 0인지 먼저 확인해 주세요.';
  if (/IndexError|ArrayIndexOutOfBoundsException/i.test(message)) return '배열이나 목록의 인덱스가 범위 안에 있는지 확인해 주세요.';
  if (/NullPointerException/i.test(message)) return '사용하기 전에 객체가 null인지 확인해 주세요.';
  if (/class .* is public, should be declared in a file named|class name mismatch/i.test(message)) return 'public 클래스 이름과 .java 파일 이름이 같아야 해요.';
}

function diagnostic(line, column, severity, message, tempDir) {
  const result = { line, ...(column ? { column } : {}), severity, message: stripPaths(message, { tempDir }).slice(0, 800) };
  const hintKo = hintFor(message);
  if (hintKo) result.hintKo = hintKo;
  return result;
}

export function parseDiagnostics(text, { lang, tempDir = '' } = {}) {
  const lines = String(text).split(/\r?\n/);
  const found = [];
  for (let i = 0; i < lines.length && found.length < MAX_DIAGNOSTICS; i++) {
    const raw = lines[i];
    let match;
    if (lang === 'c') {
      match = raw.match(/^(?:.*[\\/])?main\.c:(\d+):(\d+):\s*(?:fatal )?(error|warning):\s*(.*)$/);
      if (match) found.push(diagnostic(Number(match[1]), Number(match[2]), match[3], match[4], tempDir));
    } else if (lang === 'java') {
      match = raw.match(/^(?:.*[\\/])?[A-Za-z_$][\w$]*\.java:(\d+):\s*(error|warning):\s*(.*)$/);
      if (match) found.push(diagnostic(Number(match[1]), undefined, match[2], match[3], tempDir));
      else {
        match = raw.match(/^\s*at [\w.$/<>]+\((?:[A-Za-z_$][\w$]*\.java):(\d+)\)/);
        if (match && i > 0) found.push(diagnostic(Number(match[1]), undefined, 'error', lines[i - 1].trim(), tempDir));
      }
    } else if (lang === 'python') {
      match = raw.match(/^\s*File ["'](?:.*[\\/])?main\.py["'], line (\d+)/);
      if (match) {
        const last = lines.slice(i + 1).find(line => /^(?:[\w.]+(?:Error|Exception)):/.test(line.trim()));
        if (last) found.push(diagnostic(Number(match[1]), undefined, 'error', last.trim(), tempDir));
      }
    }
  }
  return found;
}

// Blank comments and literals without shifting source positions; regex matching
// the original text would let a quoted example choose the Java filename.
function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    match => match.replace(/[^\n]/g, ' '));
}

export function detectJavaClass(code) {
  const source = codeOnly(String(code));
  const declaration = /\bpublic\s+(?:(?:final|abstract)\s+)?class\s+([A-Za-z_$][\w$]*)\b/g;
  for (const match of source.matchAll(declaration)) {
    const opening = source.indexOf('{', match.index + match[0].length);
    if (opening < 0) continue;
    let depth = 0;
    for (let i = opening; i < source.length; i++) {
      if (source[i] === '{') depth++;
      if (source[i] === '}' && --depth === 0) {
        if (/\bstatic\s+void\s+main\s*\(/.test(source.slice(opening, i))) return match[1];
        break;
      }
    }
  }
  return 'Main';
}
