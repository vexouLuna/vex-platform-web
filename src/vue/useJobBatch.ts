// Pause, resume, retry or cancel several runs at once. The API acts on one run per request, so each run the action
// applies to gets its own, a few at a time; the site's `notify` then hears once how it went.
import { ref } from 'vue'
import type { PlatformClient } from '../client'
import { errorText } from '../errors'
import { batchTargets, type BatchAction } from '../jobs'
import type { JobOut } from '../types'
import { usePlatformUi } from './config'

const CONCURRENCY = 4
const DONE: Record<BatchAction, string> = { pause: 'Pausing', resume: 'Resumed', retry: 'Retrying', cancel: 'Cancelling', dismiss: 'Dismissed' }

export interface BatchResult {
  ok: number[]
  failed: { id: number; error: string }[]
}

export function useJobBatch(client: PlatformClient, done?: (result: BatchResult) => void) {
  const ui = usePlatformUi()
  /** The action in flight, or null. */
  const busy = ref<BatchAction | null>(null)

  const call = (action: BatchAction, id: number) =>
    action === 'pause' ? client.pause(id) : action === 'resume' ? client.resume(id) : action === 'retry' ? client.retry(id) : action === 'dismiss' ? client.dismiss(id) : client.cancel(id)

  /** Sends `action` to each of `jobs` it applies to; the rest are left alone. */
  async function run(action: BatchAction, jobs: readonly Pick<JobOut, 'id' | 'state' | 'cancel_requested' | 'dismissed_at'>[]): Promise<BatchResult | null> {
    const ids = batchTargets(jobs, action).map((j) => j.id)
    if (busy.value || !ids.length) return null
    busy.value = action
    const result: BatchResult = { ok: [], failed: [] }
    try {
      let next = 0
      const worker = async () => {
        while (next < ids.length) {
          const id = ids[next++]!
          try {
            await call(action, id)
            result.ok.push(id)
          } catch (e) {
            result.failed.push({ id, error: errorText(e) })
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker))
    } finally {
      busy.value = null
    }
    const n = (k: number) => `${k} job${k === 1 ? '' : 's'}`
    const first = result.failed[0]
    ui.notify(
      first
        ? `${DONE[action]} ${result.ok.length} of ${n(ids.length)}. #${first.id}: ${first.error}${result.failed.length > 1 ? ` (and ${result.failed.length - 1} more)` : ''}`
        : `${DONE[action]} ${n(ids.length)}`,
      first ? 'error' : 'ok',
    )
    done?.(result)
    return result
  }

  return { busy, run }
}
