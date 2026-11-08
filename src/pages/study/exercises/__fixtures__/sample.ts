import type { Exercise, WebExercise } from '../types'

// E2E-only catalog. The normal build never includes these problems in its index.
export const sampleExercises: Exercise[] = [
  {
    id: 'sample-echo', title: '첫 인사 출력하기', level: 1, topics: ['입출력'],
    langs: ['c', 'java', 'python'], chapter: { c: 'start', java: 'start', python: 'start' },
    statement: '입력한 이름 앞에 **안녕,**을 붙여 출력하세요.', inputSpec: '이름 한 줄', outputSpec: '`안녕, 이름` 한 줄',
    examples: [{ stdin: '민수\n', expected: '안녕, 민수\n', explain: '이름 앞에 인사를 붙여요.' }],
    tests: [{ stdin: '지수\n', expected: '안녕, 지수\n' }, { stdin: 'COMS\n', expected: '안녕, COMS\n' }, { stdin: '봄\n', expected: '안녕, 봄\n' }],
    mode: 'stdio',
    starter: { c: '#include <stdio.h>\nint main(void) { char name[100]; scanf("%99s", name); puts(name); return 0; }\n', java: 'import java.util.*;\nclass Main { public static void main(String[] args) { System.out.println(new Scanner(System.in).nextLine()); } }\n', python: 'name = input()\nprint(name)\n' },
    solution: { c: '#include <stdio.h>\nint main(void) { char name[100]; scanf("%99s", name); printf("안녕, %s\\n", name); return 0; }\n', java: 'import java.util.*;\nclass Main { public static void main(String[] args) { System.out.println("안녕, " + new Scanner(System.in).nextLine()); } }\n', python: 'name = input()\nprint("안녕, " + name)\n' },
    explain: '입력을 읽고 문자열을 연결합니다.', hints: ['이름을 먼저 읽어 보세요.'],
  },
  {
    id: 'sample-double', title: '숫자 두 배 만들기', level: 1, topics: ['수학'],
    langs: ['c', 'java', 'python'], chapter: { c: 'types', java: 'vars', python: 'values' },
    statement: '정수 하나를 읽고 **두 배**를 출력하세요.', inputSpec: '정수 하나', outputSpec: '두 배가 된 정수',
    examples: [{ stdin: '3\n', expected: '6\n' }],
    tests: [{ stdin: '0\n', expected: '0\n' }, { stdin: '-4\n', expected: '-8\n' }, { stdin: '12\n', expected: '24\n' }],
    mode: 'stdio',
    starter: { c: '#include <stdio.h>\nint main(void) { int n; scanf("%d", &n); printf("%d\\n", n); return 0; }\n', java: 'import java.util.*;\nclass Main { public static void main(String[] args) { System.out.println(new Scanner(System.in).nextInt()); } }\n', python: 'n = int(input())\nprint(n)\n' },
    solution: { c: '#include <stdio.h>\nint main(void) { int n; scanf("%d", &n); printf("%d\\n", n * 2); return 0; }\n', java: 'import java.util.*;\nclass Main { public static void main(String[] args) { System.out.println(new Scanner(System.in).nextInt() * 2); } }\n', python: 'n = int(input())\nprint(n * 2)\n' },
    explain: '읽은 정수에 2를 곱합니다.', hints: ['곱셈 연산자를 사용하세요.'],
  },
  {
    id: 'sample-function', title: '제곱 함수 만들기', level: 2, topics: ['함수'],
    langs: ['c', 'java', 'python'], chapter: { c: 'func', java: 'method', python: 'func' },
    statement: '`square` 함수를 작성해 입력 정수의 제곱을 반환하세요.', inputSpec: '정수 하나', outputSpec: '정수의 제곱',
    examples: [{ stdin: '3\n', expected: '9\n' }],
    tests: [{ stdin: '0\n', expected: '0\n' }, { stdin: '-4\n', expected: '16\n' }, { stdin: '12\n', expected: '144\n' }],
    mode: 'function',
    harness: { c: '#include <stdio.h>\n/*@USER@*/\nint main(void) { int n; scanf("%d", &n); printf("%d\\n", square(n)); }\n', java: 'import java.util.*;\nclass Main {\n/*@USER@*/\npublic static void main(String[] args) { System.out.println(square(new Scanner(System.in).nextInt())); }\n}\n', python: '#@USER@\nprint(square(int(input())))\n' },
    starter: { c: 'int square(int n) { return 0; }', java: 'static int square(int n) { return 0; }', python: 'def square(n):\n    return 0' },
    solution: { c: 'int square(int n) { return n * n; }', java: 'static int square(int n) { return n * n; }', python: 'def square(n):\n    return n * n' },
    explain: '같은 값을 두 번 곱해 반환합니다.', hints: ['`n * n`을 생각해 보세요.'],
  },
]

export const sampleWebExercises: WebExercise[] = [
  { id: 'sample-web-heading', title: '제목 색 바꾸기', level: 1, topics: ['HTML', 'CSS'], chapter: 'css',
    statement: '제목을 만들고 파란색으로 표시하세요.', starter: { html: '<h1>안녕하세요</h1>', css: 'h1 { color: red; }', js: '' },
    solution: { html: '<h1>안녕하세요</h1>', css: 'h1 { color: blue; }', js: '' },
    explain: '`color` 속성을 바꿉니다.', hints: ['`h1` 선택자를 사용하세요.'],
    checks: [{ name: '제목 확인', code: 'return t.text("h1") === "안녕하세요" || "제목을 확인해 주세요"' }, { name: '파란색 확인', code: 'return t.style("h1", "color") === "rgb(0, 0, 255)" || "제목을 파란색으로 바꿔 주세요"' }] },
  { id: 'sample-web-button', title: '버튼 누르기', level: 2, topics: ['JavaScript'], chapter: 'js',
    statement: '버튼을 누르면 메시지가 바뀌게 하세요.', starter: { html: '<button>누르기</button><p id="msg">대기</p>', css: '', js: '' },
    solution: { html: '<button>누르기</button><p id="msg">대기</p>', css: '', js: 'document.querySelector("button").addEventListener("click", () => { document.querySelector("#msg").textContent = "완료" })' },
    explain: '클릭 이벤트에서 내용을 바꿉니다.', hints: ['`click` 이벤트를 등록하세요.'],
    checks: [{ name: '클릭 동작', code: 't.click("button"); return t.text("#msg") === "완료" || "클릭 후 문구를 바꿔 주세요"' }] },
]
