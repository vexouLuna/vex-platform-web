<script setup lang="ts">
// One run: what it is, its steps (with pause gates), progress, payload, controls and log. Polls the run and follows
// its events while it can still change.
import { computed, ref, watch } from 'vue'
import { auditActor } from '../../audit'
import type { PlatformClient } from '../../client'
import { EVENT_LEVELS, duration, isActive, jobActions, progressRatio, progressText, runTime, scheduledFor, stepStates } from '../../jobs'
import type { EventLevel, JobKindOut, JobOut } from '../../types'
import { usePlatformUi } from '../config'
import { useEventTail } from '../useEventTail'
import { useJobActions } from '../useJobActions'
import { usePoll } from '../usePoll'
import ActorRef from './ActorRef.vue'
import JobEventLog from './JobEventLog.vue'
import PlatformLink from './PlatformLink.vue'
import RelatedJobs from './RelatedJobs.vue'
import StateChip from './StateChip.vue'
import SubjectLink from './SubjectLink.vue'

const props = withDefaults(
  defineProps<{
    client: PlatformClient
    id: number
    /** The kinds, for the run's description, cancel mode and default pause gates; loaded when not given. */
    kinds?: JobKindOut[] | null
    poll?: number
    /** Show the runs around this one (its tree, other runs on its subject). */
    related?: boolean
  }>(),
  { kinds: null, poll: 3000, related: true },
)
const emit = defineEmits<{ loaded: [job: JobOut] }>()
const ui = usePlatformUi()

// Polled until the run stops; a retry or resume (through the actions here) refreshes it and polling starts again.
let stopped = false
const {
  data: job,
  error,
  refresh,
} = usePoll<JobOut>(
  async (signal) => {
    const j = await props.client.job(props.id, signal)
    stopped = !isActive(j.state)
    return j
  },
  (): number => (stopped ? 0 : props.poll),
)
// The log's lowest level shown; debug lines (what a check found, what was skipped) only when asked for.
const level = ref<EventLevel>('info')
const tail = useEventTail(props.client, () => props.id, {
  poll: props.poll,
  live: () => !job.value || isActive(job.value.state),
  minLevel: () => level.value,
})
watch(
  () => props.id,
  () => {
    job.value = null
    refresh()
  },
)
watch(
  () => job.value?.state,
  (now, before) => {
    if (job.value) emit('loaded', job.value)
    // One more read of the log once a run stops; and polling again if a retry brings it back.
    if (before && now !== before) tail.refresh()
  },
)

const loadedKinds = ref<JobKindOut[] | null>(null)
const kindInfo = computed(() => (props.kinds ?? loadedKinds.value ?? []).find((k) => k.name === job.value?.kind) ?? null)
watch(
  () => job.value?.kind,
  async (k) => {
    if (!k || props.kinds || loadedKinds.value) return
    try {
      loadedKinds.value = await props.client.jobKinds()
    } catch {
      loadedKinds.value = []
    }
  },
)

const actions = computed(() => (job.value ? jobActions(job.value) : null))
const steps = computed(() => (job.value ? stepStates(job.value, kindInfo.value?.pause_before) : []))
const gates = computed(() => job.value?.pause_before ?? kindInfo.value?.pause_before ?? [])
const progress = computed(() => (job.value?.state === 'running' ? (tail.progress.value?.progress ?? null) : null))
const progressStep = computed(() => tail.progress.value?.step ?? null)
const ratio = computed(() => progressRatio(progress.value))
const payloadText = computed(() => (job.value && Object.keys(job.value.payload ?? {}).length ? JSON.stringify(job.value.payload, null, 2) : null))
const took = computed(() => (job.value ? runTime(job.value) : null))

const run = useJobActions(props.client, (j) => {
  job.value = j
  stopped = !isActive(j.state)
  refresh()
  tail.refresh()
})
const busy = run.busy

function togglePause(step: string, on: boolean) {
  const next = on ? [...gates.value, step] : gates.value.filter((s) => s !== step)
  run.update(props.id, { pause_before: next }, on ? `Will pause before ${step}` : `Won't pause before ${step}`)
}
const useKindGates = () => run.update(props.id, { pause_before: null }, "Using the kind's pause steps")
const togglePauseNext = (on: boolean) =>
  run.update(props.id, { pause_next: on }, on ? 'Will pause after this step' : "Won't pause after this step")

// A retry: from a step (where it stopped; the first one for a succeeded run), now or later, with its own pause steps.
const retryStep = ref('')
watch(
  () => [job.value?.step, job.value?.state],
  () => (retryStep.value = (job.value?.state === 'succeeded' ? null : job.value?.step) ?? job.value?.steps[0] ?? ''),
  { immediate: true },
)
const RETRY_IN: [string, number][] = [['now', 0], ['in 15 min', 15], ['in 1 hour', 60], ['in 6 hours', 360], ['in 1 day', 1440]]
const retryIn = ref(0) // minutes; -1: at the time in retryAt
const retryAt = ref('') // <input type="datetime-local">: the viewer's local time
const retryGates = ref<string[] | null>(null) // null: leave the run's pause steps as they are
const retrySteps = computed(() => (job.value ? job.value.steps.slice(Math.max(0, job.value.steps.indexOf(retryStep.value))) : []))
const retryGated = (step: string) => (retryGates.value ?? gates.value).includes(step)
function toggleRetryGate(step: string, on: boolean) {
  const now = retryGates.value ?? [...gates.value]
  retryGates.value = on ? [...now, step] : now.filter((s) => s !== step)
}
function retry() {
  const at =
    retryIn.value === -1 ? (retryAt.value ? new Date(retryAt.value).toISOString() : null) : retryIn.value ? new Date(Date.now() + retryIn.value * 60_000).toISOString() : null
  if (retryIn.value === -1 && !at) return ui.notify('Pick when to retry', 'error')
  run.retry(props.id, retryStep.value || null, { at, ...(retryGates.value ? { pause_before: retryGates.value } : {}) })
  retryGates.value = null
}

const dialog = ref<HTMLDialogElement | null>(null)
function cancel() {
  dialog.value?.close()
  run.cancel(props.id)
}

defineExpose({ refresh })
</script>

<template>
  <div class="vxp detail">
    <div v-if="error && !job" class="vxp-callout error" role="alert">
      <strong>Couldn't load this job</strong>
      {{ error }}
      <div><button type="button" class="vxp-btn sm retry-load" @click="refresh">Try again</button></div>
    </div>
    <div v-else-if="!job" aria-busy="true" class="sk"><div class="vxp-skeleton" style="height: 120px" /><div class="vxp-skeleton" style="height: 240px" /></div>

    <template v-else>
      <div v-if="error" class="vxp-callout warn">Refresh failed: {{ error }}. Showing the last known state.</div>

      <div class="actions">
        <button v-if="actions?.resume" type="button" class="vxp-btn primary" :disabled="!!busy" :aria-busy="busy === 'resume'" @click="run.resume(id)">Resume</button>
        <button v-if="actions?.resume" type="button" class="vxp-btn" :disabled="!!busy" :aria-busy="busy === 'once'" @click="run.once(id)">Run one step</button>
        <button v-if="actions?.pause" type="button" class="vxp-btn" :disabled="!!busy" :aria-busy="busy === 'pause'" @click="run.pause(id)">Pause</button>
        <template v-if="actions?.retry">
          <select v-model="retryStep" class="vxp-input vxp-mono" aria-label="Retry from step" :disabled="!!busy">
            <option v-for="s in job.steps" :key="s" :value="s">from {{ s }}</option>
          </select>
          <select v-model.number="retryIn" class="vxp-input" aria-label="When to retry" :disabled="!!busy">
            <option v-for="[label, min] in RETRY_IN" :key="min" :value="min">{{ label }}</option>
            <option :value="-1">at a time…</option>
          </select>
          <input v-if="retryIn === -1" v-model="retryAt" type="datetime-local" class="vxp-input" aria-label="Retry at" :disabled="!!busy" />
          <button type="button" class="vxp-btn primary" :disabled="!!busy" :aria-busy="busy === 'retry'" @click="retry">{{ retryIn ? 'Schedule retry' : 'Retry' }}</button>
        </template>
        <button v-if="actions?.cancel" type="button" class="vxp-btn danger" :disabled="!!busy" :aria-busy="busy === 'cancel'" @click="dialog?.showModal()">Cancel</button>
        <slot name="actions" :job="job" />
      </div>
      <fieldset v-if="actions?.retry && retrySteps.length" class="retry-gates vxp-small">
        <legend class="vxp-muted">The retry pauses before</legend>
        <label v-for="s in retrySteps" :key="s" class="vxp-check">
          <input type="checkbox" :checked="retryGated(s)" :disabled="!!busy" @change="toggleRetryGate(s, ($event.target as HTMLInputElement).checked)" />
          <span class="vxp-mono">{{ s }}</span>
        </label>
      </fieldset>

      <div class="summary vxp-panel">
        <dl>
          <div><dt>State</dt><dd><StateChip :state="job.state" :cancelling="job.cancel_requested && isActive(job.state)" :scheduled="scheduledFor(job)" /></dd></div>
          <div><dt>Kind</dt><dd class="vxp-mono" :title="kindInfo?.description">{{ job.kind }}</dd></div>
          <div><dt>Subject</dt><dd><SubjectLink :subject="job.subject" /><slot name="subject" :job="job" /></dd></div>
          <div><dt>Attempts</dt><dd class="vxp-mono">{{ job.attempts }}<template v-if="kindInfo?.max_attempts"> / {{ kindInfo.max_attempts }}</template></dd></div>
          <div v-if="!job.parent_id"><dt>Started by</dt><dd><ActorRef :actor="auditActor(job.actor)" /></dd></div>
          <div><dt>Created</dt><dd :title="ui.stamp(job.created_at)">{{ ui.timeAgo(job.created_at) }}</dd></div>
          <div v-if="job.started_at"><dt>Started</dt><dd :title="ui.stamp(job.started_at)">{{ ui.timeAgo(job.started_at) }}</dd></div>
          <div v-if="job.finished_at"><dt>Finished</dt><dd :title="ui.stamp(job.finished_at)">{{ ui.timeAgo(job.finished_at) }}</dd></div>
          <div v-if="took !== null"><dt>{{ job.finished_at ? 'Took' : 'Running for' }}</dt><dd class="vxp-mono">{{ duration(took) }}</dd></div>
          <div v-if="job.parent_id"><dt>Queued by</dt><dd class="vxp-mono"><PlatformLink :to="ui.jobHref(job.parent_id)">job #{{ job.parent_id }}</PlatformLink></dd></div>
          <div v-if="job.not_before && job.state === 'queued'"><dt>Starts</dt><dd :title="ui.stamp(job.not_before)">{{ ui.timeAgo(job.not_before) }}</dd></div>
        </dl>
        <p v-if="kindInfo?.description" class="desc vxp-muted">{{ kindInfo.description }}</p>
        <p v-if="job.cancel_requested && isActive(job.state)" class="vxp-callout warn">
          Cancel asked for. This kind stops when its running step next checks, so it can take a while.
        </p>
        <div v-if="job.last_error" class="vxp-callout" :class="job.state === 'failed' ? 'error' : 'warn'">
          <strong>Last error</strong>
          <pre class="error-text">{{ job.last_error }}</pre>
        </div>
      </div>

      <div class="cols">
        <section>
          <h2 class="vxp-eyebrow">Steps</h2>
          <ol class="steps vxp-panel">
            <li v-for="s in steps" :key="s.name" :class="`is-${s.status}`">
              <span class="mark" aria-hidden="true">{{ s.status === 'done' ? '✓' : s.status === 'todo' ? '·' : '▶' }}</span>
              <span class="name vxp-mono">{{ s.name }}</span>
              <StateChip v-if="s.status !== 'done' && s.status !== 'todo'" :state="s.status" />
              <label v-if="s.status === 'todo' && actions?.edit" class="vxp-check pb">
                <input type="checkbox" :checked="s.pauseBefore" :disabled="!!busy" @change="togglePause(s.name, ($event.target as HTMLInputElement).checked)" />
                pause before
              </label>
            </li>
          </ol>
          <p v-if="actions?.edit && job.pause_before" class="vxp-small gates">
            Custom pause steps.
            <button type="button" class="vxp-btn sm" :disabled="!!busy" @click="useKindGates">Use the kind's</button>
          </p>
          <label v-if="job.state === 'running'" class="vxp-check pause-next">
            <input type="checkbox" :checked="job.pause_next" :disabled="!!busy" @change="togglePauseNext(($event.target as HTMLInputElement).checked)" />
            Pause after the current step
          </label>
          <div v-if="progress" class="progress">
            <div class="vxp-mono vxp-small">{{ progressStep ?? 'progress' }} · {{ progressText(progress) }}</div>
            <div
              class="vxp-progress"
              :class="{ indeterminate: ratio === null }"
              role="progressbar"
              :aria-label="`${progressStep ?? 'Progress'}: ${progressText(progress)}`"
              :aria-valuenow="ratio === null ? undefined : Math.round(ratio * 100)"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <span :style="ratio === null ? undefined : { width: `${ratio * 100}%` }" />
            </div>
          </div>
          <template v-if="payloadText">
            <h2 class="vxp-eyebrow">Payload</h2>
            <pre class="payload vxp-panel vxp-mono">{{ payloadText }}</pre>
          </template>
        </section>

        <section>
          <div class="log-head">
            <h2 class="vxp-eyebrow">Log</h2>
            <label class="vxp-small">
              Level
              <select v-model="level" class="vxp-input" aria-label="Lowest log level shown">
                <option v-for="l in EVENT_LEVELS" :key="l" :value="l">{{ l }}{{ l === 'error' ? '' : ' and up' }}</option>
              </select>
            </label>
          </div>
          <JobEventLog
            :lines="tail.lines.value"
            :error="tail.error.value"
            :dropped="tail.dropped.value"
            :has-older="tail.hasOlder.value"
            :loading-older="tail.loadingOlder.value"
            @older="tail.loadOlder"
            :empty="isActive(job.state) ? 'No log lines yet.' : 'This job wrote no log lines.'"
          />
        </section>
      </div>

      <RelatedJobs v-if="related" :client="client" :job="job" :poll="poll" />
    </template>

    <dialog ref="dialog" class="vxp-dialog" aria-labelledby="vxp-cancel-title">
      <h2 id="vxp-cancel-title">Cancel this job?</h2>
      <p v-if="kindInfo?.cancel_mode === 'cooperative'">
        The running step stops when it next checks for a cancel. You can retry the job later from the step it was on.
      </p>
      <p v-else>A running step is stopped where it is. You can retry the job later from the step it was on.</p>
      <div class="actions">
        <button type="button" class="vxp-btn" @click="dialog?.close()">Keep it</button>
        <button type="button" class="vxp-btn danger-solid" @click="cancel">Cancel job</button>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.detail { display: flex; flex-direction: column; gap: 16px; container-type: inline-size; }
.sk { display: flex; flex-direction: column; gap: 12px; }
.retry-load { margin-top: 8px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.retry-gates { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: -8px 0 0; padding: 0; border: 0; }
.retry-gates legend { float: left; margin-right: 6px; }
.summary { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
dl { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px 16px; margin: 0; }
dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--vxp-muted); margin-bottom: 2px; }
dd { margin: 0; overflow-wrap: anywhere; }
.desc { margin: 0; font-size: 13px; }
.summary p.vxp-callout { margin: 0; }
.error-text { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 12px; font-family: var(--vxp-mono); }
.cols { display: grid; grid-template-columns: minmax(0, 320px) minmax(0, 1fr); gap: 20px; }
@container (max-width: 760px) { .cols { grid-template-columns: minmax(0, 1fr); } }
h2 { margin: 0 0 8px; }
.log-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; }
.log-head label { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; color: var(--vxp-muted); }
.steps { list-style: none; margin: 0 0 10px; padding: 6px 0; }
.steps li { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; padding: 6px 12px; }
.mark { width: 14px; text-align: center; }
.name { flex: 1 1 auto; }
.is-done { opacity: 0.55; }
.is-running .mark, .is-paused .mark { color: var(--vxp-accent); }
.is-failed .mark { color: var(--vxp-bad); }
.pb { font-size: 12px; }
.gates { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; color: var(--vxp-muted); }
.pause-next { margin-bottom: 12px; }
.progress { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.payload { margin: 0; padding: 10px 12px; font-size: 12px; overflow: auto; }
</style>
