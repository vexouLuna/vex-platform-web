<script setup lang="ts">
import { ref } from 'vue'
const text = ref('not json')
</script>

<template>
  <Story title="Controls" :layout="{ type: 'single', iframe: true }">
    <Variant title="Chips and buttons">
      <div class="vxp story-frame stack">
        <div class="row">
          <span class="vxp-chip">neutral</span>
          <span class="vxp-chip accent">accent</span>
          <span class="vxp-chip ok">succeeded</span>
          <span class="vxp-chip warn">paused</span>
          <span class="vxp-chip bad">failed</span>
        </div>
        <div class="row">
          <button type="button" class="vxp-btn">Default</button>
          <button type="button" class="vxp-btn primary">Primary</button>
          <button type="button" class="vxp-btn danger">Danger</button>
          <button type="button" class="vxp-btn danger-solid">Danger solid</button>
          <button type="button" class="vxp-btn danger-solid" disabled>Disabled</button>
        </div>
      </div>
    </Variant>
    <Variant title="Input states">
      <div class="vxp story-frame stack">
        <label class="vxp-field">Default (hover me)<input class="vxp-input" value="vod:2551234567" /></label>
        <label class="vxp-field">Disabled<input class="vxp-input" value="vod:2551234567" disabled /></label>
        <label class="vxp-field">
          Invalid
          <input v-model="text" class="vxp-input" :aria-invalid="true" aria-describedby="ctl-err" />
          <span id="ctl-err" class="vxp-field-error" role="alert">Not valid JSON.</span>
        </label>
        <label class="vxp-field">Invalid via class<input class="vxp-input is-invalid" value="x" /></label>
      </div>
    </Variant>
    <Variant title="Progress">
      <div class="vxp story-frame stack">
        <div class="vxp-progress"><span style="width: 60%"></span></div>
        <div class="vxp-progress indeterminate"><span></span></div>
      </div>
    </Variant>
  </Story>
</template>

<style scoped>
.stack { display: grid; gap: 16px; align-content: start; max-width: 360px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
