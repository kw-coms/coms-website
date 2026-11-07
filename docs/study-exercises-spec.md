# Study exercises ("실습 문제") — spec

Goal: on the study pages members **write programs themselves** and get them graded, not only edit the examples.
Every study (C, Java, Python, Web) gets a problem set; Arduino links to the Circuit Lab missions.

## 1. Pages and placement
- `/study/:id/practice` — problem list for that study: filter by chapter/topic/level, solved ✓ / tried ◐ / new, progress bar, "다음 문제" suggestion (first unsolved at the lowest level of the furthest chapter reached).
- `/study/:id/practice/:problemId` — problem page: statement + examples on the left (top on mobile), editor + results on the right.
- Inline on the study page: at the end of each chapter section whose id appears in a problem's `chapter[lang]`, a "이 장의 실습 문제" card lists those problems (title, level dots, solved state) linking to the problem page. Injected by code, the content HTML is not edited.
- Study page header gets a "실습 문제 N개" button; the study hub cards show "문제 N개 · 해결 M개".
- Arduino study: the practice page lists the Circuit Lab missions (from `lab/src/missions`, by id/title/level) and links to the Lab's mission URL (use the Lab's actual mission URL scheme).

## 2. Problem data (`src/pages/study/exercises/types.ts`)
```ts
export type ExLang = 'c' | 'java' | 'python'
export type Level = 1 | 2 | 3 | 4 | 5 // 1 입문 · 2 기초 · 3 응용 · 4 심화 · 5 도전

export interface ExCase { stdin: string; expected: string; explain?: string }

export interface Exercise {
  id: string                 // kebab-case, unique across ALL problems (web too)
  title: string              // Korean
  level: Level
  topics: string[]           // Korean tags: '입출력','조건문','반복문','배열','문자열','함수','포인터','구조체','클래스','상속','예외','재귀','정렬','탐색','딕셔너리','수학','시뮬레이션'
  langs: ExLang[]            // languages it is offered in; starter+solution required for each
  chapter: Partial<Record<ExLang, string>> // section id on that study page it belongs after (see §6)
  statement: string          // mini-markdown (§5)
  inputSpec?: string         // "입력" box, mini-markdown
  outputSpec?: string        // "출력" box
  examples: ExCase[]         // shown on the page AND graded (≥ 1)
  tests: ExCase[]            // additional graded cases (≥ 3), input/expected revealed after a failed submit
  mode: 'stdio' | 'function' // function: the student writes only a function/class; the harness supplies main
  harness?: Partial<Record<ExLang, string>> // function mode: full program containing the line `/*@USER@*/` (C/Java) or `#@USER@` (Python) replaced by the student's code
  starter: Partial<Record<ExLang, string>>  // what the editor starts with (function signature, or a near-empty main for stdio)
  solution: Partial<Record<ExLang, string>> // reference; shown only after solving or after "답 보기"
  explain: string            // solution explanation (mini-markdown), shown with the solution
  hints: string[]            // 1–3, revealed one at a time
  compare?: 'tokens' | 'lines' | { float: number } // default 'tokens' (whitespace-insensitive), float: abs/rel tolerance per numeric token
}

export interface WebExercise {
  id: string; title: string; level: Level; topics: string[]
  chapter: string            // web study section id
  statement: string
  starter: { html: string; css: string; js: string }
  solution: { html: string; css: string; js: string }
  explain: string; hints: string[]
  checks: { name: string; code: string }[] // §4
}
```
Data files: `src/pages/study/exercises/problems/{core,c,java,python,web}.ts`, each `export default` an array; `problems/index.ts` merges and exposes `exercisesFor(study)`. `core.ts` = problems offered in all three languages; `c.ts`/`java.ts`/`python.ts` = language-specific ones (pointers, structs, classes, dict…).

## 3. Grading (C/Java/Python)
- Program = `mode === 'function' ? harness[lang].replace(marker, studentCode) : studentCode`.
- One request runs every case: `POST /study/api/run` with `{ lang, code, tests: string[] }` (runner §7). Cases = examples + tests (≤ 10 per problem).
- Per case verdict, in this order: 컴파일 에러 (whole submission) · 시간 초과 (`timedOut`) · 출력 초과 (`truncated`; the runner may also report SIGKILL) · 런타임 에러 (non-zero exit or signal; show stderr) · 오답 (compare fails; show input, expected, actual and a line diff using `playground/compare.ts`) · 정답.
- Output comparison uses the shared `exercises/compare.ts`: `tokens` (default) splits on whitespace and compares literal tokens; `lines` normalizes CRLF/bare CR to LF, removes one final newline, and preserves all spaces (including leading/trailing spaces) and remaining blank lines. Float mode tokenizes like `tokens`, accepts decimal/exponent numeric tokens only (not hex), and requires finite values with `abs(actual - expected) <= tolerance * max(1, abs(expected))`. Signed zero compares numerically; nonnumeric tokens (including literal `NaN`/`Infinity`) compare exactly. Decimal overflow never passes numeric comparison.
- Function-mode line numbers in diagnostics are mapped back to the student's code (subtract the harness lines before the marker); diagnostics inside the harness are shown as "채점 코드" errors.
- "실행" runs the program once with a custom stdin box (default: first example) via the normal single-run API; "제출" grades all cases. Ctrl/⌘+Enter = 실행, Ctrl/⌘+Shift+Enter = 제출.
- Not logged in: the editor works, 실행/제출 show the playground's login prompt (returns to the same problem).
- 429/busy/503: reuse the playground's countdown/messages.

## 4. Web problems
Run in the existing `/study-sandbox.html` iframe (same sandbox as the playground's HTML/JS blocks). After the page loads, the grader injects the checks; each check's `code` is an async function body receiving `t` and must `return true` or throw/return a Korean message. `t` API: `t.$(sel)`, `t.$$(sel)`, `t.text(sel)`, `t.style(sel, prop)` (computed), `t.click(sel)`, `t.type(sel, text)` (sets value + input event), `t.wait(ms)` (≤ 500), `t.log` (captured console.log lines). Each check times out after 2 s; the whole run after 8 s. Results come back by `postMessage` with the same origin/nonce rules the playground already uses. Live preview pane + three editors (HTML/CSS/JS tabs).

## 5. Mini-markdown
Paragraphs, `**bold**`, `` `code` ``, fenced ``` blocks, `- ` lists, `1. ` lists, line breaks. Rendered to DOM nodes with textContent (never innerHTML from data).

## 6. Chapter ids
- c: start anatomy types branch loop array func pointer struct project
- java: start anatomy vars input flow array method class inherit exception project
- python: start values cond loop data str func module error class project
- web: start html css js project

## 7. Runner multi-case API (`runner/**`)
Request: `{ lang, code, tests: string[] }` — `tests` replaces `stdin` (both present → 400). 1–10 entries, each ≤ 16 KB, total ≤ 32 KB.
Compile once; run each case in order with the same per-run sandbox, killing every job-uid process and clearing SysV IPC between cases (job dir files may persist between cases). Shared run budget: total wall 10 s across cases, each case wall ≤ min(remaining, 4 s), CPU per case 2 s (Java 4 s). When the budget is gone the remaining cases are `{ skipped: true }`.
Response 200: `{ ok, stage, stderr (compile), diagnostics, timeMs, results: [{ stdout, stderr, exitCode, signal, timedOut, truncated, timeMs, skipped? }] }`, per-case stdout/stderr capped at 8 KB each (response ≤ 200 KB). A multi-case request counts as one run for the per-member limit. Single-`stdin` requests are unchanged.

## 8. Progress
`localStorage['coms-study-exercises:v1']` = `{ [problemId]: { solved: boolean, tries: number, lastAt: number, code: { [lang]: string }, solvedLangs: ExLang[], viewed?: boolean } }`, all reads/writes try/catch. Code autosaves (debounced) per problem per language. "초기화" restores the starter (with confirm). "답 보기" asks once ("스스로 풀어 보는 게 실력이 늘어요. 그래도 볼까요?") and then marks the problem as viewed (shown as 👀 in the list, not solved).

## 9. Quality bar
- Statements read like a good Korean textbook exercise: a short story/context, exact input/output format, constraints, 1–3 examples with explanations.
- Levels ramp gently: each chapter has at least 2 problems, starting at level 1; inline chapter cards show at most 4 (unsolved first, then by level) and link to the full list filtered by chapter; core set spans 입출력 → 조건 → 반복 → 배열/문자열 → 함수 → 재귀/정렬/탐색 → 작은 시뮬레이션.
- Every reference solution passes every case in every language it lists; every starter fails at least one case (CI enforces both, §10).
- Function-mode starters compile as-is (they return a placeholder value) so a beginner never starts from a compile error.

## 10. Tests
- `tests/studyExercises.test.mjs` (node --test, no network): schema, unique ids, chapter ids exist in the study HTML, ≤ 10 cases, harness markers present, mini-markdown renders.
- `scripts/verify-exercises.mjs`: runs every reference solution (and every starter, expecting a failure) through the real runner (multi-case API) — wired into the CI "Study code runner" job.
- Frontend unit tests for grading verdicts, line mapping, compare modes; a Playwright e2e (mocked runner) for list → problem → submit → solved ✓ → list shows ✓.
