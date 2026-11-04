<script setup lang="ts">
// Recurring jobs (GET /schedules): when each next runs (cron, UTC), with Pause, Resume, Run now, Edit and Delete. A new
// schedule can be made for the kinds the app lists as schedulable. Needs vex-platform 0.10+ with jobs_sql(6) applied.
import { computed, ref } from 'vue'
import type { PlatformClient } from '../../client'
import { errorText } from '../../errors'
import { parsePayload } from '../../jobs'
import type { ScheduleOut } from '../../types'
import { usePlatformUi } from '../config'
import { usePoll } from '../usePoll'
import LoadState from './LoadState.vue'

const props = withDefaults(defineProps<{ client: PlatformClient; poll?: number }>(), { poll: 10000 })
const ui = usePlatformUi()
const { data, error, loading, refresh } = usePoll((signal) => props.client.schedules(signal), () => props.poll)
const items = computed(() => data.value?.items ?? [])
const kinds = computed(() => data.value?.kinds ?? [])

const busy = ref<string | null>(null)
async function act(key: string, run: () => Promise<unknown>, ok: string) {
  if (busy.value) return
  busy.value = key
  try {
    await run()
    ui.notify(ok, 'ok')
    await refresh()
  } catch (e) {
    ui.notify(errorText(e), 'error')
  } finally {
    busy.value = null
  }
}
function remove(s: ScheduleOut) {
  if (confirm(`Delete the schedule "${s.name}"? The runs it already made stay.`)) act(`d${s.id}`, () => props.client.deleteSchedule(s.id), 'Schedule deleted')
}

// The form: a new schedule (editing is null) or an existing one's cron, subject and payload.
const dialog = ref<HTMLDialogElement | null>(null)
const editing = ref<ScheduleOut | null>(null)
const name = ref('')
const kind = ref('')
const cron = ref('')
const subject = ref('')
const payload = ref('')
const formError = ref<string | null>(null)
const saving = ref(false)
const parsed = computed(() => parsePayload(payload.value))

function openForm(s: ScheduleOut | null) {
  editing.value = s
  name.value = s?.name ?? ''
  kind.value = s?.kind ?? kinds.value[0] ?? ''
  cron.value = s?.cron ?? '0 3 * * *'
  subject.value = s?.subject ?? ''
  payload.value = s && Object.keys(s.payload).length ? JSON.stringify(s.payload) : ''
  formError.value = null
  dialog.value?.showModal()
}
async function save() {
  if (parsed.value.error || saving.value) return
  saving.value = true
  formError.value = null
  try {
    const body = { cron: cron.value.trim(), subject: subject.value.trim() || null, payload: parsed.value.payload ?? {} }
    if (editing.value) await props.client.updateSchedule(editing.value.id, body)
    else await props.client.createSchedule({ name: name.value.trim(), kind: kind.value, ...body })
    ui.notify(editing.value ? 'Schedule saved' : 'Schedule created', 'ok')
    dialog.value?.close()
    await refresh()
  } catch (e) {
    formError.value = errorText(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="vxp-schedules">
    <div class="bar">
      <p class="vxp-small vxp-muted">All times are UTC. A paused schedule skips its turns; resuming does not run the ones it missed.</p>
      <button type="button" class="vxp-btn primary" :disabled="!kinds.length" :title="kinds.length ? '' : 'This app has no kinds that can be scheduled'" @click="openForm(null)">New schedule</button>
    </div>
    <div v-if="data && error" class="vxp-callout" role="alert">Refresh failed: {{ error }}. Showing the last known state.</div>
    <LoadState :loading="loading && !data" :error="data ? null : error" :empty="!!data && !items.length" empty-text="No schedules yet." @retry="refresh">
      <div class="vxp-table-scroll">
        <table class="vxp-table">
          <thead>
            <tr><th>Name</th><th>Kind</th><th>Cron (UTC)</th><th>Next run</th><th>Last run</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            <tr v-for="s in items" :key="s.id">
              <td>{{ s.name }}<span v-if="s.subject" class="vxp-small vxp-muted vxp-mono"> {{ s.subject }}</span></td>
              <td class="vxp-mono">{{ s.kind }}</td>
              <td class="vxp-mono">{{ s.cron }}</td>
              <td :title="s.next_run_at">{{ s.paused_at ? 'skipped while paused' : ui.timeAgo(s.next_run_at) }}</td>
              <td :title="s.last_run_at ?? ''">{{ s.last_run_at ? ui.timeAgo(s.last_run_at) : 'never' }}</td>
              <td><span class="vxp-chip" :class="s.paused_at ? 'warn' : 'ok'">{{ s.paused_at ? 'paused' : 'active' }}</span></td>
              <td class="acts">
                <button v-if="s.paused_at" type="button" class="vxp-btn sm primary" :disabled="!!busy" @click="act(`r${s.id}`, () => client.resumeSchedule(s.id), 'Schedule resumed')">Resume</button>
                <button v-else type="button" class="vxp-btn sm" :disabled="!!busy" @click="act(`p${s.id}`, () => client.pauseSchedule(s.id), 'Schedule paused')">Pause</button>
                <button type="button" class="vxp-btn sm" :disabled="!!busy" @click="act(`n${s.id}`, () => client.runSchedule(s.id), 'Run queued')">Run now</button>
                <button type="button" class="vxp-btn sm" :disabled="!!busy" @click="openForm(s)">Edit</button>
                <button type="button" class="vxp-btn sm" :disabled="!!busy" @click="remove(s)">Delete</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </LoadState>

    <dialog ref="dialog" class="vxp-dialog" aria-labelledby="vxp-sched-title">
      <h2 id="vxp-sched-title">{{ editing ? `Edit ${editing.name}` : 'New schedule' }}</h2>
      <form class="form" @submit.prevent="save">
        <label class="vxp-field">Name<input v-model="name" class="vxp-input" required :disabled="!!editing" autocomplete="off" /></label>
        <label class="vxp-field">
          Kind
          <select v-model="kind" class="vxp-input vxp-mono" :disabled="!!editing">
            <option v-if="editing" :value="editing.kind">{{ editing.kind }}</option>
            <template v-else><option v-for="k in kinds" :key="k" :value="k">{{ k }}</option></template>
          </select>
        </label>
        <label class="vxp-field">
          Cron (UTC)
          <input v-model="cron" class="vxp-input vxp-mono" required placeholder="0 3 * * *" autocomplete="off" />
          <span class="vxp-small vxp-muted">Five fields: minute hour day-of-month month day-of-week, in UTC.</span>
        </label>
        <label class="vxp-field">Subject (optional)<input v-model="subject" class="vxp-input vxp-mono" placeholder="type:id" autocomplete="off" /></label>
        <label class="vxp-field">
          Payload (JSON, optional)
          <textarea v-model="payload" class="vxp-input vxp-mono" rows="3" placeholder='{"force": true}' :aria-invalid="!!parsed.error" />
          <span v-if="parsed.error" class="vxp-field-error" role="alert">{{ parsed.error }}</span>
        </label>
        <div v-if="formError" class="vxp-callout error" role="alert">{{ formError }}</div>
        <div class="acts">
          <button type="button" class="vxp-btn" @click="dialog?.close()">Cancel</button>
          <button type="submit" class="vxp-btn primary" :disabled="!!parsed.error || saving" :aria-busy="saving">{{ editing ? 'Save' : 'Create' }}</button>
        </div>
      </form>
    </dialog>
  </section>
</template>

<style scoped>
.bar { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 12px; }
.bar p { margin: 0; }
.acts { display: flex; gap: 6px; flex-wrap: wrap; }
.form { display: flex; flex-direction: column; gap: 12px; min-width: min(420px, calc(100vw - 64px)); }
</style>
