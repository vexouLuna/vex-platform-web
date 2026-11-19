<script setup lang="ts">
// The runs around one run: the tree it is in (who queued whom, from GET /jobs/{id}/related) as an indented list, and
// other runs on the same subject. Polled while any of them can still change; servers before vex-platform 0.6 have no
// tree, and that section just doesn't show.
import { computed, watch } from 'vue'
import type { PlatformClient } from '../../client'
import { isActive, jobTree } from '../../jobs'
import type { JobOut, RelatedOut } from '../../types'
import { usePlatformUi } from '../config'
import { usePoll } from '../usePoll'
import PlatformLink from './PlatformLink.vue'
import StateChip from './StateChip.vue'
import SubjectLink from './SubjectLink.vue'

const props = withDefaults(
  defineProps<{
    client: PlatformClient
    job: JobOut
    poll?: number
    /** Most runs to show in the tree. */
    limit?: number
    /** Most other runs on the same subject to show. */
    sameSubject?: number
  }>(),
  { poll: 3000, limit: 200, sameSubject: 10 },
)
const ui = usePlatformUi()

const anyActive = (runs: readonly JobOut[] | undefined) => !!runs?.some((j) => j.id !== props.job.id && isActive(j.state))

let treeActive = false
const { data: related, refresh: refreshTree } = usePoll<RelatedOut>(
  async (signal): Promise<RelatedOut> => {
    const r = await props.client.related(props.job.id, props.limit, signal)
    treeActive = anyActive(r.items)
    return r
  },
  (): number => (treeActive ? props.poll : 0),
)
let subjectActive = false
const { data: subjectPage, refresh: refreshSubject } = usePoll<JobOut[]>(
  async (signal): Promise<JobOut[]> => {
    const s = props.job.subject
    const items = s ? (await props.client.jobs({ subject: s, limit: props.sameSubject + 1 }, signal)).items : []
    subjectActive = anyActive(items)
    return items
  },
  (): number => (subjectActive ? props.poll : 0),
)
// Two sources, not one getter returning an array: that would be a new array on each poll of the run, and so clear
// and refetch both lists (the section leaving the page and coming back) every time.
watch(
  [() => props.job.id, () => props.job.subject],
  () => {
    related.value = null
    subjectPage.value = null
    refreshTree()
    refreshSubject()
  },
)
// A run that finishes or starts again may have queued (or be about to queue) others.
watch(
  () => props.job.state,
  (now, before) => {
    if (before && now !== before) refreshTree()
  },
)

const tree = computed(() => (related.value ? jobTree(related.value.items, related.value.root_id) : []))
const inTree = computed(() => new Set(tree.value.map((r) => r.job.id)))
const others = computed(() =>
  (subjectPage.value ?? []).filter((j) => j.id !== props.job.id && !inTree.value.has(j.id)).slice(0, props.sameSubject),
)
const subjectHref = computed(() => (props.job.subject ? ui.subjectHref(props.job.subject) : null))
</script>

<template>
  <div v-if="tree.length > 1 || others.length" class="vxp related">
    <section v-if="tree.length > 1" aria-labelledby="vxp-related-tree">
      <h2 id="vxp-related-tree" class="vxp-eyebrow">Related jobs</h2>
      <ul class="rows tree vxp-panel">
        <li
          v-for="r in tree"
          :key="r.job.id"
          :class="{ current: r.job.id === job.id }"
          :style="{ '--depth': Math.min(r.depth, 8) }"
          :aria-current="r.job.id === job.id ? 'true' : undefined"
        >
          <span v-if="r.depth" class="branch" aria-hidden="true">└</span>
          <span class="vxp-mono id">
            <template v-if="r.job.id === job.id">#{{ r.job.id }}</template>
            <PlatformLink v-else :to="ui.jobHref(r.job.id)">#{{ r.job.id }}</PlatformLink>
          </span>
          <span class="vxp-mono kind">{{ r.job.kind }}</span>
          <StateChip :state="r.job.state" :cancelling="r.job.cancel_requested && isActive(r.job.state)" />
          <span v-if="r.job.subject && r.job.subject !== job.subject" class="subject"><SubjectLink :subject="r.job.subject" /></span>
          <span v-if="r.job.id === job.id" class="vxp-small vxp-muted">this job</span>
          <span class="when vxp-small vxp-muted" :title="ui.stamp(r.job.created_at)">{{ ui.timeAgo(r.job.created_at) }}</span>
        </li>
      </ul>
      <p v-if="related?.truncated" class="vxp-small vxp-muted note">Showing the first {{ limit }} runs of this tree.</p>
    </section>

    <section v-if="others.length" aria-labelledby="vxp-related-subject">
      <h2 id="vxp-related-subject" class="vxp-eyebrow">
        Other runs on
        <PlatformLink :to="subjectHref" class="vxp-mono">{{ job.subject }}</PlatformLink>
      </h2>
      <ul class="rows vxp-panel">
        <li v-for="j in others" :key="j.id">
          <span class="vxp-mono id"><PlatformLink :to="ui.jobHref(j.id)">#{{ j.id }}</PlatformLink></span>
          <span class="vxp-mono kind">{{ j.kind }}</span>
          <StateChip :state="j.state" :cancelling="j.cancel_requested && isActive(j.state)" />
          <span class="when vxp-small vxp-muted" :title="ui.stamp(j.created_at)">{{ ui.timeAgo(j.created_at) }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.related { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 20px; }
h2 { margin: 0 0 8px; }
.rows { list-style: none; margin: 0; padding: 6px 0; }
.rows li { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; padding: 6px 12px; min-width: 0; }
.tree li { padding-left: calc(12px + var(--depth, 0) * 14px); }
.current { background: var(--vxp-hover); }
.branch { color: var(--vxp-muted); margin-left: -12px; width: 8px; }
.id { min-width: 4.5ch; }
.kind { overflow-wrap: anywhere; }
.subject { overflow-wrap: anywhere; font-size: 13px; }
.when { margin-left: auto; }
.note { margin: 6px 0 0; }
</style>
