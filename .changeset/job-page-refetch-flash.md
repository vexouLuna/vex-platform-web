---
'@vex/platform-web': patch
---

`JobDetail`: the related jobs section no longer leaves the page and comes back on every poll of a running job (which made the page flash and the scroll jump), and the step picked in the retry select is no longer reset by a poll.
