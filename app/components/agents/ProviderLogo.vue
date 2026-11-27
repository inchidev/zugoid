<script setup lang="ts">
/** Provider marks from simple-icons (CC0), drawn as masks so they follow the text colour in both themes. */
const props = defineProps<{ kind: 'openrouter' | 'anthropic' | 'chatgpt' | 'google' | 'workers-ai' }>()
const file = computed(() => ({ openrouter: 'openrouter', anthropic: 'claude', chatgpt: 'chatgpt', google: null, 'workers-ai': 'workers-ai' })[props.kind])
</script>

<template>
  <UIcon v-if="kind === 'google'" name="i-ph-google-logo" class="shrink-0" aria-hidden="true" />
  <span v-else class="inline-block shrink-0 bg-current" :style="{ maskImage: `url(/providers/${file}.svg)`, maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'center' }" aria-hidden="true" />
</template>
