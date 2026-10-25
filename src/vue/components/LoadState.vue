<script setup lang="ts">
// Whatever a section shows while its data isn't there: the error with "Try again", skeleton rows while loading, or
// the empty state once loaded with nothing in it. The content (default slot) shows only once there's data. The same
// props as vex-ui's VxLoadState, drawn with the --vxp-* variables:
//   <LoadState :error="error" :loading="!data" :empty="!data?.items.length" @retry="reload">…</LoadState>
// `#loading` and `#empty` replace the stand-ins; `errorText` turns the error into words (default: errorText()).
import { errorText as problemText } from '../../errors'

withDefaults(
  defineProps<{
    error?: unknown
    loading?: boolean
    empty?: boolean
    /** The error's title: "Couldn't load …". */
    errorTitle?: string
    errorText?: (e: unknown) => string
    /** Skeleton rows while loading, and their height. */
    rows?: number
    rowHeight?: string
    emptyTitle?: string
    emptyText?: string
  }>(),
  {
    loading: false,
    empty: false,
    errorTitle: "Couldn't load this",
    errorText: problemText,
    rows: 4,
    rowHeight: '38px',
    emptyTitle: 'Nothing here yet',
  },
)
defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="error" class="vxp-callout error" role="alert">
    <strong>{{ errorTitle }}</strong>
    {{ errorText(error) }}
    <div class="vxp-load-retry"><button type="button" class="vxp-btn sm" @click="$emit('retry')">Try again</button></div>
  </div>
  <div v-else-if="loading" class="vxp-load-rows" role="status" aria-busy="true" aria-label="Loading">
    <slot name="loading"><div v-for="i in rows" :key="i" class="vxp-skeleton" :style="{ height: rowHeight }" /></slot>
  </div>
  <slot v-else-if="empty" name="empty">
    <div class="vxp-empty">
      <strong>{{ emptyTitle }}</strong>
      <p v-if="emptyText" class="vxp-muted">{{ emptyText }}</p>
    </div>
  </slot>
  <slot v-else></slot>
</template>

<style scoped>
.vxp-load-retry { margin-top: 8px; }
.vxp-load-rows { display: flex; flex-direction: column; gap: 8px; }
.vxp-empty { padding: 28px 16px; text-align: center; font-size: 14px; border: 1px dashed var(--vxp-line); border-radius: var(--vxp-radius); }
.vxp-empty p { margin: 6px 0 0; font-size: 13px; }
</style>
