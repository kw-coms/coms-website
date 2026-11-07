import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseDebugInfo, MAX_DEBUG_OUTPUT, MAX_DEBUG_LINES } from '../debug-info.mjs';
const options = { sketchPath: '/fixture/sketch/sketch.ino', sketchLines: 10 };
const lto = await readFile(new URL('./fixtures/debug/avr-gcc7-lto.txt', import.meta.url), 'utf8');
const dwarf4 = await readFile(new URL('./fixtures/debug/avr-gcc7-dwarf4.txt', import.meta.url), 'utf8');

test('recorded GCC 7 -Os -flto maps preprocessor #line to user lines, not generated cpp', () => {
  const result = parseDebugInfo(lto, options);
  assert.deepEqual(result.lines, [
    { addr: 0x96, line: 5 }, { addr: 0x9e, line: 8 }, { addr: 0xa2, line: 7 },
    { addr: 0xb4, line: 8 }, { addr: 0xce, line: 9 },
  ]);
  assert.deepEqual(result.globals, [
    { name: 'temperature', addr: 0x100, size: 4, type: 'volatile float' },
    { name: 'leds', addr: 0x104, size: 3, type: 'volatile uint8_t[3]' },
    { name: 'counter', addr: 0x109, size: 2, type: 'volatile int' },
  ]);
  // Optimized-out message, library globals and MCU registers are not watches.
  assert.doesNotMatch(JSON.stringify(result), /coreGlobal|UDR0|eeprom|message|fixture|\.cpp|\.ino/);
});
test('recorded DWARF4 supports typedefs, const pointers and SRAM globals', () => {
  const result = parseDebugInfo(dwarf4, options);
  assert.ok(result.lines.length > 0);
  assert.ok(result.lines.every(({ line }) => line >= 5 && line <= 10));
  assert.ok(result.globals.some(g => g.name === 'message' && g.type === 'const char *' && g.size === 2));
  assert.ok(result.globals.some(g => g.name === 'counter' && g.type === 'volatile int'));
});
test('requires exact sketch path, not merely matching basename', () => {
  assert.deepEqual(parseDebugInfo(lto, { ...options, sketchPath: '/foreign/sketch.ino' }), { lines: [], globals: [] });
  const result = parseDebugInfo(lto.replaceAll('/fixture/sketch', '/foreign'), options);
  assert.deepEqual(result, { lines: [], globals: [] });
});
test('excludes out of range line numbers, malformed addresses and location expressions', () => {
  assert.deepEqual(parseDebugInfo(lto, { ...options, sketchLines: 0 }), { lines: [], globals: [] });
  const bad = lto.replaceAll('DW_OP_addr: 800', 'DW_OP_addr: 810');
  assert.deepEqual(parseDebugInfo(bad, options).globals, []);
  const dynamic = lto.replaceAll('DW_OP_addr:', 'DW_OP_fbreg:');
  assert.deepEqual(parseDebugInfo(dynamic, options).globals, []);
  assert.deepEqual(parseDebugInfo('', options), { lines: [], globals: [] });
});
test('bounds text input and line response, sorts and deduplicates byte addresses', () => {
  assert.throws(() => parseDebugInfo('x'.repeat(MAX_DEBUG_OUTPUT + 1), options), /limit/);
  const text = 'Decoded dump of debug contents of section .debug_line:\n/fixture/sketch/sketch.ino:\n'
    + Array.from({ length: 5000 }, (_, n) => `sketch.ino 5 0x${(n * 2).toString(16)}\n`).join('');
  const result = parseDebugInfo(text, options);
  assert.equal(result.lines.length, MAX_DEBUG_LINES);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 128 * 1024);
  assert.deepEqual(parseDebugInfo(text + 'sketch.ino 5 0x1\nsketch.ino 5 0x8000\n', options), result);
});
test('malicious type/name strings and cyclic type references are omitted', () => {
  assert.ok(!parseDebugInfo(lto.replaceAll(': counter', ': /etc/passwd'), options).globals.some(g => g.name.includes('/')));
  assert.ok(!parseDebugInfo(lto.replaceAll(': int\n', ': /etc/passwd\n'), options).globals.some(g => g.name === 'counter'));
  assert.ok(!parseDebugInfo(lto.replace('<6eb>   DW_AT_type        : <0x6e3>', '<6eb>   DW_AT_type        : <0x6ea>'), options).globals.some(g => g.name === 'counter'));
});

test('recorded pointer qualifiers preserve meaning; unsupported pointees are omitted', async () => {
  const text = await readFile(new URL('./fixtures/debug/avr-gcc7-pointers.txt', import.meta.url), 'utf8');
  const { globals } = parseDebugInfo(text, options);
  assert.equal(globals.find(g => g.name === 'pointer')?.type, 'int * volatile');
  assert.equal(globals.find(g => g.name === 'pointee')?.type, 'const int *');
  assert.equal(globals.find(g => g.name === 'opaque')?.type, 'void * volatile');
  assert.ok(!globals.some(g => g.name === 'functionPointer' || g.name === 'arrayPointer'));
});
