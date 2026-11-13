// Errors from a vex-platform API: RFC 9457 problem details. Older routes answer `{msg}` (or `{message}`, `{error}`,
// or FastAPI's `{detail: [{msg}]}`), which is read the same way so a site can use one error class for both.

export interface FieldError {
  loc: (string | number)[]
  msg: string
  type: string
}

/** Body fields the class reads itself; everything else lands in `extra`. */
const KNOWN = new Set(['type', 'title', 'status', 'detail', 'instance', 'code', 'request_id', 'errors', 'msg', 'message', 'error'])

const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

/** FastAPI's validation answer: `detail` is a list of `{msg}`. */
const detailList = (v: unknown) =>
  Array.isArray(v)
    ? v
        .map((d) => (d && typeof d === 'object' ? str((d as { msg?: unknown }).msg) : null))
        .filter(Boolean)
        .join('; ') || null
    : null

/** Seconds to wait, from a Retry-After header: delay-seconds or an HTTP date. Null when absent, past or unreadable. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | null {
  const v = value?.trim()
  if (!v) return null
  if (/^\d+$/.test(v)) return Number(v) > 0 ? Number(v) : null
  const at = Date.parse(v)
  if (!Number.isFinite(at)) return null
  const s = Math.ceil((at - now) / 1000)
  return s > 0 ? s : null
}

export class ProblemError extends Error {
  /** A stable snake_case code to branch on (`job_conflict`, `invalid`, `bad_cursor`…), or null. */
  readonly code: string | null
  readonly title: string | null
  readonly detail: string | null
  readonly requestId: string | null
  /** A validation failure's fields (422 `invalid`). */
  readonly errors: FieldError[]
  /** Seconds, from Retry-After. */
  readonly retryAfter: number | null
  /** The body's fields this class doesn't read itself (a 409's `validPoints`, `edited`, `blockedBy`…). */
  readonly extra: Record<string, unknown>

  constructor(
    readonly status: number,
    /** The whole error body, for fields a route adds. */
    readonly body: Record<string, unknown> = {},
    retryAfter: number | null = null,
    /** The response's status text, for the message when the body has none. */
    readonly statusText = '',
  ) {
    const detail = str(body.detail) ?? detailList(body.detail) ?? str(body.msg) ?? str(body.message) ?? str(body.error)
    super(detail ?? str(body.title) ?? `HTTP ${status} ${statusText}`.trim())
    this.name = 'ProblemError'
    this.code = str(body.code)
    this.title = str(body.title)
    this.detail = detail
    this.requestId = str(body.request_id)
    this.errors = Array.isArray(body.errors) ? (body.errors as FieldError[]) : []
    this.retryAfter = retryAfter
    this.extra = Object.fromEntries(Object.entries(body).filter(([k]) => !KNOWN.has(k)))
  }

  /** Not signed in (401). A 403 is a refusal of this one request (a role limit, a CSRF reject), not the end of the session. */
  get unauthorized(): boolean {
    return this.status === 401
  }

  /** When to try again, for a rate-limited login: "Try again in 5 min." (whole minutes, rounded up), or "Try again in
   *  a few minutes." without a Retry-After. */
  retryAfterText(): string {
    return `Try again in ${this.retryAfter ? `${Math.ceil(this.retryAfter / 60)} min` : 'a few minutes'}.`
  }

  /** Parses a failed response. */
  static async from(res: Response, now = Date.now()): Promise<ProblemError> {
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      // not JSON (a proxy's error page, say)
    }
    return new ProblemError(
      res.status,
      body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {},
      parseRetryAfter(res.headers.get('retry-after'), now),
      res.statusText,
    )
  }
}

/** The text to show for any caught value: a problem's detail, with the field errors of a 422; an Error's message;
 *  anything else as a string. */
export function errorText(e: unknown): string {
  if (e instanceof ProblemError && e.errors.length) {
    return `${e.message}: ${e.errors.map((f) => `${f.loc.filter((l) => l !== 'body').join('.')} ${f.msg}`).join('; ')}`
  }
  return e instanceof Error ? e.message : String(e)
}
