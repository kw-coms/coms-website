# Study code runner — API contract

Lets club members edit and run the code examples on the study pages (C, Java, Python) and see the output.
HTML/CSS/JS run client-side in the existing `/study-sandbox.html` iframe; Arduino opens the Circuit Lab.

## Endpoint
`POST /study/api/run` (same origin, behind the frontend nginx; members only via nginx `auth_request` → backend `/api/auth/me`).

Request (JSON, ≤ 96 KB body):
```json
{ "lang": "c" | "java" | "python", "code": "<source ≤ 64 KB>", "stdin": "<optional ≤ 16 KB>" }
```

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
### Errors
All error bodies are JSON with a Korean `messageKo`; `Content-Type: application/json`.

| Status | Body | When | `Retry-After` |
| --- | --- | --- | --- |
| 400 | `{ "error": "rejected", "messageKo" }` | bad JSON, wrong content type, unknown `lang`, size limits | – |
| 401 | `{ "error": "unauthorized", "messageKo" }` | `X-Runner-Client` missing/malformed (nginx must set it from `auth_request`; also returned by nginx itself when not logged in) | – |
| 404 | `{ "error": "rejected", "messageKo" }` | any path other than `/study/api/run` and `/study/api/health` | – |
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
- `java`: JDK 21. The runner picks the file/class name itself: the first `public [final|abstract] class X` whose body contains `static void main(` (comments and string literals ignored); if there is none, `Main`. Non-public classes may coexist.
- `python`: CPython 3.12, file `main.py`, `-I -u`.

## Limits (per run)
Wall 10 s (compile 15 s), CPU 3 s (Java 6 s; compile 10 s CPU), memory via container/cgroup (Java `-Xmx192m -Xss1m -XX:MaxMetaspaceSize=96m`, javac `-Xmx256m`), output 64 KB per stream, processes+threads ≤ 32 (C/Python) or ≤ 128 (Java) for the dedicated job uid 10100, open files ≤ 64 (Java 256), files ≤ 8 MB, no network, private 0700 job dir on a tmpfs wiped after every job, killed process group, every uid-10100 process killed after each job, one job at a time per container (queue ≤ 8, then 429 busy). If sandbox cleanup ever fails the runner answers `503 {"error":"unavailable"}` (Retry-After 30) and restarts itself.
