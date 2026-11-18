<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { CustomerContactDTO } from '~~/shared/types'
import { formatMessageTime } from '~~/shared/format'

definePageMeta({ layout: 'server', middleware: ['auth'] })

const { api } = useApi()
const searchInput = ref('')
const search = refDebounced(computed(() => searchInput.value.trim()), 300)

const contactsQ = useQuery({
  queryKey: computed(() => ['customer-contacts', search.value]),
  queryFn: () => api<{ contacts: CustomerContactDTO[] }>('/api/customers/contacts', { query: search.value ? { q: search.value } : {} }),
  placeholderData: previous => previous,
})
const contacts = computed(() => contactsQ.data.value?.contacts ?? [])

function lastTouch(contact: CustomerContactDTO) {
  const at = [contact.lastSeenAt, contact.lastContactedAt, contact.firstSeenAt].filter((value): value is string => Boolean(value)).sort().at(-1)
  return at ? formatMessageTime(at) : ''
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <LayoutPageHeader icon="i-ph-users-three" title="Contacts">
      <template #actions>
        <UInput v-model="searchInput" icon="i-ph-magnifying-glass" placeholder="Search name or email" size="sm" class="w-56" />
      </template>
    </LayoutPageHeader>
    <LayoutSkeleton v-if="contactsQ.isPending.value" variant="rows" :rows="8" />
    <LayoutEmptyState
      v-else-if="!contacts.length"
      icon="i-ph-users-three"
      :title="search ? 'No contact matches' : 'No contacts yet'"
      :description="search ? 'Try another name or address.' : 'Everyone who writes to a Mailbox or a Widget, and everyone you email, becomes a Contact here.'"
    />
    <ul v-else class="min-h-0 flex-1 divide-y divide-default overflow-y-auto">
      <li v-for="contact in contacts" :key="contact.id">
        <NuxtLink :to="`/customers/contacts/${contact.id}`" class="flex items-center gap-3 px-4 py-3 hover:bg-elevated/60">
          <UAvatar :alt="contact.name" size="sm" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-highlighted">{{ contact.name }}</p>
            <p class="truncate text-xs text-muted">{{ contact.emails.map(email => email.address).join(', ') }}</p>
          </div>
          <span v-if="contact.conversationCount" class="shrink-0 text-xs text-muted">
            {{ contact.conversationCount === 1 ? '1 conversation' : `${contact.conversationCount} conversations` }}
          </span>
          <span class="w-20 shrink-0 text-end text-xs text-dimmed">{{ lastTouch(contact) }}</span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
