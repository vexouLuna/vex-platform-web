import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { PlatformClient, type JobOut } from '../src'
import { RelatedJobs } from '../src/vue'
import jobs from './fixtures/jobs.json'

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('RelatedJobs', () => {
  it('stays on the page, rows and all, when the run it is about is polled again', async () => {
    const job = jobs.items[0] as JobOut
    const child = { ...job, id: 813, kind: 'censor', parent_id: job.id, state: 'succeeded' } as JobOut
    const fetch = vi.fn(async (url: string) =>
      json(url.includes('/related') ? { root_id: job.id, items: [job, child], truncated: false } : { items: [job, child], next_cursor: null }),
    )
    const client = new PlatformClient({ base: '/api/v2', fetch })
    const w = mount(RelatedJobs, { props: { client, job }, attachTo: document.body })
    for (let i = 0; i < 3; i++) await flush()
    const rows = w.findAll('.tree li').map((r) => r.element)
    expect(rows).toHaveLength(2)
    const calls = fetch.mock.calls.length

    // A poll of the run hands over a new object for the same run, here with nothing changed that matters.
    await w.setProps({ job: { ...job, updated_at: '2026-09-30T18:42:13Z' } })
    await nextTick()
    const after = w.findAll('.tree li').map((r) => r.element)
    expect(after).toHaveLength(2)
    expect(after.every((el, i) => el === rows[i])).toBe(true)
    expect(fetch.mock.calls.length).toBe(calls)
    w.unmount()
  })
})
