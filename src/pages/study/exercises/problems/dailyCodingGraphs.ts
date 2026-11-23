import type { Exercise } from '../types'

// Adapted from the owner's DailyCoding catalog: problemCatalog.js and newProblems2026.js.
const starter = {
  c: '#include <stdio.h>\nint main(void) { puts("0"); return 0; }\n',
  java: 'public class Main { public static void main(String[] args) { System.out.println(0); } }\n',
  python: 'print(0)\n',
}

const problems: Exercise[] = [
  {
    id: 'dc-grid-reach', title: '격자 도달 영역', level: 4, topics: ['그래프', '너비 우선 탐색'],
    langs: ['c', 'java', 'python'], chapter: { c: 'array', java: 'array', python: 'data' }, mode: 'stdio',
    statement: '맨 왼쪽 위 칸에서 상하좌우로 이동합니다. `1`인 칸으로만 갈 수 있을 때 방문할 수 있는 칸 수를 구하세요. 시작 칸이 `0`이면 답은 0입니다.',
    inputSpec: '첫 줄에 높이 `N`과 너비 `M`이 주어집니다 (`1 ≤ N,M ≤ 30`). 다음 `N`줄은 길이 `M`의 `0`과 `1` 문자열입니다.',
    outputSpec: '도달 가능한 칸 수를 출력합니다.',
    examples: [{ stdin: '3 3\n111\n010\n111\n', expected: '7\n', explain: '시작점에서 오른쪽 가장자리를 따라 아래쪽까지 이동할 수 있습니다.' }],
    tests: [
      { stdin: '1 1\n1\n', expected: '1\n' },
      { stdin: '1 1\n0\n', expected: '0\n' },
      { stdin: '3 3\n100\n001\n111\n', expected: '1\n' },
      { stdin: '2 3\n111\n111\n', expected: '6\n' },
      { stdin: '4 4\n1100\n0100\n0111\n0001\n', expected: '7\n' },
    ],
    starter, explain: '방문 배열을 두고 시작 칸부터 너비 우선 탐색합니다. 한 번 방문한 칸만 세므로 중복되지 않습니다.',
    hints: ['시작 칸이 0인지 먼저 확인하세요.', '큐에 넣는 순간 방문 표시를 하면 중복을 막을 수 있습니다.'],
    solution: {
      c: `#include <stdio.h>
int main(void) {
    int n, m, front = 0, back = 0, count = 0;
    char grid[30][31];
    int seen[30][30] = {0}, qr[900], qc[900];
    int dr[4] = {-1, 1, 0, 0}, dc[4] = {0, 0, -1, 1};
    scanf("%d%d", &n, &m);
    for (int r = 0; r < n; r++) scanf("%30s", grid[r]);
    if (grid[0][0] == '1') { seen[0][0] = 1; qr[back] = 0; qc[back++] = 0; }
    while (front < back) {
        int r = qr[front], c = qc[front++];
        count++;
        for (int k = 0; k < 4; k++) {
            int nr = r + dr[k], nc = c + dc[k];
            if (nr >= 0 && nr < n && nc >= 0 && nc < m && !seen[nr][nc] && grid[nr][nc] == '1') {
                seen[nr][nc] = 1; qr[back] = nr; qc[back++] = nc;
            }
        }
    }
    printf("%d\\n", count);
    return 0;
}
`,
      java: `import java.util.*;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt(), m = sc.nextInt(), count = 0;
        char[][] grid = new char[n][];
        for (int r = 0; r < n; r++) grid[r] = sc.next().toCharArray();
        boolean[][] seen = new boolean[n][m];
        ArrayDeque<int[]> queue = new ArrayDeque<>();
        if (grid[0][0] == '1') { seen[0][0] = true; queue.add(new int[]{0, 0}); }
        int[] dr = {-1, 1, 0, 0}, dc = {0, 0, -1, 1};
        while (!queue.isEmpty()) {
            int[] pos = queue.remove();
            count++;
            for (int k = 0; k < 4; k++) {
                int r = pos[0] + dr[k], c = pos[1] + dc[k];
                if (r >= 0 && r < n && c >= 0 && c < m && !seen[r][c] && grid[r][c] == '1') {
                    seen[r][c] = true;
                    queue.add(new int[]{r, c});
                }
            }
        }
        System.out.println(count);
    }
}
`,
      python: `from collections import deque
n, m = map(int, input().split())
grid = [input().strip() for _ in range(n)]
seen = {(0, 0)} if grid[0][0] == '1' else set()
queue = deque(seen)
while queue:
    r, c = queue.popleft()
    for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        nr, nc = r + dr, c + dc
        if 0 <= nr < n and 0 <= nc < m and grid[nr][nc] == '1' and (nr, nc) not in seen:
            seen.add((nr, nc))
            queue.append((nr, nc))
print(len(seen))
`,
    },
  },
  {
    id: 'dc-knapsack', title: '한정된 가방의 최대 가치', level: 5, topics: ['동적 계획법', '배열'],
    langs: ['c', 'java', 'python'], chapter: { c: 'array', java: 'array', python: 'data' }, mode: 'stdio',
    statement: '각 물건을 최대 한 번만 골라 무게 합이 `W` 이하가 되도록 담습니다. 얻을 수 있는 가치의 최댓값을 구하세요.',
    inputSpec: '첫 줄에 물건 수 `N`과 가방 용량 `W`가 주어집니다 (`1 ≤ N ≤ 50`, `1 ≤ W ≤ 1000`). 다음 `N`줄에는 무게(`1~1000`)와 가치(`1~10000`)가 주어집니다.',
    outputSpec: '최대 가치 한 개를 출력합니다. 아무 물건도 담지 못하면 0입니다.',
    examples: [{ stdin: '4 7\n6 13\n4 8\n3 6\n5 12\n', expected: '14\n', explain: '무게 4와 3의 물건을 골라 가치 8+6을 얻습니다.' }],
    tests: [
      { stdin: '1 3\n4 10\n', expected: '0\n' },
      { stdin: '1 3\n3 10\n', expected: '10\n' },
      { stdin: '3 5\n2 3\n2 4\n3 5\n', expected: '9\n' },
      { stdin: '3 10\n5 10\n4 40\n6 30\n', expected: '70\n' },
      { stdin: '2 2\n1 5\n1 6\n', expected: '11\n' },
    ],
    starter, explain: '용량별 최대 가치를 저장하고 각 물건을 읽을 때 용량을 큰 값부터 갱신하면 같은 물건이 두 번 선택되지 않습니다.',
    hints: ['`dp[c]`를 용량 c 이하에서 얻을 수 있는 최대 가치로 두세요.', '각 물건마다 용량을 W부터 해당 무게까지 내림차순으로 순회하세요.'],
    solution: {
      c: `#include <stdio.h>
int main(void) {
    int n, w, dp[1001] = {0};
    scanf("%d%d", &n, &w);
    for (int i = 0; i < n; i++) {
        int weight, value;
        scanf("%d%d", &weight, &value);
        for (int cap = w; cap >= weight; cap--) {
            int candidate = dp[cap - weight] + value;
            if (candidate > dp[cap]) dp[cap] = candidate;
        }
    }
    printf("%d\\n", dp[w]);
    return 0;
}
`,
      java: `import java.util.*;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt(), w = sc.nextInt();
        int[] dp = new int[w + 1];
        for (int i = 0; i < n; i++) {
            int weight = sc.nextInt(), value = sc.nextInt();
            for (int cap = w; cap >= weight; cap--)
                dp[cap] = Math.max(dp[cap], dp[cap - weight] + value);
        }
        System.out.println(dp[w]);
    }
}
`,
      python: `n, capacity = map(int, input().split())
dp = [0] * (capacity + 1)
for _ in range(n):
    weight, value = map(int, input().split())
    for cap in range(capacity, weight - 1, -1):
        dp[cap] = max(dp[cap], dp[cap - weight] + value)
print(dp[capacity])
`,
    },
  },
  {
    id: 'dc-max-subarray', title: '연속 구간의 최대 합', level: 4, topics: ['동적 계획법', '배열'],
    langs: ['c', 'java', 'python'], chapter: { c: 'array', java: 'array', python: 'data' }, mode: 'stdio',
    statement: '정수 배열에서 비어 있지 않은 연속 구간 하나를 선택합니다. 그 구간의 합을 최대화하세요.',
    inputSpec: '첫 줄에 `N` (`1 ≤ N ≤ 100000`), 둘째 줄에 정수 `N`개 (`-10000~10000`)가 주어집니다.',
    outputSpec: '가능한 최대 합을 출력합니다.',
    examples: [{ stdin: '6\n-2 1 -3 4 -1 2\n', expected: '5\n', explain: '4, -1, 2를 고르면 합이 5입니다.' }],
    tests: [
      { stdin: '1\n-7\n', expected: '-7\n' },
      { stdin: '4\n-5 -2 -8 -3\n', expected: '-2\n' },
      { stdin: '5\n1 2 3 4 5\n', expected: '15\n' },
      { stdin: '5\n-3 4 -1 2 -5\n', expected: '5\n' },
      { stdin: '4\n0 0 0 0\n', expected: '0\n' },
    ],
    starter, explain: '각 위치에서 끝나는 최대 구간 합은 이전 구간에 이어 붙이는 경우와 현재 수에서 새로 시작하는 경우 중 큰 값입니다.',
    hints: ['첫 번째 수로 현재 합과 전체 답을 초기화하세요.', '`현재 합 = max(현재 수, 이전 합 + 현재 수)`를 반복하세요.'],
    solution: {
      c: `#include <stdio.h>
int main(void) {
    int n, value;
    long long current, best;
    scanf("%d%d", &n, &value);
    current = best = value;
    for (int i = 1; i < n; i++) {
        scanf("%d", &value);
        current = current + value > value ? current + value : value;
        if (current > best) best = current;
    }
    printf("%lld\\n", best);
    return 0;
}
`,
      java: `import java.util.*;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        long current = sc.nextLong(), best = current;
        for (int i = 1; i < n; i++) {
            long value = sc.nextLong();
            current = Math.max(value, current + value);
            best = Math.max(best, current);
        }
        System.out.println(best);
    }
}
`,
      python: `import sys
values = list(map(int, sys.stdin.buffer.read().split()))
current = best = values[1]
for value in values[2:]:
    current = max(value, current + value)
    best = max(best, current)
print(best)
`,
    },
  },
  {
    id: 'dc-zero-sum-subarray', title: '합이 0인 연속 구간', level: 4, topics: ['누적 합', '해시'],
    langs: ['c', 'java', 'python'], chapter: { c: 'array', java: 'array', python: 'data' }, mode: 'stdio',
    statement: '배열에 합이 0인 비어 있지 않은 연속 구간이 하나라도 있는지 판별하세요.',
    inputSpec: '첫 줄에 `N` (`1 ≤ N ≤ 10000`), 둘째 줄에 정수 `N`개 (`-1000~1000`)가 주어집니다.',
    outputSpec: '있으면 `YES`, 없으면 `NO`를 출력합니다.',
    examples: [{ stdin: '5\n4 2 -3 1 6\n', expected: 'YES\n', explain: '2 + (-3) + 1 = 0입니다.' }],
    tests: [
      { stdin: '1\n0\n', expected: 'YES\n' },
      { stdin: '1\n5\n', expected: 'NO\n' },
      { stdin: '4\n1 2 3 -6\n', expected: 'YES\n' },
      { stdin: '4\n1 2 3 4\n', expected: 'NO\n' },
      { stdin: '4\n9 -3 2 2\n', expected: 'NO\n' },
    ],
    starter, explain: '누적 합이 0이 되거나 이미 본 누적 합과 다시 같아지면 그 사이 구간의 합은 0입니다.',
    hints: ['누적 합을 각 위치까지 계산하세요.', '맨 앞부터 시작하는 구간을 위해 초기 누적 합 0도 기록하세요.'],
    solution: {
      c: `#include <stdio.h>
#include <stdlib.h>
static int compare(const void *a, const void *b) {
    long long x = *(const long long *)a, y = *(const long long *)b;
    return (x > y) - (x < y);
}
int main(void) {
    int n, value;
    long long prefix[10001] = {0};
    scanf("%d", &n);
    for (int i = 1; i <= n; i++) {
        scanf("%d", &value);
        prefix[i] = prefix[i - 1] + value;
    }
    qsort(prefix, n + 1, sizeof(long long), compare);
    for (int i = 1; i <= n; i++) {
        if (prefix[i] == prefix[i - 1]) { puts("YES"); return 0; }
    }
    puts("NO");
    return 0;
}
`,
      java: `import java.util.*;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        long prefix = 0;
        Set<Long> seen = new HashSet<>();
        seen.add(0L);
        for (int i = 0; i < n; i++) {
            prefix += sc.nextLong();
            if (!seen.add(prefix)) { System.out.println("YES"); return; }
        }
        System.out.println("NO");
    }
}
`,
      python: `import sys
values = list(map(int, sys.stdin.buffer.read().split()))
seen = {0}
prefix = 0
for value in values[1:]:
    prefix += value
    if prefix in seen:
        print('YES')
        break
    seen.add(prefix)
else:
    print('NO')
`,
    },
  },
  {
    id: 'dc-graph-components', title: '연결된 모임 수', level: 4, topics: ['그래프', '너비 우선 탐색'],
    langs: ['c', 'java', 'python'], chapter: { c: 'project', java: 'project', python: 'project' }, mode: 'stdio',
    statement: '회원 `V`명이 있고 양방향으로 서로 만난 관계가 `E`개 있습니다. 관계를 거쳐 이어지는 사람들을 한 모임으로 볼 때 전체 모임 수를 구하세요. 혼자 있는 사람도 한 모임입니다.',
    inputSpec: '첫 줄에 `V E` (`1 ≤ V ≤ 100`, `0 ≤ E ≤ 2000`), 다음 `E`줄에 1부터 V까지의 서로 다른 회원 번호 두 개가 주어집니다.',
    outputSpec: '연결된 모임 수를 출력합니다.',
    examples: [{ stdin: '5 3\n1 2\n3 4\n4 5\n', expected: '2\n', explain: '1·2와 3·4·5가 각각 연결됩니다.' }],
    tests: [
      { stdin: '1 0\n', expected: '1\n' },
      { stdin: '4 0\n', expected: '4\n' },
      { stdin: '4 3\n1 2\n2 3\n3 4\n', expected: '1\n' },
      { stdin: '5 3\n1 2\n2 3\n1 3\n', expected: '3\n' },
      { stdin: '6 3\n1 2\n3 4\n5 6\n', expected: '3\n' },
    ],
    starter, explain: '아직 방문하지 않은 번호를 발견할 때마다 모임 수를 늘리고, 그 번호부터 탐색하여 이어진 모든 번호를 방문 처리합니다.',
    hints: ['1번부터 V번까지 순서대로 방문 여부를 확인하세요.', '새 탐색을 시작한 횟수가 답입니다.'],
    solution: {
      c: `#include <stdio.h>
int main(void) {
    int v, e, graph[101][101] = {{0}}, seen[101] = {0};
    int queue[101], groups = 0;
    scanf("%d%d", &v, &e);
    for (int i = 0; i < e; i++) {
        int a, b;
        scanf("%d%d", &a, &b);
        graph[a][b] = graph[b][a] = 1;
    }
    for (int start = 1; start <= v; start++) {
        if (seen[start]) continue;
        groups++;
        int front = 0, back = 0;
        queue[back++] = start;
        seen[start] = 1;
        while (front < back) {
            int at = queue[front++];
            for (int next = 1; next <= v; next++) {
                if (graph[at][next] && !seen[next]) {
                    seen[next] = 1;
                    queue[back++] = next;
                }
            }
        }
    }
    printf("%d\\n", groups);
    return 0;
}
`,
      java: `import java.util.*;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int v = sc.nextInt(), e = sc.nextInt(), groups = 0;
        boolean[][] graph = new boolean[v + 1][v + 1];
        boolean[] seen = new boolean[v + 1];
        for (int i = 0; i < e; i++) {
            int a = sc.nextInt(), b = sc.nextInt();
            graph[a][b] = graph[b][a] = true;
        }
        for (int start = 1; start <= v; start++) {
            if (seen[start]) continue;
            groups++;
            ArrayDeque<Integer> queue = new ArrayDeque<>();
            queue.add(start);
            seen[start] = true;
            while (!queue.isEmpty()) {
                int at = queue.remove();
                for (int next = 1; next <= v; next++) {
                    if (graph[at][next] && !seen[next]) {
                        seen[next] = true;
                        queue.add(next);
                    }
                }
            }
        }
        System.out.println(groups);
    }
}
`,
      python: `from collections import deque
import sys
data = list(map(int, sys.stdin.buffer.read().split()))
v, e = data[:2]
graph = [[] for _ in range(v + 1)]
for k in range(e):
    a, b = data[2 + 2 * k:4 + 2 * k]
    graph[a].append(b)
    graph[b].append(a)
seen = set()
groups = 0
for start in range(1, v + 1):
    if start in seen:
        continue
    groups += 1
    seen.add(start)
    queue = deque([start])
    while queue:
        at = queue.popleft()
        for neighbor in graph[at]:
            if neighbor not in seen:
                seen.add(neighbor)
                queue.append(neighbor)
print(groups)
`,
    },
  },
  {
    id: 'dc-shortest-path', title: '최소 이동 비용', level: 5, topics: ['그래프', '최단 경로'],
    langs: ['c', 'java', 'python'], chapter: { c: 'project', java: 'project', python: 'project' }, mode: 'stdio',
    statement: '방향이 있는 이동 경로마다 양의 비용이 있습니다. 1번 지점에서 V번 지점까지 가는 최소 비용을 구하세요. 갈 수 없으면 -1을 출력합니다.',
    inputSpec: '첫 줄에 `V E` (`1 ≤ V ≤ 100`, `0 ≤ E ≤ 2000`), 다음 `E`줄에 출발 번호, 도착 번호, 비용(`1~10000`)이 주어집니다. 같은 출발·도착에 경로가 여러 개 있을 수 있습니다.',
    outputSpec: '최소 비용 또는 -1을 출력합니다.',
    examples: [{ stdin: '4 4\n1 2 4\n2 3 2\n3 4 1\n1 4 10\n', expected: '7\n', explain: '1→2→3→4의 비용은 7입니다.' }],
    tests: [
      { stdin: '1 0\n', expected: '0\n' },
      { stdin: '3 1\n1 2 5\n', expected: '-1\n' },
      { stdin: '3 3\n1 3 9\n1 2 2\n2 3 2\n', expected: '4\n' },
      { stdin: '2 2\n1 2 8\n1 2 3\n', expected: '3\n' },
      { stdin: '4 4\n1 2 1\n2 4 10\n1 3 3\n3 4 2\n', expected: '5\n' },
    ],
    starter, explain: '아직 확정하지 않은 지점 중 시작점에서의 거리가 가장 짧은 곳을 차례로 선택해 경로를 갱신합니다. 양의 비용이므로 다익스트라 알고리즘이 적용됩니다.',
    hints: ['초기 거리는 1번만 0, 나머지는 무한대로 놓으세요.', '같은 두 지점 사이에 경로가 여러 개면 비용이 가장 낮은 것을 보관하세요.'],
    solution: {
      c: `#include <stdio.h>
#define INF 1000000000
int main(void) {
    int v, e, weight[101][101], dist[101], done[101] = {0};
    scanf("%d%d", &v, &e);
    for (int a = 1; a <= v; a++) {
        dist[a] = INF;
        for (int b = 1; b <= v; b++) weight[a][b] = INF;
    }
    dist[1] = 0;
    for (int i = 0; i < e; i++) {
        int a, b, cost;
        scanf("%d%d%d", &a, &b, &cost);
        if (cost < weight[a][b]) weight[a][b] = cost;
    }
    for (int i = 1; i <= v; i++) {
        int at = 0;
        for (int x = 1; x <= v; x++)
            if (!done[x] && (at == 0 || dist[x] < dist[at])) at = x;
        if (at == 0 || dist[at] == INF) break;
        done[at] = 1;
        for (int next = 1; next <= v; next++)
            if (weight[at][next] != INF && dist[at] + weight[at][next] < dist[next])
                dist[next] = dist[at] + weight[at][next];
    }
    printf("%d\\n", dist[v] == INF ? -1 : dist[v]);
    return 0;
}
`,
      java: `import java.util.*;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int v = sc.nextInt(), e = sc.nextInt();
        final int inf = 1000000000;
        int[][] weight = new int[v + 1][v + 1];
        int[] dist = new int[v + 1];
        boolean[] done = new boolean[v + 1];
        Arrays.fill(dist, inf);
        for (int i = 1; i <= v; i++) Arrays.fill(weight[i], inf);
        dist[1] = 0;
        for (int i = 0; i < e; i++) {
            int a = sc.nextInt(), b = sc.nextInt(), cost = sc.nextInt();
            weight[a][b] = Math.min(weight[a][b], cost);
        }
        for (int i = 1; i <= v; i++) {
            int at = -1;
            for (int x = 1; x <= v; x++)
                if (!done[x] && (at == -1 || dist[x] < dist[at])) at = x;
            if (at == -1 || dist[at] == inf) break;
            done[at] = true;
            for (int next = 1; next <= v; next++)
                if (weight[at][next] != inf)
                    dist[next] = Math.min(dist[next], dist[at] + weight[at][next]);
        }
        System.out.println(dist[v] == inf ? -1 : dist[v]);
    }
}
`,
      python: `import heapq
import sys
data = list(map(int, sys.stdin.buffer.read().split()))
v, e = data[:2]
graph = [[] for _ in range(v + 1)]
for k in range(e):
    a, b, cost = data[2 + 3 * k:5 + 3 * k]
    graph[a].append((b, cost))
inf = 10**18
dist = [inf] * (v + 1)
dist[1] = 0
heap = [(0, 1)]
while heap:
    cost, at = heapq.heappop(heap)
    if cost != dist[at]:
        continue
    for next, edge_cost in graph[at]:
        candidate = cost + edge_cost
        if candidate < dist[next]:
            dist[next] = candidate
            heapq.heappush(heap, (candidate, next))
print(-1 if dist[v] == inf else dist[v])
`,
    },
  },
]

export default problems
