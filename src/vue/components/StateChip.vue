<script setup lang="ts">
import { STATE_TONE } from '../../jobs'
import type { JobState } from '../../types'

/** `scheduled`: a queued run's start time still ahead (`scheduledFor`); the chip then reads "scheduled". */
defineProps<{ state: JobState; cancelling?: boolean; scheduled?: string | null; dismissed?: boolean }>()
</script>

<template>
  <span class="vxp-chip" :class="cancelling ? 'warn' : STATE_TONE[state]">{{
    cancelling ? 'cancelling…' : scheduled ? 'scheduled' : state
  }}</span>
  <span v-if="dismissed" class="vxp-chip" title="Dismissed: left out of alerts and counts">dismissed</span>
</template>
