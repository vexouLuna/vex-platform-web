// What a site needs to show audit rows: who did it, how it went, and what changed, as text.
import type { Tone } from './jobs'
import type { Actor, AuditOut, AuditQuery } from './types'

/** Who did it: `@login` for a user (only a user gets an @; `admin` for the admin password), `key <id>`, `job #<id>`, or the app itself (`appName`). */
export function actorLabel(e: Pick<AuditOut, 'actor_kind' | 'actor_id' | 'actor_login' | 'via'>, appName = 'system'): string {
  // The admin password signs in as a user without an id (its login is just "session").
  if (e.actor_kind === 'user') return !e.actor_id ? 'admin' : e.actor_login ? `@${e.actor_login}` : e.actor_id === 'password' ? 'password' : e.actor_id
  if (e.actor_kind === 'api_key') return `key ${e.actor_id ?? ''}`.trim()
  if (e.actor_kind === 'job') return e.actor_id ? `job #${e.actor_id}` : 'job'
  return e.actor_kind === 'system' ? appName : e.actor_kind
}

/** A job's `Actor` in the audit row's shape, for `actorLabel` and `actorTitle`. */
export const auditActor = (a: Actor): Pick<AuditOut, 'actor_kind' | 'actor_id' | 'actor_login' | 'via'> => ({
  actor_kind: a.kind,
  actor_id: a.id,
  actor_login: a.login,
  via: a.via,
})

/** The raw actor, for a tooltip: `user:1234 via session`. */
export const actorTitle = (e: Pick<AuditOut, 'actor_kind' | 'actor_id' | 'via'>): string =>
  `${e.actor_kind}${e.actor_id ? `:${e.actor_id}` : ''} via ${e.via}`

export const outcomeTone = (o: string): Tone => (o === 'ok' ? 'ok' : o === 'denied' ? 'warn' : 'bad')

/** A value as one line; '' when there is none (or an empty object, as a login's stripped password leaves). */
export function oneLine(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return Object.keys(v).length ? JSON.stringify(v) : ''
  return String(v)
}

/** What a row changed: its before and after, or its detail alone. */
export function auditChange(e: Pick<AuditOut, 'before' | 'after' | 'detail'>): { before: string; after: string; detail: string } {
  return { before: oneLine(e.before), after: oneLine(e.after), detail: oneLine(e.detail) }
}

/** The audit filters as typed in a form → the query (trimmed; `@login` → `login`; empty ones left out). */
export function auditFilterQuery(form: { action?: string; target?: string; actor?: string; actor_kind?: string; outcome?: string }): AuditQuery {
  const t = (s?: string) => s?.trim() || undefined
  const q: AuditQuery = {}
  if (t(form.action)) q.action = t(form.action)
  if (t(form.target)) q.target = t(form.target)
  if (t(form.actor)) q.actor = t(form.actor)!.replace(/^@/, '')
  if (t(form.actor_kind)) q.actor_kind = t(form.actor_kind)
  if (t(form.outcome)) q.outcome = t(form.outcome) as AuditQuery['outcome']
  return q
}
