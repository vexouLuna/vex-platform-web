<script setup lang="ts">
// The job queue: state tabs, kind and subject filters, the first page refreshed every few seconds and older pages on
// demand. The filters are a v-model, so the site can keep them in its URL. Ticked runs can be resumed, paused, retried
// or cancelled together; each button counts the ticked runs it applies to.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PlatformClient } from '../../client'
import { batchTargets, type BatchAction } from '../../jobs'
import type { JobKindOut, JobState } from '../../types'
import type { JobFilters } from '../types'
import { useCursorPages } from '../useCursorPages'
import { useJobBatch } from '../useJobBatch'
import JobsTable from './JobsTable.vue'

const props = withDefaults(
  defineProps<{
    client: PlatformClient
    /** Kinds for the kind filter; loaded from `/job-kinds` when not given. */
    kinds?: JobKindOut[] | null
    poll?: number
    pageSize?: number
    /** What the subject filter's placeholder says (`vod:123`). */
    subjectHint?: string
    /** Tick runs to act on several at once. */
    selectable?: boolean
  }>(),
  { kinds: null, poll: 5000, pageSize: 50, subjectHint: 'type:id', selectable: true },
)
const filters = defineModel<JobFilters>('filters', { default: () => ({ state: 'all', kind: '', subject: '' }) })

const TABS: { value: string; label: string; title?: string; states?: JobState[] }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active', title: 'queued, running, paused', states: ['queued', 'running', 'paused'] },
  { value: 'stopped', label: 'Needs attention', title: 'paused, failed, cancelled', states: ['paused', 'failed', 'cancelled'] },
  { value: 'running', label: 'Running', states: ['running'] },
  { value: 'failed', label: 'Failed', states: ['failed'] },
  { value: 'succeeded', label: 'Succeeded', states: ['succeeded'] },
]
const states = (tab: string): JobState[] | undefined =>
  TABS.find((t) => t.value === tab)?.states ?? (tab && tab !== 'all' ? [tab as JobState] : undefined)

const set = (patch: Partial<JobFilters>) => (filters.value = { ...filters.value, ...patch })

const loadedKinds = ref<JobKindOut[]>([])
const kindNames = computed(() => (props.kinds ?? loadedKinds.value).map((k) => k.name))
onMounted(async () => {
  if (props.kinds) return
  try {
    loadedKinds.value = await props.client.jobKinds()
  } catch {
    // the kind filter just stays empty; the table shows the error from its own request
  }
})

// The subject filter applies once typing stops.
const subjectDraft = ref(filters.value.subject)
let typing: ReturnType<typeof setTimeout> | undefined
watch(subjectDraft, (v) => {
  clearTimeout(typing)
  typing = setTimeout(() => set({ subject: v.trim() }), 300)
})
watch(
  () => filters.value.subject,
  (v) => {
    if (v !== subjectDraft.value.trim()) subjectDraft.value = v
  },
)
onBeforeUnmount(() => clearTimeout(typing))

const pages = useCursorPages(
  (cursor, signal) =>
    props.client.jobs(
      {
        state: states(filters.value.state),
        kind: filters.value.kind || undefined,
        subject: filters.value.subject || undefined,
        cursor,
        limit: props.pageSize,
      },
      signal,
    ),
  { poll: props.poll },
)
const selected = ref<number[]>([])
watch(
  () => [filters.value.state, filters.value.kind, filters.value.subject],
  () => {
    selected.value = []
    pages.reset()
  },
)

/** The ticked runs, as the latest refresh has them. */
const chosen = computed(() => {
  const ids = new Set(selected.value)
  return pages.items.value.filter((j) => ids.has(j.id))
})
const BATCH: { action: BatchAction; label: string; title: string }[] = [
  { action: 'resume', label: 'Resume', title: 'The paused ones' },
  { action: 'pause', label: 'Pause', title: 'The queued and running ones' },
  { action: 'retry', label: 'Retry', title: 'The finished ones: failed and cancelled from where they stopped, succeeded from the start' },
]
const cancellable = computed(() => batchTargets(chosen.value, 'cancel').length)
const batch = useJobBatch(props.client, ({ ok }) => {
  const done = new Set(ok)
  selected.value = selected.value.filter((id) => !done.has(id))
  pages.refresh()
})
const dialog = ref<HTMLDialogElement | null>(null)
function cancelChosen() {
  dialog.value?.close()
  batch.run('cancel', chosen.value)
}
// Re-running succeeded runs redoes their work (uploads too), so a batch with any asks first.
const rerun = computed(() => chosen.value.filter((j) => j.state === 'succeeded').length)
const rerunDialog = ref<HTMLDialogElement | null>(null)
function runBatch(action: BatchAction) {
  if (action === 'retry' && rerun.value) rerunDialog.value?.showModal()
  else batch.run(action, chosen.value)
}
function retryChosen() {
  rerunDialog.value?.close()
  batch.run('retry', chosen.value)
}

defineExpose({ refresh: pages.refresh })
</script>

<template>
  <div class="vxp browser">
    <div class="filters">
      <div class="vxp-tabs" role="tablist" aria-label="Job state">
        <button
          v-for="t in TABS"
          :key="t.value"
          type="button"
          role="tab"
          class="vxp-tab"
          :title="t.title"
          :aria-selected="(filters.state || 'all') === t.value"
          @click="set({ state: t.value })"
        >{{ t.label }}</button>
      </div>
      <div class="row">
        <select class="vxp-input kind" aria-label="Kind" :value="filters.kind" @change="set({ kind: ($event.target as HTMLSelectElement).value })">
          <option value="">All kinds</option>
          <option v-if="filters.kind && !kindNames.includes(filters.kind)" :value="filters.kind">{{ filters.kind }}</option>
          <option v-for="k in kindNames" :key="k" :value="k">{{ k }}</option>
        </select>
        <input v-model="subjectDraft" class="vxp-input vxp-mono subject" type="search" aria-label="Subject" :placeholder="subjectHint" />
        <span class="grow" />
        <slot name="actions" />
        <button type="button" class="vxp-btn" :aria-busy="pages.loading.value" @click="pages.refresh">Refresh</button>
      </div>
    </div>

    <div v-if="pages.error.value" class="vxp-callout error" role="alert">
      <strong>Couldn't load the jobs</strong>
      {{ pages.error.value }}
      <div><button type="button" class="vxp-btn sm retry" @click="pages.refresh">Try again</button></div>
    </div>

    <div v-if="!pages.loaded.value && !pages.error.value" aria-busy="true" class="sk">
      <div v-for="i in 6" :key="i" class="vxp-skeleton" />
    </div>
    <template v-else-if="pages.loaded.value">
      <div v-if="selectable && chosen.length" class="vxp-panel batch" role="group" aria-label="Ticked jobs">
        <span class="vxp-small count"><strong>{{ chosen.length }}</strong> ticked</span>
        <button
          v-for="b in BATCH"
          :key="b.action"
          type="button"
          class="vxp-btn sm"
          :title="b.title"
          :disabled="!!batch.busy.value || !batchTargets(chosen, b.action).length"
          :aria-busy="batch.busy.value === b.action"
          @click="runBatch(b.action)"
        >{{ b.label }} {{ batchTargets(chosen, b.action).length }}</button>
        <button
          type="button"
          class="vxp-btn sm danger"
          title="The queued, running and paused ones"
          :disabled="!!batch.busy.value || !cancellable"
          :aria-busy="batch.busy.value === 'cancel'"
          @click="dialog?.showModal()"
        >Cancel {{ cancellable }}</button>
        <span class="grow" />
        <button type="button" class="vxp-btn sm" @click="selected = []">Untick all</button>
      </div>
      <JobsTable v-model:selected="selected" :jobs="pages.items.value" :selectable="selectable" empty="No jobs match these filters." />
      <div class="more">
        <button v-if="pages.hasOlder.value" type="button" class="vxp-btn" :aria-busy="pages.loadingOlder.value" :disabled="pages.loadingOlder.value" @click="pages.loadOlder">
          Older jobs
        </button>
        <span class="vxp-muted vxp-mono vxp-small">{{ pages.items.value.length }} shown<template v-if="poll"> · refreshes every {{ Math.round(poll / 1000) }} s</template></span>
      </div>
    </template>

    <dialog ref="dialog" class="vxp-dialog" aria-labelledby="vxp-batch-cancel-title">
      <h2 id="vxp-batch-cancel-title">Cancel {{ cancellable }} job{{ cancellable === 1 ? '' : 's' }}?</h2>
      <p>Running steps stop where they are, or when they next check for a cancel. Each job can be retried later from the step it was on.</p>
      <div class="actions">
        <button type="button" class="vxp-btn" @click="dialog?.close()">Keep them</button>
        <button type="button" class="vxp-btn danger-solid" @click="cancelChosen">Cancel {{ cancellable }}</button>
      </div>
    </dialog>
    <dialog ref="rerunDialog" class="vxp-dialog" aria-labelledby="vxp-batch-rerun-title">
      <h2 id="vxp-batch-rerun-title">Rerun {{ rerun }} succeeded job{{ rerun === 1 ? '' : 's' }}?</h2>
      <p>
        {{ rerun === 1 ? 'It runs again from the first step and redoes all its work.' : 'They run again from the first step and redo all their work.' }}
        <template v-if="batchTargets(chosen, 'retry').length > rerun">The {{ batchTargets(chosen, 'retry').length - rerun }} other finished ones retry from where they stopped.</template>
      </p>
      <div class="actions">
        <button type="button" class="vxp-btn" @click="rerunDialog?.close()">Don't retry</button>
        <button type="button" class="vxp-btn primary" @click="retryChosen">Retry {{ batchTargets(chosen, 'retry').length }}</button>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.browser { display: flex; flex-direction: column; gap: 12px; }
.filters { display: flex; flex-direction: column; gap: 10px; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.kind { width: 180px; max-width: 100%; }
.subject { flex: 0 1 200px; }
.grow { flex: 1; }
.retry { margin-top: 8px; }
.batch { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 8px; position: sticky; top: 0; z-index: 1; }
.count { margin-right: 4px; }
.sk { display: flex; flex-direction: column; gap: 6px; }
.more { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 4px; }
</style>
