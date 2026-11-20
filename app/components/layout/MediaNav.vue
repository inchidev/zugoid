<script setup lang="ts">
const route = useRoute()
const source = computed(() => typeof route.query.source === 'string' ? route.query.source : 'mine')
const rows = [
  { source: 'mine', to: '/media', icon: 'i-ph-images', label: 'My library' },
  { source: 'space', to: '/media?source=space', icon: 'i-ph-users-three', label: 'Shared in this Space' },
  { source: 'chats', to: '/media?source=chats', icon: 'i-ph-chat-circle', label: 'From conversations' },
] as const
</script>

<template>
  <ul class="px-2">
    <li v-for="row in rows" :key="row.source">
      <LayoutNavRow :to="row.to" :active="route.path === '/media' && source === row.source">
        <template #leading>
          <UIcon :name="row.icon" class="size-[18px] shrink-0 text-dimmed" />
        </template>
        {{ row.label }}
      </LayoutNavRow>
    </li>
  </ul>
</template>
