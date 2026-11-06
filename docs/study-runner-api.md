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
  "stdout": "…", "stderr": "…",    // UTF-8, each capped at 64 KB, absolute paths stripped
  "exitCode": 0,                   // null when killed
  "signal": null,                  // e.g. "SIGKILL"
  "timedOut": false,               // wall or CPU limit hit
  "truncated": false,              // output cap hit
  "timeMs": 37,
  "diagnostics": [ { "line": 3, "column": 5, "severity": "error", "message": "…", "hintKo": "…" } ]
}
```
Errors: 400 `{ "error": "rejected", "messageKo": "…" }` (bad JSON, unknown lang, size), 401 (not logged in, from nginx), 429 `{ "error": "busy" | "rate-limited", "messageKo": "…" }`.

## Languages
- `c`: gcc, `-std=c17 -O1 -Wall -Wextra -lm`, file `main.c`.
- `java`: JDK 21, file `Main.java` (public class must be `Main`; if the source declares another public class with `main`, rename the file to match — runner detects `public class (\w+)`).
- `python`: CPython 3.12, file `main.py`, `-I -u`.

## Limits (per run)
Wall 10 s (compile 15 s), CPU 3 s (Java 6 s), memory via container/cgroup (Java `-Xmx192m -Xss8m`), output 64 KB per stream, processes ≤ 32, files ≤ 8 MB, no network, fresh temp dir, killed process group, all processes of the runner uid killed after each job, one job at a time per container (queue ≤ 8, then 429 busy).
