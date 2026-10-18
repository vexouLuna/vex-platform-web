import { describe, expect, it, vi } from 'vitest'
import { PlatformClient, ProblemError, errorText, query, type JobOut, type Page } from '../src'
import jobs from './fixtures/jobs.json'
import events from './fixtures/events.json'
import kinds from './fixtures/job-kinds.json'
import audit from './fixtures/audit.json'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

function client(reply: (url: string, init: RequestInit) => Response, opts: Partial<ConstructorParameters<typeof PlatformClient>[0]> = {}) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => reply(url, init ?? {}))
  return { api: new PlatformClient({ base: '/api/v2/', fetch, ...opts }), fetch }
}

describe('query', () => {
  it('repeats arrays and leaves out empty values', () => {
    expect(query({ state: ['queued', 'running'], kind: '', subject: null, limit: 50, cursor: undefined })).toBe('?state=queued&state=running&limit=50')
    expect(query({})).toBe('')
  })
})

describe('PlatformClient', () => {
  it('lists jobs with the filters in the query', async () => {
    const { api, fetch } = client(() => json(jobs))
    const page: Page<JobOut> = await api.jobs({ state: ['failed', 'cancelled'], kind: 'upload', subject: 'vod:1', cursor: 'abc', limit: 20 })
    expect(fetch.mock.calls[0]![0]).toBe('/api/v2/jobs?state=failed&state=cancelled&kind=upload&subject=vod%3A1&cursor=abc&limit=20')
    expect(page.items.map((j) => [j.id, j.state])).toEqual([[812, 'running'], [811, 'failed']])
    expect(page.next_cursor).toBe('eyJpZCI6ODExfQ')
  })

  it('counts jobs per state, with the filters in the query', async () => {
    const counts = { counts: { queued: 1, running: 0, paused: 0, succeeded: 3, failed: 1, cancelled: 0 }, total: 5 }
    const { api, fetch } = client(() => json(counts))
    expect(await api.jobCounts({ kind: 'archive', since: '2026-10-01T00:00:00Z' })).toEqual(counts)
    expect(fetch.mock.calls[0]![0]).toBe('/api/v2/jobs/counts?kind=archive&since=2026-10-01T00%3A00%3A00Z')
  })

  it('reads a run tree and lists a run\'s children', async () => {
    const tree = { root_id: 811, items: [{ ...jobs.items[1], parent_id: null }, { ...jobs.items[0], parent_id: 811 }], truncated: false }
    const { api, fetch } = client((url) => json(url.includes('/related') ? tree : jobs))
    const r = await api.related(812, 50)
    expect(fetch.mock.calls[0]![0]).toBe('/api/v2/jobs/812/related?limit=50')
    expect([r.root_id, r.items.map((j) => j.parent_id), r.truncated]).toEqual([811, [null, 811], false])
    await api.related(812)
    expect(fetch.mock.calls[1]![0]).toBe('/api/v2/jobs/812/related')
    await api.jobs({ parent: 811 })
    expect(fetch.mock.calls[2]![0]).toBe('/api/v2/jobs?parent=811')
  })

  it('reads events, kinds and audit', async () => {
    const { api, fetch } = client((url) => json(url.includes('/events') ? events : url.endsWith('/job-kinds') ? kinds : audit))
    expect((await api.events(812, 'c1', 100)).items).toHaveLength(5)
    expect(fetch.mock.calls[0]![0]).toBe('/api/v2/jobs/812/events?cursor=c1&limit=100')
    expect((await api.jobKinds()).map((k) => k.cancel_mode)).toEqual(['interrupt', 'cooperative'])
    const a = await api.audit({ action: 'job.', actor: 'me', outcome: 'ok' })
    expect(fetch.mock.calls[2]![0]).toBe('/api/v2/audit?action=job.&actor=me&outcome=ok')
    expect(a.items[1]!.scope_name).toBe('example')
  })

  it('sends the CSRF token and a JSON body on writes only', async () => {
    const { api, fetch } = client(() => json(jobs.items[1]), { csrf: () => 'tok' })
    await api.retry(811, 'store')
    await api.job(811)
    const [url, init] = fetch.mock.calls[0]!
    expect([url, init!.method, init!.body]).toEqual(['/api/v2/jobs/811/retry', 'POST', '{"step":"store"}'])
    await api.retry(811, null, { at: '2026-10-18T00:00:00.000Z', pause_before: [] })
    expect(fetch.mock.calls.at(-1)![1]!.body).toBe('{"step":null,"at":"2026-10-18T00:00:00.000Z","pause_before":[]}')
    expect((init!.headers as Record<string, string>)['x-csrf-token']).toBe('tok')
    expect((fetch.mock.calls[1]![1]!.headers as Record<string, string>)['x-csrf-token']).toBeUndefined()
  })

  it('sends resume `once`, a PATCH for updates and a Bearer key', async () => {
    const { api, fetch } = client(() => json(jobs.items[0]), { token: () => 'key' })
    await api.resume(1, true)
    await api.updateJob(1, { pause_before: null, pause_next: true })
    expect(fetch.mock.calls[0]![1]!.body).toBe('{"once":true}')
    expect([fetch.mock.calls[1]![1]!.method, fetch.mock.calls[1]![1]!.body]).toEqual(['PATCH', '{"pause_before":null,"pause_next":true}'])
    expect((fetch.mock.calls[0]![1]!.headers as Record<string, string>).authorization).toBe('Bearer key')
  })

  it('throws problem details and reports 401/403', async () => {
    const onUnauthorized = vi.fn()
    const problem = { type: 'about:blank', title: 'Conflict', status: 409, code: 'job_conflict', detail: 'Job 811 is failed; it cannot be paused.', request_id: 'r1' }
    const { api } = client(() => json(problem, 409), { onUnauthorized })
    const err = await api.pause(811).catch((e) => e)
    expect(err).toBeInstanceOf(ProblemError)
    expect([err.status, err.code, err.message, err.requestId]).toEqual([409, 'job_conflict', 'Job 811 is failed; it cannot be paused.', 'r1'])
    expect(onUnauthorized).not.toHaveBeenCalled()

    const denied = client(() => json({ title: 'Forbidden', status: 403, code: 'forbidden' }, 403), { onUnauthorized })
    await denied.api.jobs().catch(() => {})
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('names the fields of a 422, and reads v1 {msg} bodies and non-JSON errors', async () => {
    const invalid = new ProblemError(422, {
      code: 'invalid',
      detail: 'The request is invalid.',
      errors: [{ loc: ['body', 'step'], msg: 'unknown step', type: 'value_error' }],
    })
    expect(errorText(invalid)).toBe('The request is invalid.: step unknown step')
    expect(new ProblemError(400, { msg: 'nope' }).message).toBe('nope')
    const { api } = client(() => new Response('<html>bad gateway</html>', { status: 502, headers: { 'retry-after': '5' } }))
    const err = await api.jobs().catch((e) => e)
    expect([err.message, err.retryAfter]).toEqual(['HTTP 502', 5])
  })
})
