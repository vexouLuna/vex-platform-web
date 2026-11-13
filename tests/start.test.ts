import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { PlatformClient, settledPoll, ProblemError, parsePayload, sameGates, toggleGate, type JobKindOut, type JobOut } from '../src'
import { JobsTable, LoadState, PauseGates, StartJob } from '../src/vue'
import kinds from './fixtures/job-kinds.json'
import jobs from './fixtures/jobs.json'
import vodNotFound from './fixtures/problem-vod-not-found.json'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': status < 300 ? 'application/json' : 'application/problem+json' } })
const all = kinds as JobKindOut[]
const queued = { ...(jobs.items[0] as JobOut), id: 901, state: 'queued' } as JobOut

describe('pause gates', () => {
  it('turns one step on or off and keeps the others in order', () => {
    expect(toggleGate(['publish'], 'download', true)).toEqual(['publish', 'download'])
    expect(toggleGate(['publish', 'download'], 'publish', false)).toEqual(['download'])
    expect(toggleGate(['publish'], 'publish', true)).toEqual(['publish'])
    expect(sameGates(['a', 'b'], ['b', 'a'])).toBe(true)
    expect(sameGates(['a'], [])).toBe(false)
  })

  it('PauseGates keeps steps it does not list', async () => {
    const w = mount(PauseGates, { props: { steps: ['upload', 'publish'], modelValue: ['download', 'publish'] } })
    expect(w.findAll('input').map((i) => (i.element as HTMLInputElement).checked)).toEqual([false, true])
    await w.findAll('input')[0]!.setValue(true)
    expect(w.emitted('update:modelValue')![0]).toEqual([['download', 'publish', 'upload']])
    expect(mount(PauseGates, { props: { steps: [] } }).find('fieldset').exists()).toBe(false)
  })
})

describe('parsePayload', () => {
  it('takes an object or nothing', () => {
    expect(parsePayload('  ')).toEqual({ error: null })
    expect(parsePayload('{"force": true}')).toEqual({ payload: { force: true }, error: null })
    expect(parsePayload('[1]').error).toBe('Must be a JSON object.')
    expect(parsePayload('{').error).toBe('Not valid JSON.')
  })
})

describe('StartJob', () => {
  const setup = (respond: () => Response) => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => respond())
    const client = new PlatformClient({ base: '/api/v2', fetch, csrf: () => 'tok' })
    const w = mount(StartJob, {
      attachTo: document.body,
      props: { client, kinds: all, open: true, subject: '2551234567', toSubject: (id: string) => `vod:${id}` },
      slots: { error: `<template #error="{ error, subject }">{{ error.code }} {{ subject }}</template>` },
    })
    return { fetch, w }
  }
  const sent = (fetch: ReturnType<typeof setup>['fetch']) => JSON.parse(String(fetch.mock.calls[0]![1]!.body))
  const gateBoxes = (w: ReturnType<typeof setup>['w']) => w.findAll('fieldset input')

  it("queues the first kind on its subject, leaving the kind's gates alone", async () => {
    const { fetch, w } = setup(() => json(queued, 201))
    expect(gateBoxes(w).map((i) => (i.element as HTMLInputElement).checked)).toEqual([false, false, false, true])
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(fetch.mock.calls[0]![0]).toBe('/api/v2/jobs')
    expect(fetch.mock.calls[0]![1]!.method).toBe('POST')
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).get('x-csrf-token')).toBe('tok')
    expect(sent(fetch)).toEqual({ kind: 'upload', subject: 'vod:2551234567', paused: false })
    expect(w.emitted('started')![0]).toEqual([queued])
    expect(w.emitted('update:open')![0]).toEqual([false])
    w.unmount()
  })

  it('sends its own gates, the start step and the payload when they are set', async () => {
    const { fetch, w } = setup(() => json(queued, 201))
    await w.findAll('select')[1]!.setValue('transcode')
    await gateBoxes(w)[3]!.setValue(false)
    const createPaused = w.findAll('input[type=checkbox]').find((i) => !i.element.closest('fieldset'))!
    await createPaused.setValue(true)
    await w.find('textarea').setValue('{"privacy": "private"}')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(sent(fetch)).toEqual({ kind: 'upload', subject: 'vod:2551234567', payload: { privacy: 'private' }, step: 'transcode', pause_before: [], paused: true })
    w.unmount()
  })

  it('starts the next run from a clean form', async () => {
    const { w } = setup(() => json(queued, 201))
    await w.findAll('select')[0]!.setValue(all[1]!.name)
    await w.findAll('input[type=checkbox]').find((i) => !i.element.closest('fieldset'))!.setValue(true)
    await w.find('textarea').setValue('{"force": true}')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.emitted('started')).toHaveLength(1)
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('')
    expect((w.findAll('input[type=checkbox]').find((i) => !i.element.closest('fieldset'))!.element as HTMLInputElement).checked).toBe(false)
    await flushPromises()
    expect((w.findAll('select')[0]!.element as HTMLSelectElement).value).toBe(all[0]!.name)
    w.unmount()
  })

  it("won't send a payload that isn't an object", async () => {
    const { fetch, w } = setup(() => json(queued, 201))
    await w.find('textarea').setValue('[1, 2]')
    expect(w.text()).toContain('Must be a JSON object.')
    expect(w.find('button[type=submit]').attributes('disabled')).toBeDefined()
    await w.find('form').trigger('submit')
    expect(fetch).not.toHaveBeenCalled()
    w.unmount()
  })

  it("hands a refusal to the site's #error slot, with the subject as typed", async () => {
    const { w } = setup(() => json(vodNotFound, 404))
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.find('[role=alert]').text()).toBe('vod_not_found 2551234567')
    expect(w.emitted('started')).toBeUndefined()
    w.unmount()
  })
})

describe('settledPoll', () => {
  it('keeps polling slowly once a run has settled, and leaves 0 alone', () => {
    expect(settledPoll(3000, true)).toBe(3000)
    expect(settledPoll(3000, false)).toBe(30_000)
    expect(settledPoll(5000, false)).toBe(50_000)
    expect(settledPoll(0, false)).toBe(0)
  })
})

describe('LoadState', () => {
  it('shows the error, then the skeletons, then the empty state, then the content', async () => {
    const slots = { default: '<p class="content">rows</p>' }
    const w = mount(LoadState, { props: { error: new ProblemError(404, vodNotFound), loading: true, errorTitle: "Couldn't load the VOD" }, slots })
    expect(w.find('[role=alert]').text()).toContain("Couldn't load the VOD")
    expect(w.find('[role=alert]').text()).toContain('no VOD 2345678901')
    await w.find('button').trigger('click')
    expect(w.emitted('retry')).toHaveLength(1)
    await w.setProps({ error: null })
    expect(w.findAll('.vxp-skeleton')).toHaveLength(4)
    await w.setProps({ loading: false, empty: true, emptyText: 'Nothing queued.' })
    expect(w.text()).toContain('Nothing here yet')
    expect(w.text()).toContain('Nothing queued.')
    await w.setProps({ empty: false })
    expect(w.find('.content').exists()).toBe(true)
  })
})

describe('JobsTable', () => {
  it('shows the step position only when the run has steps', () => {
    const run = { ...(jobs.items[0] as JobOut), state: 'running', step: 'download' } as JobOut
    const text = (steps: string[]) => mount(JobsTable, { props: { jobs: [{ ...run, steps }] } }).text()
    expect(text(['download', 'upload'])).toContain('1/2')
    expect(text([])).not.toContain('/0')
  })
})
