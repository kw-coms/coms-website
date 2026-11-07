// Shared by validator and HTTP handler tests: every case must stop before the CLI.
export const rejectedSketches = [
  ['has-include double-underscore oracle', '#if __has_include__(</etc/passwd>)\n#error yes\n#endif'],
  ...['__has_include', '__has_include_next', '__has_include_next__', '__has_embed', '__has_attribute', '__has_', '__has_future_operator'].map(name =>
    [`reserved probe ${name}`, `#define PROBE ${name}(</etc/passwd>)`]),
  ['probe in ordinary code', 'int __has_secret = 0;'],
  ['probe in comment', '// __has_include__(</etc/passwd>)'],
  ['spliced probe identifier', '#if __has_inclu\\\nde__(</etc/passwd>)\n#endif'],
  ...['pragma once', 'pragma GCC dependency "/etc/passwd"', 'pragma GCC poison setup', 'pragma push_macro("x")', 'pragma pop_macro("x")', 'line 1 "/etc/passwd"', 'include_next <Servo.h>', 'import <Servo.h>', 'embed </etc/passwd>', 'ident "x"', 'sccs "x"', 'assert system(unix)', 'unassert system(unix)', 'unknown x', '', '123 junk', '"junk"'].map(body =>
    [`directive #${body || '(null)'}`, `#${body}`]),
  ['directive behind multiline block comment', '#/*\n*/pragma GCC dependency "/etc/passwd"'],
  ['directive argument behind multiline block comment', '#include /*\n*/ "/etc/passwd"'],
  ['directive after multiline comment at line start', '/*\n*/ #pragma once'],
  ['spliced directive', '#prag\\\nma once'],
  ['spliced CRLF directive', '#prag\\\r\nma once'],
  ['digraph hash', '%:include "/etc/passwd"'],
  ['digraph paste', '#define X(a,b) a %:%: b'],
  ['trigraph hash', '??=include "/etc/passwd"'],
  ['trigraph backslash', '#inc??/\nlude "/etc/passwd"'],
  ['lowercase UCN', '#define X \\u005f_has_include__'],
  ['uppercase UCN', '#define X \\U0000005f_has_include__'],
  ['UCN in string', 'const char* s="\\u0041";'],
  ['spliced UCN', '#define X ' + '\\' + '\\\n' + 'u005f_has_include__'],
  ['spliced digraph', '%\\\n:include "/etc/passwd"'],
  ['spliced token paste', '#define X(a,b) a #\\\n# b'],
  ...['asm', '__asm__', '__asm', '.incbin', 'incbin', '_Pragma', '__pragma'].map(name =>
    [`forbidden token ${name}`, `#define X ${name}("/etc/passwd")`]),
  ['spliced assembly', '__as\\\nm__("nop");'],
  ['token paste', '#define X(a,b) a ## b'],
  ['raw string', 'const char* x=R"(anything)";'],
  ['prefixed raw string', 'const char* x=u8R"(anything)";'],
  ...['"Servo.h"', '</etc/passwd>', '<../Servo.h>', '<avr/../pgmspace.h>', '<notallowed.h>', '<Servo.h/*../secret*/>', '<Servo.h//secret>', 'HEADER', '<Servo.h> junk'].map(arg =>
    [`include argument ${arg}`, `#include ${arg}`]),
  ['macro include', '#define HEADER <Servo.h>\n#include HEADER'],
  ['continued include', '#include \\\n"/etc/passwd"'],
  ['string cannot hide directive', 'const char* s="/*";\n#include "/etc/passwd"\n// */'],
  ['escaped quote cannot hide directive', 'const char* s="\\\"/*";\n#include "/etc/passwd"\n// */'],
  ['character cannot hide directive', 'char c=\'"\';\n#include "/etc/passwd"'],
];
