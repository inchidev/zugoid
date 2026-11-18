<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { CustomerCompanyDTO, CustomerContactDTO, CustomerConversationDTO, CustomerConversationStatus } from '~~/shared/types'
import { errorMessage } from '~/composables/useApi'
import { formatDateTime } from '~~/shared/format'
import { mailPath, widgetPath, type MailFolder } from '~~/shared/paths'

definePageMeta({ layout: 'server', middleware: ['auth'] })

const { api } = useApi()
const route = useRoute()
const contactId = computed(() => String(route.params.id || ''))

const contactQ = useQuery({
  queryKey: computed(() => ['customer-contact', contactId.value]),
  queryFn: () => api<{ contact: CustomerContactDTO; conversations: CustomerConversationDTO[] }>(`/api/customers/contacts/${contactId.value}`),
})
const contact = computed(() => contactQ.data.value?.contact ?? null)
const conversations = computed(() => contactQ.data.value?.conversations ?? [])

const statusLabel: Record<CustomerConversationStatus, string> = { open: 'Open', waiting: 'Waiting', resolved: 'Resolved', spam: 'Spam', trash: 'Trash' }
const statusFolder: Record<CustomerConversationStatus, MailFolder> = { open: 'inbox', waiting: 'inbox', resolved: 'archive', spam: 'spam', trash: 'trash' }

function conversationPath(conversation: CustomerConversationDTO) {
  if (conversation.sourceKind === 'widget') return widgetPath(conversation.sourceChannelId, conversation.status, conversation.channelId)
  return mailPath(conversation.sourceChannelId, statusFolder[conversation.status], conversation.channelId)
}

const qc = useQueryClient()
const toast = useToast()
async function refresh() {
  await Promise.all([qc.invalidateQueries({ queryKey: ['customer-contact', contactId.value] }), qc.invalidateQueries({ queryKey: ['customer-contacts'] }), qc.invalidateQueries({ queryKey: ['customer-companies'] })])
}
async function run(action: () => Promise<unknown>) {
  try { await action(); await refresh() }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
}

const renaming = ref(false)
const name = ref('')
function startRename() { name.value = contact.value?.name ?? ''; renaming.value = true }
async function rename() {
  await run(() => api(`/api/customers/contacts/${contactId.value}`, { method: 'PATCH', body: { name: name.value.trim() } }))
  renaming.value = false
}

const companiesQ = useQuery({
  queryKey: ['customer-companies', ''],
  queryFn: () => api<{ companies: CustomerCompanyDTO[] }>('/api/customers/companies'),
})
const addCompanyId = ref<string | undefined>()
const companyItems = computed(() => (companiesQ.data.value?.companies ?? [])
  .filter(company => company.spaceId === contact.value?.spaceId && !contact.value?.companies.some(item => item.id === company.id))
  .map(company => ({ value: company.id, label: company.name })))
watch(addCompanyId, (companyId) => {
  if (!companyId) return
  addCompanyId.value = undefined
  void run(() => api(`/api/customers/contacts/${contactId.value}/companies/${companyId}`, { method: 'PUT', body: {} }))
})
function setCurrent(companyId: string, current: boolean) {
  void run(() => api(`/api/customers/contacts/${contactId.value}/companies/${companyId}`, { method: 'PUT', body: { current } }))
}
function removeCompany(companyId: string) {
  void run(() => api(`/api/customers/contacts/${contactId.value}/companies/${companyId}`, { method: 'DELETE' }))
}

const mergeOpen = ref(false)
const mergeSearch = ref('')
const mergeTerm = refDebounced(computed(() => mergeSearch.value.trim()), 300)
const mergeQ = useQuery({
  queryKey: computed(() => ['customer-contacts', mergeTerm.value]),
  queryFn: () => api<{ contacts: CustomerContactDTO[] }>('/api/customers/contacts', { query: mergeTerm.value ? { q: mergeTerm.value } : {} }),
  enabled: mergeOpen,
})
const mergeTargets = computed(() => (mergeQ.data.value?.contacts ?? []).filter(item => item.id !== contactId.value && item.spaceId === contact.value?.spaceId))
async function mergeInto(target: CustomerContactDTO) {
  try {
    await api(`/api/customers/contacts/${contactId.value}/merge`, { method: 'POST', body: { into: target.id } })
    mergeOpen.value = false
    await qc.invalidateQueries({ queryKey: ['customer-contacts'] })
    await navigateTo(`/customers/contacts/${target.id}`, { replace: true })
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <LayoutPageHeader
      icon="i-ph-user"
      :crumbs="[{ label: 'Contacts', to: '/customers' }, { label: contact?.name ?? '' }]"
      :loading="contactQ.isPending.value"
    >
      <template v-if="contact" #actions>
        <UButton icon="i-ph-git-merge" label="Join into…" color="neutral" variant="ghost" size="sm" @click="mergeOpen = true" />
      </template>
    </LayoutPageHeader>
    <LayoutSkeleton v-if="contactQ.isPending.value" variant="rows" :rows="6" />
    <LayoutEmptyState
      v-else-if="!contact"
      icon="i-ph-user"
      title="Contact not found"
      description="It was removed, or it is in a Space you cannot reach."
    />
    <div v-else class="min-h-0 flex-1 overflow-y-auto">
      <section class="space-y-3 border-b border-default px-4 py-5">
        <div class="flex items-center gap-3">
          <UAvatar :alt="contact.name" size="lg" />
          <form v-if="renaming" class="flex min-w-0 flex-1 gap-2" @submit.prevent="rename">
            <UInput v-model="name" class="min-w-0 flex-1" autofocus @keydown.esc="renaming = false" />
            <UButton type="submit" label="Save" size="sm" :disabled="!name.trim()" />
          </form>
          <template v-else>
            <h2 class="truncate text-lg font-semibold text-highlighted">{{ contact.name }}</h2>
            <UButton icon="i-ph-pencil-simple" color="neutral" variant="ghost" size="xs" aria-label="Rename" @click="startRename" />
          </template>
        </div>
        <ul class="space-y-1">
          <li v-for="email in contact.emails" :key="email.address" class="flex items-center gap-2 text-sm">
            <UIcon name="i-ph-envelope-simple" class="size-4 text-dimmed" />
            <span class="truncate">{{ email.address }}</span>
            <UBadge v-if="email.verified" color="success" variant="subtle" size="sm" label="Verified" />
          </li>
        </ul>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-muted">
          <dt>First seen</dt><dd>{{ formatDateTime(contact.firstSeenAt) }}</dd>
          <template v-if="contact.lastSeenAt">
            <dt>Last wrote</dt><dd>{{ formatDateTime(contact.lastSeenAt) }}</dd>
          </template>
          <template v-if="contact.lastContactedAt">
            <dt>Last contacted</dt><dd>{{ formatDateTime(contact.lastContactedAt) }}</dd>
          </template>
        </dl>
      </section>
      <section class="space-y-2 border-b border-default px-4 py-4">
        <h3 class="text-sm font-semibold text-highlighted">Companies</h3>
        <ul v-if="contact.companies.length" class="space-y-1">
          <li v-for="company in contact.companies" :key="company.id" class="flex items-center gap-2 text-sm">
            <UIcon name="i-ph-buildings" class="size-4 text-dimmed" />
            <NuxtLink :to="`/customers/companies/${company.id}`" class="truncate hover:underline" :class="company.current ? 'text-highlighted' : 'text-muted line-through'">{{ company.name }}</NuxtLink>
            <span v-if="company.title" class="truncate text-xs text-muted">{{ company.title }}</span>
            <UBadge v-if="company.linkedBy === 'domain'" color="neutral" variant="subtle" size="sm" label="By email domain" />
            <UButton :label="company.current ? 'Left' : 'Works here'" color="neutral" variant="link" size="xs" class="ms-auto" @click="setCurrent(company.id, !company.current)" />
            <UButton icon="i-ph-x" color="neutral" variant="ghost" size="xs" aria-label="Remove from company" @click="removeCompany(company.id)" />
          </li>
        </ul>
        <USelectMenu v-model="addCompanyId" :items="companyItems" value-key="value" placeholder="Add to a company…" size="sm" class="w-64" :disabled="!companyItems.length" />
      </section>
      <section class="px-4 py-4">
        <h3 class="mb-2 text-sm font-semibold text-highlighted">Conversations</h3>
        <p v-if="!conversations.length" class="text-sm text-muted">No conversations in Mailboxes you can read.</p>
        <ul v-else class="divide-y divide-default rounded-md border border-default">
          <li v-for="conversation in conversations" :key="conversation.channelId">
            <NuxtLink :to="conversationPath(conversation)" class="flex items-center gap-3 px-3 py-2 hover:bg-elevated/60">
              <UIcon name="i-ph-envelope-simple" class="size-4 shrink-0 text-dimmed" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm text-highlighted">{{ conversation.subject }}</p>
                <p class="truncate text-xs text-muted">{{ conversation.sourceName }}</p>
              </div>
              <UBadge color="neutral" variant="subtle" size="sm" :label="statusLabel[conversation.status]" />
              <span class="w-28 shrink-0 text-end text-xs text-dimmed">{{ formatDateTime(conversation.lastMessageAt) }}</span>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </div>
    <UModal v-model:open="mergeOpen" title="Join into another Contact" description="Its addresses, conversations and companies move there, and this Contact goes away. People outside never see that two Contacts were joined.">
      <template #body>
        <UInput v-model="mergeSearch" icon="i-ph-magnifying-glass" placeholder="Search name or email" class="mb-3 w-full" autofocus />
        <ul class="max-h-72 divide-y divide-default overflow-y-auto rounded-md border border-default">
          <li v-for="target in mergeTargets" :key="target.id">
            <button type="button" class="flex w-full items-center gap-3 px-3 py-2 text-start hover:bg-elevated/60" @click="mergeInto(target)">
              <UAvatar :alt="target.name" size="xs" />
              <span class="min-w-0 flex-1 truncate text-sm text-highlighted">{{ target.name }}</span>
              <span class="truncate text-xs text-muted">{{ target.emails[0]?.address }}</span>
            </button>
          </li>
          <li v-if="!mergeTargets.length" class="px-3 py-2 text-sm text-muted">No other Contact matches.</li>
        </ul>
      </template>
    </UModal>
  </div>
</template>
