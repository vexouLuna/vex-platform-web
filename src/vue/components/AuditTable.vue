<script setup lang="ts">
// Audit rows: when, the action (and its outcome when it wasn't ok), where (the scope), the target with what changed,
// who, and how they came in. Sites can render the actor and the scope themselves through the `actor` and `scope` slots.
import { actorLabel, auditChange, outcomeTone } from '../../audit'
import type { AuditOut } from '../../types'
import { usePlatformUi } from '../config'
import ActorRef from './ActorRef.vue'
import SubjectLink from './SubjectLink.vue'

const props = withDefaults(
  defineProps<{
    entries: AuditOut[]
    /** Names for scope ids the rows don't name themselves (channel id → login). */
    scopeNames?: Record<string, string>
    /** Leave out the Where column (an app without scopes, or a table already scoped to one). */
    hideScope?: boolean
    empty?: string
  }>(),
  { scopeNames: () => ({}), hideScope: false, empty: 'Nothing here yet.' },
)
const ui = usePlatformUi()

const where = (e: AuditOut) => {
  if (!e.scope) return '—'
  if (e.scope === '*') return 'everywhere'
  const name = e.scope_name ?? props.scopeNames[e.scope]
  return name ? `#${name}` : e.scope
}
</script>

<template>
  <div class="vxp vxp-table-scroll vxp-panel">
    <table class="vxp-table audit" aria-label="Audit log">
      <thead>
        <tr>
          <th>When</th>
          <th>Action</th>
          <th v-if="!hideScope">Where</th>
          <th>Target</th>
          <th>By</th>
          <th>Via</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="e in entries" :key="e.id">
          <td class="vxp-muted nowrap" :title="ui.stamp(e.at)">{{ ui.timeAgo(e.at) }}</td>
          <td>
            <code class="action">{{ e.action }}</code>
            <span v-if="e.outcome !== 'ok'" class="vxp-chip outcome" :class="outcomeTone(e.outcome)">{{ e.outcome }}</span>
          </td>
          <td v-if="!hideScope"><slot name="scope" :entry="e" :label="where(e)">{{ where(e) }}</slot></td>
          <td class="target">
            <SubjectLink v-if="e.target" :subject="e.target" />
            <template v-for="c in [auditChange(e)]" :key="0">
              <div v-if="c.before || c.after" class="change">
                <span v-if="c.before" class="before" title="Before">{{ c.before }}</span>
                <span v-if="c.before" class="vxp-muted" aria-hidden="true"> → </span>
                <span class="after" title="After">{{ c.after || '(removed)' }}</span>
              </div>
              <div v-else-if="c.detail" class="change vxp-muted">{{ c.detail }}</div>
            </template>
          </td>
          <td class="vxp-mono vxp-muted">
            <slot name="actor" :entry="e" :label="actorLabel(e, ui.appName)"><ActorRef :actor="e" /></slot>
          </td>
          <td><span class="vxp-chip">{{ e.via }}</span></td>
        </tr>
        <tr v-if="!entries.length">
          <td :colspan="hideScope ? 5 : 6" class="vxp-muted empty">{{ empty }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.audit { min-width: 44rem; }
.nowrap { white-space: nowrap; }
.action { font-family: var(--vxp-mono); font-size: 12.5px; }
.outcome { margin-left: 6px; }
.target { overflow-wrap: anywhere; }
.change { font-family: var(--vxp-mono); font-size: 12px; margin-top: 2px; }
.before { color: var(--vxp-muted); text-decoration: line-through; }
.after { color: var(--vxp-ink); }
.empty { text-align: center; padding: 24px 10px; }
</style>
