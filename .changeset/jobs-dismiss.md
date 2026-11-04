---
'@vex/platform-web': minor
---

Dismiss a failed or cancelled run (`client.dismiss`, `jobs({ dismissed })`, `jobCounts({ include_dismissed })`, `dismissed_at` on runs; needs vex-platform 0.10): a Dismiss button on the run page and in the batch bar, a dismissed chip, and a "Show dismissed" toggle on the Needs attention and Failed tabs, which leave dismissed runs out by default. The run page's buttons read "Retry now" and "Resume schedule".
