<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { CustomerConversationDetailDTO, CustomerConversationStatus, CustomerWidgetConversationDTO, CustomerWidgetDTO, MemberDTO } from '~~/shared/types'
import { formatDateTime } from '~~/shared/format'
import { isWidgetFolder, type WidgetFolder } from '~~/shared/paths'
import { errorMessage } from '~/composables/useApi'

definePageMeta({ layout: 'server', middleware: ['auth'] })

const { api } = useApi()
const { serverId } = useServer()
const route = useRoute()
const qc = useQueryClient()
const toast = useToast()
const ui = useUiStore()

const widgetId = computed(() => String(route.params.widget || ''))
const folder = computed<WidgetFolder>(() => isWidgetFolder(route.params.folder) ? route.params.folder : 'open')
const conversationId = computed(() => String(route.query.conversation || '') || null)

const widgetsQ = useQuery({
  queryKey: ['customer-widgets'],
  queryFn: () => api<{ widgets: CustomerWidgetDTO[]; canManage: boolean }>('/api/customers/widgets'),
})
const widget = computed(() => widgetsQ.data.value?.widgets.find(item => item.channelId === widgetId.value) ?? null)

const listQ = useQuery({
  queryKey: computed(() => ['customer-widget-conversations', widgetId.value, folder.value]),
  queryFn: () => api<{ conversations: CustomerWidgetConversationDTO[] }>(`/api/customers/widgets/${widgetId.value}/conversations`, { query: { status: folder.value } }),
  enabled: computed(() => Boolean(widgetId.value)),
  refetchInterval: 10_000,
})
const conversations = computed(() => listQ.data.value?.conversations ?? [])

// Version 1 has no live updates: an open Conversation is polled every few seconds.
const detailQ = useQuery({
  queryKey: computed(() => ['customer-conversation', conversationId.value]),
  queryFn: () => api<CustomerConversationDetailDTO>(`/api/customers/conversations/${conversationId.value}`),
  enabled: computed(() => Boolean(conversationId.value)),
  refetchInterval: 4_000,
})
const detail = computed(() => detailQ.data.value ?? null)

const membersQ = useQuery({
  queryKey: computed(() => ['members', serverId.value]),
  queryFn: () => api<{ members: MemberDTO[] }>(`/api/servers/${serverId.value}/members`),
  enabled: computed(() => Boolean(serverId.value)),
})
const assigneeItems = computed(() => [
  { value: '', label: 'Unassigned' },
  ...(membersQ.data.value?.members ?? []).map(member => ({ value: member.user.id, label: member.nickname || member.user.displayName })),
])
const statusItems: Array<{ value: CustomerConversationStatus; label: string }> = [
  { value: 'open', label: 'Open' }, { value: 'waiting', label: 'Waiting' }, { value: 'resolved', label: 'Resolved' },
  { value: 'spam', label: 'Spam' }, { value: 'trash', label: 'Trash' },
]
const folderLabel = computed(() => statusItems.find(item => item.value === folder.value)?.label ?? 'Open')

function openConversation(id: string | null) {
  void navigateTo({ query: id ? { conversation: id } : {} })
}

async function refresh() {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['customer-conversation', conversationId.value] }),
    qc.invalidateQueries({ queryKey: ['customer-widget-conversations', widgetId.value] }),
    qc.invalidateQueries({ queryKey: ['customer-widgets'] }),
  ])
}

async function update(body: { status?: CustomerConversationStatus; assigneeId?: string | null }) {
  if (!conversationId.value) return
  try {
    await api(`/api/customers/conversations/${conversationId.value}`, { method: 'PATCH', body })
    await refresh()
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
}
const status = computed({
  get: () => detail.value?.conversation.status ?? 'open',
  set: (value: CustomerConversationStatus) => { void update({ status: value }) },
})
const assignee = computed({
  get: () => detail.value?.conversation.assigneeId ?? '',
  set: (value: string) => { void update({ assigneeId: value || null }) },
})

const mode = ref<'reply' | 'note'>('reply')
const draft = ref('')
const sending = ref(false)
async function send() {
  const content = draft.value.trim()
  if (!content || !conversationId.value || sending.value) return
  sending.value = true
  try {
    await api(`/api/customers/conversations/${conversationId.value}/${mode.value}`, { method: 'POST', body: { content } })
    draft.value = ''
    await refresh()
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { sending.value = false }
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send() }
}

const messagesEnd = ref<HTMLElement | null>(null)
watch(() => detail.value?.messages.length, () => nextTick(() => messagesEnd.value?.scrollIntoView({ block: 'end' })))
</script>

<template>
  <div class="h-full min-h-0 min-w-0">
    <div class="grid h-full min-h-0 min-w-0 grid-cols-1 md:grid-cols-[var(--mail-list-width)_minmax(0,1fr)]" :style="{ '--mail-list-width': `${ui.mailListWidth}px` }">
      <section class="relative min-h-0 border-e border-default" :class="conversationId ? 'hidden md:block' : 'block'">
        <LayoutResizeHandle v-model="ui.mailListWidth" class="hidden md:block" :min="240" :max="560" side="end" label="Resize conversation list" />
        <div class="h-full overflow-y-auto">
          <div class="df-top-row sticky top-0 z-10 flex items-center gap-2 border-b border-default bg-default/90 px-3 backdrop-blur">
            <LayoutMobileMenuButton />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-highlighted">{{ folderLabel }}</p>
              <p class="truncate text-[11px] text-muted">{{ widget?.name || 'Widget' }}</p>
            </div>
          </div>
          <LayoutSkeleton v-if="listQ.isPending.value" variant="rows" :rows="6" />
          <LayoutLoadError v-else-if="listQ.error.value" inline message="Conversations did not load." :retry="listQ.refetch" />
          <div v-else-if="!conversations.length" class="px-6 py-16 text-center">
            <UIcon name="i-ph-chat-circle-dots" class="size-8 text-dimmed" />
            <p class="mt-3 text-sm font-medium text-highlighted">No {{ folderLabel.toLowerCase() }} conversations</p>
            <p v-if="folder === 'open'" class="mt-1 text-sm text-muted">What visitors write on your site appears here.</p>
          </div>
          <button
            v-for="item in conversations"
            :key="item.channelId"
            type="button"
            class="block w-full border-b border-default px-4 py-3 text-start hover:bg-elevated/60"
            :class="item.channelId === conversationId ? 'bg-accented' : ''"
            @click="openConversation(item.channelId)"
          >
            <div class="flex items-baseline gap-2">
              <span class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">{{ item.contactName }}</span>
              <span class="shrink-0 text-[11px] text-muted">{{ formatDateTime(item.lastMessageAt) }}</span>
            </div>
            <p class="mt-0.5 line-clamp-2 text-xs text-muted">{{ item.preview }}</p>
          </button>
        </div>
      </section>

      <section class="flex min-h-0 min-w-0 flex-col" :class="conversationId ? 'flex' : 'hidden md:flex'">
        <template v-if="detail">
          <header class="df-top-row-min flex flex-wrap items-center gap-2 border-b border-default px-3 py-1">
            <UButton icon="i-ph-arrow-left" color="neutral" variant="ghost" square class="md:hidden" aria-label="Back to conversations" @click="openConversation(null)" />
            <div class="min-w-0 flex-1">
              <NuxtLink v-if="detail.conversation.contactId" :to="`/customers/contacts/${detail.conversation.contactId}`" class="block truncate text-sm font-semibold text-highlighted hover:underline">
                {{ detail.conversation.contactName }}
              </NuxtLink>
              <h2 v-else class="truncate text-sm font-semibold text-highlighted">{{ detail.conversation.contactName }}</h2>
              <p v-if="detail.visitor" class="truncate text-xs text-muted">
                <template v-if="detail.visitor.claimedEmail">{{ detail.visitor.claimedEmail }} (not verified) · </template>
                <template v-if="detail.visitor.country">{{ detail.visitor.country }} · </template>
                Last seen {{ formatDateTime(detail.visitor.lastSeenAt) }}
              </p>
            </div>
            <USelect v-model="assignee" :items="assigneeItems" :disabled="!detail.canReply" size="sm" class="w-40" aria-label="Assignee" />
            <USelect v-model="status" :items="statusItems" :disabled="!detail.canReply" size="sm" class="w-32" aria-label="Status" />
          </header>
          <div class="flex-1 space-y-2 overflow-y-auto p-3">
            <article
              v-for="message in detail.messages"
              :key="message.id"
              class="rounded-lg border px-4 py-3"
              :class="message.direction === null ? 'border-warning/40 bg-warning/5' : 'border-default bg-default'"
            >
              <div class="flex items-center gap-2">
                <UserAvatar :user="message.author" size="xs" />
                <span class="text-sm font-medium text-highlighted">{{ message.author.displayName }}</span>
                <UBadge v-if="message.direction === null" label="Internal note" color="warning" variant="subtle" size="sm" />
                <span class="text-xs text-muted">{{ formatDateTime(message.createdAt) }}</span>
              </div>
              <p class="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-default">{{ message.content }}</p>
            </article>
            <div ref="messagesEnd" />
          </div>
          <form v-if="detail.canReply" class="border-t border-default p-3" @submit.prevent="send">
            <div class="mb-2 flex items-center gap-1">
              <UButton label="Reply" size="xs" color="neutral" :variant="mode === 'reply' ? 'soft' : 'ghost'" @click="mode = 'reply'" />
              <UButton label="Internal note" size="xs" color="warning" :variant="mode === 'note' ? 'soft' : 'ghost'" @click="mode = 'note'" />
            </div>
            <UTextarea
              v-model="draft"
              :placeholder="mode === 'reply' ? 'Reply to the visitor' : 'Write a note only the team sees'"
              autoresize
              :maxrows="8"
              class="w-full"
              @keydown="onKeydown"
            />
            <div class="mt-2 flex justify-end">
              <UButton type="submit" :label="mode === 'reply' ? 'Send reply' : 'Add note'" trailing-icon="i-ph-paper-plane-tilt" :loading="sending" :disabled="!draft.trim()" />
            </div>
          </form>
          <div v-else class="border-t border-default p-4 text-sm text-muted">Read only</div>
        </template>
        <LayoutSkeleton v-else-if="conversationId && detailQ.isPending.value" variant="messages" :rows="3" class="p-4" />
        <LayoutLoadError v-else-if="conversationId && detailQ.error.value" inline message="This conversation did not load." :retry="detailQ.refetch" />
        <div v-else class="grid flex-1 place-items-center text-sm text-muted">Choose a conversation</div>
      </section>
    </div>
  </div>
</template>
