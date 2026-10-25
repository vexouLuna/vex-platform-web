// What a site's sign-in needs to decide, without Vue or a router: where to send someone a page turns away, and which
// `?next=` to trust when they come back.

export interface SafeNextOptions {
  /** Where to go when `next` is missing or not trusted. */
  home: string
  /** Only paths under this one (`/manage`); default any path on the site. */
  within?: string
  /** Paths never to go back to (the sign-in page itself). */
  not?: readonly string[]
}

/**
 * The `?next=` to go to after signing in: a path on this site, never another origin (`//evil.example`,
 * `/\evil.example`) or a full URL; else `home`.
 */
export function safeNext(raw: unknown, { home, within = '/', not = [] }: SafeNextOptions): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return home
  if (!raw.startsWith(within) || not.some((p) => raw.startsWith(p))) return home
  return raw
}

export interface SignInState {
  authenticated: boolean
  /** Whether the app offers signing in with Twitch. */
  twitchLogin: boolean
  /** Why the session ended, shown on the sign-in page; while set, the visitor goes there and not straight to Twitch. */
  notice: string | null
}

/**
 * Where a page that needs the session sends this visitor: nowhere (null, signed in), straight through the app's
 * Twitch sign-in (`href`, for `location.assign`), or the site's own sign-in page with `next`.
 */
export function signInTarget(s: SignInState, next: string, twitchLoginUrl: (next: string) => string): { href: string } | { next: string } | null {
  if (s.authenticated) return null
  if (s.twitchLogin && !s.notice) return { href: twitchLoginUrl(next) }
  return { next }
}
