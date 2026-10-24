// Client for the routes every vex-platform app serves under /api/v2: job runs, their events and kinds, and the
// audit log. Auth is the site's: a session cookie (writes carry its CSRF token) or a Bearer key.
import { ProblemError } from './errors'
import type { AuditOut, AuditQuery, EnqueueIn, EventOut, EventPage, EventQuery, JobCountsOut, JobCountsQuery, JobKindOut, JobOut, JobQuery, JobUpdate, Page, RelatedOut } from './types'

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export interface PlatformClientOptions {
  /** The API's v2 root, e.g. `https://archive.example.net/api/v2` or `/api/v2`. */
  base: string
  /** The session's CSRF token, sent as X-CSRF-Token on writes. Read on every request, so it can change. */
  csrf?: () => string | null | undefined
  /** A Bearer key instead of the session. */
  token?: () => string | null | undefined
  /** Called on a 401/403, so the site can send the user to sign in. */
  onUnauthorized?: (e: ProblemError) => void
  fetch?: Fetch
  credentials?: RequestCredentials
}

type Params = Record<string, string | number | boolean | readonly (string | number)[] | null | undefined>

/** A query string from params, leaving out empty ones and repeating arrays (`state=a&state=b`). */
export function query(params: Params): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue
    if (Array.isArray(v)) for (const x of v) qs.append(k, String(x))
    else qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

export class PlatformClient {
  readonly base: string
  private readonly opts: PlatformClientOptions
  private readonly fetcher: Fetch

  constructor(opts: PlatformClientOptions) {
    this.opts = opts
    this.base = opts.base.replace(/\/+$/, '')
    this.fetcher = opts.fetch ?? ((input, init) => globalThis.fetch(input, init))
  }

  /** Any request under the v2 root, with the client's auth and error handling. */
  async request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const token = this.opts.token?.()
    if (token) headers.authorization = `Bearer ${token}`
    const csrf = method !== 'GET' ? this.opts.csrf?.() : null
    if (csrf) headers['x-csrf-token'] = csrf
    const res = await this.fetcher(`${this.base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: this.opts.credentials ?? 'same-origin',
      signal,
    })
    if (!res.ok) {
      const err = await ProblemError.from(res)
      if (err.unauthorized) this.opts.onUnauthorized?.(err)
      throw err
    }
    return (res.status === 204 ? undefined : await res.json()) as T
  }

  // ---- jobs ----
  /** Newest first. */
  jobs(q: JobQuery = {}, signal?: AbortSignal): Promise<Page<JobOut>> {
    return this.request('GET', `/jobs${query({ ...q })}`, undefined, signal)
  }
  /** Runs per state (vex-platform 0.5+). With `since`, finished runs from then on only. */
  jobCounts(q: JobCountsQuery = {}, signal?: AbortSignal): Promise<JobCountsOut> {
    return this.request('GET', `/jobs/counts${query({ ...q })}`, undefined, signal)
  }
  job(id: number, signal?: AbortSignal): Promise<JobOut> {
    return this.request('GET', `/jobs/${id}`, undefined, signal)
  }
  enqueue(body: EnqueueIn): Promise<JobOut> {
    return this.request('POST', '/jobs', body)
  }
  updateJob(id: number, patch: JobUpdate): Promise<JobOut> {
    return this.request('PATCH', `/jobs/${id}`, patch)
  }
  pause(id: number): Promise<JobOut> {
    return this.request('POST', `/jobs/${id}/pause`)
  }
  /** `once`: run the next step, then pause again. */
  resume(id: number, once = false): Promise<JobOut> {
    return this.request('POST', `/jobs/${id}/resume`, { once })
  }
  /**
   * From `step`, or where it stopped (the first step for a succeeded run). `at`: start then instead of now (ISO 8601
   * UTC). `pause_before`: the run's new pause steps, a retry from one of them waiting paused; left as they are when
   * not given. Both need vex-platform 0.7+.
   */
  retry(id: number, step?: string | null, opts: { at?: string | null; pause_before?: string[] } = {}): Promise<JobOut> {
    return this.request('POST', `/jobs/${id}/retry`, { step: step ?? null, ...opts })
  }
  cancel(id: number): Promise<JobOut> {
    return this.request('POST', `/jobs/${id}/cancel`)
  }
  /** Oldest first, after `cursor`. `next_cursor` is never null: pass it back to follow the log. */
  events(id: number, cursor?: string | null, limit?: number, signal?: AbortSignal): Promise<Page<EventOut> & { next_cursor: string }> {
    return this.request('GET', `/jobs/${id}/events${query({ cursor, limit })}`, undefined, signal)
  }
  /** A page of the run's events: after a cursor, before one, or the newest (`tail`); see `EventQuery`. */
  eventPage(id: number, q: EventQuery = {}, signal?: AbortSignal): Promise<EventPage> {
    return this.request('GET', `/jobs/${id}/events${query({ ...q })}`, undefined, signal)
  }
  /** The tree of runs this one is in: who queued whom (vex-platform 0.6+). */
  related(id: number, limit?: number, signal?: AbortSignal): Promise<RelatedOut> {
    return this.request('GET', `/jobs/${id}/related${query({ limit })}`, undefined, signal)
  }
  jobKinds(signal?: AbortSignal): Promise<JobKindOut[]> {
    return this.request('GET', '/job-kinds', undefined, signal)
  }

  // ---- audit ----
  /** Newest first. */
  audit(q: AuditQuery = {}, signal?: AbortSignal): Promise<Page<AuditOut>> {
    return this.request('GET', `/audit${query({ ...q })}`, undefined, signal)
  }
}
