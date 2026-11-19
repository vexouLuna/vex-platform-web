---
'@vex/platform-web': minor
---

The job page has an "Edit payload" control for a run that is not running: a JSON editor that checks the text is a
JSON object, saves the whole payload with `PATCH /jobs/{id}` (`payload`, `expected_updated_at`), and shows why a
save failed under the editor (a run that started or changed since it was opened is a 409). `jobActions()` gains
`editPayload`, and `JobUpdate` takes `payload` and `expected_updated_at`. Needs vex-platform 0.12 on the server; an
older one answers 422.
