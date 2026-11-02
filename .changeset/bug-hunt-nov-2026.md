---
'@vex/platform-web': patch
---

`atLevel` now ranks `debug` below `info`, so the event tail filters debug lines on apps that ignore `min_level`. `useCursorPages` drops an older page that lands after `reset()` instead of appending old-filter rows.
