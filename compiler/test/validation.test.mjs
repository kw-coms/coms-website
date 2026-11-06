import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSketch, ALLOWED_HEADERS } from '../validation.mjs';

for (const header of ALLOWED_HEADERS) test(`allows ${header}`, () => assert.equal(validateSketch(`#include <${header}>\nvoid setup(){} void loop(){}`), null));
for (const input of [
  '#include "Servo.h"', '#include <../Servo.h>', '#include </etc/passwd>',
  '#include <foo\\bar.h>', '#include <avr/../pgmspace.h>', '#include <notallowed.h>',
  '#include_next <Servo.h>', '#import <Servo.h>', '#pragma once',
  '#if __has_include(<private.h>)', 'asm(".incbin /etc/passwd");',
  '__asm__("incbin /etc/passwd");', '#define INC(x) ##x',
  '#\\\ninclude "Servo.h"', '#\ninclude "Servo.h"',
  '#include \\\n"Servo.h"', '#include </tmp/secret.h>',
]) test(`rejects unsafe input ${JSON.stringify(input)}`, () => assert.ok(validateSketch(input)));
test('allows comments containing unsafe directive', () => assert.equal(validateSketch('// #include "secret.h"\n/* #pragma once */\nvoid setup(){}'), null));
test('rejects invalid sketch type', () => assert.ok(validateSketch(null)));
test('rejects sketch over 64 KiB in UTF-8 bytes', () => assert.ok(validateSketch('가'.repeat(22000))));

test('rejects digit-separator lexer confusion hiding a quoted include', () => {
  assert.ok(validateSketch(`int n=1'000;\nconst char* s="'/*";\n#include "/etc/passwd"\n// */`));
});
for (const sketch of ["const char* x=\"unterminated\n/*\n#include <secret.h>", "char x = 'unterminated", '/* never closed']) {
  test(`rejects ambiguous lexical state ${JSON.stringify(sketch)}`, () => assert.ok(validateSketch(sketch)));
}
test('keeps comment markers inside ordinary strings as data', () => {
  assert.equal(validateSketch('const char* url = "https://example.com/*";\n#include <Servo.h>'), null);
  assert.ok(validateSketch('const char* url = "https://example.com/*";\n#include "/etc/passwd"'));
});
test('splices escaped newlines before stripping line comments', () => {
  assert.equal(validateSketch('// continued \\\n#include "ignored.h"\n#include <Servo.h>'), null);
  assert.ok(validateSketch('#inc\\\nlude <secret.h>'));
  assert.ok(validateSketch('#include /* comment */ "secret.h"'));
});

test('does not erase path characters inside header-name tokens', () => {
  assert.ok(validateSketch('#include <Servo.h/*../secret*/>'));
  assert.ok(validateSketch('#/**/include/**/<Servo.h/*../secret*/>'));
  assert.ok(validateSketch('#include <Servo.h//../secret>'));
  assert.equal(validateSketch('#/**/include/**/<Servo.h> // safe trailing comment'), null);
});
