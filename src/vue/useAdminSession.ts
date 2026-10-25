// A site's admin session, headless: whether it has been asked yet, the app's answer, the CSRF token its client sends,
// and dropping it on a 401. The session's shape is the app's (twitch-archive and doomtp-bot answer differently), so
// the site reads its own fields from `data`; the chrome (sign-in page, account menu) stays in the site.
import { computed, ref, shallowRef } from 'vue'

/** The part of the site's API client the session drives: the token it sends on writes, and what it does on a 401. */
export interface SessionAuth {
  csrf: string | null
  onUnauthorized: (() => void) | null
}

export interface AdminSessionOptions<S> {
  auth: SessionAuth
  /** Asks the app for the session (`GET /admin/session`). */
  load: () => Promise<S>
  /** Ends it on the app (`DELETE /admin/session`). */
  logout: () => Promise<unknown>
  /** What's left of a session once it ends, to keep what the app said about signing in (which logins it offers).
   *  Default: the same, signed out. */
  signedOut?: (s: S) => S
  /** Told about a session check that failed (the app unreachable); the session then reads as signed out. */
  onLoadError?: (e: unknown) => void
  /** Called whenever the session ends here: a sign-out, or a 401 (before the expired handler). */
  onClear?: () => void
  /** The notice a 401 leaves for the sign-in page. */
  expiredNotice?: string
}

export interface SessionShape {
  authenticated: boolean
  csrf?: string | null
}

export function useAdminSession<S extends SessionShape>(o: AdminSessionOptions<S>) {
  const data = shallowRef<S | null>(null)
  const checked = ref(false)
  const notice = ref<string | null>(null)
  const authenticated = computed(() => !!data.value?.authenticated)

  function apply(s: S) {
    data.value = s
    checked.value = true
    o.auth.csrf = s.csrf ?? null
  }

  function clear() {
    if (data.value) data.value = o.signedOut ? o.signedOut(data.value) : { ...data.value, authenticated: false, csrf: null }
    o.auth.csrf = null
    o.onClear?.()
  }

  let onExpired: (() => void) | null = null
  o.auth.onUnauthorized = () => {
    if (!authenticated.value) return
    clear()
    notice.value = o.expiredNotice ?? 'Your session ended. Sign in again.'
    onExpired?.()
  }

  let pending: Promise<void> | null = null
  /** Asks the app once; later calls share the answer. */
  function ensure(): Promise<void> {
    if (checked.value) return Promise.resolve()
    pending ??= o
      .load()
      .then(apply)
      .catch((e: unknown) => {
        // Unreachable: signed out; the sign-in page shows the error when it tries.
        checked.value = true
        o.onLoadError?.(e)
      })
      .finally(() => (pending = null))
    return pending
  }

  return {
    /** The app's answer, as it gave it; null until asked (or when asking failed). */
    data: computed(() => data.value),
    checked: computed(() => checked.value),
    authenticated,
    notice: computed(() => notice.value),
    ensure,
    /** Asks again, after something that changes what the session may do. */
    refresh(): Promise<void> {
      checked.value = false
      return ensure()
    },
    /** Takes a session the app just gave (a password or code sign-in), and drops the old notice. */
    signIn(s: S) {
      apply(s)
      notice.value = null
    },
    async logout(): Promise<void> {
      try {
        await o.logout()
      } finally {
        clear()
      }
    },
    /** How to reach the sign-in page when the session ends mid-use (the site's router push). */
    setExpiredHandler(fn: () => void) {
      onExpired = fn
    },
  }
}

export type AdminSession<S extends SessionShape> = ReturnType<typeof useAdminSession<S>>
