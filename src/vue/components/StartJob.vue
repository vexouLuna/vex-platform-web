<script setup lang="ts">
// The "Start a job" dialog: any kind the app knows (GET /api/v2/job-kinds), its subject, where to start, where to
// pause, and a payload. Queued with POST /api/v2/jobs; `started` gets the new run. What the subject field takes is the
// site's: `toSubject` turns what was typed into the subject (a VOD id into `vod:<id>`), and `#error` can say more
// about a refusal it knows (a subject the app doesn't have yet).
import { computed, ref, watch } from 'vue'
import type { PlatformClient } from '../../client'
import { errorText } from '../../errors'
import { parsePayload, sameGates } from '../../jobs'
import type { JobKindOut, JobOut } from '../../types'
import PauseGates from './PauseGates.vue'

const props = withDefaults(
  defineProps<{
    client: PlatformClient
    kinds: JobKindOut[]
    /** What the subject field starts with when the dialog opens. */
    subject?: string
    /** The kind picked when the dialog first opens; the first one when it isn't there. */
    defaultKind?: string
    title?: string
    subjectLabel?: string
    subjectHint?: string
    subjectHelp?: string
    /** What was typed (trimmed, never empty) into the subject sent. */
    toSubject?: (input: string) => string
  }>(),
  {
    subject: '',
    defaultKind: '',
    title: 'Start a job',
    subjectLabel: 'Subject',
    subjectHint: 'type:id',
    subjectHelp: "Empty for jobs that aren't about one thing.",
    toSubject: (input: string) => input,
  },
)
const emit = defineEmits<{ started: [job: JobOut] }>()
const open = defineModel<boolean>('open', { default: false })

const kind = ref(props.defaultKind)
const subject = ref('')
const fromStep = ref('')
const pauseBefore = ref<string[]>([])
const paused = ref(false)
const payload = ref('')
const busy = ref(false)
const error = ref<unknown>(null)
// What the refused run was about, for `#error`.
const failedSubject = ref('')

const kindInfo = computed(() => props.kinds.find((k) => k.name === kind.value))
const steps = computed(() => kindInfo.value?.steps ?? [])
const parsed = computed(() => parsePayload(payload.value))

const dialog = ref<HTMLDialogElement | null>(null)
// Immediate: the page can load with the dialog already open (`?new=1`).
watch(
  [open, dialog],
  ([v]) => {
    const d = dialog.value
    if (!v) return d?.open && d.close()
    error.value = null
    subject.value = props.subject
    if (d && !d.open) d.showModal()
  },
  { immediate: true },
)
watch(
  [kind, () => props.kinds],
  () => {
    // The kinds can arrive after the dialog opened.
    if (!kindInfo.value && props.kinds.length) kind.value = props.kinds[0]!.name
    fromStep.value = ''
    pauseBefore.value = [...(kindInfo.value?.pause_before ?? [])]
  },
  { immediate: true },
)

async function submit() {
  if (!kindInfo.value || parsed.value.error || busy.value) return
  busy.value = true
  error.value = null
  const typed = subject.value.trim()
  try {
    const job = await props.client.enqueue({
      kind: kind.value,
      subject: typed ? props.toSubject(typed) : undefined,
      payload: parsed.value.payload,
      step: fromStep.value || undefined,
      // Only when it differs from the kind's, so the run keeps following the kind's gates.
      pause_before: sameGates(pauseBefore.value, kindInfo.value.pause_before) ? undefined : pauseBefore.value,
      paused: paused.value,
    })
    open.value = false
    emit('started', job)
  } catch (e) {
    error.value = e
    failedSubject.value = typed
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <dialog ref="dialog" class="vxp-dialog vxp-start" aria-labelledby="vxp-start-title" @close="open = false">
    <h2 id="vxp-start-title">{{ title }}</h2>
    <form class="form" @submit.prevent="submit">
      <div v-if="!kinds.length" class="vxp-callout warn">Couldn't load the job kinds.</div>
      <div class="row">
        <label class="vxp-field">
          Kind
          <select v-model="kind" class="vxp-input vxp-mono" :disabled="!kinds.length">
            <option v-for="k in kinds" :key="k.name" :value="k.name">{{ k.name }}</option>
          </select>
        </label>
        <label class="vxp-field">
          {{ subjectLabel }}
          <input v-model="subject" class="vxp-input vxp-mono" :placeholder="subjectHint" autocomplete="off" />
          <span v-if="subjectHelp" class="vxp-small">{{ subjectHelp }}</span>
        </label>
      </div>
      <p v-if="kindInfo" class="vxp-small vxp-muted desc">{{ kindInfo.description || `${kindInfo.steps.length} steps` }}</p>
      <label class="vxp-field">
        Start at
        <select v-model="fromStep" class="vxp-input vxp-mono">
          <option value="">First step</option>
          <option v-for="s in steps" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
      <PauseGates v-model="pauseBefore" :steps="steps" />
      <label class="vxp-check"><input v-model="paused" type="checkbox" />Create it paused (resume it by hand)</label>
      <label class="vxp-field">
        Payload (JSON, optional)
        <textarea
          v-model="payload"
          class="vxp-input vxp-mono payload"
          rows="3"
          placeholder='{"force": true}'
          :aria-invalid="!!parsed.error"
          :aria-describedby="parsed.error ? 'vxp-start-payload' : undefined"
        />
        <span v-if="parsed.error" id="vxp-start-payload" class="vxp-small bad">{{ parsed.error }}</span>
      </label>
      <div v-if="error" class="vxp-callout error" role="alert">
        <slot name="error" :error="error" :subject="failedSubject">{{ errorText(error) }}</slot>
      </div>
      <div class="actions">
        <button type="button" class="vxp-btn" @click="open = false">Cancel</button>
        <button type="submit" class="vxp-btn primary" :disabled="!kindInfo || !!parsed.error || busy" :aria-busy="busy">Start</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
dialog.vxp-start { width: min(480px, calc(100vw - 32px)); max-width: none; box-sizing: border-box; }
.form { display: flex; flex-direction: column; gap: 12px; }
.row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.desc { margin: -4px 0 0; }
.payload { height: auto; padding: 6px 8px; resize: vertical; }
.bad { color: var(--vxp-bad); }
.actions { margin-top: 4px; }
</style>
