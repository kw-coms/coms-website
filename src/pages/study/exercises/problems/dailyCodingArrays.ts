import type { Exercise } from '../types'

// Adapted from the user's DailyCoding problem catalog (range-sum, pair-target,
// interval-merge, lis-len, balanced-paren, coin-min).
const langs = ['c', 'java', 'python'] as const
const starter = {
  c: '#include <stdio.h>\nint main(void) { puts("0"); return 0; }\n',
  java: 'public class Main { public static void main(String[] args) { System.out.println(0); } }\n',
  python: 'print(0)\n',
}

const problems: Exercise[] = [
  {
    id: 'dc-range-sum', title: '구간 합 질의', level: 2, topics: ['누적 합', '배열'],
    langs: [...langs], chapter: { c: 'array', java: 'array', python: 'data' }, mode: 'stdio',
    statement: '수열에서 L번째부터 R번째까지의 합을 구하세요. 위치는 1부터 셉니다. 여러 구간을 묻기 때문에 누적 합을 활용하세요.',
    inputSpec: '첫 줄에 N(1~100000)과 Q(1~1000), 다음 줄에 절댓값이 100000 이하인 정수 N개, 이어서 Q줄에 L R(1 ≤ L ≤ R ≤ N)이 주어집니다.',
    outputSpec: '각 구간의 합을 한 줄씩 출력합니다. 합은 64비트 정수 범위에 들어갑니다.',
    examples: [{ stdin: '5 2\n1 2 3 4 5\n2 4\n1 5\n', expected: '9\n15\n', explain: '두 번째부터 네 번째까지는 2+3+4=9입니다.' }],
    tests: [
      { stdin: '1 1\n-5\n1 1\n', expected: '-5\n' },
      { stdin: '4 3\n10 -20 30 -40\n1 2\n2 3\n4 4\n', expected: '-10\n10\n-40\n' },
      { stdin: '3 2\n100000 100000 100000\n1 3\n2 2\n', expected: '300000\n100000\n' },
      { stdin: '5 2\n0 0 0 0 0\n3 5\n1 1\n', expected: '0\n0\n' },
    ],
    starter, solution: {
      c: `#include <stdio.h>
int main(void) {
    int n, q, left, right;
    scanf("%d%d", &n, &q);
    long long prefix[100001] = {0};
    for (int i = 1; i <= n; i++) {
        long long value;
        scanf("%lld", &value);
        prefix[i] = prefix[i - 1] + value;
    }
    while (q--) {
        scanf("%d%d", &left, &right);
        printf("%lld\\n", prefix[right] - prefix[left - 1]);
    }
    return 0;
}
`,
      java: `import java.io.*;
import java.util.*;
public class Main {
    public static void main(String[] args) throws Exception {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt(), q = sc.nextInt();
        long[] prefix = new long[n + 1];
        for (int i = 1; i <= n; i++) prefix[i] = prefix[i - 1] + sc.nextLong();
        StringBuilder result = new StringBuilder();
        while (q-- > 0) {
            int left = sc.nextInt(), right = sc.nextInt();
            result.append(prefix[right] - prefix[left - 1]).append('\\n');
        }
        System.out.print(result);
    }
}
`,
      python: `import sys
values = list(map(int, sys.stdin.buffer.read().split()))
n, q = values[:2]
prefix = [0]
for value in values[2:2+n]:
    prefix.append(prefix[-1] + value)
answers = []
for i in range(2+n, 2+n+2*q, 2):
    left, right = values[i:i+2]
    answers.append(str(prefix[right] - prefix[left-1]))
print('\\n'.join(answers))
`,
    },
    explain: 'prefix[i]를 처음 i개 원소의 합으로 두면 L..R의 합은 prefix[R] − prefix[L−1]입니다.',
    hints: ['prefix[0]은 0입니다.', '각 질문은 이미 계산한 누적 합 두 개를 빼서 답합니다.'],
  },
  {
    id: 'dc-pair-target', title: '두 수 합 찾기', level: 3, topics: ['투 포인터', '정렬'],
    langs: [...langs], chapter: { c: 'array', java: 'array', python: 'data' }, mode: 'stdio',
    statement: '서로 다른 위치의 수 두 개를 골라 합이 X가 되는지 확인하세요. 값이 같은 두 수를 쓰려면 실제로 두 번 나타나야 합니다.',
    inputSpec: '첫 줄에 N(2~2000)과 X(절댓값 200000 이하), 다음 줄에 절댓값 100000 이하인 정수 N개가 주어집니다.',
    outputSpec: '가능하면 YES, 아니면 NO를 출력합니다.',
    examples: [{ stdin: '5 9\n1 2 4 7 8\n', expected: 'YES\n', explain: '2와 7을 고를 수 있습니다.' }],
    tests: [
      { stdin: '2 4\n2 3\n', expected: 'NO\n' },
      { stdin: '2 4\n2 2\n', expected: 'YES\n' },
      { stdin: '4 0\n-3 1 3 5\n', expected: 'YES\n' },
      { stdin: '4 100\n10 20 30 40\n', expected: 'NO\n' },
    ],
    starter, solution: {
      c: `#include <stdio.h>
#include <stdlib.h>
int compare(const void *a, const void *b) {
    int x = *(const int *)a, y = *(const int *)b;
    return (x > y) - (x < y);
}
int main(void) {
    int n, target, values[2000];
    scanf("%d%d", &n, &target);
    for (int i = 0; i < n; i++) scanf("%d", &values[i]);
    qsort(values, n, sizeof(int), compare);
    int left = 0, right = n - 1;
    while (left < right) {
        int sum = values[left] + values[right];
        if (sum == target) { puts("YES"); return 0; }
        if (sum < target) left++;
        else right--;
    }
    puts("NO");
    return 0;
}
`,
      java: `import java.util.*;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt(), target = sc.nextInt();
        int[] values = new int[n];
        for (int i = 0; i < n; i++) values[i] = sc.nextInt();
        Arrays.sort(values);
        int left = 0, right = n - 1;
        while (left < right) {
            int sum = values[left] + values[right];
            if (sum == target) { System.out.println("YES"); return; }
            if (sum < target) left++;
            else right--;
        }
        System.out.println("NO");
    }
}
`,
      python: `import sys
data = list(map(int, sys.stdin.buffer.read().split()))
n, target = data[:2]
values = sorted(data[2:2+n])
left, right = 0, n-1
while left < right:
    total = values[left] + values[right]
    if total == target:
        print('YES')
        break
    if total < target:
        left += 1
    else:
        right -= 1
else:
    print('NO')
`,
    },
    explain: '오름차순 정렬 후 양 끝에서 시작합니다. 합이 작으면 왼쪽을, 크면 오른쪽을 옮깁니다.',
    hints: ['두 포인터가 같은 위치를 가리키면 원소 하나만 고른 상태입니다.', '값이 같아도 서로 다른 위치라면 함께 쓸 수 있습니다.'],
  },
  {
    id: 'dc-interval-merge', title: '겹치는 구간 병합', level: 4, topics: ['정렬', '그리디'],
    langs: [...langs], chapter: { c: 'project', java: 'project', python: 'project' }, mode: 'stdio',
    statement: '닫힌 정수 구간 N개가 주어집니다. 끝점 하나를 공유하는 구간도 이어 붙여 병합합니다. 모두 병합한 뒤 남는 구간의 수를 구하세요.',
    inputSpec: '첫 줄에 N(1~1000), 다음 N줄에 두 정수 L R(−100000 ≤ L ≤ R ≤ 100000)이 주어집니다.',
    outputSpec: '남은 구간 개수 한 개를 출력합니다.',
    examples: [{ stdin: '4\n1 3\n2 4\n6 7\n7 9\n', expected: '2\n', explain: '[1,4]와 [6,9]가 남습니다.' }],
    tests: [
      { stdin: '1\n-5 -5\n', expected: '1\n' },
      { stdin: '3\n1 2\n3 4\n5 6\n', expected: '3\n' },
      { stdin: '4\n5 7\n1 4\n3 6\n10 12\n', expected: '2\n' },
      { stdin: '3\n0 10\n2 3\n5 6\n', expected: '1\n' },
    ],
    starter, solution: {
      c: `#include <stdio.h>
#include <stdlib.h>
typedef struct { int left, right; } Interval;
int compare(const void *a, const void *b) {
    const Interval *x = a, *y = b;
    return (x->left > y->left) - (x->left < y->left);
}
int main(void) {
    int n, count = 0, end = 0;
    Interval intervals[1000];
    scanf("%d", &n);
    for (int i = 0; i < n; i++) scanf("%d%d", &intervals[i].left, &intervals[i].right);
    qsort(intervals, n, sizeof(Interval), compare);
    for (int i = 0; i < n; i++) {
        if (count == 0 || intervals[i].left > end) {
            count++;
            end = intervals[i].right;
        } else if (intervals[i].right > end) end = intervals[i].right;
    }
    printf("%d\\n", count);
    return 0;
}
`,
      java: `import java.util.*;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt(), count = 0, end = 0;
        int[][] intervals = new int[n][2];
        for (int i = 0; i < n; i++) {
            intervals[i][0] = sc.nextInt();
            intervals[i][1] = sc.nextInt();
        }
        Arrays.sort(intervals, Comparator.comparingInt(a -> a[0]));
        for (int[] interval : intervals) {
            if (count == 0 || interval[0] > end) {
                count++;
                end = interval[1];
            } else end = Math.max(end, interval[1]);
        }
        System.out.println(count);
    }
}
`,
      python: `import sys
data = list(map(int, sys.stdin.buffer.read().split()))
n = data[0]
intervals = sorted((data[i], data[i+1]) for i in range(1, 1+2*n, 2))
count = 0
end = None
for left, right in intervals:
    if end is None or left > end:
        count += 1
        end = right
    else:
        end = max(end, right)
print(count)
`,
    },
    explain: '시작 위치로 정렬하면 앞 구간의 오른쪽 끝만 기억하면 됩니다. 새 구간이 겹치면 끝을 늘립니다.',
    hints: ['끝점에서 만나는 구간도 겹칩니다.', '포함된 작은 구간이 큰 구간의 끝을 줄이지 않게 주의하세요.'],
  },
  {
    id: 'dc-lis-length', title: '최장 증가 부분 수열 길이', level: 5, topics: ['다이나믹 프로그래밍', '배열'],
    langs: [...langs], chapter: { c: 'project', java: 'project', python: 'project' }, mode: 'stdio',
    statement: '수열의 순서를 유지하며 일부 원소를 선택합니다. 선택한 값이 매번 엄격하게 커질 때, 고를 수 있는 최대 개수를 구하세요.',
    inputSpec: '첫 줄에 N(1~1000), 다음 줄에 절댓값이 100000 이하인 정수 N개가 주어집니다.',
    outputSpec: '최장 증가 부분 수열의 길이를 출력합니다.',
    examples: [{ stdin: '6\n3 1 2 1 4 3\n', expected: '3\n', explain: '1, 2, 4를 고르면 길이 3입니다.' }],
    tests: [
      { stdin: '1\n-5\n', expected: '1\n' },
      { stdin: '5\n5 4 3 2 1\n', expected: '1\n' },
      { stdin: '5\n1 2 3 4 5\n', expected: '5\n' },
      { stdin: '4\n2 2 2 2\n', expected: '1\n' },
      { stdin: '6\n1 3 2 4 3 5\n', expected: '4\n' },
    ],
    starter, solution: {
      c: `#include <stdio.h>
int main(void) {
    int n, values[1000], length[1000], best = 0;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) scanf("%d", &values[i]);
    for (int i = 0; i < n; i++) {
        length[i] = 1;
        for (int j = 0; j < i; j++)
            if (values[j] < values[i] && length[j] + 1 > length[i])
                length[i] = length[j] + 1;
        if (length[i] > best) best = length[i];
    }
    printf("%d\\n", best);
    return 0;
}
`,
      java: `import java.util.*;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt(), best = 0;
        int[] values = new int[n], length = new int[n];
        for (int i = 0; i < n; i++) values[i] = sc.nextInt();
        for (int i = 0; i < n; i++) {
            length[i] = 1;
            for (int j = 0; j < i; j++)
                if (values[j] < values[i]) length[i] = Math.max(length[i], length[j] + 1);
            best = Math.max(best, length[i]);
        }
        System.out.println(best);
    }
}
`,
      python: `import sys
data = list(map(int, sys.stdin.buffer.read().split()))
values = data[1:1+data[0]]
lengths = [1] * len(values)
for i in range(len(values)):
    for j in range(i):
        if values[j] < values[i]:
            lengths[i] = max(lengths[i], lengths[j] + 1)
print(max(lengths))
`,
    },
    explain: 'dp[i]를 i번째 원소로 끝나는 최장 길이로 두고, 더 작은 이전 원소의 길이에 1을 더합니다.',
    hints: ['같은 값은 엄격한 증가가 아닙니다.', '모든 i에 대해 이전 j를 살펴보면 O(N²)입니다.'],
  },
  {
    id: 'dc-balanced-paren', title: '올바른 괄호 판별', level: 3, topics: ['스택', '문자열'],
    langs: [...langs], chapter: { c: 'array', java: 'array', python: 'str' }, mode: 'stdio',
    statement: '괄호 문자열에서 모든 여는 괄호가 나중의 닫는 괄호와 짝을 이루는지 판별하세요. 중간에 닫는 괄호가 먼저 나와도 올바르지 않습니다.',
    inputSpec: '첫 줄에 `(`와 `)`만으로 된 길이 1~1000의 문자열이 주어집니다.',
    outputSpec: '올바르면 YES, 그렇지 않으면 NO를 출력합니다.',
    examples: [{ stdin: '(()())\n', expected: 'YES\n', explain: '안쪽과 바깥쪽 괄호가 각각 짝을 이룹니다.' }],
    tests: [
      { stdin: ')(', expected: 'NO\n' },
      { stdin: '(()\n', expected: 'NO\n' },
      { stdin: '()()()\n', expected: 'YES\n' },
      { stdin: '())(()\n', expected: 'NO\n' },
      { stdin: '(())()\n', expected: 'YES\n' },
    ],
    starter, solution: {
      c: `#include <stdio.h>
int main(void) {
    char text[1001];
    int balance = 0, valid = 1;
    scanf("%1000s", text);
    for (int i = 0; text[i]; i++) {
        balance += text[i] == '(' ? 1 : -1;
        if (balance < 0) valid = 0;
    }
    puts(valid && balance == 0 ? "YES" : "NO");
    return 0;
}
`,
      java: `import java.util.*;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String text = sc.next();
        int balance = 0;
        boolean valid = true;
        for (int i = 0; i < text.length(); i++) {
            balance += text.charAt(i) == '(' ? 1 : -1;
            if (balance < 0) valid = false;
        }
        System.out.println(valid && balance == 0 ? "YES" : "NO");
    }
}
`,
      python: `text = input().strip()
balance = 0
valid = True
for char in text:
    balance += 1 if char == '(' else -1
    if balance < 0:
        valid = False
print('YES' if valid and balance == 0 else 'NO')
`,
    },
    explain: '왼쪽부터 여는 괄호는 +1, 닫는 괄호는 −1로 셉니다. 중간에 음수가 되지 않고 끝에 0이면 올바릅니다.',
    hints: ['닫는 괄호를 만났을 때 이전 여는 괄호가 있어야 합니다.', '마지막에 남은 여는 괄호도 없어야 합니다.'],
  },
  {
    id: 'dc-coin-min', title: '최소 동전 개수', level: 4, topics: ['다이나믹 프로그래밍', '배열'],
    langs: [...langs], chapter: { c: 'project', java: 'project', python: 'project' }, mode: 'stdio',
    statement: '주어진 종류의 동전을 여러 개 사용할 수 있습니다. 정확히 T원을 만들 때 필요한 최소 동전 수를 구하세요. 만들 수 없으면 −1입니다.',
    inputSpec: '첫 줄에 동전 종류 수 N(1~20)과 목표 T(1~1000), 다음 줄에 1~1000 범위의 동전 가치 N개가 주어집니다.',
    outputSpec: '최소 동전 수 또는 −1을 출력합니다.',
    examples: [{ stdin: '3 11\n1 5 6\n', expected: '2\n', explain: '5원과 6원 동전을 하나씩 쓰면 됩니다.' }],
    tests: [
      { stdin: '2 3\n2 4\n', expected: '-1\n' },
      { stdin: '2 6\n1 4\n', expected: '3\n' },
      { stdin: '1 8\n2\n', expected: '4\n' },
      { stdin: '2 12\n4 6\n', expected: '2\n' },
      { stdin: '1 1\n5\n', expected: '-1\n' },
    ],
    starter, solution: {
      c: `#include <stdio.h>
int main(void) {
    int n, target, coins[20], best[1001];
    scanf("%d%d", &n, &target);
    for (int i = 0; i < n; i++) scanf("%d", &coins[i]);
    best[0] = 0;
    for (int amount = 1; amount <= target; amount++) {
        best[amount] = target + 1;
        for (int i = 0; i < n; i++)
            if (coins[i] <= amount && best[amount - coins[i]] + 1 < best[amount])
                best[amount] = best[amount - coins[i]] + 1;
    }
    printf("%d\\n", best[target] <= target ? best[target] : -1);
    return 0;
}
`,
      java: `import java.util.*;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt(), target = sc.nextInt();
        int[] coins = new int[n], best = new int[target + 1];
        for (int i = 0; i < n; i++) coins[i] = sc.nextInt();
        Arrays.fill(best, target + 1);
        best[0] = 0;
        for (int amount = 1; amount <= target; amount++)
            for (int coin : coins)
                if (coin <= amount) best[amount] = Math.min(best[amount], best[amount - coin] + 1);
        System.out.println(best[target] <= target ? best[target] : -1);
    }
}
`,
      python: `import sys
data = list(map(int, sys.stdin.buffer.read().split()))
n, target = data[:2]
coins = data[2:2+n]
best = [target + 1] * (target + 1)
best[0] = 0
for amount in range(1, target + 1):
    for coin in coins:
        if coin <= amount:
            best[amount] = min(best[amount], best[amount-coin] + 1)
print(best[target] if best[target] <= target else -1)
`,
    },
    explain: 'dp[금액]에 최소 동전 수를 저장합니다. 모든 동전 종류를 확인하며 더 작은 금액의 답에 1을 더합니다.',
    hints: ['만들 수 없는 금액은 T+1처럼 큰 값으로 표시하세요.', '목표 금액까지 작은 금액부터 순서대로 계산하세요.'],
  },
]

export default problems
