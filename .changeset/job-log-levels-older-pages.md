---
'@vex/platform-web': minor
---

Job log: a level selector (default "info and up"; "debug" shows what a step checked or skipped), and the log now
opens on its newest lines and loads older ones as you scroll up (or with "Load older lines"). New client method
`eventPage(id, { cursor, before, tail, min_level, limit })` and types `EventQuery`, `EventPage`, `EventLevel`;
`useEventTail` gains `minLevel`, `hasOlder`, `loadingOlder` and `loadOlder()`, and keeps up to 20,000 events by
default. `tail`, `before` and `min_level` need vex-platform 0.9+; against an older app the log reads from the start
as before, and levels are filtered in the browser.
