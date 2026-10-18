import { describe, expect, it } from 'vitest'
import {
  actorLabel,
  auditChange,
  auditFilterQuery,
  bytes,
  duration,
  jobActions,
  jobTree,
  logLines,
  progressRatio,
  progressText,
  runTime,
  scheduledFor,
  stepPosition,
  stepStates,
  subjectOf,
  timeAgo,
  type AuditOut,
  type EventOut,
  type JobOut,
  type JobState,
} from '../src'
import { mergePages } from '../src/vue/useCursorPages'
import audit from './fixtures/audit.json'
import events from './fixtures/events.json'
import jobs from './fixtures/jobs.json'

const running = jobs.items[0] as JobOut
const failed = jobs.items[1] as JobOut
const as = (state: JobState, extra: Partial<JobOut> = {}): JobOut => ({ ...running, state, ...extra })

describe('scheduledFor', () => {
  const now = Date.parse('2026-10-14T12:00:00Z')
  it('is a queued run whose start is still ahead', () => {
    expect(scheduledFor(as('queued', { not_before: '2026-10-15T07:05:00Z' }), now)).toBe('2026-10-15T07:05:00Z')
  })
  it('is null once it is due, without a start time, or for any other state', () => {
    expect(scheduledFor(as('queued', { not_before: '2026-10-14T11:59:00Z' }), now)).toBeNull()
    expect(scheduledFor(as('queued', { not_before: null }), now)).toBeNull()
    expect(scheduledFor(as('failed', { not_before: '2026-10-15T07:05:00Z' }), now)).toBeNull()
  })
})

describe('jobActions', () => {
  it('allows what vex-platform allows in each state', () => {
    const table = (['queued', 'running', 'paused', 'succeeded', 'failed', 'cancelled'] as const).map((s) => {
      const a = jobActions(as(s))
      return [s, a.pause, a.resume, a.retry, a.cancel, a.edit]
    })
    expect(table).toEqual([
      ['queued', true, false, false, true, true],
      ['running', true, false, false, true, true],
      ['paused', false, true, false, true, true],
      ['succeeded', false, false, true, false, false],
      ['failed', false, false, true, false, false],
      ['cancelled', false, false, true, false, false],
    ])
  })

  it("doesn't offer a cancel already asked for", () => {
    expect(jobActions(as('running', { cancel_requested: true })).cancel).toBe(false)
  })
})

describe('steps', () => {
  it('places a run in its steps', () => {
    expect(stepPosition(running)).toEqual({ index: 2, total: 4 })
    expect(stepPosition(as('succeeded', { step: null }))).toEqual({ index: 4, total: 4 })
    expect(stepPosition(as('queued', { step: null }))).toEqual({ index: 0, total: 4 })
  })

  it("marks each step, with the run's own pause gates or else its kind's", () => {
    expect(stepStates(running, ['publish']).map((s) => [s.name, s.status, s.pauseBefore])).toEqual([
      ['download', 'done', false],
      ['transcode', 'done', false],
      ['upload', 'running', false],
      ['publish', 'todo', true],
    ])
    expect(stepStates(failed, ['fetch']).map((s) => [s.status, s.pauseBefore])).toEqual([
      ['failed', false],
      ['todo', true],
    ])
  })
})

describe('progress and times', () => {
  it('reads progress as a ratio and as text', () => {
    expect(progressRatio({ done: 40, total: 100, unit: 'percent' })).toBe(0.4)
    expect(progressRatio({ done: 3, total: null, unit: 'items' })).toBeNull()
    expect(progressText({ done: 1288490188, total: 4294967296, unit: 'bytes' })).toBe('1.2 GB / 4 GB')
    expect(progressText({ done: 3, total: 12, unit: 'parts' })).toBe('3/12 parts')
    expect(progressText({ done: 62, total: null, unit: 'seconds' })).toBe('1m 02s')
    expect(bytes(512)).toBe('512 B')
  })

  it('formats durations and run times', () => {
    expect([duration(12), duration(185), duration(3720), duration(null)]).toEqual(['12s', '3m 05s', '1h 02m', '—'])
    expect(runTime(failed)).toBe(299)
    expect(runTime(as('queued', { started_at: null }))).toBeNull()
    expect(runTime(running, Date.parse('2026-09-30T18:00:12Z'))).toBe(10)
  })

  it('says how long ago', () => {
    const now = Date.parse('2026-09-30T18:00:00Z')
    expect(timeAgo('2026-09-30T17:59:50Z', now)).toBe('just now')
    expect(timeAgo('2026-09-30T17:00:00Z', now)).toMatch(/hour/)
    expect(timeAgo(null, now)).toBe('—')
  })

  it('keeps only the newest of each run of progress reports', () => {
    expect(logLines(events.items as EventOut[]).map((e) => e.id)).toEqual([1, 3, 4, 5])
  })
})

describe('subjects and audit', () => {
  it('splits subjects', () => {
    expect(subjectOf('vod:2551234567')).toEqual({ type: 'vod', id: '2551234567' })
    expect(subjectOf('channel:a:b')).toEqual({ type: 'channel', id: 'a:b' })
    expect([subjectOf('vod'), subjectOf(':1'), subjectOf('vod:'), subjectOf(null)]).toEqual([null, null, null, null])
  })

  it('names actors', () => {
    const [user, key, system] = audit.items as AuditOut[]
    expect([actorLabel(user!), actorLabel(key!), actorLabel(system!, 'archive')]).toEqual(['@example', 'key k7', 'archive'])
    // Only a user gets an @: a job's or the app's login (a kind name) is not one.
    const a = (actor_kind: string, actor_id: string | null, actor_login: string | null) => ({ actor_kind, actor_id, actor_login, via: 'job' })
    expect([actorLabel(a('job', '42', 'archive')), actorLabel(a('system', null, 'archive'), 'app'), actorLabel(a('user', '99', null))]).toEqual([
      'job #42',
      'app',
      '99',
    ])
  })

  it('shows what changed', () => {
    const [user, key, system] = audit.items as AuditOut[]
    expect(auditChange(user!)).toEqual({ before: '', after: '{"kind":"upload"}', detail: '' })
    expect(auditChange(key!)).toEqual({ before: 'hi', after: 'hello', detail: '' })
    expect(auditChange(system!).detail).toBe('{"reason":"title changed"}')
    expect(auditChange({ before: {}, after: null, detail: null }).before).toBe('')
  })

  it('turns the filter form into a query', () => {
    expect(auditFilterQuery({ action: ' job. ', actor: '@Someone', target: '', outcome: 'denied' })).toEqual({
      action: 'job.',
      actor: 'Someone',
      outcome: 'denied',
    })
  })
})

describe('mergePages', () => {
  it('appends older rows the polled first page no longer has', () => {
    const first = [{ id: 5 }, { id: 4 }, { id: 3 }]
    // Two rows arrived since the older page was read: it starts with rows the first page now has too.
    const older = [{ id: 3 }, { id: 2 }, { id: 1 }]
    expect(mergePages(first, older, (r) => r.id).map((r) => r.id)).toEqual([5, 4, 3, 2, 1])
  })
})

describe('jobTree', () => {
  const run = (id: number, parent_id: number | null = null) => ({ ...(jobs.items[0] as JobOut), id, parent_id })

  it('orders each run before the runs it queued, oldest first', () => {
    const rows = jobTree([run(1), run(2, 1), run(3, 2), run(4, 1), run(5, 3)], 1)
    expect(rows.map((r) => [r.job.id, r.depth])).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
      [5, 3],
      [4, 1],
    ])
  })

  it('hangs runs whose parent was cut off on the root', () => {
    expect(jobTree([run(1), run(9, 7)], 1).map((r) => [r.job.id, r.depth])).toEqual([
      [1, 0],
      [9, 1],
    ])
  })

  it('handles a lone run and runs without parent_id (older servers)', () => {
    expect(jobTree([run(4)], 4)).toHaveLength(1)
    const { parent_id: _, ...old } = run(6)
    expect(jobTree([old as JobOut], 6).map((r) => r.depth)).toEqual([0])
  })
})
