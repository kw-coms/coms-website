import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeText, parseDiagnostics, hintFor, MAX_DIAGNOSTICS } from '../diagnostics.mjs';

test('maps gcc location to user line and column', () => {
  assert.deepEqual(parseDiagnostics('/tmp/job/sketch/sketch.ino:3:7: error: expected primary-expression', { tempDir: '/tmp/job', sketchLines: 4 })[0],
    { line: 3, column: 7, severity: 'error', message: 'expected primary-expression', hintKo: hintFor('expected primary-expression') });
});
test('drops compiler location outside user sketch', () => assert.deepEqual(parseDiagnostics('sketch.ino:99:1: warning: issue', { sketchLines: 3 }), []));
test('strips absolute Unix and Windows paths', () => {
  const output = sanitizeText('open /etc/passwd C:\\Temp\\secret.h /tmp/circuit-lab-abc', '/tmp/circuit-lab-abc');
  assert.doesNotMatch(output, /passwd|Temp|circuit-lab-abc/);
});
test('caps returned diagnostic count and text', () => {
  const rows = Array.from({ length: 40 }, () => `sketch.ino:1:1: warning: ${'x'.repeat(900)}`).join('\n');
  const result = parseDiagnostics(rows);
  assert.equal(result.length, MAX_DIAGNOSTICS);
  assert.ok(result[0].message.length <= 800);
});
for (const message of [
  "expected ';' before '}' token", "'foo' was not declared in this scope", "'OUTPUT' was not declared in this scope",
  "'digitalwrite' was not declared in this scope", "expected '}' at end of input", 'undefined reference to `setup`',
  'expected primary-expression', 'invalid conversion from int to char*', 'too many arguments to function', 'Sketch too big',
]) test(`adds Korean hint for ${message}`, () => assert.match(hintFor(message) || '', /[가-힣]/));

test('prioritizes errors and their hints after many warnings', () => {
  const warnings = Array.from({ length: 30 }, () => 'sketch.ino:1:1: warning: something').join('\n');
  const result = parseDiagnostics(`${warnings}\nsketch.ino:2:3: error: expected ';' before '}' token`);
  assert.equal(result.length, MAX_DIAGNOSTICS);
  assert.equal(result[0].severity, 'error');
  assert.equal(result[0].line, 2);
  assert.match(result[0].hintKo, /세미콜론/);
});

test('drops other-file errors, notes, snippets, generic output and spoofed sketch basenames', () => {
  const result = parseDiagnostics([
    '/etc/passwd:1:1: error: FILE_CONTENT_SENTINEL',
    '/opt/arduino/secret.h:2:3: warning: FILE_CONTENT_SENTINEL',
    '/other/sketch.ino:1:1: error: FILE_CONTENT_SENTINEL',
    '/tmp/job/sketch/sketch.ino:2:1: note: FILE_CONTENT_SENTINEL error: leak',
    'FILE_CONTENT_SENTINEL error: leak',
    'error: FILE_CONTENT_SENTINEL',
    '/opt/arduino/secret.h:1: note: undefined reference to FILE_CONTENT_SENTINEL',
    '  1 | FILE_CONTENT_SENTINEL',
    '/tmp/job/sketch/sketch.ino:1:1: error: expected primary-expression',
  ].join('\n'), { tempDir: '/tmp/job', sketchLines: 2 });
  assert.equal(result.length, 1);
  assert.equal(result[0].message, 'expected primary-expression');
  assert.doesNotMatch(JSON.stringify(result), /FILE_CONTENT_SENTINEL/);
});
test('maps linker failures to fixed messages without echoing foreign symbols', () => {
  const result = parseDiagnostics("/tmp/job/build/x.o: undefined reference to `FILE_CONTENT_SENTINEL'\ncollect2: error: ld returned 1 exit status");
  assert.equal(result.length, 1);
  assert.match(result[0].message, /[가-힣]/);
  assert.doesNotMatch(JSON.stringify(result), /FILE_CONTENT_SENTINEL/);
});
