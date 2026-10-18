@.conventions/CLAUDE.md

# vex-platform-web

The web side of vex-platform: a client and Vue components for the `/api/v2` routes every vex-platform
app serves (job runs, their events and kinds, the audit log), plus the chat-line parsing and rendering
shared by VOD chat replay and a bot's chat log. The sites and vods-core install a tag
(`github:vexouLuna/vex-platform-web#vX.Y.Z`), so a change reaches them only when a release is tagged on
`main` and their pins move.

- Shapes follow vex-platform's v2 API (its `docs/conventions.md`). A new one gets a test against
  recorded JSON in `tests/fixtures/`.
- Not tied to one site: components draw only with their own `--vxp-*` CSS variables and native
  elements, with nothing from vex-ui or a router. Links, names and toasts come from the site through
  `createPlatformUi`.
- A change to `src/` adds a changeset (`npm run changeset`). Releases go through a `release/x-y-z`
  branch, and the tag is set on `main` after it merges (README "Releasing").
- `npm run story:dev` runs Histoire with the components against the fixtures.
