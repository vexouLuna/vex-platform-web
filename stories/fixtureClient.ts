// A PlatformClient over the test fixtures, so the stories run without a backend. Writes answer with the job in the
// state the action would leave it in.
import { PlatformClient, type JobOut, type JobState } from '../src'
import audit from '../tests/fixtures/audit.json'
import events from '../tests/fixtures/events.json'
import kinds from '../tests/fixtures/job-kinds.json'
import jobs from '../tests/fixtures/jobs.json'
import vodNotFound from '../tests/fixtures/problem-vod-not-found.json'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const after: Record<string, JobState> = { pause: 'paused', resume: 'running', retry: 'queued', cancel: 'cancelled' }

export function fixtureClient(): PlatformClient {
  const base = jobs.items.map((j) => ({ ...j })) as JobOut[]
  const backfill = base.find((j) => j.kind === 'chat_backfill')!
  const child = (id: number, parent: number, subject: string, state: JobState): JobOut => ({
    ...backfill,
    id,
    kind: 'bot_chat',
    subject,
    state,
    parent_id: parent,
    last_error: state === 'failed' ? backfill.last_error : null,
    actor: { kind: 'job', id: String(parent), login: backfill.kind, via: 'job' },
  })
  const rows: JobOut[] = [
    ...base,
    child(813, backfill.id, 'vod:2551230001', 'succeeded'),
    child(814, backfill.id, 'vod:2551230002', 'failed'),
    child(815, 814, 'vod:2551230002', 'queued'),
    { ...backfill, id: 790, state: 'succeeded', last_error: null, parent_id: null },
    // Put off to a set time by its step (a YouTube daily limit), so it reads "scheduled".
    {
      ...backfill,
      id: 816,
      kind: 'upload',
      subject: 'vod:2551230003',
      state: 'queued',
      step: backfill.steps[0] ?? null,
      attempts: 0,
      parent_id: null,
      not_before: new Date(Date.now() + 9 * 3600_000).toISOString(),
      last_error: "YouTube refused videos.insert: the channel's upload limit is used up (uploadLimitExceeded); trying again at 2026-10-15 13:05 UTC (1 of 3)",
    },
  ]
  return new PlatformClient({
    base: '/api/v2',
    fetch: async (input, init) => {
      const url = new URL(String(input), 'http://stories')
      const path = url.pathname.replace('/api/v2', '')
      await new Promise((r) => setTimeout(r, 250))
      if (path === '/job-kinds') return json(kinds)
      if (path === '/audit') return json(audit)
      if (path === '/jobs' && init?.method === 'POST') {
        // A new run, queued; the archive's refusal for a subject it doesn't have (any id ending in 404).
        const body = JSON.parse(String(init.body))
        if (String(body.subject ?? '').endsWith('404')) return json(vodNotFound, 404)
        const steps = kinds.find((k) => k.name === body.kind)?.steps ?? []
        const job: JobOut = { ...backfill, id: 900 + rows.length, steps, step: body.step ?? steps[0] ?? null, state: body.paused ? 'paused' : 'queued', kind: body.kind, subject: body.subject ?? null, pause_before: body.pause_before ?? null, last_error: null, attempts: 0, parent_id: null, finished_at: null }
        rows.push(job)
        return json(job, 201)
      }
      if (path === '/jobs') {
        const states = url.searchParams.getAll('state')
        const subject = url.searchParams.get('subject')
        const parent = url.searchParams.get('parent')
        const items = rows
          .filter((j) => (!states.length || states.includes(j.state)) && (!subject || j.subject === subject))
          .filter((j) => !parent || j.parent_id === Number(parent))
          .sort((a, b) => b.id - a.id)
        return json({ items, next_cursor: null })
      }
      const m = path.match(/^\/jobs\/(\d+)(?:\/(\w+))?$/)
      const job = m && rows.find((j) => j.id === Number(m[1]))
      if (!m || !job) return json({ title: 'Not Found', status: 404, code: 'not_found', detail: 'No such job.' }, 404)
      if (m[2] === 'related') {
        let root = job
        while (root.parent_id) root = rows.find((j) => j.id === root.parent_id) ?? root
        const tree = new Set([root.id])
        for (const j of [...rows].sort((a, b) => a.id - b.id)) if (j.parent_id && tree.has(j.parent_id)) tree.add(j.id)
        return json({ root_id: root.id, items: rows.filter((j) => tree.has(j.id)).sort((a, b) => a.id - b.id), truncated: false })
      }
      if (m[2] === 'events') {
        // The fixture's lines are the newest page; `before` gives an older page of made-up lines, debug ones among them.
        const ranks = ['debug', 'info', 'warning', 'error']
        const min = ranks.indexOf(url.searchParams.get('min_level') ?? 'debug')
        const shown = (items: typeof events.items) => items.filter((e) => ranks.indexOf(e.level) >= min)
        if (url.searchParams.has('cursor')) return json({ items: [], next_cursor: 'end' })
        if (url.searchParams.has('before')) {
          const older = Array.from({ length: 40 }, (_, i) => ({
            id: -40 + i,
            at: new Date(Date.parse(events.items[0]!.at) - (40 - i) * 1000).toISOString(),
            level: i % 3 ? 'info' : 'debug',
            step: 'chapters',
            message: i % 3 ? `chapter ${i}: Just Chatting at ${i * 7}m` : `censor: category ${i} not in the censored list, skipped`,
            progress: null,
          }))
          return json({ items: shown(older), next_cursor: 'end', prev_cursor: null })
        }
        return json({ items: shown(events.items), next_cursor: 'end', prev_cursor: 'older' })
      }
      if (m[2] && after[m[2]]) job.state = after[m[2]]!
      if (init?.method === 'PATCH') Object.assign(job, JSON.parse(String(init.body)))
      if (m[2] === 'retry') {
        const { step, at, pause_before } = JSON.parse(String(init?.body ?? '{}'))
        Object.assign(job, { step: step ?? job.step, not_before: at ?? null, ...(pause_before ? { pause_before } : {}), finished_at: null })
      }
      return json(job)
    },
  })
}
