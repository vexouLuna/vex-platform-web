// What a site needs to show a job run: which actions apply, where it is in its steps, its progress.
import { bytes } from './format'
import type { EventOut, JobOut, JobState, Progress } from './types'

export type Tone = 'default' | 'accent' | 'ok' | 'warn' | 'bad'

export const STATE_TONE: Record<JobState, Tone> = {
  queued: 'default',
  running: 'accent',
  paused: 'warn',
  succeeded: 'ok',
  failed: 'bad',
  cancelled: 'default',
}

export const isActive = (state: JobState): boolean => state === 'queued' || state === 'running' || state === 'paused'

/**
 * When a queued run is due to start, if that is still ahead: a retry backoff, or a step that put itself off to a set
 * time (vex-platform's `StepDeferred`, such as a daily quota). Null for anything else.
 */
export function scheduledFor(job: Pick<JobOut, 'state' | 'not_before'>, now = Date.now()): string | null {
  return job.state === 'queued' && job.not_before && Date.parse(job.not_before) > now ? job.not_before : null
}

/** The actions vex-platform accepts for a run in its state (anything else is a 409 `job_conflict`). */
export function jobActions(job: Pick<JobOut, 'state' | 'cancel_requested'>) {
  return {
    pause: job.state === 'queued' || job.state === 'running',
    resume: job.state === 'paused',
    /** Any finished run (vex-platform 0.7+ for a succeeded one), from a step of its choice, now or later. */
    retry: !isActive(job.state),
    // A cancel already asked for is waiting on a cooperative step; asking again changes nothing.
    cancel: isActive(job.state) && !job.cancel_requested,
    /** Pause gates and pause-next can be changed while the run is active. */
    edit: isActive(job.state),
  }
}

export type BatchAction = 'pause' | 'resume' | 'retry' | 'cancel'

/** The runs among `jobs` that `action` applies to in their state; sending it to the others would be a 409. */
export function batchTargets<J extends Pick<JobOut, 'state' | 'cancel_requested'>>(jobs: readonly J[], action: BatchAction): J[] {
  // A batch retry is for runs that didn't finish: re-running succeeded ones is a choice made one run at a time.
  return jobs.filter((j) => jobActions(j)[action] && !(action === 'retry' && j.state === 'succeeded'))
}

/** Where a run is in its steps: 0-based index of the current step, and the total. */
export function stepPosition(job: Pick<JobOut, 'state' | 'step' | 'steps'>): { index: number; total: number } {
  const total = job.steps.length
  if (job.state === 'succeeded') return { index: total, total }
  const i = job.step ? job.steps.indexOf(job.step) : -1
  return { index: i < 0 ? 0 : i, total }
}

export type StepStatus = 'done' | 'todo' | JobState

/**
 * The state of each step, for a step list. `pauseBefore` is the run's own gates, or `kindPauseBefore` (its kind's)
 * when the run has none of its own.
 */
export function stepStates(job: Pick<JobOut, 'state' | 'step' | 'steps' | 'pause_before'>, kindPauseBefore: readonly string[] = []) {
  const { index } = stepPosition(job)
  const gates = job.pause_before ?? kindPauseBefore
  return job.steps.map((name, i) => ({
    name,
    status: (i < index ? 'done' : i > index ? 'todo' : job.state === 'succeeded' ? 'done' : job.state) as StepStatus,
    pauseBefore: gates.includes(name),
  }))
}

/** Progress as 0..1, or null when it has no total. */
export function progressRatio(p: Progress | null | undefined): number | null {
  if (!p) return null
  if (p.unit === 'percent') return Math.min(1, Math.max(0, p.done / 100))
  return p.total ? Math.min(1, Math.max(0, p.done / p.total)) : null
}

/** "42%", "1.2 GB / 3.4 GB", "3/12 parts". */
export function progressText(p: Progress): string {
  if (p.unit === 'percent') return `${Math.round(p.done)}%`
  if (p.unit === 'bytes') return p.total ? `${bytes(p.done)} / ${bytes(p.total)}` : bytes(p.done)
  if (p.unit === 'seconds') return p.total ? `${duration(p.done)} / ${duration(p.total)}` : duration(p.done)
  return p.total ? `${p.done}/${p.total} ${p.unit}` : `${p.done} ${p.unit}`
}

/** Seconds → "1h 02m", "3m 05s", "12s". */
export function duration(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return '—'
  const t = Math.max(0, Math.round(s))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = t % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}h ${pad(m)}m` : m ? `${m}m ${pad(sec)}s` : `${sec}s`
}

/** How long a run has taken: started → finished, or → now while it's going. Null before it started. */
export function runTime(job: Pick<JobOut, 'started_at' | 'finished_at'>, now = Date.now()): number | null {
  if (!job.started_at) return null
  const end = job.finished_at ? Date.parse(job.finished_at) : now
  return (end - Date.parse(job.started_at)) / 1000
}

/**
 * Log lines to show: progress reports only as the newest one of each unbroken run of them in a step (uploads report
 * every percent).
 */
export function logLines(events: readonly EventOut[]): EventOut[] {
  return events.filter((e, i, all) => !e.progress || !all[i + 1]?.progress || all[i + 1]!.step !== e.step)
}

/** `vod:123` → `{type: 'vod', id: '123'}`; null when it isn't `type:id`. */
export function subjectOf(subject: string | null | undefined): { type: string; id: string } | null {
  const i = subject ? subject.indexOf(':') : -1
  if (!subject || i <= 0 || i === subject.length - 1) return null
  return { type: subject.slice(0, i), id: subject.slice(i + 1) }
}

export interface TreeRow {
  job: JobOut
  /** 0 for the root, 1 for the runs it queued, and so on. */
  depth: number
}

/**
 * A run tree (`GET /jobs/{id}/related`) as rows in reading order: each run, then the runs it queued, oldest first.
 * Runs whose parent isn't in the list (cut off by the limit) hang off the root.
 */
export function jobTree(items: readonly JobOut[], rootId: number): TreeRow[] {
  const ids = new Set(items.map((j) => j.id))
  const children = new Map<number, JobOut[]>()
  for (const j of [...items].sort((a, b) => a.id - b.id)) {
    if (j.id === rootId) continue
    const parent = j.parent_id != null && ids.has(j.parent_id) ? j.parent_id : rootId
    children.set(parent, [...(children.get(parent) ?? []), j])
  }
  const rows: TreeRow[] = []
  const seen = new Set<number>()
  const walk = (job: JobOut, depth: number) => {
    if (seen.has(job.id)) return
    seen.add(job.id)
    rows.push({ job, depth })
    for (const c of children.get(job.id) ?? []) walk(c, depth + 1)
  }
  const root = items.find((j) => j.id === rootId)
  if (root) walk(root, 0)
  else for (const c of children.get(rootId) ?? []) walk(c, 0)
  return rows
}
