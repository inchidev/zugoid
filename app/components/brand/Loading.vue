<script setup lang="ts">
import ZugMark from '../../../packages/client-ui/ZugMark.vue'

// Matches spa-loading-template.html and the Shell overlay pixel for pixel. The negative
// delay keeps the face on the page clock, so swapping screens does not restart it.
const delay = import.meta.client ? `-${Math.round(performance.now() % 1400)}ms` : '0ms'
</script>

<template>
  <div role="status" aria-label="Opening" class="fixed inset-0 flex items-center justify-center bg-black text-white">
    <ZugMark state="working" class="size-12" :style="{ '--zug-delay': delay }" />
  </div>
</template>
