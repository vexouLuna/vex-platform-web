<script setup lang="ts">
// A run's log lines, scrolled to the newest while the reader is at the bottom. With `hasOlder`, scrolling to the top
// (or the button there) asks for older lines (`older`), and the view stays on the line the reader was at.
import { nextTick, ref, watch } from 'vue'
import type { EventOut } from '../../types'
import { usePlatformUi } from '../config'

const props = withDefaults(
  defineProps<{ lines: EventOut[]; empty?: string; error?: string | null; dropped?: number; hasOlder?: boolean; loadingOlder?: boolean }>(),
  { empty: 'No log lines yet.', error: null, dropped: 0, hasOlder: false, loadingOlder: false },
)
const emit = defineEmits<{ older: [] }>()
const ui = usePlatformUi()

const box = ref<HTMLElement | null>(null)
const follow = ref(true)
watch(
  () => [props.lines.length, props.lines[0]?.id] as const,
  async (_, prev) => {
    const el = box.value
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0
    await nextTick()
    if (!el) return
    if (follow.value) el.scrollTop = el.scrollHeight
    // Older lines were put above: keep the same line in view.
    else if (prev && props.lines[0]?.id !== prev[1]) el.scrollTop = el.scrollHeight - fromBottom
  },
  { immediate: true },
)
function onScroll() {
  const el = box.value
  if (!el) return
  follow.value = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  if (el.scrollTop < 48 && props.hasOlder && !props.loadingOlder) emit('older')
}
const time = (iso: string) => new Date(iso).toLocaleTimeString()
</script>

<template>
  <div ref="box" class="vxp log vxp-panel vxp-mono" role="log" aria-live="polite" tabindex="0" @scroll.passive="onScroll">
    <p v-if="error" class="vxp-muted">Couldn't load the log: {{ error }}</p>
    <p v-else-if="!lines.length" class="vxp-muted">{{ empty }}</p>
    <p v-if="hasOlder" class="older">
      <button type="button" class="vxp-btn" :disabled="loadingOlder" @click="emit('older')">
        {{ loadingOlder ? 'Loading older lines…' : 'Load older lines' }}
      </button>
    </p>
    <p v-else-if="dropped" class="vxp-muted">{{ dropped }} older lines not shown.</p>
    <div v-for="e in lines" :key="e.id" class="line" :class="`is-${e.level}`">
      <span class="t" :title="ui.stamp(e.at)">{{ time(e.at) }}</span>
      <span v-if="e.step" class="s">{{ e.step }}</span>
      <span class="m">{{ e.message }}</span>
    </div>
  </div>
</template>

<style scoped>
.log { height: min(60vh, 520px); overflow: auto; padding: 10px 12px; font-size: 12px; line-height: 1.5; }
.log p { margin: 0; }
.log p.older { margin-bottom: 6px; }
.line { display: flex; gap: 8px; }
.t { color: var(--vxp-muted); flex: none; }
.s { color: var(--vxp-accent); flex: none; }
.m { white-space: pre-wrap; word-break: break-word; }
.is-debug .m { color: var(--vxp-muted); }
.is-warning .m { color: var(--vxp-warn); }
.is-error .m { color: var(--vxp-bad); }
</style>
