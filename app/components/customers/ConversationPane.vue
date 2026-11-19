<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { ClientMsg, CustomerConversationDetailDTO, CustomerConversationStatus, MemberDTO } from '~~/shared/types'
import { formatDateTime } from '~~/shared/format'
import { errorMessage } from '~/composables/useApi'

/**
 * One Widget or Telegram Conversation. It is a channel like any other, so it reads and writes
 * with Chat's message list and composer, live over its socket. Reply goes out through the
 * Source; Internal note stays with the team.
 */
const props = defineProps<{
  conversationId: string
  serverId: string
}>()
const emit = defineEmits<{ back: []; changed: [] }>()

const { api } = useApi()
const qc = useQueryClient()
const toast = useToast()
const ui = useUiStore()

const detailQ = useQuery({
  queryKey: computed(() => ['customer-conversation', props.conversationId]),
  queryFn: () => api<CustomerConversationDetailDTO>(`/api/customers/conversations/${props.conversationId}`),
})
const detail = computed(() => detailQ.data.value ?? null)

const membersQ = useQuery({
  queryKey: computed(() => ['members', props.serverId]),
  queryFn: () => api<{ members: MemberDTO[] }>(`/api/servers/${props.serverId}/members`),
  enabled: computed(() => Boolean(props.serverId)),
})
const members = computed(() => membersQ.data.value?.members ?? [])
const assigneeItems = computed(() => [
  { value: '', label: 'Unassigned' },
  ...members.value.map(member => ({ value: member.user.id, label: member.nickname || member.user.displayName })),
])
const statusItems: Array<{ value: CustomerConversationStatus; label: string }> = [
  { value: 'open', label: 'Open' }, { value: 'waiting', label: 'Waiting' }, { value: 'resolved', label: 'Resolved' },
  { value: 'spam', label: 'Spam' }, { value: 'trash', label: 'Trash' },
]

async function update(body: { status?: CustomerConversationStatus; assigneeId?: string | null }) {
  try {
    await api(`/api/customers/conversations/${props.conversationId}`, { method: 'PATCH', body })
    await qc.invalidateQueries({ queryKey: ['customer-conversation', props.conversationId] })
    emit('changed')
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

const { send, retry } = useChannelSocket(computed(() => props.conversationId))
const mode = ref<'reply' | 'note'>('reply')
watch(() => props.conversationId, () => { mode.value = 'reply' })
const where = computed(() => detail.value?.conversation.sourceKind === 'telegram' ? 'Telegram' : 'the chat on your site')

function onReply(id: string) {
  ui.startReply(props.conversationId, id)
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <template v-if="detail">
      <header class="df-top-row-min flex flex-wrap items-center gap-2 border-b border-default px-3 py-1">
        <UButton icon="i-ph-arrow-left" color="neutral" variant="ghost" square class="md:hidden" aria-label="Back to conversations" @click="emit('back')" />
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
          <p v-else-if="detail.telegram" class="truncate text-xs text-muted">Telegram · {{ detail.telegram.name }}</p>
        </div>
        <USelect v-model="assignee" :items="assigneeItems" :disabled="!detail.canReply" size="sm" class="w-40" aria-label="Assignee" />
        <USelect v-model="status" :items="statusItems" :disabled="!detail.canReply" size="sm" class="w-32" aria-label="Status" />
      </header>
      <ChatMessageList
        :channel-id="conversationId"
        :members="members"
        :channel-name="detail.conversation.contactName"
        :show-intro="false"
        :allow-threads="false"
        :read-only="!detail.canReply"
        @reply="onReply"
        @read="(messageId) => send({ t: 'read', messageId } as ClientMsg)"
        @retry="retry"
      />
      <div v-if="detail.canReply" class="border-t border-default" :class="mode === 'note' ? 'bg-warning/5' : ''">
        <div class="flex items-center gap-1 px-3 pt-2 sm:px-5" role="tablist" aria-label="Write">
          <UButton
            label="Reply"
            size="xs"
            color="neutral"
            role="tab"
            :aria-selected="mode === 'reply'"
            :variant="mode === 'reply' ? 'soft' : 'ghost'"
            @click="mode = 'reply'"
          />
          <UButton
            label="Internal note"
            size="xs"
            color="warning"
            role="tab"
            :aria-selected="mode === 'note'"
            :variant="mode === 'note' ? 'soft' : 'ghost'"
            @click="mode = 'note'"
          />
          <span class="ms-2 truncate text-xs text-muted">{{ mode === 'reply' ? `Goes to ${where}` : 'Only the team sees it' }}</span>
        </div>
        <ChatComposer
          :channel-id="conversationId"
          :server-id="serverId"
          :members="members"
          :send="send as (msg: ClientMsg) => void"
          :deliver="mode === 'reply'"
          :group-mentions="false"
          can-attach
          primary
          :placeholder="mode === 'reply' ? `Reply to ${detail.conversation.contactName}` : 'Write a note only the team sees'"
        />
      </div>
      <div v-else class="border-t border-default p-4 text-sm text-muted">Read only</div>
    </template>
    <LayoutSkeleton v-else-if="detailQ.isPending.value" variant="messages" :rows="3" class="p-4" />
    <LayoutLoadError v-else-if="detailQ.error.value" inline message="This conversation did not load." :retry="detailQ.refetch" />
  </div>
</template>
