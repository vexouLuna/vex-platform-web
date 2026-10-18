---
'@vex/platform-web': minor
---

Retry later, from any step, with new pause steps; one way to show who did something.

- `JobDetail` retries any finished run, a succeeded one too: from a step, now or in 15 min / 1 hour / 6 hours / 1 day
  or at a set time, with the steps the retry pauses before. `client.retry(id, step, { at, pause_before })` and
  `useJobActions().retry` take the same. A retry later or a succeeded run's needs vex-platform 0.7+. A batch retry still
  skips succeeded runs.
- New `ActorRef`: a user as `@login` (id on hover, copied on click), a job as a link to `job #id`, a key or the app by
  name. `JobDetail` and `AuditTable` use it. `actorLabel` gives an @ to users only: a job or the app with a login
  (a kind name) was shown as `@archive`. New `auditActor` turns a job's `Actor` into the audit row's shape.
