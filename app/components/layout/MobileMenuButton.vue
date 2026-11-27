<script setup lang="ts">
import { hasServerNavigationMenu, serverNavigationSection } from '~~/shared/server-navigation'

const ui = useUiStore()
const route = useRouter().currentRoute
const hasMenu = computed(() => hasServerNavigationMenu(route.value.path))
const chat = computed(() => serverNavigationSection(route.value.path) === 'chat')
</script>

<template>
  <UButton
    v-if="hasMenu"
    :icon="chat ? 'i-ph-arrow-left' : 'i-ph-list'"
    color="neutral"
    variant="ghost"
    size="md"
    square
    class="-ms-1.5 size-10 shrink-0 justify-center md:hidden"
    :aria-label="chat ? 'Back to conversations' : 'Open section menu'"
    aria-controls="channel-navigation"
    :aria-expanded="ui.mobilePane === 'channels'"
    @click="ui.mobilePane = 'channels'"
  />
</template>
