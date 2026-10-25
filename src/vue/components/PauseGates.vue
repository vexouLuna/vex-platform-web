<script setup lang="ts">
// The "Pause before" step picker: a checkbox per step, `v-model` the steps a run pauses before. Steps in the model
// that aren't listed (a retry shows only the steps from where it starts) are kept as they are.
import { toggleGate } from '../../jobs'

withDefaults(defineProps<{ steps: readonly string[]; legend?: string; disabled?: boolean }>(), { legend: 'Pause before', disabled: false })
const gates = defineModel<string[]>({ default: () => [] })
</script>

<template>
  <fieldset v-if="steps.length" class="vxp-gates">
    <legend class="vxp-muted vxp-small">{{ legend }}</legend>
    <label v-for="s in steps" :key="s" class="vxp-check">
      <input
        type="checkbox"
        :checked="gates.includes(s)"
        :disabled="disabled"
        @change="gates = toggleGate(gates, s, ($event.target as HTMLInputElement).checked)"
      />
      <span class="vxp-mono">{{ s }}</span>
    </label>
  </fieldset>
</template>

<style scoped>
.vxp-gates { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0; padding: 0; border: 0; min-width: 0; }
legend { padding: 0; margin-bottom: 6px; }
</style>
