// What a site tells the components once, at app setup: how to link (its router's link component), where a job or a
// subject lives, how to tell the user something happened, and how to show times.
import { inject, type App, type Component, type InjectionKey } from 'vue'
import { stamp, timeAgo } from '../time'
import type { UserLookup } from '../chat/users'

export type NotifyKind = 'ok' | 'error' | 'info'

export interface PlatformUiOptions {
  /** A link component taking `to` (vue-router's RouterLink). Without one, links are plain `<a href>`. */
  link?: Component
  /** Where a job's page is; null leaves job ids unlinked. */
  jobHref?: (id: number) => string | null
  /** Where a subject or audit target (`vod:123`, `channel:456`) lives; null leaves it as text. */
  subjectHref?: (subject: string) => string | null
  /** Tell the user an action went through or failed (a toast). Without one, nothing is shown beyond the components' own errors. */
  notify?: (message: string, kind: NotifyKind) => void
  timeAgo?: (iso: string | null | undefined) => string
  stamp?: (iso: string | null | undefined) => string
  /** What the app's own actions (`system` actor) are called in the audit. */
  appName?: string
  /** Where `UserCard` gets a chatter's Twitch profile: `twitchUserLookup('/api/v2/twitch/users')` over doomtp-bot's
   * route. Without one the card shows only what the chat line knows. */
  userLookup?: UserLookup
}

export interface PlatformUi {
  link: Component | null
  jobHref: (id: number) => string | null
  subjectHref: (subject: string) => string | null
  notify: (message: string, kind: NotifyKind) => void
  timeAgo: (iso: string | null | undefined) => string
  stamp: (iso: string | null | undefined) => string
  appName: string
  userLookup: UserLookup | null
}

export const PLATFORM_UI: InjectionKey<PlatformUi> = Symbol('vex-platform-ui')

export function resolveUi(o: PlatformUiOptions = {}): PlatformUi {
  return {
    link: o.link ?? null,
    jobHref: o.jobHref ?? (() => null),
    subjectHref: o.subjectHref ?? (() => null),
    notify: o.notify ?? (() => {}),
    timeAgo: o.timeAgo ?? ((iso) => timeAgo(iso)),
    stamp: o.stamp ?? stamp,
    appName: o.appName ?? 'system',
    userLookup: o.userLookup ?? null,
  }
}

/** `app.use(createPlatformUi({ link: RouterLink, jobHref: (id) => `/manage/jobs/${id}` }))`. */
export function createPlatformUi(options: PlatformUiOptions = {}) {
  const ui = resolveUi(options)
  return { install: (app: App) => app.provide(PLATFORM_UI, ui) }
}

const fallback = resolveUi()

/** The site's config, or the defaults when it installed none. */
export const usePlatformUi = (): PlatformUi => inject(PLATFORM_UI, fallback)
