<script setup lang="ts">
// Who did something, the same everywhere: a user as `@login` (their id on hover, copied on click), a job as a link to
// it, an API key or the app itself by name. Only a user gets an @.
import { computed } from 'vue'
import { actorLabel, actorTitle } from '../../audit'
import type { AuditOut } from '../../types'
import { usePlatformUi } from '../config'
import PlatformLink from './PlatformLink.vue'

const props = defineProps<{ actor: Pick<AuditOut, 'actor_kind' | 'actor_id' | 'actor_login' | 'via'> }>()
const ui = usePlatformUi()

const label = computed(() => actorLabel(props.actor, ui.appName))
const userId = computed(() => (props.actor.actor_kind === 'user' && props.actor.actor_id !== 'password' ? props.actor.actor_id : null))
const jobId = computed(() => (props.actor.actor_kind === 'job' && props.actor.actor_id ? Number(props.actor.actor_id) : null))

async function copyId() {
  try {
    await navigator.clipboard.writeText(userId.value!)
    ui.notify(`Copied ${label.value}'s id`, 'ok')
  } catch {
    ui.notify("Couldn't copy the id", 'error')
  }
}
</script>

<template>
  <button v-if="userId" type="button" class="vxp-actor" :title="`id ${userId} via ${actor.via} · click to copy the id`" @click="copyId">{{ label }}</button>
  <span v-else-if="jobId !== null" :title="actorTitle(actor)"><PlatformLink :to="ui.jobHref(jobId)">{{ label }}</PlatformLink></span>
  <span v-else :title="actorTitle(actor)">{{ label }}</span>
</template>

<style scoped>
.vxp-actor { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: copy; text-decoration: underline dotted; text-underline-offset: 2px; }
.vxp-actor:focus-visible { outline: 2px solid var(--vxp-accent); outline-offset: 2px; }
</style>
