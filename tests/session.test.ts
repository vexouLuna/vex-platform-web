import { describe, expect, it, vi } from 'vitest'
import { safeNext, signInTarget } from '../src'
import { auditFiltersFrom, auditFiltersQuery, jobFiltersFrom, jobFiltersQuery, useAdminSession, type SessionAuth } from '../src/vue'
import archive from './fixtures/session-archive.json'
import bot from './fixtures/session-bot.json'

type Archive = typeof archive
type Bot = typeof bot

describe('useAdminSession', () => {
  const setup = <S extends { authenticated: boolean; csrf?: string | null }>(load: () => Promise<S>, extra: { signedOut?: (s: S) => S } = {}) => {
    const auth: SessionAuth = { csrf: null, onUnauthorized: null }
    const logout = vi.fn(async () => undefined)
    const onClear = vi.fn()
    const session = useAdminSession<S>({ auth, load, logout, onClear, ...extra })
    return { auth, logout, onClear, session }
  }

  it("asks twitch-archive once, and hands its CSRF token to the site's client", async () => {
    const load = vi.fn(async () => archive)
    const { auth, session } = setup<Archive>(load)
    expect(session.checked.value).toBe(false)
    await Promise.all([session.ensure(), session.ensure()])
    await session.ensure()
    expect(load).toHaveBeenCalledTimes(1)
    expect(session.authenticated.value).toBe(true)
    expect(session.data.value?.user.displayName).toBe('vEXOULZ')
    expect(auth.csrf).toBe('c5f0d1e2a9b84f7e')
    await session.refresh()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("drops doomtp-bot's session on a 401, keeps what it said about signing in, and says why", async () => {
    const { auth, onClear, session } = setup<Bot>(async () => bot, {
      signedOut: (s) => ({ ...s, authenticated: false, csrf: null, role: null, user: null, channels: null }) as unknown as Bot,
    })
    const expired = vi.fn()
    session.setExpiredHandler(expired)
    await session.ensure()
    expect(auth.csrf).toBe('9a1c47be03d2f6aa')
    auth.onUnauthorized!()
    expect(session.authenticated.value).toBe(false)
    expect(session.data.value?.user).toBeNull()
    expect(session.data.value?.twitch_login).toBe(true)
    expect(auth.csrf).toBeNull()
    expect(session.notice.value).toBe('Your session ended. Sign in again.')
    expect([onClear.mock.calls.length, expired.mock.calls.length]).toEqual([1, 1])
    // A second 401 (another call in flight) changes nothing.
    auth.onUnauthorized!()
    expect(expired).toHaveBeenCalledTimes(1)
    // Signing in again takes the new session and the notice goes.
    session.signIn(bot)
    expect([session.authenticated.value, session.notice.value, auth.csrf]).toEqual([true, null, '9a1c47be03d2f6aa'])
  })

  it('reads as signed out when the app is unreachable', async () => {
    const onLoadError = vi.fn()
    const auth: SessionAuth = { csrf: null, onUnauthorized: null }
    const session = useAdminSession<Archive>({ auth, load: () => Promise.reject(new TypeError('Failed to fetch')), logout: async () => {}, onLoadError })
    await session.ensure()
    expect([session.checked.value, session.authenticated.value, session.data.value]).toEqual([true, false, null])
    expect(onLoadError).toHaveBeenCalledOnce()
    // Not signed in, so a 401 leaves no notice.
    auth.onUnauthorized!()
    expect(session.notice.value).toBeNull()
  })

  it('signs out even when the app does not answer', async () => {
    const { auth, logout, session } = setup<Archive>(async () => archive)
    await session.ensure()
    logout.mockRejectedValueOnce(new Error('offline'))
    await expect(session.logout()).rejects.toThrow('offline')
    expect([session.authenticated.value, auth.csrf, session.data.value?.twitchLogin]).toEqual([false, null, true])
  })
})

describe('signInTarget', () => {
  const twitch = (next: string) => `/auth/admin/login?${new URLSearchParams({ next })}`
  it('lets the signed in through, sends the rest to Twitch or the sign-in page', () => {
    expect(signInTarget({ authenticated: true, twitchLogin: true, notice: null }, '/manage', twitch)).toBeNull()
    expect(signInTarget({ authenticated: false, twitchLogin: true, notice: null }, '/manage/jobs?kind=x', twitch)).toEqual({
      href: '/auth/admin/login?next=%2Fmanage%2Fjobs%3Fkind%3Dx',
    })
    // After an expired session, the sign-in page first, which says why.
    expect(signInTarget({ authenticated: false, twitchLogin: true, notice: 'ended' }, '/manage', twitch)).toEqual({ next: '/manage' })
    expect(signInTarget({ authenticated: false, twitchLogin: false, notice: null }, '/manage', twitch)).toEqual({ next: '/manage' })
  })
})

describe('safeNext', () => {
  it('takes a path on this site, nothing else', () => {
    const opts = { home: '/manage', not: ['/admin/login'] }
    expect(safeNext('/manage/jobs?x=1', opts)).toBe('/manage/jobs?x=1')
    for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', '/admin/login?next=/', undefined, ['/manage']]) {
      expect(safeNext(bad, opts)).toBe('/manage')
    }
    expect(safeNext('/vods', { home: '/manage', within: '/manage' })).toBe('/manage')
  })
})

describe('filters in the query', () => {
  it('reads and writes the jobs filters', () => {
    expect(jobFiltersFrom({ state: 'failed', kind: 'upload', subject: ['a', 'b'] })).toEqual({ state: 'failed', kind: 'upload', subject: '' })
    expect(jobFiltersFrom({})).toEqual({ state: 'all', kind: '', subject: '' })
    expect(jobFiltersQuery({ state: 'all', kind: '', subject: 'vod:1' })).toEqual({ subject: 'vod:1' })
    expect(jobFiltersQuery({ state: 'active', kind: 'upload', subject: '' })).toEqual({ state: 'active', kind: 'upload' })
  })

  it('reads and writes the audit filters, trimmed', () => {
    const f = auditFiltersFrom({ action: 'vod.', actor: ' me ', scope: 'ignored' })
    expect(f).toEqual({ action: 'vod.', target: '', actor: ' me ', actor_kind: '', outcome: '', scope: '' })
    expect(auditFiltersFrom({}, 'channel:1').scope).toBe('channel:1')
    expect(auditFiltersQuery({ ...f, scope: 'channel:1' })).toEqual({ action: 'vod.', actor: 'me' })
  })
})
