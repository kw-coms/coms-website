# Study code runner — API contract

Lets club members edit and run the code examples on the study pages (C, Java, Python) and see the output.
HTML/CSS/JS run client-side in the existing `/study-sandbox.html` iframe; Arduino opens the Circuit Lab.

## Endpoint
`POST /study/api/run` (same origin, behind the frontend nginx; members only via nginx `auth_request` → backend `/api/auth/me`).

Request (JSON, ≤ 112 KiB body after escaping):
```json
{ "lang": "c" | "cpp" | "java" | "python" | "javascript", "code": "<source ≤ 64 KB>", "stdin": "<optional ≤ 16 KB>" }
```
For grading, replace `stdin` with `"tests": ["<case 1 stdin>", "<case 2 stdin>"]`.
`tests` must contain 1–10 strings, each at most 16 KiB UTF-8 and at most 32 KiB UTF-8 in total.
Sending both `stdin` and `tests` (even if one is empty), or an invalid case list, returns 400 `rejected` with a Korean `messageKo`.
The entire multi-case request counts as one member run and occupies one queue slot.

Response 200 (the program ran or failed to compile — both are normal outcomes):
```json
{
  "ok": true,                      // false only when compilation failed
  "stage": "compile" | "run",      // where it stopped
  "stdout": "…", "stderr": "…",    // UTF-8, each capped at 64 KB; stderr/diagnostics have system paths stripped, stdout only the job dir
  "exitCode": 0,                   // null when killed
  "signal": null,                  // e.g. "SIGKILL"
  "timedOut": false,               // wall or CPU limit hit
  "truncated": false,              // output cap hit
  "timeMs": 37,
  "diagnostics": [ { "line": 3, "column": 5, "severity": "error", "message": "…", "hintKo": "…" } ]
}
```

With `tests`, the runner compiles C, C++, or Java once and runs cases in request order. The response is:
```json
{
  "ok": true,
  "stage": "run",
  "stderr": "",
  "diagnostics": [],
  "timeMs": 10042,
  "results": [
    { "stdout": "…", "stderr": "…", "exitCode": 0, "signal": null,
      "timedOut": false, "truncated": false, "timeMs": 12 },
    { "skipped": true }
  ]
}
```
`stderr` at the top level contains compile diagnostics, capped at 8 KiB in multi-case mode; the serialized diagnostics array is also bounded to 8 KiB. On compile failure, `ok` is `false`, `stage` is `"compile"`, and `results` is absent. A runtime error or timeout belongs to its individual case; `ok` remains `true` when compilation succeeded. A `{ "skipped": true }` entry means the shared 10 s run wall budget was exhausted before that case could start; it has no output or exit fields. Each executed case's stdout and stderr are capped at 8 KiB UTF-8 and marked `truncated` when the cap is hit; output containing many JSON-escaped characters may truncate sooner to bound the serialized response. Top-level `timeMs` includes compilation and all started cases; each result's `timeMs` measures that case only. As in single-run responses, stdout strips only the private job directory and stderr strips system paths. Single-`stdin` requests retain the response shape shown above.

### Numbered problems and progress

Submit a numbered problem with `lang`, `code`, and an integer `problemNumber`. Omit `stdin` and `tests`. The runner selects the stored cases and assembles any function harness. A response contains `judge` with `passed`, `total`, `solved`, `verdicts`, `diagnostics`, `compileError`, `stderr`, and `timeMs`. Cases return verdicts without input or expected output. The runner records a first solve only when every case passes.

Authenticated `GET /study/api/progress` returns `solved` (problem numbers), `solvedToday`, and `streak` for the authenticated member. Dates use Korean standard time. First solves are stored in the existing runner state volume. A numbered submission also returns the member's latest `progress`. The achievement-sharing control shares a summary and problem link.

### Club problem features

Authenticated `POST /study/api/club` accepts an `action` for private `battle-*` rooms, `sets-*` problem collections, and `vote-*` difficulty votes. nginx supplies the member identity. The runner stores room, collection, and vote state in its existing private state volume. Only the collection owner can edit sharing, and only members with a verified solve can vote on that problem.

Attach a `battleCode` to a numbered submission to enter it in a live room. The runner checks the participant, problem number, and server receipt time before queuing. An accepted result records that receipt time for the room. A result from a submission received within the match can arrive during the settling window. Battle drafts stay separate from practice drafts.

The same authenticated club endpoint serves `tournament-*` actions. nginx forwards the verified role and encoded display name from the backend session check. Only the president can save, publish, or cancel a tournament. Send both `tournamentId` and `matchId` with a numbered submission for an assigned live match. A round allows 60 seconds for work already queued at the deadline, then advances winners by accepted receipt time or by the best case count and its receipt time. Tournament drafts use a separate editor key per match.

New tournament configurations can specify 1–12 weighted problems and a duration for each round, a separate registration cutoff, and full-answer or partial scoring. Final scores sum the best result for each problem. The earlier time to reach a tied positive score breaks the tie. Existing tournament records retain their original result calculation.

The authenticated `problem-*` club actions manage drafts, review and the published catalog. `problem-catalog` returns the numbered problem statement and examples. To verify a saved draft, send `{ "action": "problem-verify", "authoringId": "…" }` to `/study/api/run`. The runner executes the stored reference against the stored examples and private cases, using its regular queue. Publication assigns a durable COM’s number once the current draft passes and the president publishes it. Case inputs and expected outputs stay in the private state volume.

`scripts/gen-numbered-judge.mjs` regenerates the runner bank after edits to COM’s study problems. To refresh the archive, pass the trusted DailyCoding catalog module from [`2b4fe3c9`](https://github.com/choijunhuk/dailycoding-final/blob/2b4fe3c9e93f3b7a05a5a9da6c80c2603f37c323/dailycoding-server/src/shared/problemCatalog.js). The browser archive contains statements and public examples. The runner image carries the separate case bank. Repository readers can inspect the source cases, so the practice results are not an anti-cheat guarantee for contests.

### Errors
All error bodies are JSON with a Korean `messageKo`; `Content-Type: application/json`.

| Status | Body | When | `Retry-After` |
| --- | --- | --- | --- |
| 400 | `{ "error": "rejected", "messageKo" }` | bad JSON, wrong content type, unknown `lang`, size limits, or invalid `tests` | – |
| 401 | `{ "error": "unauthorized", "messageKo" }` | `X-Runner-Client` missing/malformed (nginx must set it from `auth_request`; also returned by nginx itself when not logged in) | – |
| 403 | `{ "error": "rejected", "messageKo" }` | refused by nginx before the runner: the browser labels the request cross-site (`Sec-Fetch-Site: cross-site`). Applies to `POST /study/api/run` (`/study/api/health` is internal and never behind that nginx check); the frontend shows `messageKo` instead of asking to sign in | – |
| 404 | `{ "error": "rejected", "messageKo" }` | unknown path or numbered problem | – |
| 405 | `{ "error": "rejected", "messageKo" }` | non-POST on `/study/api/run` (`Allow: POST`) | – |
| 429 | `{ "error": "rate-limited", "messageKo" }` | more than the per-member limit (default **10 runs/min per member**) | 60 |
| 429 | `{ "error": "rate-limited", "messageKo" }` | member deny-listed for 15 min after making the runner crash or fail cleanup | remaining seconds (≤ 900) |
| 429 | `{ "error": "busy", "messageKo" }` | queue full (8 waiting), the member already has a request in flight (1 per member), or the job could not start within 25 s of queueing | 20 |
| 500 | `{ "error": "rejected", "messageKo" }` | unexpected server error | – |
| 503 | `{ "error": "unavailable", "messageKo" }` | sandbox cleanup failed; the runner exits and the container restarts | 30 |

A request always ends within ~55 s (≤ 25 s queue wait + compile ≤ 15 s + run ≤ 10 s + cleanup), so the frontend nginx `proxy_read_timeout` should be ~58 s.

## `GET /study/api/health` (internal only)
Used by the container healthcheck over the unix socket; do **not** expose it through the public nginx. `200 {"ok":true}` when healthy, `503 {"ok":false}` once cleanup has failed.

## Languages
- `c`: gcc, `-std=c17 -O1 -Wall -Wextra -lm`, file `main.c`. Strict C17: POSIX functions such as `fork` need `#define _POSIX_C_SOURCE 200809L`.
- `cpp` uses g++ with C++17 and `main.cpp`.
- `java`: JDK 21. The runner picks the file/class name itself: the first `public [final|abstract] class X` whose body contains `static void main(` (comments and string literals ignored); if there is none, `Main`. Non-public classes may coexist.
- `python`: CPython 3.12, file `main.py`, `-I -u`.
- `javascript` uses Node.js 22 with CommonJS input in `main.cjs`. Programs can read standard input from file descriptor 0.

## Limits (per run)
Wall 10 s (compile 15 s), CPU 3 s (Java 6 s; compile 10 s CPU), memory via container/cgroup (Java `-Xmx192m -Xss1m -XX:MaxMetaspaceSize=96m`, javac `-Xmx256m`), output 64 KB per stream, processes+threads ≤ 32 (C/Python) or ≤ 128 (Java) for the dedicated job uid 10100, open files ≤ 64 (Java 256), files ≤ 8 MB, no network, private 0700 job dir on a tmpfs wiped after every job, killed process group, every uid-10100 process killed after each job, one job at a time per container (queue ≤ 8, then 429 busy). If sandbox cleanup ever fails the runner answers `503 {"error":"unavailable"}` (Retry-After 30) and restarts itself.

For multi-case grading, the 10 s run wall budget is shared across cases and includes cleanup between cases; compilation occurs before that budget starts. Each case gets at most the lesser of 4 s and the remaining budget. The per-case CPU limit is 2 s (Java 4 s). Every job-uid process is killed and System V IPC is removed between cases; the private job directory can persist until the request finishes. A cleanup failure poisons the runner and follows the same 503/restart path as a single run.

## Saved drafts (frontend)
The study playground keeps each block's draft in its own `localStorage` record, `coms-study-playground:<pageId>:<blockKey>` = `{ code, backup?, at }`, written only by `saveBlock` (`src/pages/study/playground/storage.ts`), which is fully synchronous so exit flushes never miss a queued save. Limit, accepted: `localStorage` has no cross-process atomicity, so another tab's write can land between `saveBlock`'s read and write (microseconds); a draft changed by another tab since this tab last looked is kept as the one-step backup instead of being overwritten unseen.
Records are never deleted automatically: growth is bounded by lesson revisions × blocks (slow), and when the quota fills, saves fail with the existing notice. Accepted limit, because automatic pruning can delete live drafts.
