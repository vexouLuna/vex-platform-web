import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { PlatformClient, batchTargets, type JobOut, type JobState } from '../src'
import { createPlatformUi, useJobBatch, type BatchResult } from '../src/vue'
import jobs from './fixtures/jobs.json'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/problem+json' } })
const base = jobs.items[0] as JobOut
const job = (id: number, state: JobState, extra: Partial<JobOut> = {}): JobOut => ({ ...base, id, state, ...extra })

describe('batchTargets', () => {
  it('keeps the runs the action applies to', () => {
    const runs = [job(1, 'paused'), job(2, 'running'), job(3, 'running', { cancel_requested: true }), job(4, 'failed'), job(5, 'succeeded')]
    expect(batchTargets(runs, 'resume').map((j) => j.id)).toEqual([1])
    expect(batchTargets(runs, 'pause').map((j) => j.id)).toEqual([2, 3])
    expect(batchTargets(runs, 'cancel').map((j) => j.id)).toEqual([1, 2])
    expect(batchTargets(runs, 'retry').map((j) => j.id)).toEqual([4, 5])
  })
})

describe('useJobBatch', () => {
  it('sends the action to each run it applies to and reports once', async () => {
    const fetch = vi.fn(async (url: string, _init?: RequestInit) =>
      url.includes('/jobs/3/') ? json({ title: 'Conflict', status: 409, detail: 'job 3 is not paused' }, 409) : json(base),
    )
    const notify = vi.fn()
    let batch!: ReturnType<typeof useJobBatch>
    const done = vi.fn((_r: BatchResult) => {})
    const app = createApp(defineComponent({ setup: () => ((batch = useJobBatch(new PlatformClient({ base: '/api/v2', fetch }), done)), () => h('div')) }))
    app.use(createPlatformUi({ notify }))
    app.mount(document.createElement('div'))

    const result = await batch.run('resume', [job(1, 'paused'), job(2, 'paused'), job(3, 'paused'), job(4, 'failed')])
    expect(fetch.mock.calls.map((c) => [String(c[0]), c[1]!.method]).sort()).toEqual([
      ['/api/v2/jobs/1/resume', 'POST'],
      ['/api/v2/jobs/2/resume', 'POST'],
      ['/api/v2/jobs/3/resume', 'POST'],
    ])
    expect(result!.ok.sort()).toEqual([1, 2])
    expect(result!.failed.map((f) => f.id)).toEqual([3])
    expect(notify).toHaveBeenCalledOnce()
    expect(notify.mock.calls[0]![0]).toMatch(/^Resumed 2 of 3 jobs\. #3: /)
    expect(notify.mock.calls[0]![1]).toBe('error')
    expect(done).toHaveBeenCalledWith(result)
    expect(batch.busy.value).toBeNull()

    expect(await batch.run('retry', [job(1, 'paused')])).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(3)
    app.unmount()
  })
})
