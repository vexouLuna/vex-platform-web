---
'@vex/platform-web': minor
---

Darker light-mode `--vxp-ok` and `--vxp-warn` so chip text passes AA. New `--vxp-on-bad` for text on `.vxp-btn.danger-solid` (sites that remap `--vxp-bad` should set it). `.vxp-input` gets hover, disabled and invalid (`aria-invalid` / `.is-invalid`) states, `.vxp-field-error` shows a message under a field (StartJob uses it for the payload), and `.vxp-progress` honours reduced motion.
