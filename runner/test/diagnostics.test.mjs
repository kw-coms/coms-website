import test from 'node:test';
import assert from 'node:assert/strict';
import { detectJavaClass, hintFor, parseDiagnostics, stripPaths } from '../diagnostics.mjs';

test('gcc and javac locations and beginner hints', () => {
  const c = parseDiagnostics('/tmp/study-abc/main.c:3:5: error: expected ‘;’ before ‘}’ token\nmain.c:4:2: warning: control reaches end of non-void function', { lang: 'c' });
  assert.deepEqual(c.map(x => [x.line, x.column, x.severity]), [[3, 5, 'error'], [4, 2, 'warning']]);
  assert.match(c[0].hintKo, /세미콜론/);
  assert.match(c[1].hintKo, /반환/);
  const java = parseDiagnostics('Main.java:7: error: incompatible types: String cannot be converted to int', { lang: 'java' });
  assert.equal(java[0].line, 7);
  assert.match(java[0].hintKo, /자료형/);
});

test('Python traceback and Java runtime stack point to student lines', () => {
  const py = parseDiagnostics('Traceback (most recent call last):\n  File "/tmp/study-abc/main.py", line 4, in <module>\n    print(1/0)\nZeroDivisionError: division by zero', { lang: 'python' });
  assert.deepEqual(py.map(x => [x.line, x.severity]), [[4, 'error']]);
  assert.match(py[0].hintKo, /0/);
  const java = parseDiagnostics('Exception in thread "main" java.lang.NullPointerException\n\tat Main.main(Main.java:12)', { lang: 'java' });
  assert.equal(java[0].line, 12);
  assert.match(java[0].hintKo, /null/);
});

test('all requested beginner hints have coverage', () => {
  for (const [message, expected] of [
    ['use of undeclared identifier', /철자/], ['NameError: name x is not defined', /철자/],
    ['IndentationError: unexpected indent', /들여쓰기/], ['SyntaxError: invalid syntax', /문법/],
    ['IndexError: list index out of range', /인덱스/],
    ['java.lang.ArrayIndexOutOfBoundsException: Index 4', /인덱스/],
    ['class Foo is public, should be declared in a file named Foo.java', /파일 이름/],
  ]) assert.match(hintFor(message), expected);
});

test('stripPaths removes absolute paths and temp names from arbitrary output', () => {
  const actual = stripPaths('at /tmp/study-secret/main.c and C:\\Users\\secret\\Main.java\nopen "/etc/shadow"', { tempDir: '/tmp/study-secret' });
  assert.doesNotMatch(actual, /study-secret|Users|shadow|\/tmp/);
  assert.match(actual, /main\.c|Main\.java/);
  assert.equal(stripPaths('/tmp/work/Hello.java', { tempDir: '/tmp/work' }), 'Hello.java');
  assert.equal(parseDiagnostics(stripPaths('/tmp/work/main.c:2:3: error: undeclared x', { tempDir: '/tmp/work' }), { lang: 'c', tempDir: '/tmp/work' })[0].line, 2);
});

test('Java class detection ignores comments and strings', () => {
  assert.equal(detectJavaClass('// public class Fake\npublic class Hello { public static void main(String[] args) {} }'), 'Hello');
  assert.equal(detectJavaClass('String sample = "public class Fake"; public final class Real { public static void main(String[] a) {} }'), 'Real');
  assert.equal(detectJavaClass('class Utility { static void main(String[] a) {} } public class Data {}'), 'Main');
  assert.equal(detectJavaClass('class Helper {}'), 'Main');
});
