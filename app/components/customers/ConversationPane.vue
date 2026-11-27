<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useEventListener } from '@vueuse/core'
import type { ClientMsg, CustomerConversationDetailDTO, CustomerConversationStatus, MailMessageDTO, MemberDTO, MessageDTO } from '~~/shared/types'
import { formatDateTime } from '~~/shared/format'
import { errorMessage } from '~/composables/useApi'

/**
 * One Widget, Telegram or Email Conversation. It is a channel like any other, so it reads and writes
 * with Chat's message list and composer, live over its socket. Reply goes out through the
 * Source; Internal note stays with the team.
 */
const props = defineProps<{
  conversationId: string
  serverId: string
}>()
const emit = defineEmits<{ back: []; changed: []; forward: [message: MailMessageDTO, subject: string] }>()

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
// A select item cannot have an empty value.
const UNASSIGNED = 'unassigned'
const assigneeItems = computed(() => [
  { value: UNASSIGNED, label: 'Unassigned' },
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
  get: () => detail.value?.conversation.assigneeId ?? UNASSIGNED,
  set: (value: string) => { void update({ assigneeId: value === UNASSIGNED ? null : value }) },
})

const { send, retry } = useChannelSocket(computed(() => props.conversationId))
const mode = ref<'reply' | 'note'>('reply')
const pane = useTemplateRef('pane')
const composer = useTemplateRef('composer')
const selectedMailText = ref('')
watch(() => props.conversationId, () => { mode.value = 'reply'; selectedMailText.value = '' })
const where = computed(() => detail.value?.conversation.sourceKind === 'telegram' ? 'Telegram' : 'the chat on your site')

if (import.meta.client) {
  useEventListener(document, 'selectionchange', () => {
    selectedMailText.value = ''
    if (!detail.value?.email || !detail.value.canReply) return
    const selection = window.getSelection()
    if (!selection?.rangeCount || selection.isCollapsed) return
    const common = selection.getRangeAt(0).commonAncestorContainer
    const body = (common instanceof Element ? common : common.parentElement)?.closest('[data-email-text]')
    // An email body is the only selectable source. Notes and selections across messages stay local.
    if (body && pane.value?.contains(body)) selectedMailText.value = selection.toString().trim()
  })
}

/** Retrying an email that failed to go out keeps its human confirmation for uncertain delivery. */
const uncertainRetry = ref<MailMessageDTO | null>(null)
async function mailRetry(message: MessageDTO, confirmUncertain = false) {
  const email = message.email
  if (!email) return
  if (email.deliveryUncertain && !confirmUncertain) { uncertainRetry.value = message as MailMessageDTO; return }
  uncertainRetry.value = null
  try {
    await api(`/api/mail/threads/${props.conversationId}/retry`, { method: 'POST', body: { messageId: message.id, confirmUncertain } })
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
}

function onForward(message: MessageDTO) {
  if (message.email) emit('forward', message as MailMessageDTO, detail.value?.email?.subject ?? '')
}

function onReply(id: string) {
  ui.startReply(props.conversationId, id)
}
</script>

<template>
  <div ref="pane" class="flex min-h-0 min-w-0 flex-1 flex-col">
    <template v-if="detail">
      <header class="df-top-row-min flex flex-wrap items-center gap-2 border-b border-default px-3 py-1">
        <UButton icon="i-ph-arrow-left" color="neutral" variant="ghost" square class="md:hidden" aria-label="Back to conversations" @click="emit('back')" />
        <div class="min-w-0 flex-1">
          <NuxtLink v-if="detail.conversation.contactId" :to="`/customers/contacts/${detail.conversation.contactId}`" class="block truncate text-sm font-semibold text-highlighted hover:underline">
            {{ detail.conversation.contactName }}
          </NuxtLink>
          <h2 v-else class="truncate text-sm font-semibold text-highlighted">{{ detail.conversation.contactName }}</h2>
          <p v-if="detail.email" class="truncate text-xs text-muted" :title="detail.email.subject">{{ detail.email.subject }} · {{ detail.email.participants.join(', ') }}</p>
          <p v-else-if="detail.visitor" class="truncate text-xs text-muted">
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
        :read-on-open="Boolean(detail.email)"
        @reply="onReply"
        @read="(messageId, generation) => send({ t: 'read', messageId, generation })"
        @retry="retry"
        @mail-retry="mailRetry"
        @forward="onForward"
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
          <span class="ms-2 truncate text-xs text-muted">{{ mode === 'reply' ? (detail.email ? 'Goes out as an email' : `Goes to ${where}`) : 'Only the team sees it' }}</span>
        </div>
        <div v-if="detail.email && mode === 'reply' && selectedMailText" class="px-3 pt-1 sm:px-5">
          <UButton label="Quote selection" icon="i-ph-quotes" size="xs" color="neutral" variant="ghost" @mousedown.prevent @click="composer?.appendQuote(selectedMailText)" />
        </div>
        <ChatComposer
          ref="composer"
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
    <UModal :open="Boolean(uncertainRetry)" title="Send another copy?" @update:open="value => { if (!value) uncertainRetry = null }">
      <template #body><p class="text-sm text-muted">The recipient may already have this email. Sending again may deliver a duplicate.</p></template>
      <template #footer>
        <UButton label="Cancel" color="neutral" variant="ghost" @click="uncertainRetry = null" />
        <UButton label="Send another copy" color="warning" @click="uncertainRetry && mailRetry(uncertainRetry, true)" />
      </template>
    </UModal>
  </div>
</template>
