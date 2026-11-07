import type { Exercise } from '../types'

export default [
  {
    id: "core-sum-difference",
    title: "합과 차를 적는 장부",
    level: 1,
    topics: ["입출력", "수학"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "types",
      java: "input",
      python: "values"
    },
    statement: `동아리 장부에 두 정수의 합과 첫째 수에서 둘째 수를 뺀 차를 적어 주세요.

**조건:** \`-1000 ≤ a,b ≤ 1000\`.`,
    inputSpec: "두 줄에 정수 `a`, `b`가 차례로 주어집니다.",
    outputSpec: "첫 줄에 합, 둘째 줄에 `a-b`를 출력합니다.",
    examples: [
      {
        stdin: `8
3
`,
        expected: `11
5
`,
        explain: "8+3=11, 8-3=5입니다."
      }
    ],
    tests: [
      {
        stdin: `0
0
`,
        expected: `0
0
`
      },
      {
        stdin: `-7
4
`,
        expected: `-3
-11
`
      },
      {
        stdin: `1000
-1000
`,
        expected: `0
2000
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>

int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>

int main(void) {
    int a, b;
    scanf("%d%d", &a, &b);
    printf("%d\\n%d\\n", a+b, a-b);
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt(), b = sc.nextInt();
        System.out.println(a+b);
        System.out.println(a-b);
    }
}
`,
      python: `a = int(input())
b = int(input())
print(a+b)
print(a-b)
`
    },
    explain: "두 값을 각각 변수에 저장하고 `+`와 `-`를 적용합니다.",
    hints: ["두 정수를 차례로 읽어 보세요.", "차는 입력 순서가 중요합니다."]
  },
  {
    id: "core-rectangle",
    title: "행사 포스터의 넓이",
    level: 1,
    topics: ["입출력", "수학"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "types",
      java: "input",
      python: "values"
    },
    statement: `직사각형 포스터의 테두리 길이와 채울 면적을 계산해 주세요.

**조건:** \`1 ≤ w,h ≤ 1000\`.`,
    inputSpec: "첫 줄에 가로 `w`, 둘째 줄에 세로 `h`가 주어집니다.",
    outputSpec: "둘레와 넓이를 각각 한 줄에 출력합니다.",
    examples: [
      {
        stdin: `4
7
`,
        expected: `22
28
`,
        explain: "둘레는 2×(4+7), 넓이는 4×7입니다."
      }
    ],
    tests: [
      {
        stdin: `1
1
`,
        expected: `4
1
`
      },
      {
        stdin: `1
1000
`,
        expected: `2002
1000
`
      },
      {
        stdin: `1000
1000
`,
        expected: `4000
1000000
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>

int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>

int main(void) {
    int w, h;
    scanf("%d%d", &w, &h);
    printf("%d\\n%d\\n", 2*(w+h), w*h);
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int w = sc.nextInt(), h = sc.nextInt();
        System.out.println(2*(w+h));
        System.out.println(w*h);
    }
}
`,
      python: `w = int(input())
h = int(input())
print(2*(w+h))
print(w*h)
`
    },
    explain: "둘레는 `(가로+세로)×2`, 넓이는 `가로×세로`입니다.",
    hints: ["가로 두 변과 세로 두 변을 더합니다."]
  },
  {
    id: "core-minutes-clock",
    title: "연습 시간표",
    level: 1,
    topics: ["입출력", "수학"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "types",
      java: "input",
      python: "values"
    },
    statement: `연습한 전체 분을 시간과 남은 분으로 나누어 기록해 주세요.

**조건:** \`0 ≤ m ≤ 100000\`.`,
    inputSpec: "한 줄에 전체 시간 `m`분이 주어집니다.",
    outputSpec: "`시간 분`을 한 줄에 공백으로 구분해 출력합니다.",
    examples: [
      {
        stdin: `135
`,
        expected: `2 15
`,
        explain: "135분은 2시간 15분입니다."
      }
    ],
    tests: [
      {
        stdin: `0
`,
        expected: `0 0
`
      },
      {
        stdin: `59
`,
        expected: `0 59
`
      },
      {
        stdin: `100000
`,
        expected: `1666 40
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>

int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>

int main(void) {
    int m;
    scanf("%d", &m);
    printf("%d %d\\n", m/60, m%60);
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int m = sc.nextInt();
        System.out.println((m/60) + " " + (m%60));
    }
}
`,
      python: `m = int(input())
print(m//60, m%60)
`
    },
    explain: "`60`으로 나눈 몫이 시간, 나머지가 분입니다.",
    hints: ["60분이 한 시간입니다.", "몫과 나머지를 각각 구하세요."]
  },
  {
    id: "core-sticker-packs",
    title: "스티커 묶음",
    level: 1,
    topics: ["입출력", "수학"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "types",
      java: "input",
      python: "values"
    },
    statement: `스티커 \`n\`장을 한 묶음에 \`k\`장씩 포장합니다. 완성된 묶음과 남은 장수를 알려 주세요.

**조건:** \`0 ≤ n ≤ 100000\`, \`1 ≤ k ≤ 1000\`.`,
    inputSpec: "첫 줄에 스티커 수 `n`, 둘째 줄에 묶음 크기 `k`가 주어집니다.",
    outputSpec: "`묶음수 남은장수`를 출력합니다.",
    examples: [
      {
        stdin: `17
5
`,
        expected: `3 2
`,
        explain: "5장짜리 3묶음을 만들고 2장이 남습니다."
      }
    ],
    tests: [
      {
        stdin: `0
5
`,
        expected: `0 0
`
      },
      {
        stdin: `3
10
`,
        expected: `0 3
`
      },
      {
        stdin: `100000
1
`,
        expected: `100000 0
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>

int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>

int main(void) {
    int n, k;
    scanf("%d%d", &n, &k);
    printf("%d %d\\n", n/k, n%k);
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt(), k = sc.nextInt();
        System.out.println((n/k) + " " + (n%k));
    }
}
`,
      python: `n = int(input())
k = int(input())
print(n//k, n%k)
`
    },
    explain: "정수 나눗셈의 몫은 완성된 묶음 수, 나머지는 남은 장수입니다.",
    hints: ["나눗셈의 몫과 나머지를 사용합니다."]
  },
  {
    id: "core-score-raise",
    title: "점수 수정",
    level: 1,
    topics: ["입출력", "수학"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "types",
      java: "input",
      python: "values"
    },
    statement: `행사 점수에 보너스를 더합니다. 수정 전 점수와 보너스가 주어질 때 새 점수를 출력해 주세요.

**조건:** \`-10000 ≤ s,b ≤ 10000\`; 감점은 음수 보너스로 표시합니다.`,
    inputSpec: "첫 줄에 기존 점수 `s`, 둘째 줄에 보너스 `b`가 주어집니다.",
    outputSpec: "새 점수 한 개를 출력합니다.",
    examples: [
      {
        stdin: `72
5
`,
        expected: `77
`,
        explain: "72점에 5점을 더합니다."
      }
    ],
    tests: [
      {
        stdin: `0
0
`,
        expected: `0
`
      },
      {
        stdin: `10
-20
`,
        expected: `-10
`
      },
      {
        stdin: `-10000
10000
`,
        expected: `0
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>

int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>

int main(void) {
    int s, b;
    scanf("%d%d", &s, &b);
    printf("%d\\n", s+b);
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int s = sc.nextInt(), b = sc.nextInt();
        System.out.println(s+b);
    }
}
`,
      python: `s = int(input())
b = int(input())
print(s+b)
`
    },
    explain: "보너스가 음수여도 덧셈 하나로 처리됩니다.",
    hints: ["두 수를 읽고 더합니다."]
  },
  {
    id: "core-three-day-total",
    title: "사흘 출석 인원",
    level: 1,
    topics: ["입출력", "수학"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "types",
      java: "input",
      python: "values"
    },
    statement: `사흘 동안 매일 기록한 출석 인원의 합을 구해 주세요.

**조건:** \`0 ≤ a,b,c ≤ 10000\`. 같은 사람이 여러 날 와도 각 날마다 셉니다.`,
    inputSpec: "세 줄에 각 날짜의 출석 인원 `a`, `b`, `c`가 주어집니다.",
    outputSpec: "총 출석 횟수를 출력합니다.",
    examples: [
      {
        stdin: `3
5
4
`,
        expected: `12
`,
        explain: "3+5+4=12입니다."
      }
    ],
    tests: [
      {
        stdin: `0
0
0
`,
        expected: `0
`
      },
      {
        stdin: `10000
10000
10000
`,
        expected: `30000
`
      },
      {
        stdin: `0
1
0
`,
        expected: `1
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>

int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>

int main(void) {
    int a, b, c;
    scanf("%d%d%d", &a, &b, &c);
    printf("%d\\n", a+b+c);
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt(), b = sc.nextInt(), c = sc.nextInt();
        System.out.println(a+b+c);
    }
}
`,
      python: `a = int(input())
b = int(input())
c = int(input())
print(a+b+c)
`
    },
    explain: "세 변수에 하루씩 저장한 뒤 합합니다.",
    hints: ["세 줄을 각각 읽습니다."]
  },
  {
    id: "core-even-odd",
    title: "짝수 자리 찾기",
    level: 1,
    topics: ["조건문", "수학"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "branch",
      java: "flow",
      python: "cond"
    },
    statement: `번호표가 짝수인지 홀수인지 표시해 주세요.

**조건:** \`-100000 ≤ n ≤ 100000\`. 0은 짝수입니다.`,
    inputSpec: "한 줄에 정수 `n`이 주어집니다.",
    outputSpec: "짝수면 `EVEN`, 홀수면 `ODD`를 출력합니다.",
    examples: [
      {
        stdin: `8
`,
        expected: `EVEN
`,
        explain: "8은 2로 나누어떨어집니다."
      }
    ],
    tests: [
      {
        stdin: `0
`,
        expected: `EVEN
`
      },
      {
        stdin: `-3
`,
        expected: `ODD
`
      },
      {
        stdin: `100000
`,
        expected: `EVEN
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>

int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    printf("%s\\n", n%2==0 ? "EVEN" : "ODD");
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        System.out.println(n%2==0 ? "EVEN" : "ODD");
    }
}
`,
      python: `n = int(input())
print("EVEN" if n%2 == 0 else "ODD")
`
    },
    explain: "`n % 2 == 0`이면 짝수입니다. 음수에도 같은 판별을 쓸 수 있습니다.",
    hints: ["2로 나눈 나머지를 확인하세요."]
  },
  {
    id: "core-temperature-sign",
    title: "온도계 표시",
    level: 1,
    topics: ["조건문"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "branch",
      java: "flow",
      python: "cond"
    },
    statement: `실험실 온도가 영하, 영상, 정확히 0도인지 분류해 주세요.

**조건:** \`-100 ≤ t ≤ 100\`; 0은 별도 분류입니다.`,
    inputSpec: "한 줄에 섭씨 정수 온도 `t`가 주어집니다.",
    outputSpec: "각각 `COLD`, `WARM`, `ZERO` 중 하나를 출력합니다.",
    examples: [
      {
        stdin: `-5
`,
        expected: `COLD
`,
        explain: "-5는 0보다 작습니다."
      }
    ],
    tests: [
      {
        stdin: `0
`,
        expected: `ZERO
`
      },
      {
        stdin: `100
`,
        expected: `WARM
`
      },
      {
        stdin: `-100
`,
        expected: `COLD
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>

int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>

int main(void) {
    int t;
    scanf("%d", &t);
    if (t<0) puts("COLD"); else if (t>0) puts("WARM"); else puts("ZERO");
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int t = sc.nextInt();
        if (t<0) System.out.println("COLD");
        else if (t>0) System.out.println("WARM");
        else System.out.println("ZERO");
    }
}
`,
      python: `t = int(input())
if t < 0:
    print("COLD")
elif t > 0:
    print("WARM")
else:
    print("ZERO")
`
    },
    explain: "0보다 작은지, 큰지, 어느 쪽도 아닌지 차례로 확인합니다.",
    hints: ["0과 비교하는 세 경우를 만드세요."]
  },
  {
    id: "core-largest-three",
    title: "세 상자 중 가장 무거운 것",
    level: 2,
    topics: ["조건문"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "branch",
      java: "flow",
      python: "cond"
    },
    statement: `세 팀의 점수 변화량 중 가장 큰 값을 출력해 주세요. 감점은 음수로 적으며 같은 값이 있어도 됩니다.

**조건:** \`-10000 ≤ a,b,c ≤ 10000\`.`,
    inputSpec: "세 줄에 정수 `a`, `b`, `c`가 주어집니다.",
    outputSpec: "최댓값을 출력합니다.",
    examples: [
      {
        stdin: `4
9
2
`,
        expected: `9
`,
        explain: "9가 세 값 중 가장 큽니다."
      }
    ],
    tests: [
      {
        stdin: `0
0
0
`,
        expected: `0
`
      },
      {
        stdin: `-5
-2
-7
`,
        expected: `-2
`
      },
      {
        stdin: `10000
10000
-10000
`,
        expected: `10000
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>

int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>

int main(void) {
    int a,b,c;
    scanf("%d%d%d", &a,&b,&c);
    int best=a;
    if (b>best) best=b;
    if (c>best) best=c;
    printf("%d\\n", best);
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a=sc.nextInt(), b=sc.nextInt(), c=sc.nextInt();
        int best=a;
        if (b>best) best=b;
        if (c>best) best=c;
        System.out.println(best);
    }
}
`,
      python: `a = int(input())
b = int(input())
c = int(input())
best = a
if b > best:
    best = b
if c > best:
    best = c
print(best)
`
    },
    explain: "첫 값을 임시 최댓값으로 두고 남은 두 값을 비교합니다. 음수만 있어도 작동합니다.",
    hints: ["최댓값의 초기값은 첫 입력으로 두세요.", "각 값이 더 크면 갱신합니다."]
  },
  {
    id: "core-grade-bands",
    title: "연습 점수 등급",
    level: 2,
    topics: ["조건문"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "branch",
      java: "flow",
      python: "cond"
    },
    statement: `연습 점수를 등급 문자로 바꾸어 주세요. 90점 이상 A, 80점 이상 B, 70점 이상 C, 나머지는 D입니다.

**조건:** \`0 ≤ s ≤ 100\`. 경계 점수는 높은 등급에 포함합니다.`,
    inputSpec: "한 줄에 점수 `s`가 주어집니다.",
    outputSpec: "`A`, `B`, `C`, `D` 중 하나를 출력합니다.",
    examples: [
      {
        stdin: `85
`,
        expected: `B
`,
        explain: "85는 80 이상이고 90 미만입니다."
      }
    ],
    tests: [
      {
        stdin: `0
`,
        expected: `D
`
      },
      {
        stdin: `70
`,
        expected: `C
`
      },
      {
        stdin: `90
`,
        expected: `A
`
      },
      {
        stdin: `100
`,
        expected: `A
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>

int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>

int main(void) {
    int s;
    scanf("%d", &s);
    if (s>=90) puts("A"); else if (s>=80) puts("B"); else if (s>=70) puts("C"); else puts("D");
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int s=sc.nextInt();
        if (s>=90) System.out.println("A");
        else if (s>=80) System.out.println("B");
        else if (s>=70) System.out.println("C");
        else System.out.println("D");
    }
}
`,
      python: `s = int(input())
if s >= 90:
    print("A")
elif s >= 80:
    print("B")
elif s >= 70:
    print("C")
else:
    print("D")
`
    },
    explain: "높은 점수 구간부터 검사하면 앞 구간에 걸리지 않은 값은 다음 구간으로 내려갑니다.",
    hints: ["90, 80, 70 순서로 비교하세요."]
  },
  {
    id: "core-leap-year",
    title: "행사 달력의 하루",
    level: 2,
    topics: ["조건문", "수학"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "branch",
      java: "flow",
      python: "cond"
    },
    statement: `2월 행사를 준비하며 윤년 여부를 확인해 주세요. 4의 배수이면서 100의 배수가 아니거나, 400의 배수면 윤년입니다.

**조건:** \`1 ≤ y ≤ 10000\`.`,
    inputSpec: "한 줄에 연도 `y`가 주어집니다.",
    outputSpec: "윤년이면 `LEAP`, 아니면 `COMMON`을 출력합니다.",
    examples: [
      {
        stdin: `2024
`,
        expected: `LEAP
`,
        explain: "2024는 4의 배수이며 100의 배수가 아닙니다."
      }
    ],
    tests: [
      {
        stdin: `1900
`,
        expected: `COMMON
`
      },
      {
        stdin: `2000
`,
        expected: `LEAP
`
      },
      {
        stdin: `1
`,
        expected: `COMMON
`
      },
      {
        stdin: `10000
`,
        expected: `LEAP
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>

int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>

int main(void) {
    int y;
    scanf("%d", &y);
    puts((y%400==0 || (y%4==0 && y%100!=0)) ? "LEAP" : "COMMON");
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int y=sc.nextInt();
        System.out.println((y%400==0 || (y%4==0 && y%100!=0)) ? "LEAP" : "COMMON");
    }
}
`,
      python: `y = int(input())
print("LEAP" if y%400 == 0 or (y%4 == 0 and y%100 != 0) else "COMMON")
`
    },
    explain: "400의 배수 조건을 먼저 포함하고, 100의 배수 예외를 4의 배수 분기에 적용합니다.",
    hints: ["100으로 나누어떨어지는 해는 특별히 살펴보세요.", "400의 배수는 다시 윤년입니다."]
  },
  {
    id: "core-admission-fee",
    title: "체험관 입장료",
    level: 2,
    topics: ["조건문", "수학"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "branch",
      java: "flow",
      python: "cond"
    },
    statement: `체험관 기본 입장료는 10000원입니다. 나이가 12세 이하면 5000원, 65세 이상이면 7000원입니다.

**조건:** \`0 ≤ age ≤ 120\`. 경계 나이도 할인 대상입니다.`,
    inputSpec: "한 줄에 나이 `age`가 주어집니다.",
    outputSpec: "적용된 입장료를 정수로 출력합니다.",
    examples: [
      {
        stdin: `12
`,
        expected: `5000
`,
        explain: "12세는 어린이 할인 대상입니다."
      }
    ],
    tests: [
      {
        stdin: `0
`,
        expected: `5000
`
      },
      {
        stdin: `13
`,
        expected: `10000
`
      },
      {
        stdin: `65
`,
        expected: `7000
`
      },
      {
        stdin: `120
`,
        expected: `7000
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>

int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>

int main(void) {
    int age;
    scanf("%d", &age);
    if (age<=12) puts("5000"); else if (age>=65) puts("7000"); else puts("10000");
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int age=sc.nextInt();
        if (age<=12) System.out.println(5000);
        else if (age>=65) System.out.println(7000);
        else System.out.println(10000);
    }
}
`,
      python: `age = int(input())
if age <= 12:
    print(5000)
elif age >= 65:
    print(7000)
else:
    print(10000)
`
    },
    explain: "어린이 구간, 시니어 구간, 나머지 구간으로 나눕니다.",
    hints: ["12와 65를 포함하도록 부등호를 정하세요."]
  },
  {
    id: "core-running-total",
    title: "첫날부터 모은 배지",
    level: 1,
    topics: ["반복문", "수학"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "loop",
      java: "flow",
      python: "loop"
    },
    statement: `첫날 1개, 둘째 날 2개처럼 \`n\`일째에는 \`n\`개의 배지를 모읍니다. 총 개수를 출력해 주세요.

**조건:** \`0 ≤ n ≤ 10000\`; 0일이면 0개입니다.`,
    inputSpec: "한 줄에 일수 `n`이 주어집니다.",
    outputSpec: "총 배지 수를 출력합니다.",
    examples: [
      {
        stdin: `4
`,
        expected: `10
`,
        explain: "1+2+3+4=10입니다."
      }
    ],
    tests: [
      {
        stdin: `0
`,
        expected: `0
`
      },
      {
        stdin: `1
`,
        expected: `1
`
      },
      {
        stdin: `10000
`,
        expected: `50005000
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>

int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>

int main(void) {
    int n, sum=0;
    scanf("%d", &n);
    for (int day=1; day<=n; day++) sum+=day;
    printf("%d\\n", sum);
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n=sc.nextInt(), sum=0;
        for (int day=1; day<=n; day++) sum+=day;
        System.out.println(sum);
    }
}
`,
      python: `n = int(input())
total = 0
for day in range(1, n+1):
    total += day
print(total)
`
    },
    explain: "합계 변수를 0으로 시작해 1부터 `n`까지 누적합니다.",
    hints: ["반복할 때마다 현재 날짜를 합계에 더합니다."]
  },
  {
    id: "core-countdown",
    title: "공연 시작 카운트다운",
    level: 1,
    topics: ["반복문"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "loop",
      java: "flow",
      python: "loop"
    },
    statement: `공연 시작 전 \`n\`부터 0까지 한 숫자씩 내려가며 출력해 주세요.

**조건:** \`0 ≤ n ≤ 20\`.`,
    inputSpec: "한 줄에 시작 숫자 `n`이 주어집니다.",
    outputSpec: "`n`, `n-1`, …, `0`을 각 줄에 출력합니다.",
    examples: [
      {
        stdin: `3
`,
        expected: `3
2
1
0
`,
        explain: "3부터 0까지 네 줄입니다."
      }
    ],
    tests: [
      {
        stdin: `0
`,
        expected: `0
`
      },
      {
        stdin: `1
`,
        expected: `1
0
`
      },
      {
        stdin: `20
`,
        expected: `20
19
18
17
16
15
14
13
12
11
10
9
8
7
6
5
4
3
2
1
0
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>

int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    for (int i=n; i>=0; i--) printf("%d\\n", i);
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n=sc.nextInt();
        for (int i=n; i>=0; i--) System.out.println(i);
    }
}
`,
      python: `n = int(input())
for i in range(n, -1, -1):
    print(i)
`
    },
    explain: "시작값을 `n`, 종료값을 0으로 두고 1씩 줄입니다.",
    hints: ["0도 출력해야 합니다.", "Python의 range 종료값은 포함되지 않습니다."],
    compare: "lines"
  },
  {
    id: "core-times-table",
    title: "구구단 한 단",
    level: 1,
    topics: ["반복문", "수학"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "loop",
      java: "flow",
      python: "loop"
    },
    statement: `연습할 구구단 한 단을 1배부터 9배까지 적어 주세요.

**조건:** \`1 ≤ n ≤ 9\`.`,
    inputSpec: "한 줄에 단 `n`이 주어집니다.",
    outputSpec: "아홉 줄에 `n x i = 결과` 형식으로 출력합니다 (`x`는 소문자 영문).",
    examples: [
      {
        stdin: `2
`,
        expected: `2 x 1 = 2
2 x 2 = 4
2 x 3 = 6
2 x 4 = 8
2 x 5 = 10
2 x 6 = 12
2 x 7 = 14
2 x 8 = 16
2 x 9 = 18
`,
        explain: "2단의 1배부터 9배까지 적습니다."
      }
    ],
    tests: [
      {
        stdin: `1
`,
        expected: `1 x 1 = 1
1 x 2 = 2
1 x 3 = 3
1 x 4 = 4
1 x 5 = 5
1 x 6 = 6
1 x 7 = 7
1 x 8 = 8
1 x 9 = 9
`
      },
      {
        stdin: `9
`,
        expected: `9 x 1 = 9
9 x 2 = 18
9 x 3 = 27
9 x 4 = 36
9 x 5 = 45
9 x 6 = 54
9 x 7 = 63
9 x 8 = 72
9 x 9 = 81
`
      },
      {
        stdin: `5
`,
        expected: `5 x 1 = 5
5 x 2 = 10
5 x 3 = 15
5 x 4 = 20
5 x 5 = 25
5 x 6 = 30
5 x 7 = 35
5 x 8 = 40
5 x 9 = 45
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>

int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    for (int i=1; i<=9; i++) printf("%d x %d = %d\\n", n, i, n*i);
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n=sc.nextInt();
        for (int i=1; i<=9; i++) System.out.println(n+" x "+i+" = "+(n*i));
    }
}
`,
      python: `n = int(input())
for i in range(1, 10):
    print(n, "x", i, "=", n*i)
`
    },
    explain: "`i`를 1부터 9까지 바꾸며 같은 출력 문장을 반복합니다.",
    hints: ["반복 변수는 곱하는 수입니다.", "출력 모양에서 공백 위치도 맞춰 보세요."],
    compare: "lines"
  },
  {
    id: "core-factorial",
    title: "순서대로 세운 줄",
    level: 2,
    topics: ["반복문", "수학"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "loop",
      java: "flow",
      python: "loop"
    },
    statement: `서로 다른 \`n\`명을 한 줄로 세우는 방법은 \`1×2×…×n\`가지입니다. 그 수를 구해 주세요.

**조건:** \`0 ≤ n ≤ 12\`; 0명인 경우도 방법은 1가지로 셉니다.`,
    inputSpec: "한 줄에 인원 `n`이 주어집니다.",
    outputSpec: "배치 방법의 수를 출력합니다.",
    examples: [
      {
        stdin: `4
`,
        expected: `24
`,
        explain: "1×2×3×4=24입니다."
      }
    ],
    tests: [
      {
        stdin: `0
`,
        expected: `1
`
      },
      {
        stdin: `1
`,
        expected: `1
`
      },
      {
        stdin: `12
`,
        expected: `479001600
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>

int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>

int main(void) {
    int n, product=1;
    scanf("%d", &n);
    for (int i=2; i<=n; i++) product*=i;
    printf("%d\\n", product);
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n=sc.nextInt(), product=1;
        for (int i=2; i<=n; i++) product*=i;
        System.out.println(product);
    }
}
`,
      python: `n = int(input())
product = 1
for i in range(2, n+1):
    product *= i
print(product)
`
    },
    explain: "곱셈 누적 변수는 1로 시작합니다. `n=0`이면 반복하지 않아 그대로 1입니다.",
    hints: ["합계의 0과 달리 곱의 시작값은 1입니다."]
  },
  {
    id: "core-digit-sum",
    title: "번호표 숫자 합",
    level: 2,
    topics: ["반복문", "수학"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "loop",
      java: "flow",
      python: "loop"
    },
    statement: `번호표의 각 자리 숫자를 모두 더해 주세요. 예를 들어 204는 \`2+0+4\`입니다.

**조건:** \`0 ≤ n ≤ 1000000000\`. 0의 자릿수 합은 0입니다.`,
    inputSpec: "한 줄에 번호 `n`이 주어집니다.",
    outputSpec: "각 자리 숫자의 합을 출력합니다.",
    examples: [
      {
        stdin: `204
`,
        expected: `6
`,
        explain: "2+0+4=6입니다."
      }
    ],
    tests: [
      {
        stdin: `0
`,
        expected: `0
`
      },
      {
        stdin: `9
`,
        expected: `9
`
      },
      {
        stdin: `1000000000
`,
        expected: `1
`
      },
      {
        stdin: `999999999
`,
        expected: `81
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>

int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>

int main(void) {
    int n, sum=0;
    scanf("%d", &n);
    while (n>0) { sum+=n%10; n/=10; }
    printf("%d\\n", sum);
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n=sc.nextInt(), sum=0;
        while (n>0) { sum+=n%10; n/=10; }
        System.out.println(sum);
    }
}
`,
      python: `n = int(input())
total = 0
while n > 0:
    total += n % 10
    n //= 10
print(total)
`
    },
    explain: "10으로 나눈 나머지가 마지막 자리입니다. 10으로 나눈 몫으로 다음 자리를 준비합니다.",
    hints: ["마지막 자리부터 하나씩 꺼내세요.", "0은 반복하지 않아 합계 0이 됩니다."]
  },
  {
    id: "core-divisor-count",
    title: "나누어지는 번호",
    level: 2,
    topics: ["반복문", "조건문", "수학"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "loop",
      java: "flow",
      python: "loop"
    },
    statement: `동아리 번호 \`n\`을 나머지 없이 나눌 수 있는 양의 정수가 몇 개인지 세어 주세요.

**조건:** \`1 ≤ n ≤ 10000\`.`,
    inputSpec: "한 줄에 양의 정수 `n`이 주어집니다.",
    outputSpec: "약수의 개수를 출력합니다.",
    examples: [
      {
        stdin: `12
`,
        expected: `6
`,
        explain: "약수는 1, 2, 3, 4, 6, 12입니다."
      }
    ],
    tests: [
      {
        stdin: `1
`,
        expected: `1
`
      },
      {
        stdin: `13
`,
        expected: `2
`
      },
      {
        stdin: `10000
`,
        expected: `25
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>

int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>

int main(void) {
    int n, count=0;
    scanf("%d", &n);
    for (int d=1; d<=n; d++) if (n%d==0) count++;
    printf("%d\\n", count);
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n=sc.nextInt(), count=0;
        for (int d=1; d<=n; d++) if (n%d==0) count++;
        System.out.println(count);
    }
}
`,
      python: `n = int(input())
count = 0
for d in range(1, n+1):
    if n % d == 0:
        count += 1
print(count)
`
    },
    explain: "1부터 `n`까지 후보로 나누어 보고 나머지가 0인 경우만 셉니다.",
    hints: ["1과 자기 자신도 약수입니다.", "나머지가 0인지 검사하세요."]
  },
  {
    id: "core-stair-stars",
    title: "공연장 별 계단",
    level: 3,
    topics: ["반복문"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "loop",
      java: "flow",
      python: "loop"
    },
    statement: `무대 장식으로 첫 줄에 별 1개, 다음 줄에 2개처럼 \`n\`줄의 별 계단을 만들어 주세요.

**조건:** \`1 ≤ n ≤ 20\`.`,
    inputSpec: "한 줄에 줄 수 `n`이 주어집니다.",
    outputSpec: "`i`번째 줄에 `*`를 정확히 `i`개 출력합니다. 별 사이에 공백은 없습니다.",
    examples: [
      {
        stdin: `3
`,
        expected: `*
**
***
`,
        explain: "줄마다 별이 하나씩 늘어납니다."
      }
    ],
    tests: [
      {
        stdin: `1
`,
        expected: `*
`
      },
      {
        stdin: `2
`,
        expected: `*
**
`
      },
      {
        stdin: `20
`,
        expected: `*
**
***
****
*****
******
*******
********
*********
**********
***********
************
*************
**************
***************
****************
*****************
******************
*******************
********************
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>

int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>

int main(void) {
    int n;
    scanf("%d", &n);
    for (int row=1; row<=n; row++) {
        for (int col=0; col<row; col++) putchar('*');
        putchar('\\n');
    }
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n=sc.nextInt();
        for (int row=1; row<=n; row++) {
            for (int col=0; col<row; col++) System.out.print("*");
            System.out.println();
        }
    }
}
`,
      python: `n = int(input())
for row in range(1, n+1):
    for col in range(row):
        print("*", end="")
    print()
`
    },
    explain: "바깥 반복이 줄 번호, 안쪽 반복이 그 줄의 별 개수를 결정합니다.",
    hints: ["한 줄의 별을 모두 찍은 뒤 줄바꿈합니다.", "줄 번호만큼 별을 반복합니다."],
    compare: "lines"
  },
  {
    id: "core-first-maximum",
    title: "최고 점수와 자리",
    level: 2,
    topics: ["배열", "탐색"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "loop",
      java: "flow",
      python: "loop"
    },
    statement: "동아리 퀴즈 점수를 입력 순서대로 적었습니다. 가장 높은 점수와 그 점수가 **처음** 나온 자리(1부터)를 알려 주세요. 같은 최고점이 여러 번 나와도 앞자리를 고릅니다.",
    inputSpec: "첫 줄에 학생 수 `n`(1~100), 이어서 한 줄에 하나씩 정수 점수 `n`개(-100~100)가 주어집니다.",
    outputSpec: "최고점과 첫 자리 번호를 공백으로 구분해 출력하세요.",
    examples: [
      {
        stdin: `5
3
9
9
-2
4
`,
        expected: `9 2
`,
        explain: "최고점 9가 2, 3번에 있으므로 2번을 고릅니다."
      }
    ],
    tests: [
      {
        stdin: `1
-100
`,
        expected: `-100 1
`
      },
      {
        stdin: `4
0
0
0
0
`,
        expected: `0 1
`
      },
      {
        stdin: `5
-5
-3
-1
-8
-1
`,
        expected: `-1 3
`
      },
      {
        stdin: `3
100
99
98
`,
        expected: `100 1
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>
int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>
int main(void) {
    int n, value, best = -101, position = 0;
    scanf("%d", &n);
    for (int i = 1; i <= n; i++) {
        scanf("%d", &value);
        if (value > best) { best = value; position = i; }
    }
    printf("%d %d\\n", best, position);
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt(), best = -101, position = 0;
        for (int i = 1; i <= n; i++) {
            int value = sc.nextInt();
            if (value > best) { best = value; position = i; }
        }
        System.out.println(best + " " + position);
    }
}
`,
      python: `n = int(input())
best = -101
position = 0
for i in range(1, n + 1):
    value = int(input())
    if value > best:
        best = value
        position = i
print(best, position)
`
    },
    explain: "현재 최고점보다 **클 때만** 점수와 자리를 갱신하면 동점에서는 앞자리가 남습니다. 점수를 하나씩 읽으며 처리할 수 있습니다.",
    hints: ["가능한 최솟값보다 작은 값으로 최고점을 시작하세요.", "동점에서는 자리를 바꾸지 않습니다."]
  },
  {
    id: "core-above-average",
    title: "평균보다 높은 점수",
    level: 3,
    topics: ["배열", "수학"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "array",
      java: "array",
      python: "data"
    },
    statement: "퀴즈 점수 전체의 평균을 구한 뒤 평균보다 **엄격히 높은** 점수가 몇 개인지 세어 주세요. 평균과 같은 점수는 세지 않습니다.",
    inputSpec: "첫 줄에 점수 수 `n`(1~100), 이어서 한 줄에 하나씩 정수 점수 `n`개(0~100)가 주어집니다.",
    outputSpec: "평균보다 높은 점수의 개수 한 개를 출력하세요.",
    examples: [
      {
        stdin: `5
3
7
10
0
5
`,
        expected: `2
`,
        explain: "평균은 5이므로 7과 10만 셉니다."
      }
    ],
    tests: [
      {
        stdin: `1
100
`,
        expected: `0
`
      },
      {
        stdin: `4
0
0
0
0
`,
        expected: `0
`
      },
      {
        stdin: `3
0
0
100
`,
        expected: `1
`
      },
      {
        stdin: `4
1
2
2
3
`,
        expected: `1
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>
int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>
int main(void) {
    int n, a[100], sum = 0, count = 0;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) { scanf("%d", &a[i]); sum += a[i]; }
    for (int i = 0; i < n; i++) if (a[i] * n > sum) count++;
    printf("%d\\n", count);
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt(), sum = 0, count = 0;
        int[] a = new int[n];
        for (int i = 0; i < n; i++) { a[i] = sc.nextInt(); sum += a[i]; }
        for (int value : a) if (value * n > sum) count++;
        System.out.println(count);
    }
}
`,
      python: `n = int(input())
a = []
total = 0
for _ in range(n):
    value = int(input())
    a.append(value)
    total += value
count = 0
for value in a:
    if value * n > total:
        count += 1
print(count)
`
    },
    explain: "먼저 전체 합을 구하고 값을 다시 확인합니다. `점수 × 개수 > 합계`이면 평균보다 높으므로 소수 계산이 필요 없습니다.",
    hints: ["전체 합을 알아야 개별 점수가 평균을 넘는지 판단할 수 있습니다.", "평균과 같은 점수는 제외하세요."]
  },
  {
    id: "core-reverse-notes",
    title: "기록 거꾸로 읽기",
    level: 2,
    topics: ["배열", "반복문"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "array",
      java: "array",
      python: "data"
    },
    statement: "마지막으로 기록한 숫자부터 차례로 확인하려 합니다. 숫자의 순서를 거꾸로 출력해 주세요.",
    inputSpec: "첫 줄에 기록 수 `n`(1~20), 이어서 한 줄에 하나씩 정수 `n`개(-100~100)가 주어집니다.",
    outputSpec: "숫자 `n`개를 역순으로 공백 구분해 출력하세요.",
    examples: [
      {
        stdin: `4
5
-2
0
9
`,
        expected: `9 0 -2 5
`,
        explain: "끝의 9부터 맨 앞의 5까지 읽습니다."
      }
    ],
    tests: [
      {
        stdin: `1
-100
`,
        expected: `-100
`
      },
      {
        stdin: `3
0
0
0
`,
        expected: `0 0 0
`
      },
      {
        stdin: `5
1
2
3
4
5
`,
        expected: `5 4 3 2 1
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>
int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>
int main(void) {
    int n, a[20];
    scanf("%d", &n);
    for (int i = 0; i < n; i++) scanf("%d", &a[i]);
    for (int i = n - 1; i >= 0; i--) printf("%d%c", a[i], i ? ' ' : '\\n');
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = sc.nextInt();
        for (int i = n - 1; i >= 0; i--) {
            System.out.print(a[i]);
            System.out.print(i == 0 ? "\\n" : " ");
        }
    }
}
`,
      python: `n = int(input())
a = []
for _ in range(n):
    a.append(int(input()))
for i in range(n - 1, -1, -1):
    print(a[i], end="\\n" if i == 0 else " ")
`
    },
    explain: "마지막 인덱스 `n-1`부터 0까지 거꾸로 순회합니다. Python은 슬라이스 `[::-1]`을 써도 됩니다.",
    hints: ["배열의 마지막 인덱스는 `n-1`입니다.", "C·Java는 반복 변수를 하나씩 줄여 보세요."]
  },
  {
    id: "core-target-count",
    title: "찾는 번호는 몇 번?",
    level: 2,
    topics: ["배열", "탐색"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "array",
      java: "array",
      python: "data"
    },
    statement: "출석 번호 목록에서 찾는 번호가 몇 번 나타났는지 세어 주세요. 목록이 비어 있으면 결과는 0입니다.",
    inputSpec: "첫 줄에 목록 길이 `n`(0~30), 이어서 한 줄에 하나씩 정수 `n`개(-100~100), 마지막 줄에 찾는 정수 `target`(-100~100)이 주어집니다. `n=0`이면 `target`이 바로 다음 줄에 옵니다.",
    outputSpec: "`target`과 같은 값의 개수 한 개를 출력하세요.",
    examples: [
      {
        stdin: `5
2
3
2
-1
2
2
`,
        expected: `3
`,
        explain: "2가 세 번 있습니다."
      }
    ],
    tests: [
      {
        stdin: `0
5
`,
        expected: `0
`
      },
      {
        stdin: `4
0
0
0
0
0
`,
        expected: `4
`
      },
      {
        stdin: `3
-100
100
0
7
`,
        expected: `0
`
      },
      {
        stdin: `1
-100
-100
`,
        expected: `1
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>
int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>
int main(void) {
    int n, target, count = 0, a[30];
    scanf("%d", &n);
    for (int i = 0; i < n; i++) scanf("%d", &a[i]);
    scanf("%d", &target);
    for (int i = 0; i < n; i++) if (a[i] == target) count++;
    printf("%d\\n", count);
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = sc.nextInt();
        int target = sc.nextInt(), count = 0;
        for (int x : a) if (x == target) count++;
        System.out.println(count);
    }
}
`,
      python: `n = int(input())
a = []
for _ in range(n):
    a.append(int(input()))
target = int(input())
count = 0
for value in a:
    if value == target:
        count += 1
print(count)
`
    },
    explain: "값을 모두 읽은 다음 목표값과 하나씩 비교합니다. 같은 값이 나올 때마다 개수를 1 늘립니다.",
    hints: ["목표값은 배열 입력 뒤에 나옵니다.", "목록이 비어 있어도 개수는 0으로 출력하세요."]
  },
  {
    id: "core-rotate-right",
    title: "원형 자리 한 칸 이동",
    level: 3,
    topics: ["배열", "시뮬레이션"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "array",
      java: "array",
      python: "data"
    },
    statement: "원형으로 앉은 팀원이 쪽지를 오른쪽 사람에게 넘깁니다. 마지막 사람의 쪽지는 첫 사람에게 갑니다. 한 번 넘긴 뒤 첫 사람부터 가진 번호를 출력해 주세요.",
    inputSpec: "첫 줄에 팀원 수 `n`(1~20), 이어서 한 줄에 하나씩 쪽지의 정수 번호 `n`개(-100~100)가 주어집니다.",
    outputSpec: "이동 후 첫 사람부터의 번호 `n`개를 공백으로 구분해 출력하세요.",
    examples: [
      {
        stdin: `4
3
-1
5
-2
`,
        expected: `-2 3 -1 5
`,
        explain: "마지막 쪽지 -2가 맨 앞으로 옵니다."
      }
    ],
    tests: [
      {
        stdin: `1
-100
`,
        expected: `-100
`
      },
      {
        stdin: `3
0
0
0
`,
        expected: `0 0 0
`
      },
      {
        stdin: `5
1
2
3
4
5
`,
        expected: `5 1 2 3 4
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>
int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>
int main(void) {
    int n, a[20];
    scanf("%d", &n);
    for (int i = 0; i < n; i++) scanf("%d", &a[i]);
    printf("%d", a[n - 1]);
    for (int i = 0; i < n - 1; i++) printf(" %d", a[i]);
    printf("\\n");
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = sc.nextInt();
        System.out.print(a[n - 1]);
        for (int i = 0; i < n - 1; i++) System.out.print(" " + a[i]);
        System.out.println();
    }
}
`,
      python: `n = int(input())
a = []
for _ in range(n):
    a.append(int(input()))
print(a[n - 1], end="")
for i in range(n - 1):
    print(" " + str(a[i]), end="")
print()
`
    },
    explain: "마지막 값을 먼저 출력하고 0번부터 `n-2`번까지 차례로 출력합니다. 한 사람만 있어도 그대로 유지됩니다.",
    hints: ["마지막 번호가 이동 후 첫 번째입니다.", "나머지 번호는 원래 순서를 유지합니다."]
  },
  {
    id: "core-palindrome-word",
    title: "앞뒤가 같은 암호",
    level: 2,
    topics: ["문자열", "조건문"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "array",
      java: "flow",
      python: "str"
    },
    statement: "암호 단어를 앞에서 읽어도 뒤에서 읽어도 같은지 검사해 주세요. 대소문자는 구분합니다.",
    inputSpec: "영어 소문자·대문자로만 이루어진 단어 한 개가 주어집니다. 길이는 1~30입니다.",
    outputSpec: "앞뒤가 같으면 `YES`, 다르면 `NO`를 출력하세요.",
    examples: [
      {
        stdin: `level
`,
        expected: `YES
`,
        explain: "거꾸로 읽어도 level입니다."
      }
    ],
    tests: [
      {
        stdin: `A
`,
        expected: `YES
`
      },
      {
        stdin: `AbA
`,
        expected: `YES
`
      },
      {
        stdin: `Abba
`,
        expected: `NO
`
      },
      {
        stdin: `abcdefghijklmnopqrstuvwxyzabcd
`,
        expected: `NO
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>
int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>
int main(void) {
    char s[31];
    int n = 0, ok = 1;
    scanf("%30s", s);
    while (s[n] != '\\0') n++;
    for (int i = 0; i < n / 2; i++) if (s[i] != s[n - 1 - i]) ok = 0;
    puts(ok ? "YES" : "NO");
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String s = sc.next();
        boolean ok = true;
        for (int i = 0; i < s.length() / 2; i++) {
            if (s.charAt(i) != s.charAt(s.length() - 1 - i)) ok = false;
        }
        System.out.println(ok ? "YES" : "NO");
    }
}
`,
      python: `s = input()
print("YES" if s == s[::-1] else "NO")
`
    },
    explain: "양 끝 글자를 하나씩 안쪽으로 비교합니다. Java에서 글자 수는 `s.length()`, i번째 글자는 `s.charAt(i)`로 얻습니다.",
    hints: ["왼쪽 i번째와 오른쪽 `길이-1-i`번째를 비교하세요.", "한 글자 단어는 언제나 회문입니다. Java에서는 `s.length()`와 `s.charAt(i)`를 사용합니다."]
  },
  {
    id: "core-vowel-counter",
    title: "모음 스티커 세기",
    level: 2,
    topics: ["문자열", "반복문"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "array",
      java: "flow",
      python: "str"
    },
    statement: "영문 단어에서 모음 스티커가 몇 장 필요한지 세어 주세요. 모음은 `a`, `e`, `i`, `o`, `u`이고 대문자도 같은 모음으로 셉니다.",
    inputSpec: "영문자만 있는 단어 한 개가 주어집니다. 길이는 1~100입니다.",
    outputSpec: "모음의 개수 한 개를 출력하세요.",
    examples: [
      {
        stdin: `COMsClub
`,
        expected: `2
`,
        explain: "O와 u가 모음입니다."
      }
    ],
    tests: [
      {
        stdin: `b
`,
        expected: `0
`
      },
      {
        stdin: `AEIOU
`,
        expected: `5
`
      },
      {
        stdin: `xyzXYZ
`,
        expected: `0
`
      },
      {
        stdin: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
`,
        expected: `100
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>
int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>
int main(void) {
    char s[101];
    int count = 0;
    scanf("%100s", s);
    for (int i = 0; s[i] != '\\0'; i++) {
        char ch = s[i];
        if (ch >= 'A' && ch <= 'Z') ch += 'a' - 'A';
        if (ch == 'a' || ch == 'e' || ch == 'i' || ch == 'o' || ch == 'u') count++;
    }
    printf("%d\\n", count);
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String s = sc.next().toLowerCase();
        int count = 0;
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch == 'a' || ch == 'e' || ch == 'i' || ch == 'o' || ch == 'u') count++;
        }
        System.out.println(count);
    }
}
`,
      python: `s = input().lower()
count = 0
for ch in s:
    if ch in "aeiou":
        count += 1
print(count)
`
    },
    explain: "대소문자를 같은 글자로 바꾼 뒤 모음 다섯 글자와 비교합니다. Java의 `toLowerCase()`가 소문자 문자열을 만듭니다.",
    hints: ["모음을 다섯 개로 정해 두세요.", "대문자와 소문자를 모두 고려하세요.", "Java에서는 `s.charAt(i)`로 글자를 읽고 `s.toLowerCase()`로 소문자 문자열을 만듭니다."]
  },
  {
    id: "core-word-spaces",
    title: "메모 속 단어 수",
    level: 3,
    topics: ["문자열", "반복문"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "array",
      java: "flow",
      python: "str"
    },
    statement: "메모 한 줄에서 영어 단어가 몇 개인지 세어 주세요. 단어 사이에는 공백이 여러 칸 있을 수 있고 앞뒤에도 공백이 있을 수 있습니다.",
    inputSpec: "영문자와 일반 공백만 포함한 한 줄이 주어집니다. 줄의 길이는 0~100자이며 줄바꿈으로 끝납니다.",
    outputSpec: "공백으로 구분된 단어의 수 한 개를 출력하세요. 빈 줄이나 공백만 있는 줄은 0입니다.",
    examples: [
      {
        stdin: `  hello   club  members 
`,
        expected: `3
`,
        explain: "공백 묶음 사이에 세 단어가 있습니다."
      }
    ],
    tests: [
      {
        stdin: `
`,
        expected: `0
`
      },
      {
        stdin: `    
`,
        expected: `0
`
      },
      {
        stdin: `word
`,
        expected: `1
`
      },
      {
        stdin: `a b c
`,
        expected: `3
`
      },
      {
        stdin: ` aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 
`,
        expected: `1
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>
int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>
int main(void) {
    char s[102];
    int count = 0, in_word = 0;
    fgets(s, sizeof(s), stdin);
    for (int i = 0; s[i] != '\\0'; i++) {
        if (s[i] == ' ' || s[i] == '\\n') in_word = 0;
        else if (!in_word) { count++; in_word = 1; }
    }
    printf("%d\\n", count);
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String s = sc.nextLine();
        int count = 0;
        boolean inWord = false;
        for (int i = 0; i < s.length(); i++) {
            if (s.charAt(i) == ' ') inWord = false;
            else if (!inWord) { count++; inWord = true; }
        }
        System.out.println(count);
    }
}
`,
      python: `s = input()
print(len(s.split()))
`
    },
    explain: "공백 뒤에서 새 글자를 만날 때마다 새 단어가 시작됩니다. Python의 `split()`은 연속 공백을 한 구분자로 다룹니다.",
    hints: ["단어 안에 있는지 상태를 기억하세요.", "빈 줄에는 단어가 없습니다.", "Java에서는 `s.length()`와 `s.charAt(i)`로 한 글자씩 확인할 수 있습니다."]
  },
  {
    id: "core-prime-check",
    title: "소수 판별 함수",
    level: 2,
    topics: ["함수", "수학"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "func",
      java: "method",
      python: "func"
    },
    statement: `동아리 암호 숫자가 소수인지 확인해요. 1과 자기 자신으로만 나누어떨어지는 2 이상의 수가 소수예요.

**함수만 작성하세요.** Java에서는 \`Main\` 안에 들어갈 \`static\` 메서드를 작성합니다. 입력과 출력은 채점 코드가 맡습니다.`,
    inputSpec: "정수 `n` 하나 (0 ≤ n ≤ 100000).",
    outputSpec: "소수면 `1`, 아니면 `0`. ",
    examples: [
      {
        stdin: `17
`,
        expected: `1
`,
        explain: "17은 1과 17로만 나누어떨어져요."
      }
    ],
    tests: [
      {
        stdin: `0
`,
        expected: `0
`
      },
      {
        stdin: `1
`,
        expected: `0
`
      },
      {
        stdin: `100000
`,
        expected: `0
`
      },
      {
        stdin: `9973
`,
        expected: `1
`
      }
    ],
    mode: "function",
    harness: {
      c: `#include <stdio.h>
/*@USER@*/
int main(void) {
    int n; scanf("%d", &n);
    printf("%d\\n", is_prime(n));
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
/*@USER@*/
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        System.out.println(isPrime(n));
    }
}
`,
      python: `#@USER@
n = int(input())
print(is_prime(n))
`
    },
    starter: {
      c: `int is_prime(int n) { return 0; }
`,
      java: `    static int isPrime(int n) { return 0; }
`,
      python: `def is_prime(n):
    return 0
`
    },
    solution: {
      c: `int is_prime(int n) {
    if (n < 2) return 0;
    for (int i = 2; i * i <= n; i++)
        if (n % i == 0) return 0;
    return 1;
}
`,
      java: `    static int isPrime(int n) {
        if (n < 2)
            return 0;
        for (int i = 2; i * i <= n; i++)
            if (n % i == 0)
                return 0;
        return 1;
    }
`,
      python: `def is_prime(n):
    if n < 2:
        return 0
    for i in range(2, n + 1):
        if i * i > n:
            break
        if n % i == 0:
            return 0
    return 1
`
    },
    explain: "2 미만은 바로 제외합니다. 2부터 `i*i ≤ n`인 약수까지만 확인하면 충분해요.",
    hints: ["1은 소수가 아닙니다.", "약수는 제곱근을 기준으로 짝을 이룹니다."]
  },
  {
    id: "core-gcd",
    title: "두 길이의 최대공약수",
    level: 2,
    topics: ["함수", "수학"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "func",
      java: "method",
      python: "func"
    },
    statement: `두 끈을 남김없이 같은 길이로 자르려고 해요. 가장 긴 공통 조각 길이를 구하세요. 두 길이가 모두 0이면 결과는 0이에요.

**함수만 작성하세요.** Java에서는 \`Main\` 안에 들어갈 \`static\` 메서드를 작성합니다. 입력과 출력은 채점 코드가 맡습니다.`,
    inputSpec: "정수 `a`, `b`를 한 줄씩 (0 ≤ a,b ≤ 100000).",
    outputSpec: "최대공약수 한 개.",
    examples: [
      {
        stdin: `18
24
`,
        expected: `6
`,
        explain: "6칸씩 자르면 두 끈 모두 남지 않아요."
      }
    ],
    tests: [
      {
        stdin: `0
0
`,
        expected: `0
`
      },
      {
        stdin: `0
27
`,
        expected: `27
`
      },
      {
        stdin: `99991
1
`,
        expected: `1
`
      },
      {
        stdin: `100000
100000
`,
        expected: `100000
`
      }
    ],
    mode: "function",
    harness: {
      c: `#include <stdio.h>
/*@USER@*/
int main(void) {
    int a,b; scanf("%d%d", &a, &b);
    printf("%d\\n", gcd(a,b));
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
/*@USER@*/
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt(), b = sc.nextInt();
        System.out.println(gcd(a,b));
    }
}
`,
      python: `#@USER@
a = int(input())
b = int(input())
print(gcd(a,b))
`
    },
    starter: {
      c: `int gcd(int a, int b) { return 0; }
`,
      java: `    static int gcd(int a, int b) { return 0; }
`,
      python: `def gcd(a, b):
    return 0
`
    },
    solution: {
      c: `int gcd(int a, int b) {
    while (b != 0) {
        int t = a % b;
        a = b;
        b = t;
    }
    return a;
}
`,
      java: `    static int gcd(int a, int b) {
        while (b != 0) {
            int t = a % b;
            a = b;
            b = t;
        }
        return a;
    }
`,
      python: `def gcd(a, b):
    while b != 0:
        a, b = b, a % b
    return a
`
    },
    explain: "나머지를 이용해 `(a,b)`를 `(b,a%b)`로 바꾸면 최대공약수가 보존돼요. `b=0`에서 멈춥니다.",
    hints: ["한쪽이 0이면 다른 쪽 길이가 답이에요.", "작은 수로 큰 수를 나눈 나머지를 이용하세요."]
  },
  {
    id: "core-clamp-temperature",
    title: "온도 표시 범위",
    level: 2,
    topics: ["함수", "조건문"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "func",
      java: "method",
      python: "func"
    },
    statement: `기록계는 온도를 정해진 구간 안에서만 표시해요. 너무 낮으면 최솟값, 너무 높으면 최댓값으로 바꾸세요.

**함수만 작성하세요.** Java에서는 \`Main\` 안에 들어갈 \`static\` 메서드를 작성합니다. 입력과 출력은 채점 코드가 맡습니다.`,
    inputSpec: "정수 `x`, `low`, `high`를 한 줄씩 (-100000 ≤ low ≤ high ≤ 100000, -100000 ≤ x ≤ 100000).",
    outputSpec: "조정한 정수 하나.",
    examples: [
      {
        stdin: `38
-10
30
`,
        expected: `30
`,
        explain: "38은 상한 30보다 높아요."
      }
    ],
    tests: [
      {
        stdin: `-100000
-100000
100000
`,
        expected: `-100000
`
      },
      {
        stdin: `5
5
5
`,
        expected: `5
`
      },
      {
        stdin: `0
-1
1
`,
        expected: `0
`
      },
      {
        stdin: `-5
0
10
`,
        expected: `0
`
      }
    ],
    mode: "function",
    harness: {
      c: `#include <stdio.h>
/*@USER@*/
int main(void) {
    int x,low,high; scanf("%d%d%d", &x, &low, &high);
    printf("%d\\n", clamp(x,low,high));
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
/*@USER@*/
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int x = sc.nextInt(), low = sc.nextInt(), high = sc.nextInt();
        System.out.println(clamp(x,low,high));
    }
}
`,
      python: `#@USER@
x = int(input())
low = int(input())
high = int(input())
print(clamp(x,low,high))
`
    },
    starter: {
      c: `int clamp(int x, int low, int high) { return 0; }
`,
      java: `    static int clamp(int x, int low, int high) { return 0; }
`,
      python: `def clamp(x, low, high):
    return 0
`
    },
    solution: {
      c: `int clamp(int x, int low, int high) {
    if (x < low) return low;
    if (x > high) return high;
    return x;
}
`,
      java: `    static int clamp(int x, int low, int high) {
        if (x < low)
            return low;
        if (x > high)
            return high;
        return x;
    }
`,
      python: `def clamp(x, low, high):
    if x < low:
        return low
    if x > high:
        return high
    return x
`
    },
    explain: "하한보다 작으면 하한을, 상한보다 크면 상한을 반환합니다. 그 외에는 원래 값입니다.",
    hints: ["두 경계와 차례로 비교하세요."]
  },
  {
    id: "core-count-digits-function",
    title: "사물함 번호의 자릿수",
    level: 2,
    topics: ["함수", "반복문"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "func",
      java: "method",
      python: "func"
    },
    statement: `사물함 번호를 인쇄할 때 필요한 숫자 칸 수를 세어요. 0도 한 칸을 차지합니다.

**함수만 작성하세요.** Java에서는 \`Main\` 안에 들어갈 \`static\` 메서드를 작성합니다. 입력과 출력은 채점 코드가 맡습니다.`,
    inputSpec: "정수 `n` 하나 (0 ≤ n ≤ 1000000000).",
    outputSpec: "십진수 자릿수.",
    examples: [
      {
        stdin: `2048
`,
        expected: `4
`,
        explain: "2048은 숫자 네 칸에 인쇄해요."
      }
    ],
    tests: [
      {
        stdin: `0
`,
        expected: `1
`
      },
      {
        stdin: `9
`,
        expected: `1
`
      },
      {
        stdin: `1000000000
`,
        expected: `10
`
      },
      {
        stdin: `999999999
`,
        expected: `9
`
      }
    ],
    mode: "function",
    harness: {
      c: `#include <stdio.h>
/*@USER@*/
int main(void) {
    int n; scanf("%d", &n);
    printf("%d\\n", count_digits(n));
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
/*@USER@*/
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        System.out.println(countDigits(n));
    }
}
`,
      python: `#@USER@
n = int(input())
print(count_digits(n))
`
    },
    starter: {
      c: `int count_digits(int n) { return 0; }
`,
      java: `    static int countDigits(int n) { return 0; }
`,
      python: `def count_digits(n):
    return 0
`
    },
    solution: {
      c: `int count_digits(int n) {
    int count = 1;
    while (n >= 10) {
        n /= 10;
        count++;
    }
    return count;
}
`,
      java: `    static int countDigits(int n) {
        int count = 1;
        while (n >= 10) {
            n /= 10;
            count++;
        }
        return count;
    }
`,
      python: `def count_digits(n):
    count = 1
    while n >= 10:
        n //= 10
        count += 1
    return count
`
    },
    explain: "0이면 한 자리입니다. 그 외에는 10으로 나눈 몫이 0이 될 때까지 반복하며 횟수를 셉니다.",
    hints: ["0은 한 자리입니다.", "`n /= 10`은 마지막 자리를 제거해요."]
  },
  {
    id: "core-integer-power",
    title: "반복 곱셈 함수",
    level: 3,
    topics: ["함수", "반복문"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "func",
      java: "method",
      python: "func"
    },
    statement: `홍보 문구가 매번 같은 배수로 퍼져요. 밑 \`a\`를 \`b\`번 곱한 값을 구하세요. 0번 곱하면 1입니다.

**함수만 작성하세요.** Java에서는 \`Main\` 안에 들어갈 \`static\` 메서드를 작성합니다. 입력과 출력은 채점 코드가 맡습니다.`,
    inputSpec: "정수 `a`, `b`를 한 줄씩 (-10 ≤ a ≤ 10, 0 ≤ b ≤ 8).",
    outputSpec: "`a`의 `b`제곱.",
    examples: [
      {
        stdin: `-2
3
`,
        expected: `-8
`,
        explain: "(-2)×(-2)×(-2)=-8이에요."
      }
    ],
    tests: [
      {
        stdin: `0
0
`,
        expected: `1
`
      },
      {
        stdin: `10
8
`,
        expected: `100000000
`
      },
      {
        stdin: `-10
8
`,
        expected: `100000000
`
      },
      {
        stdin: `1
7
`,
        expected: `1
`
      }
    ],
    mode: "function",
    harness: {
      c: `#include <stdio.h>
/*@USER@*/
int main(void) {
    int a,b; scanf("%d%d", &a, &b);
    printf("%d\\n", power(a,b));
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
/*@USER@*/
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt(), b = sc.nextInt();
        System.out.println(power(a,b));
    }
}
`,
      python: `#@USER@
a = int(input())
b = int(input())
print(power(a,b))
`
    },
    starter: {
      c: `int power(int a, int b) { return 0; }
`,
      java: `    static int power(int a, int b) { return 0; }
`,
      python: `def power(a, b):
    return 0
`
    },
    solution: {
      c: `int power(int a, int b) {
    int result = 1;
    for (int i = 0; i < b; i++) result *= a;
    return result;
}
`,
      java: `    static int power(int a, int b) {
        int result = 1;
        for (int i = 0; i < b; i++) result *= a;
        return result;
    }
`,
      python: `def power(a, b):
    result = 1
    for _ in range(b):
        result *= a
    return result
`
    },
    explain: "결과를 1에서 시작해 밑을 정확히 `b`번 곱하면 됩니다.",
    hints: ["0번 곱하는 경우를 먼저 생각하세요.", "초깃값은 1입니다."]
  },
  {
    id: "core-factorial-recursive",
    title: "접이식 계단의 경우의 수",
    level: 3,
    topics: ["재귀", "함수", "수학"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "func",
      java: "method",
      python: "func"
    },
    statement: "n개의 서로 다른 계단 표식을 한 줄로 세우는 순서의 수는 `n!`이에요. `0!`은 1입니다. 재귀 함수로 계산해 보세요.",
    inputSpec: "정수 `n` 하나 (0 ≤ n ≤ 12).",
    outputSpec: "`n!` 한 개.",
    examples: [
      {
        stdin: `4
`,
        expected: `24
`,
        explain: "4×3×2×1=24예요."
      }
    ],
    tests: [
      {
        stdin: `0
`,
        expected: `1
`
      },
      {
        stdin: `1
`,
        expected: `1
`
      },
      {
        stdin: `12
`,
        expected: `479001600
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>
int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>
int factorial(int n) { return n <= 1 ? 1 : n * factorial(n - 1); }
int main(void) {
    int n;
    scanf("%d", &n);
    printf("%d\\n", factorial(n));
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    static int factorial(int n) {
        return n <= 1 ? 1 : n * factorial(n - 1);
    }
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.println(factorial(sc.nextInt()));
    }
}
`,
      python: `def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)
print(factorial(int(input())))
`
    },
    explain: "`n <= 1`일 때 1을 반환하는 종료 조건을 두고, 나머지는 `n * factorial(n-1)`로 연결합니다.",
    hints: ["재귀 함수에는 반드시 멈추는 경우가 필요해요.", "0과 1에서는 더 작게 호출하지 마세요."]
  },
  {
    id: "core-hanoi-move-count",
    title: "원판 옮기기 횟수",
    level: 4,
    topics: ["재귀", "수학"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "func",
      java: "method",
      python: "func"
    },
    statement: "세 개의 기둥이 있습니다. 크기가 다른 원판 `n`개가 첫 기둥에 큰 것부터 쌓여 있어요. 한 번에 맨 위 원판 하나만 옮기고 큰 원판을 작은 원판 위에 놓을 수 없을 때, 모든 원판을 다른 기둥으로 옮기는 최소 횟수를 구하세요. 원판이 0개면 0번입니다. 재귀로 풀어 보세요.",
    inputSpec: "정수 `n` 하나 (0 ≤ n ≤ 20).",
    outputSpec: "최소 이동 횟수.",
    examples: [
      {
        stdin: `3
`,
        expected: `7
`,
        explain: "위 2개를 치우고 큰 원판을 옮긴 뒤 다시 2개를 옮겨요."
      }
    ],
    tests: [
      {
        stdin: `0
`,
        expected: `0
`
      },
      {
        stdin: `1
`,
        expected: `1
`
      },
      {
        stdin: `20
`,
        expected: `1048575
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>
int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>
int moves(int n) { return n == 0 ? 0 : 2 * moves(n - 1) + 1; }
int main(void) {
    int n;
    scanf("%d", &n);
    printf("%d\\n", moves(n));
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    static int moves(int n) {
        return n == 0 ? 0 : 2 * moves(n - 1) + 1;
    }
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.println(moves(sc.nextInt()));
    }
}
`,
      python: `def moves(n):
    if n == 0:
        return 0
    return 2 * moves(n - 1) + 1
print(moves(int(input())))
`
    },
    explain: "`n=0`에서 멈춥니다. `n`개는 `n-1`개를 두 번 옮기고 가장 큰 것 한 번을 더 옮깁니다.",
    hints: ["작은 탑을 치우는 횟수와 다시 쌓는 횟수는 같아요.", "점화식은 `2*T(n-1)+1`입니다."]
  },
  {
    id: "core-binary-search",
    title: "정렬된 명단에서 찾기",
    level: 3,
    topics: ["배열", "탐색"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "array",
      java: "array",
      python: "data"
    },
    statement: "오름차순으로 정리한 출석 번호표에서 목표 번호를 찾으세요. 같은 번호는 없어요. 중간을 기준으로 절반씩 좁히는 이진 탐색을 사용하세요.",
    inputSpec: "첫 줄 `n` (0 ≤ n ≤ 100), 둘째 줄 목표 정수 `x` (-100000 ≤ x ≤ 100000), 다음 `n`줄에 서로 다른 오름차순 정수 (각 -100000~100000).",
    outputSpec: "찾으면 0부터 시작하는 위치, 없으면 `-1`.",
    examples: [
      {
        stdin: `5
7
1
3
7
9
11
`,
        expected: `2
`,
        explain: "7은 세 번째 칸, 0부터 세면 2예요."
      }
    ],
    tests: [
      {
        stdin: `0
7
`,
        expected: `-1
`
      },
      {
        stdin: `1
-5
-5
`,
        expected: `0
`
      },
      {
        stdin: `4
3
-10
0
5
100000
`,
        expected: `-1
`
      },
      {
        stdin: `5
100000
-100000
0
3
9
100000
`,
        expected: `4
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>
int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>
int main(void) {
    int n, x, a[100];
    scanf("%d%d", &n, &x);
    for (int i = 0; i < n; i++) scanf("%d", &a[i]);
    int l = 0, r = n - 1;
    while (l <= r) {
        int m = l + (r - l) / 2;
        if (a[m] == x) {
            printf("%d\\n", m);
            return 0;
        }
        if (a[m] < x)
            l = m + 1;
        else
            r = m - 1;
    }
    puts("-1");
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt(), x = sc.nextInt();
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = sc.nextInt();
        int l = 0, r = n - 1;
        while (l <= r) {
            int m = l + (r - l) / 2;
            if (a[m] == x) {
                System.out.println(m);
                return;
            }
            if (a[m] < x)
                l = m + 1;
            else
                r = m - 1;
        }
        System.out.println(-1);
    }
}
`,
      python: `n=int(input())
x=int(input())
a=[int(input()) for _ in range(n)]
l,r=0,n-1
answer=-1
while l<=r:
    m=(l+r)//2
    if a[m]==x:
        answer=m
        break
    if a[m]<x:
        l=m+1
    else:
        r=m-1
print(answer)
`
    },
    explain: "가운데 값이 목표보다 작으면 왼쪽 절반은 버리고, 크면 오른쪽 절반을 버립니다. 범위가 뒤집히면 없습니다.",
    hints: ["왼쪽·오른쪽 경계를 인덱스로 둡니다.", "중간값을 본 뒤 경계 하나를 갱신하세요."]
  },
  {
    id: "core-bubble-swap-count",
    title: "정리 중 자리 바꿈",
    level: 3,
    topics: ["배열", "정렬"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "array",
      java: "array",
      python: "data"
    },
    statement: "책 번호를 왼쪽부터 차례로 비교하며, 왼쪽이 더 크면 두 책을 바꿔 정렬해요. 모든 숫자를 오름차순으로 만들 때 실제로 바뀐 횟수를 세세요.",
    inputSpec: "첫 줄 `n` (0 ≤ n ≤ 30), 다음 `n`줄에 정수 (-1000 ≤ 값 ≤ 1000).",
    outputSpec: "첫 줄에 바꾼 횟수, 둘째 줄에 정렬된 수를 공백으로 구분해 출력합니다. `n=0`이면 둘째 줄은 비워 둡니다.",
    examples: [
      {
        stdin: `3
3
1
2
`,
        expected: `2
1 2 3
`,
        explain: "3과 1, 이어서 3과 2가 자리를 바꿔요."
      }
    ],
    tests: [
      {
        stdin: `0
`,
        expected: `0

`
      },
      {
        stdin: `1
-1
`,
        expected: `0
-1
`
      },
      {
        stdin: `4
4
3
2
1
`,
        expected: `6
1 2 3 4
`
      },
      {
        stdin: `4
2
2
2
2
`,
        expected: `0
2 2 2 2
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>
int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>
int main(void) {
    int n, a[30], count = 0;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) scanf("%d", &a[i]);
    for (int end = n - 1; end > 0; end--)
        for (int i = 0; i < end; i++)
            if (a[i] > a[i + 1]) {
                int t = a[i];
                a[i] = a[i + 1];
                a[i + 1] = t;
                count++;
            }
    printf("%d\\n", count);
    for (int i = 0; i < n; i++) printf(i ? " %d" : "%d", a[i]);
    puts("");
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt(), count = 0;
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = sc.nextInt();
        for (int end = n - 1; end > 0; end--)
            for (int i = 0; i < end; i++)
                if (a[i] > a[i + 1]) {
                    int t = a[i];
                    a[i] = a[i + 1];
                    a[i + 1] = t;
                    count++;
                }
        System.out.println(count);
        for (int i = 0; i < n; i++) {
            if (i > 0)
                System.out.print(" ");
            System.out.print(a[i]);
        }
        System.out.println();
    }
}
`,
      python: `n=int(input())
a=[int(input()) for _ in range(n)]
count=0
for end in range(n-1,0,-1):
    for i in range(end):
        if a[i]>a[i+1]:
            a[i],a[i+1]=a[i+1],a[i]
            count+=1
print(count)
print(*a)
`
    },
    explain: "인접한 두 수를 비교해 왼쪽이 더 클 때만 교환합니다. 한 바퀴마다 가장 큰 수가 끝으로 갑니다.",
    hints: ["같은 숫자는 바꾸지 않아요.", "교환할 때만 횟수를 올리세요."]
  },
  {
    id: "core-merge-sorted-rows",
    title: "두 줄 번호표 합치기",
    level: 4,
    topics: ["배열", "정렬"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "array",
      java: "array",
      python: "data"
    },
    statement: "두 줄의 번호표가 각각 오름차순이에요. 순서를 유지하면서 하나의 오름차순 번호표로 합치세요. 같은 번호는 여러 번 남겨야 해요.",
    inputSpec: "첫 줄 `n`, 둘째 줄 `m` (0 ≤ n,m ≤ 30), 다음 `n`줄은 첫 번째 번호, 이어서 `m`줄은 두 번째 번호 (-1000 ≤ 값 ≤ 1000).",
    outputSpec: "합친 번호를 공백으로 구분해 한 줄에 출력합니다. 두 줄 모두 비었으면 `EMPTY`.",
    examples: [
      {
        stdin: `3
2
1
4
4
2
5
`,
        expected: `1 2 4 4 5
`,
        explain: "두 줄의 맨 앞 숫자 중 작은 것부터 골라요."
      }
    ],
    tests: [
      {
        stdin: `0
0
`,
        expected: `EMPTY
`
      },
      {
        stdin: `0
2
-1
8
`,
        expected: `-1 8
`
      },
      {
        stdin: `2
0
3
3
`,
        expected: `3 3
`
      },
      {
        stdin: `2
2
-1000
1000
-1000
1000
`,
        expected: `-1000 -1000 1000 1000
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>
int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>
int main(void) {
    int n, m, a[30], b[30];
    scanf("%d%d", &n, &m);
    for (int i = 0; i < n; i++) scanf("%d", &a[i]);
    for (int j = 0; j < m; j++) scanf("%d", &b[j]);
    if (n + m == 0) {
        puts("EMPTY");
        return 0;
    }
    int i = 0, j = 0, k = 0;
    while (i < n || j < m) {
        int x;
        if (j == m || (i < n && a[i] <= b[j]))
            x = a[i++];
        else
            x = b[j++];
        printf(k++ ? " %d" : "%d", x);
    }
    puts("");
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt(), m = sc.nextInt();
        int[] a = new int[n], b = new int[m];
        for (int i = 0; i < n; i++) a[i] = sc.nextInt();
        for (int i = 0; i < m; i++) b[i] = sc.nextInt();
        if (n + m == 0) {
            System.out.println("EMPTY");
            return;
        }
        int i = 0, j = 0, k = 0;
        while (i < n || j < m) {
            int x;
            if (j == m || (i < n && a[i] <= b[j]))
                x = a[i++];
            else
                x = b[j++];
            if (k++ > 0)
                System.out.print(" ");
            System.out.print(x);
        }
        System.out.println();
    }
}
`,
      python: `n=int(input())
m=int(input())
a=[int(input()) for _ in range(n)]
b=[int(input()) for _ in range(m)]
if n+m==0:
    print("EMPTY")
else:
    i=j=0
    result=[]
    while i<n or j<m:
        if j==m or (i<n and a[i]<=b[j]):
            result.append(a[i])
            i+=1
        else:
            result.append(b[j])
            j+=1
    print(*result)
`
    },
    explain: "각 줄의 현재 위치를 따로 기억하고 더 작은 값을 결과에 넣습니다. 한 줄이 끝나면 나머지를 그대로 이어 붙입니다.",
    hints: ["두 인덱스 `i`, `j`를 따로 움직이세요.", "같은 값이면 어느 쪽을 먼저 골라도 결과는 같습니다."]
  },
  {
    id: "core-vending-change",
    title: "동전이 부족한 자판기",
    level: 4,
    topics: ["배열", "시뮬레이션"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "array",
      java: "array",
      python: "str"
    },
    statement: "행사 자판기에는 500원·100원·50원·10원 동전 재고가 있습니다. 여러 손님의 거스름돈을 차례로 처리하세요. **큰 동전부터 가능한 만큼 쓰는 규칙**을 따릅니다. 필요한 금액을 끝까지 만들 수 없다면 `FAIL`을 출력하고 동전 재고는 바꾸지 않습니다. 다른 조합은 다시 탐색하지 않습니다.",
    inputSpec: "첫 줄에 500원·100원·50원·10원 동전 개수 각 하나 (0~20), 둘째 줄 손님 수 `n` (0 ≤ n ≤ 20), 다음 `n`줄에 가격 `price`와 받은 돈 `paid` (0 ≤ price ≤ paid ≤ 10000, 둘 다 10의 배수).",
    outputSpec: "각 손님에 대해 성공하면 `OK`와 네 종류의 사용한 동전 개수를 큰 단위부터 출력합니다. 실패하면 `FAIL` 한 줄을 출력합니다.",
    examples: [
      {
        stdin: `1 2 0 5
2
0 600
0 600
`,
        expected: `OK 1 1 0 0
FAIL
`,
        explain: "첫 손님 뒤에는 500원 동전이 없어 둘째 손님에게 600원을 줄 수 없어요."
      }
    ],
    tests: [
      {
        stdin: `0 0 0 0
2
100 100
0 10
`,
        expected: `OK 0 0 0 0
FAIL
`
      },
      {
        stdin: `20 20 20 20
2
0 10000
0 10000
`,
        expected: `OK 20 0 0 0
FAIL
`
      },
      {
        stdin: `1 6 0 0
1
0 600
`,
        expected: `OK 1 1 0 0
`
      },
      {
        stdin: `1 0 0 0
1
0 600
`,
        expected: `FAIL
`
      },
      {
        stdin: `1 0 0 0
2
0 600
0 500
`,
        expected: `FAIL
OK 1 0 0 0
`
      },
      {
        stdin: `0 0 0 0
0
`,
        expected: ""
      },
      {
        stdin: `0 0 0 20
20
0 10
0 10
0 10
0 10
0 10
0 10
0 10
0 10
0 10
0 10
0 10
0 10
0 10
0 10
0 10
0 10
0 10
0 10
0 10
0 10
`,
        expected: `OK 0 0 0 1
OK 0 0 0 1
OK 0 0 0 1
OK 0 0 0 1
OK 0 0 0 1
OK 0 0 0 1
OK 0 0 0 1
OK 0 0 0 1
OK 0 0 0 1
OK 0 0 0 1
OK 0 0 0 1
OK 0 0 0 1
OK 0 0 0 1
OK 0 0 0 1
OK 0 0 0 1
OK 0 0 0 1
OK 0 0 0 1
OK 0 0 0 1
OK 0 0 0 1
OK 0 0 0 1
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>
int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>
int main(void) {
    int coin[4] = {500, 100, 50, 10}, stock[4], n;
    for (int i = 0; i < 4; i++) scanf("%d", &stock[i]);
    scanf("%d", &n);
    for (int k = 0; k < n; k++) {
        int price, paid, use[4], remain;
        scanf("%d%d", &price, &paid);
        remain = paid - price;
        for (int i = 0; i < 4; i++) {
            use[i] = remain / coin[i];
            if (use[i] > stock[i]) use[i] = stock[i];
            remain -= use[i] * coin[i];
        }
        if (remain) {
            puts("FAIL");
        } else {
            printf("OK");
            for (int i = 0; i < 4; i++) {
                printf(" %d", use[i]);
                stock[i] -= use[i];
            }
            puts("");
        }
    }
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int[] coin = {500, 100, 50, 10}, stock = new int[4];
        for (int i = 0; i < 4; i++) stock[i] = sc.nextInt();
        int n = sc.nextInt();
        for (int k = 0; k < n; k++) {
            int price = sc.nextInt(), paid = sc.nextInt(), remain = paid - price;
            int[] use = new int[4];
            for (int i = 0; i < 4; i++) {
                use[i] = Math.min(remain / coin[i], stock[i]);
                remain -= use[i] * coin[i];
            }
            if (remain > 0) {
                System.out.println("FAIL");
            } else {
                System.out.print("OK");
                for (int i = 0; i < 4; i++) {
                    System.out.print(" " + use[i]);
                    stock[i] -= use[i];
                }
                System.out.println();
            }
        }
    }
}
`,
      python: `coin=[500,100,50,10]
stock=list(map(int,input().split()))
n=int(input())
for _ in range(n):
    price,paid=map(int,input().split())
    remain=paid-price
    used=[]
    for i in range(4):
        take=min(remain//coin[i],stock[i])
        used.append(take)
        remain-=take*coin[i]
    if remain:
        print("FAIL")
    else:
        print("OK",*used)
        for i in range(4):
            stock[i]-=used[i]
`
    },
    explain: "각 요청마다 남은 금액으로 큰 동전부터 임시로 고릅니다. 10원까지 처리한 뒤에도 금액이 남으면 실패로 처리하고 재고를 보존합니다.",
    hints: ["동전 종류별 사용 개수를 임시 배열에 저장하세요.", "성공이 확정될 때만 실제 재고에서 빼세요."]
  },
  {
    id: "core-elevator-distance",
    title: "가까운 층부터 방문",
    level: 4,
    topics: ["배열", "탐색", "시뮬레이션"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "array",
      java: "array",
      python: "data"
    },
    statement: "엘리베이터는 주어진 시작 층에서 출발합니다. 요청된 층 중 **현재 층과 가장 가까운 층**을 다음 목적지로 고릅니다. 거리가 같으면 낮은 층을 먼저 방문해요. 같은 층 요청도 각각 한 번 방문한 것으로 기록합니다.",
    inputSpec: "첫 줄 시작 층 `start` (1~100), 둘째 줄 요청 수 `n` (0~20), 다음 `n`줄에 요청 층 (1~100)이 주어집니다. 모든 요청은 출발 전에 접수되어 있습니다.",
    outputSpec: "첫 줄에 방문한 층을 순서대로 공백으로 구분해 출력합니다. 요청이 없으면 `EMPTY`를 출력합니다. 둘째 줄에는 총 이동 층 수를 출력합니다.",
    examples: [
      {
        stdin: `1
3
4
2
7
`,
        expected: `2 4 7
6
`,
        explain: "1층에서 가장 가까운 2층부터 가면 1+2+3=6층을 움직여요."
      }
    ],
    tests: [
      {
        stdin: `1
0
`,
        expected: `EMPTY
0
`
      },
      {
        stdin: `1
3
4
2
6
`,
        expected: `2 4 6
5
`
      },
      {
        stdin: `1
3
5
5
1
`,
        expected: `1 5 5
4
`
      },
      {
        stdin: `1
1
100
`,
        expected: `100
99
`
      },
      {
        stdin: `5
4
7
3
9
1
`,
        expected: `3 1 7 9
12
`,
        explain: "5층에서 같은 거리인 3층과 7층 중 낮은 3층부터 방문합니다."
      },
      {
        stdin: `100
20
1
1
1
1
1
1
1
1
1
1
1
1
1
1
1
1
1
1
1
1
`,
        expected: `1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1
99
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>
int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>
#include <stdlib.h>
int main(void) {
    int n, a[20], used[20] = {0}, floor = 1, total = 0;
    scanf("%d%d", &floor, &n);
    for (int i = 0; i < n; i++) scanf("%d", &a[i]);
    if (n == 0) puts("EMPTY");
    for (int k = 0; k < n; k++) {
        int best = -1;
        for (int i = 0; i < n; i++)
            if (!used[i] && (best < 0 || abs(a[i] - floor) < abs(a[best] - floor) ||
                             (abs(a[i] - floor) == abs(a[best] - floor) && a[i] < a[best])))
                best = i;
        total += abs(a[best] - floor);
        floor = a[best];
        used[best] = 1;
        printf(k ? " %d" : "%d", floor);
    }
    if (n) puts("");
    printf("%d\\n", total);
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int floor = sc.nextInt(), n = sc.nextInt(), total = 0;
        int[] a = new int[n];
        boolean[] used = new boolean[n];
        for (int i = 0; i < n; i++) a[i] = sc.nextInt();
        if (n == 0)
            System.out.println("EMPTY");
        for (int k = 0; k < n; k++) {
            int best = -1;
            for (int i = 0; i < n; i++)
                if (!used[i]
                    && (best < 0 || Math.abs(a[i] - floor) < Math.abs(a[best] - floor)
                        || (Math.abs(a[i] - floor) == Math.abs(a[best] - floor) && a[i] < a[best])))
                    best = i;
            total += Math.abs(a[best] - floor);
            floor = a[best];
            used[best] = true;
            if (k > 0)
                System.out.print(" ");
            System.out.print(floor);
        }
        if (n > 0)
            System.out.println();
        System.out.println(total);
    }
}
`,
      python: `floor=int(input())
n=int(input())
a=[int(input()) for _ in range(n)]
used=[False]*n
total=0
order=[]
for _ in range(n):
    best=None
    for i in range(n):
        if not used[i] and (best is None or abs(a[i]-floor)<abs(a[best]-floor) or (abs(a[i]-floor)==abs(a[best]-floor) and a[i]<a[best])):
            best=i
    total+=abs(a[best]-floor)
    floor=a[best]
    used[best]=True
    order.append(floor)
print(*order) if order else print("EMPTY")
print(total)
`
    },
    explain: "매 단계에서 아직 처리하지 않은 요청을 모두 비교합니다. 거리 최소를 고르고 동점이면 층 번호가 낮은 것을 골라 방문 표시와 이동 거리를 갱신합니다.",
    hints: ["요청별 처리 여부를 저장하세요.", "거리 비교가 동점일 때 낮은 층을 선택하세요."]
  },
  {
    id: "core-inventory-ledger",
    title: "세 품목 묶음 주문",
    level: 5,
    topics: ["배열", "시뮬레이션"],
    langs: ["c", "java", "python"],
    chapter: {
      c: "array",
      java: "array",
      python: "str"
    },
    statement: "간식 A·B·C의 재고를 관리해요. 한 주문에는 세 품목의 변화량이 함께 들어옵니다. 적용 후 **하나라도 음수**가 되면 주문 전체를 거절하고 세 재고 모두 그대로 둡니다. 양수는 입고, 음수는 판매입니다.",
    inputSpec: "첫 줄 A·B·C 초기 재고 (각 0~1000), 둘째 줄 주문 수 `n` (0 ≤ n ≤ 100), 다음 `n`줄에 A·B·C 변화량 (각 -1000~1000). 중간 재고는 각 100000 이하입니다.",
    outputSpec: "마지막 A·B·C 재고와 거절 횟수를 공백으로 구분해 출력합니다.",
    examples: [
      {
        stdin: `5 0 2
3
-2 3 -1
-4 1 0
1 -3 -1
`,
        expected: `4 0 0 1
`,
        explain: "두 번째 주문은 A가 부족해 전부 거절해요."
      }
    ],
    tests: [
      {
        stdin: `0 0 0
0
`,
        expected: `0 0 0 0
`
      },
      {
        stdin: `0 0 0
2
-1 1 1
1 1 1
`,
        expected: `1 1 1 1
`
      },
      {
        stdin: `1000 1000 1000
1
-1000 -1000 -1000
`,
        expected: `0 0 0 0
`
      },
      {
        stdin: `5 5 5
1
-6 100 -1
`,
        expected: `5 5 5 1
`
      },
      {
        stdin: `0 0 0
100
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
1000 1000 1000
`,
        expected: `100000 100000 100000 0
`
      }
    ],
    mode: "stdio",
    starter: {
      c: `#include <stdio.h>
int main(void) {
    /* 여기에 코드를 작성하세요 */
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        // 여기에 코드를 작성하세요
    }
}
`,
      python: `# 여기에 코드를 작성하세요
`
    },
    solution: {
      c: `#include <stdio.h>
int main(void) {
    int stock[3], n, rejected = 0;
    for (int i = 0; i < 3; i++) scanf("%d", &stock[i]);
    scanf("%d", &n);
    for (int k = 0; k < n; k++) {
        int d[3], ok = 1;
        for (int i = 0; i < 3; i++) {
            scanf("%d", &d[i]);
            if (stock[i] + d[i] < 0) ok = 0;
        }
        if (ok) {
            for (int i = 0; i < 3; i++) stock[i] += d[i];
        } else
            rejected++;
    }
    printf("%d %d %d %d\\n", stock[0], stock[1], stock[2], rejected);
    return 0;
}
`,
      java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int[] stock = new int[3];
        for (int i = 0; i < 3; i++) stock[i] = sc.nextInt();
        int n = sc.nextInt(), rejected = 0;
        for (int k = 0; k < n; k++) {
            int[] d = new int[3];
            boolean ok = true;
            for (int i = 0; i < 3; i++) {
                d[i] = sc.nextInt();
                if (stock[i] + d[i] < 0)
                    ok = false;
            }
            if (ok) {
                for (int i = 0; i < 3; i++) stock[i] += d[i];
            } else
                rejected++;
        }
        System.out.println(stock[0] + " " + stock[1] + " " + stock[2] + " " + rejected);
    }
}
`,
      python: `stock=list(map(int,input().split()))
n=int(input())
rejected=0
for _ in range(n):
    d=list(map(int,input().split()))
    if any(stock[i]+d[i]<0 for i in range(3)):
        rejected+=1
    else:
        for i in range(3):
            stock[i]+=d[i]
print(*stock,rejected)
`
    },
    explain: "주문을 읽은 뒤 세 품목 모두 적용 가능한지 먼저 확인합니다. 하나라도 부족하면 거절 횟수만 늘리고, 가능할 때만 세 재고를 함께 갱신합니다.",
    hints: ["변화량 세 개를 모두 읽고 검사하세요.", "검사가 끝나기 전에 어느 재고도 바꾸지 마세요."]
  }
] satisfies Exercise[]
