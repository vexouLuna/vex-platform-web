# vex-platform-web

The web side of [vex-platform](https://github.com/vexouLuna/vex-platform): a client and Vue components for the routes
every vex-platform app serves under `/api/v2` (job runs, their events and kinds, the audit log), plus the chat-line
parsing and rendering that VOD chat replay and a bot's chat log share.

It is not tied to any one site's design. Components draw only with their own `--vxp-*` CSS variables, which have
neutral light and dark defaults; a site maps them onto its own tokens in one stylesheet. Nothing here depends on a
router or a component library.

```bash
npm install
npm test            # vitest, against v2 fixtures in tests/fixtures
npm run typecheck   # vue-tsc
npm run build       # → dist/ (index.js, chat.js, vue.js, style.css, types/)
npm run story:dev   # Histoire on :6007, the components against the fixtures
git config core.hooksPath .conventions/githooks   # once per clone: branch-name rules, see CONTRIBUTING.md
```

`main` is merge-only and branches follow [Conventional Branch](https://conventional-branch.github.io/)
(`feature/…`, `bugfix/…`, `hotfix/…`, `release/…`, `chore/…`). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Using it

```bash
npm install github:vexouLuna/vex-platform-web#v0.1.0
```

Three entry points:

| Import | What |
|---|---|
| `@vex/platform-web` | `PlatformClient`, `ProblemError`/`errorText`, the v2 types, and pure helpers (`jobActions`, `stepStates`, `progressText`, `subjectOf`, `actorLabel`/`auditActor`, `auditFilterQuery`, `timeAgo`, `bytes`, …) |
| `@vex/platform-web/chat` | `tokenize`, `EmoteSet`, `resolveBadges`, `twitchColor`, `chatName`, `toChatLine` (a bot's v2 log entry → a chat line) `loadChannelEmotes(twitchId)` (7TV, BTTV and FFZ, straight from the providers) and `twitchUserLookup(url)` (a chatter's public profile from doomtp-bot's `/api/v2/twitch/users`) |
| `@vex/platform-web/vue` | `createPlatformUi`, `usePoll`, `useCursorPages`, `useEventTail`, `useJobActions`, and the components below. Importing it loads `style.css` |

The first two have no framework dependency. `vue ^3.5` is an optional peer, needed only for `./vue`.

### Client

```ts
import { PlatformClient } from '@vex/platform-web'

export const platform = new PlatformClient({
  base: '/api/v2',
  csrf: () => session.csrf,              // sent as X-CSRF-Token on writes
  onUnauthorized: () => router.push('/manage/sign-in'),
})

const page = await platform.jobs({ state: ['failed'], kind: 'upload', limit: 50 })
await platform.retry(page.items[0]!.id, 'publish')
```

Errors are `ProblemError`s parsed from RFC 9457 problem+json (`status`, `code`, `detail`, `errors[]`, `requestId`,
`retryAfter`, and `extra` for the body fields a route adds). v1 bodies (`{msg}`, `{message}`, `{error}`, FastAPI's
`{detail: [{msg}]}`) are read too, so a site can use the same class for its older routes. `retryAfter` is in seconds,
from Retry-After as delay-seconds or an HTTP date; `retryAfterText()` gives "Try again in 5 min." for a login page,
and `errorText(e)` the message to show for anything caught.

### Components

```ts
// main.ts
import { createPlatformUi } from '@vex/platform-web/vue'
import { RouterLink } from 'vue-router'

app.use(
  createPlatformUi({
    link: RouterLink,
    jobHref: (id) => `/manage/jobs/${id}`,
    subjectHref: (s) => (s.startsWith('vod:') ? `/vod/${s.slice(4)}` : null),
    notify: (msg, kind) => toast(msg, kind),
    appName: 'archive',                  // the `system` actor in the audit
  }),
)
```

| Component | What |
|---|---|
| `JobsBrowser` | State tabs, kind and subject filters (`v-model:filters`), the first page polled, older pages on demand |
| `JobsTable` | The rows alone |
| `JobDetail` | One run: summary, steps with pause-before toggles, progress, payload, the event log, and pause / resume / run one step / cancel, and a retry of any finished run from a step, now or later, with its own pause steps |
| `JobEventLog` | An event log (`role=log`) that follows new lines |
| `StartJob` | The "Start a job" dialog (`v-model:open`): kind, subject, start step, pause steps, paused, JSON payload; `@started` gets the new run. `to-subject` maps what's typed (a VOD id) to the subject, `#error="{ error, subject }"` words a refusal the site knows |
| `PauseGates` | The "Pause before" step picker: `v-model` the steps, `steps` the ones shown (others in the model are kept) |
| `LoadState` | Error with "Try again", skeleton rows, or the empty state, else its content. The same props as vex-ui's `VxLoadState` |
| `AuditBrowser` | The audit with by / action / target / actor kind / outcome filters, optionally one `scope` |
| `ActorRef` | Who did something: a user as `@login` (id on hover, copied on click), a job as a link, a key or the app by name. Only users get an @ |
| `AuditTable` | The rows alone; `#actor` and `#scope` slots |
| `ChatLine` | One chat line: badges, name colour, emotes (with zero-width stacking), rewards, removed messages and notices; `#before`/`#after` slots for a timestamp or extra columns |
| `ChatEmote` | One emote, with its menu button |
| `UserCard` | The card a name opens (`ChatLine` with `user-cards`, `@user`): picture, id, account age, followers, roles, bio and a Twitch link; `#actions` for the site's own buttons. The profile comes from `createPlatformUi({ userLookup: twitchUserLookup(url) })`; without one the card shows what the chat line knows |

Tables scroll sideways on narrow screens rather than dropping columns.

### Styling

Map the variables once, on a plain `:root`:

```css
/* src/styles/platform.css */
:root {
  --vxp-bg: var(--site-bg);
  --vxp-surface: var(--site-surface);
  --vxp-ink: var(--site-ink);
  --vxp-muted: var(--site-muted);
  --vxp-line: var(--site-line);
  --vxp-accent: var(--site-accent);
  --vxp-font: var(--site-font);
  --vxp-mono: var(--site-mono);
}
```

The library declares its defaults (light, and dark under `prefers-color-scheme`) on `:where(:root)`, which has no
specificity, so a site's `:root` rule wins whatever order the stylesheets load in, including when the library's CSS
arrives later with a lazily loaded page. No `:root:root` or `!important` is needed. The full list is at the top of
[src/style.css](src/style.css).

## Releasing

Add a changeset with each change to `src/` (`npm run changeset`). Releasing: `npm run release` on a `release/…` branch,
PR, merge, then tag `vX.Y.Z` on `main`. Sites install from the tag.
