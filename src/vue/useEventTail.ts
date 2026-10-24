// A run's event log, followed: the first read takes the newest page, each poll reads on from the last `next_cursor`
// and appends, and `loadOlder()` prepends the page before the oldest line held. Changing the level reads it afresh.
import { computed, shallowRef, watch } from 'vue'
import type { PlatformClient } from '../client'
import { errorText } from '../errors'
import { atLevel, logLines as visibleLines } from '../jobs'
import type { EventLevel, EventOut } from '../types'
import { usePoll } from './usePoll'

export interface EventTailOptions {
  /** Poll interval while `live()` (ms). */
  poll?: number
  /** Whether the run can still write events; once false, polling stops after one more read. */
  live?: () => boolean
  /** Lowest level read (default `info`); a change reads the log afresh. */
  minLevel?: () => EventLevel
  /** Events kept while following; the oldest are dropped past it (they can be loaded again). */
  max?: number
  /** Events per request. */
  limit?: number
}

export function useEventTail(client: PlatformClient, id: () => number, opts: EventTailOptions = {}) {
  // A run keeps at most 20,000 log lines (vex-platform 0.9), so by default nothing is dropped.
  const max = opts.max ?? 20_000
  const limit = opts.limit ?? 200
  const level = () => opts.minLevel?.() ?? 'info'
  const events = shallowRef<EventOut[]>([])
  const dropped = shallowRef(0)
  /** `before` cursor for the page older than what is held; null once the start of the log is reached. */
  const older = shallowRef<string | null>(null)
  const loadingOlder = shallowRef(false)
  let cursor: string | null = null
  let started = false
  let reading = `${id()}:${level()}`
  // An app on vex-platform before 0.9 ignores min_level, so filter here too.
  const keep = (items: EventOut[]) => items.filter((e) => atLevel(e, level()))

  const poll = usePoll(
    async (signal) => {
      const key = reading
      const run = id()
      if (!started) {
        const page = await client.eventPage(run, { tail: true, min_level: level(), limit }, signal)
        if (key !== reading) return null
        events.value = keep(page.items)
        older.value = page.prev_cursor ?? null
        cursor = page.next_cursor
        started = true
        // An app before 0.9 answers `tail` with the log's first page: read on from there as before.
        if (page.prev_cursor !== undefined || page.items.length < limit) return null
      }
      // Read until a short page: a run that wrote a lot since the last poll catches up at once.
      for (let i = 0; i < 20; i++) {
        const page = await client.eventPage(run, { cursor, min_level: level(), limit }, signal)
        if (key !== reading) return null
        // Event ids only grow; a page that overlaps what was read (a retried request) adds only the new ones.
        const last = events.value.at(-1)?.id ?? -Infinity
        const fresh = keep(page.items.filter((e) => e.id > last))
        if (fresh.length) {
          const all = [...events.value, ...fresh]
          if (all.length > max) dropped.value += all.length - max
          events.value = all.slice(-max)
        }
        cursor = page.next_cursor
        if (page.items.length < limit) break
      }
      return null
    },
    () => (opts.live?.() === false ? 0 : (opts.poll ?? 3000)),
  )

  async function loadOlder() {
    const before = older.value
    if (!before || loadingOlder.value) return
    const key = reading
    loadingOlder.value = true
    try {
      const page = await client.eventPage(id(), { before, min_level: level(), limit })
      if (key !== reading) return
      const first = events.value[0]?.id ?? Infinity
      events.value = [...keep(page.items.filter((e) => e.id < first)), ...events.value]
      older.value = page.prev_cursor ?? null
    } catch (e) {
      poll.error.value = errorText(e)
    } finally {
      loadingOlder.value = false
    }
  }

  watch([id, level], () => {
    reading = `${id()}:${level()}`
    cursor = null
    started = false
    events.value = []
    older.value = null
    dropped.value = 0
    poll.refresh()
  })

  return {
    events,
    /** Events with progress reports thinned to the newest of each run of them. */
    lines: computed(() => visibleLines(events.value)),
    /** The newest event with progress. */
    progress: computed(() => events.value.findLast((e) => e.progress) ?? null),
    /** How many old events were dropped to stay under `max`. */
    dropped,
    /** Whether older events can be loaded with `loadOlder()`. */
    hasOlder: computed(() => older.value !== null),
    loadingOlder,
    loadOlder,
    error: poll.error,
    refresh: poll.refresh,
  }
}
