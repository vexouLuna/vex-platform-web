<script setup lang="ts">
import { ref } from 'vue'
import { LoadState, PauseGates, StartJob } from '../src/vue'
import { errorText, ProblemError, type JobKindOut, type JobOut } from '../src'
import kinds from '../tests/fixtures/job-kinds.json'
import { fixtureClient } from './fixtureClient'

const client = fixtureClient()
const all = kinds as JobKindOut[]
const open = ref(true)
const started = ref<JobOut | null>(null)
const gates = ref<string[]>(['publish'])
const failing = ref<Error | null>(new Error('HTTP 502 Bad Gateway'))
const missing = (e: unknown) => e instanceof ProblemError && e.code === 'vod_not_found'
const vodSubject = (id: string) => `vod:${id}`
</script>

<template>
  <Story title="Start a job" :layout="{ type: 'single', iframe: true }">
    <Variant title="Start dialog">
      <div class="vxp story-frame">
        <button type="button" class="vxp-btn primary" @click="open = true">Start a job</button>
        <p v-if="started" class="vxp-small">Started job #{{ started.id }} ({{ started.kind }}, {{ started.state }}).</p>
        <p class="vxp-small vxp-muted">A VOD id ending in 404 shows the site's own refusal message.</p>
        <StartJob
          v-model:open="open"
          :client="client"
          :kinds="all"
          subject="2551234567"
          subject-label="VOD id"
          subject-hint="2345678901"
          subject-help="Empty for jobs that aren't about one VOD."
          :to-subject="vodSubject"
          @started="started = $event"
        >
          <template #error="{ error, subject }">
            <template v-if="missing(error)">VOD {{ subject }} isn't in the archive yet. Add it first.</template>
            <template v-else>{{ errorText(error) }}</template>
          </template>
        </StartJob>
      </div>
    </Variant>
    <Variant title="Start dialog: no kinds">
      <div class="vxp story-frame"><StartJob :open="true" :client="client" :kinds="[]" /></div>
    </Variant>
    <Variant title="Pause gates">
      <div class="vxp story-frame">
        <PauseGates v-model="gates" :steps="all[0]!.steps" />
        <p class="vxp-small vxp-mono">{{ JSON.stringify(gates) }}</p>
      </div>
    </Variant>
    <Variant title="Load state">
      <div class="vxp story-frame grid">
        <LoadState :error="failing" error-title="Couldn't load the jobs" @retry="failing = null" />
        <LoadState loading :rows="3" />
        <LoadState empty empty-title="No jobs yet" empty-text="Runs show up here once something queues one." />
        <LoadState><p>The content, once there's data.</p></LoadState>
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
.grid { display: grid; gap: 24px; align-content: start; }
</style>
