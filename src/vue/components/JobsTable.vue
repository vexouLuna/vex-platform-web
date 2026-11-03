<script setup lang="ts">
// Job runs, newest first: id (linked to the run's page), kind, subject, state, step and when it last changed. With
// `selectable`, a checkbox on each row and one in the header for all of them, as a v-model of ids (`selected`).
import { computed } from 'vue'
import { scheduledFor, stepPosition } from '../../jobs'
import type { JobOut } from '../../types'
import { usePlatformUi } from '../config'
import PlatformLink from './PlatformLink.vue'
import StateChip from './StateChip.vue'
import SubjectLink from './SubjectLink.vue'

const props = withDefaults(defineProps<{ jobs: JobOut[]; empty?: string; label?: string; selectable?: boolean }>(), {
  empty: 'No jobs.',
  label: 'Jobs',
  selectable: false,
})
const selected = defineModel<number[]>('selected', { default: () => [] })
const ui = usePlatformUi()

const picked = computed(() => new Set(selected.value))
const shown = computed(() => props.jobs.filter((j) => picked.value.has(j.id)).length)
const all = computed(() => props.jobs.length > 0 && shown.value === props.jobs.length)

function toggle(id: number, on: boolean) {
  selected.value = on ? [...selected.value.filter((x) => x !== id), id] : selected.value.filter((x) => x !== id)
}
function toggleAll(on: boolean) {
  const ids = new Set(props.jobs.map((j) => j.id))
  selected.value = on ? [...selected.value.filter((x) => !ids.has(x)), ...ids] : selected.value.filter((x) => !ids.has(x))
}
</script>

<template>
  <div class="vxp vxp-table-scroll">
    <table class="vxp-table jobs" :aria-label="label">
      <thead>
        <tr>
          <th v-if="selectable" class="pick">
            <input
              type="checkbox"
              aria-label="Select all shown"
              :checked="all"
              :indeterminate="shown > 0 && !all"
              :disabled="!jobs.length"
              @change="toggleAll(($event.target as HTMLInputElement).checked)"
            />
          </th>
          <th class="id">#</th>
          <th>Kind</th>
          <th>Subject</th>
          <th>State</th>
          <th>Step</th>
          <th class="right">Updated</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!jobs.length">
          <td :colspan="selectable ? 7 : 6" class="vxp-muted empty">{{ empty }}</td>
        </tr>
        <tr v-for="j in jobs" :key="j.id" :class="{ picked: selectable && picked.has(j.id) }">
          <td v-if="selectable" class="pick">
            <input
              type="checkbox"
              :aria-label="`Select job ${j.id}`"
              :checked="picked.has(j.id)"
              @change="toggle(j.id, ($event.target as HTMLInputElement).checked)"
            />
          </td>
          <td class="vxp-mono id"><PlatformLink :to="ui.jobHref(j.id)">{{ j.id }}</PlatformLink></td>
          <td class="vxp-mono">{{ j.kind }}</td>
          <td><SubjectLink :subject="j.subject" /></td>
          <td>
            <StateChip :state="j.state" :cancelling="j.cancel_requested && j.state === 'running'" :scheduled="scheduledFor(j)" />
            <div v-if="scheduledFor(j)" class="vxp-muted nowrap" :title="ui.stamp(j.not_before)">{{ ui.timeAgo(j.not_before) }}</div>
          </td>
          <td class="vxp-mono">
            <span v-if="j.state === 'succeeded'" class="vxp-muted">finished</span>
            <template v-else>
              {{ j.step ?? '—' }}
              <span v-if="stepPosition(j).total" class="vxp-muted">{{ stepPosition(j).index + 1 }}/{{ stepPosition(j).total }}</span>
            </template>
            <div v-if="j.last_error && (j.state === 'failed' || scheduledFor(j))" class="err" :title="j.last_error">{{ j.last_error }}</div>
          </td>
          <td class="vxp-muted right nowrap" :title="ui.stamp(j.updated_at)">{{ ui.timeAgo(j.updated_at) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.jobs { min-width: 40rem; }
.id { width: 64px; }
.pick { width: 28px; padding-right: 0; }
.pick input { accent-color: var(--vxp-accent); margin: 2px 0 0; width: 16px; height: 16px; cursor: pointer; }
.picked td { background: color-mix(in srgb, var(--vxp-accent) 8%, transparent); }
.right { text-align: right; }
.nowrap { white-space: nowrap; }
.empty { text-align: center; padding: 24px 10px; }
.err { color: var(--vxp-bad); font-family: var(--vxp-font); font-size: 12px; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
