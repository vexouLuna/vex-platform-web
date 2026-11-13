---
'@vex/platform-web': patch
---

A 403 no longer ends the admin session (only a 401 calls `onUnauthorized`; `ProblemError.unauthorized` is 401 only). `useCursorPages` reads the rows a new arrival pushed off page 1 after older pages were loaded. `JobDetail` keeps a slow poll after a run finishes, so a retry made elsewhere shows. `StartJob` resets the kind, payload and pause after a successful start.
