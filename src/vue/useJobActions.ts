// Pause, resume, retry, cancel and edit a run, one at a time, telling the user how it went through the site's `notify`.
import { ref } from 'vue'
import type { PlatformClient } from '../client'
import { errorText } from '../errors'
import type { JobOut, JobUpdate } from '../types'
import { usePlatformUi } from './config'

export type JobAction = 'pause' | 'resume' | 'once' | 'retry' | 'cancel' | 'update'

export function useJobActions(client: PlatformClient, done?: (job: JobOut) => void) {
  const ui = usePlatformUi()
  /** The action in flight, or null. */
  const busy = ref<JobAction | null>(null)
  const error = ref<string | null>(null)

  async function act(name: JobAction, run: () => Promise<JobOut>, ok: string): Promise<JobOut | null> {
    if (busy.value) return null
    busy.value = name
    try {
      const job = await run()
      error.value = null
      ui.notify(ok, 'ok')
      done?.(job)
      return job
    } catch (e) {
      error.value = errorText(e)
      ui.notify(error.value, 'error')
      return null
    } finally {
      busy.value = null
    }
  }

  return {
    busy,
    error,
    pause: (id: number) => act('pause', () => client.pause(id), 'Pausing'),
    resume: (id: number) => act('resume', () => client.resume(id), 'Resumed'),
    /** Run the next step, then pause again. */
    once: (id: number) => act('once', () => client.resume(id, true), 'Running one step'),
    retry: (id: number, step?: string | null, opts: { at?: string | null; pause_before?: string[] } = {}) =>
      act('retry', () => client.retry(id, step, opts), `${opts.at ? 'Scheduled a retry' : 'Retrying'}${step ? ` from ${step}` : ''}`),
    cancel: (id: number) => act('cancel', () => client.cancel(id), 'Cancelling'),
    update: (id: number, patch: JobUpdate, ok = 'Saved') => act('update', () => client.updateJob(id, patch), ok),
  }
}
