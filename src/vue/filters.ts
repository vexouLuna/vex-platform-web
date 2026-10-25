// JobsBrowser's and AuditBrowser's filters to and from a page's query string (`?state=&kind=&subject=`), without a
// router: `filters = computed({ get: () => jobFiltersFrom(route.query), set: (f) => router.replace({ query: jobFiltersQuery(f) }) })`.
import type { AuditFilters, JobFilters } from './types'

type Query = Record<string, unknown>

const one = (q: Query, k: string): string => (typeof q[k] === 'string' ? (q[k] as string) : '')

export function jobFiltersFrom(q: Query): JobFilters {
  return { state: one(q, 'state') || 'all', kind: one(q, 'kind'), subject: one(q, 'subject') }
}

/** The query for these filters: empty ones and the `all` tab left out. */
export function jobFiltersQuery(f: JobFilters): Record<string, string> {
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries(f)) if (v && !(k === 'state' && v === 'all')) query[k] = v
  return query
}

const AUDIT_KEYS = ['action', 'target', 'actor', 'actor_kind', 'outcome'] as const

/** `scope` isn't in the query: it's the site's to set (a channel page's own). */
export function auditFiltersFrom(q: Query, scope = ''): AuditFilters {
  return { action: one(q, 'action'), target: one(q, 'target'), actor: one(q, 'actor'), actor_kind: one(q, 'actor_kind'), outcome: one(q, 'outcome'), scope }
}

/** The query for these filters, trimmed, empty ones left out. */
export function auditFiltersQuery(f: AuditFilters): Record<string, string> {
  const query: Record<string, string> = {}
  for (const k of AUDIT_KEYS) if (f[k].trim()) query[k] = f[k].trim()
  return query
}
