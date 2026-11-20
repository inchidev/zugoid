<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { CustomerConversationStatus, CustomerSourceConversationDTO } from '~~/shared/types'
import { formatDateTime } from '~~/shared/format'
import type { WidgetFolder } from '~~/shared/paths'

/** A Widget's or a Telegram bot's Conversations with one status, beside the open one. */
const props = defineProps<{
  sourceId: string
  sourceName: string
  folder: WidgetFolder
  /** Where an empty Open folder says new Conversations come from. */
  emptyHint: string
}>()

const { serverId } = useServer()
const { api } = useApi()
const route = useRoute()
const qc = useQueryClient()
const ui = useUiStore()

const conversationId = computed(() => String(route.query.conversation || '') || null)
const listQ = useQuery({
  queryKey: computed(() => ['customer-source-conversations', props.sourceId, props.folder]),
  queryFn: () => api<{ conversations: CustomerSourceConversationDTO[] }>(`/api/customers/sources/${props.sourceId}/conversations`, { query: { status: props.folder } }),
  enabled: computed(() => Boolean(props.sourceId)),
  // New Conversations have no socket of their own yet; the open one is live.
  refetchInterval: 10_000,
})
const conversations = computed(() => listQ.data.value?.conversations ?? [])
const labels: Record<CustomerConversationStatus, string> = { open: 'Open', waiting: 'Waiting', resolved: 'Resolved', spam: 'Spam', trash: 'Trash' }
const folderLabel = computed(() => labels[props.folder])

function openConversation(id: string | null) {
  void navigateTo({ query: id ? { conversation: id } : {} })
}
async function changed() {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['customer-source-conversations', props.sourceId] }),
    qc.invalidateQueries({ queryKey: ['customer-widgets'] }),
    qc.invalidateQueries({ queryKey: ['customer-telegram-bots'] }),
  ])
}
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
              <p class="truncate text-[11px] text-muted">{{ sourceName }}</p>
            </div>
          </div>
          <LayoutSkeleton v-if="listQ.isPending.value" variant="rows" :rows="6" />
          <LayoutLoadError v-else-if="listQ.error.value" inline message="Conversations did not load." :retry="listQ.refetch" />
          <div v-else-if="!conversations.length" class="px-6 py-16 text-center">
            <UIcon name="i-ph-chat-circle-dots" class="size-8 text-dimmed" />
            <p class="mt-3 text-sm font-medium text-highlighted">No {{ folderLabel.toLowerCase() }} conversations</p>
            <p v-if="folder === 'open'" class="mt-1 text-sm text-muted">{{ emptyHint }}</p>
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
        <CustomersConversationPane
          v-if="conversationId && serverId"
          :key="conversationId"
          :conversation-id="conversationId"
          :server-id="serverId"
          @back="openConversation(null)"
          @changed="changed"
        />
        <div v-else class="grid flex-1 place-items-center text-sm text-muted">Choose a conversation</div>
      </section>
    </div>
  </div>
</template>
