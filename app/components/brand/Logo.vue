<script setup lang="ts">
import ZugMark from '../../../packages/client-ui/ZugMark.vue'

// The live mark on its black tile, the same proportions as public/brand/logo.svg (a 128 tile, an 80 face, radius 24).
const sizes = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 40,
  '2xl': 48,
  '3xl': 64,
  hero: 96,
} as const

type NamedSize = keyof typeof sizes

const props = withDefaults(defineProps<{
  size?: NamedSize
  alt?: string
  priority?: boolean
  state?: 'idle' | 'thinking' | 'working' | 'done'
}>(), {
  size: 'md',
  alt: 'Zugoid',
  priority: false,
  state: 'idle',
})

const px = computed(() => sizes[props.size ?? 'md'])
</script>

<template>
  <span
    :role="alt ? 'img' : undefined"
    :aria-label="alt || undefined"
    :aria-hidden="alt ? undefined : 'true'"
    class="inline-flex shrink-0 select-none items-center justify-center bg-black text-white"
    :style="{ width: `${px}px`, height: `${px}px`, borderRadius: `${px * 0.1875}px` }"
  >
    <ZugMark :state="state" :follow="size === 'hero'" :style="{ width: `${px * 0.625}px`, height: `${px * 0.625}px` }" />
  </span>
</template>
