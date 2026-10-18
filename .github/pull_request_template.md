<!-- conventions:begin: synced from vexouLuna/conventions; edit it there, then run `conventions sync` -->
## What changed

## Checklist
- [ ] The branch is named per [Conventional Branch](../CONTRIBUTING.md#branches) (`feature/`, `bugfix/`, `hotfix/`, `release/`, `chore/`).
- [ ] New behaviour has a test, and docs that describe the changed behaviour are updated in this PR.
- [ ] Nothing synced from vexouLuna/conventions was edited by hand (`.conventions/`, managed blocks).
- [ ] **No private infrastructure**: no machine hostnames, private IPs, server paths, proxy/tunnel config or deploy scripts. Those belong in the private infrastructure repo.
- [ ] No secret values anywhere in the diff, the description or the commit messages.
<!-- conventions:end -->

## vex-platform-web
- [ ] Shapes match vex-platform's v2 API (its `docs/conventions.md`); new ones have a test against recorded JSON in `tests/fixtures/`.
- [ ] Components use only the `--vxp-*` variables and native elements: nothing from vex-ui or a router, so other instances can use them.
- [ ] Nothing site-specific: links, names and toasts come from the site through `createPlatformUi`.
- [ ] A changeset was added if `src/` changed (`npm run changeset`).
