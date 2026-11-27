<script setup lang="ts">
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { AttachmentDTO, MailboxDTO, MailDraftDTO, MailMessageDTO, MailThreadDTO, MailThreadPageDTO } from '~~/shared/types'
import { forwardedEmail, mergeMailAddresses } from '~~/shared/mail'
import { formatDateTime } from '~~/shared/format'
import { isMailFolder, mailPath, type MailFolder } from '~~/shared/paths'
import type { MailDraftBody } from '~/composables/useMailDraftSaver'

const { serverId } = useServer()

definePageMeta({ layout: 'server', middleware: ['auth'] })

const { api } = useApi()
const route = useRoute()
const qc = useQueryClient()
const toast = useToast()
const nav = useNavActions()
const ui = useUiStore()

/** Mailbox, folder and open conversation all live in the URL so the sidebar can link to them. */
const activeMailboxId = computed(() => String(route.params.mailbox || '') || null)
const folder = computed<MailFolder>(() => {
  const value = String(route.params.folder || 'inbox')
  return isMailFolder(value) ? value : 'inbox'
})
const activeThreadId = computed(() => String(route.query.thread || '') || null)

const composeTo = ref('')
const composeSubject = ref('')
const composeBody = ref('')
const composeCc = ref('')
const composeBcc = ref('')
const composeCopies = ref(false)
const composeFiles = ref<AttachmentDTO[]>([])
/** Formatted mail is written in Markdown and sent as sanitized HTML with a text part. */
const composeFormat = ref<'text' | 'markdown'>('text')
const composeField = ref<{ textareaRef?: HTMLTextAreaElement } | null>(null)
const uploadingFiles = ref(0)
const sending = ref(false)
const refreshing = ref(false)
/** Searches the open folder of this mailbox. */
const searchInput = ref('')
const search = refDebounced(computed(() => searchInput.value.trim()), 300)
// Each email carries a key; retrying one after a dropped connection reuses it, so it is sent once.
const newRequestKey = () => crypto.randomUUID()
const composeKey = ref(newRequestKey())

function openThread(threadId: string | null) {
  void navigateTo({ query: threadId ? { thread: threadId } : {} })
}

// New mail arrives over the server connection; polling is only a fallback.
const mailboxesQ = useQuery({
  queryKey: ['mailboxes'],
  queryFn: () => api<{ mailboxes: MailboxDTO[] }>('/api/mail/mailboxes'),
  refetchInterval: 60_000,
})
const mailboxes = computed(() => mailboxesQ.data.value?.mailboxes ?? [])
const activeMailbox = computed(() => mailboxes.value.find(mailbox => mailbox.channelId === activeMailboxId.value) ?? null)
const canSend = computed(() => activeMailbox.value?.permission === 'send' || activeMailbox.value?.permission === 'manage')
const filesAvailable = computed(() => activeMailbox.value?.attachments !== false)
const threadsKey = computed(() => ['mail-threads', activeMailboxId.value, folder.value, search.value] as const)
const threadsQ = useInfiniteQuery({
  queryKey: threadsKey,
  queryFn: ({ pageParam }) => api<MailThreadPageDTO>(`/api/mail/mailboxes/${activeMailboxId.value}/threads`, {
    query: { status: folder.value, before: pageParam || undefined, q: search.value || undefined },
  }),
  initialPageParam: '',
  getNextPageParam: last => last.nextCursor ?? undefined,
  enabled: computed(() => Boolean(activeMailboxId.value) && folder.value !== 'drafts'),
  refetchInterval: 60_000,
})
const threads = computed(() => threadsQ.data.value?.pages.flatMap(page => page.threads) ?? [])
const draftsKey = computed(() => ['mail-drafts', activeMailboxId.value] as const)
const draftsQ = useQuery({
  queryKey: draftsKey,
  queryFn: () => api<{ drafts: MailDraftDTO[] }>(`/api/mail/mailboxes/${activeMailboxId.value}/drafts`),
  enabled: computed(() => Boolean(activeMailboxId.value) && canSend.value),
})
const drafts = computed(() => draftsQ.data.value?.drafts ?? [])
const listPending = computed(() => folder.value === 'drafts' ? draftsQ.isPending.value : threadsQ.isPending.value)

async function refreshMail() {
  if (refreshing.value) return
  const threadId = activeThreadId.value
  const folderKey = folder.value === 'drafts' ? draftsKey.value : threadsKey.value
  const keys = [folderKey, ['mailboxes'], ...(threadId ? [['customer-conversation', threadId], ['messages', threadId]] : [])]
  refreshing.value = true
  try {
    const results = await Promise.allSettled(keys.map(queryKey => qc.refetchQueries(
      { queryKey, exact: true, type: 'active' }, { cancelRefetch: false, throwOnError: true },
    )))
    if (results.some(result => result.status === 'rejected')) toast.add({ title: 'Could not refresh all mail', color: 'error' })
  }
  finally { refreshing.value = false }
}

/** Hovering a conversation loads it, so opening it is immediate. */
function prefetchThread(threadId: string) {
  void qc.prefetchQuery({ queryKey: ['customer-conversation', threadId], queryFn: () => api(`/api/customers/conversations/${threadId}`), staleTime: 15_000 })
}

/** A mailbox that disappeared (access revoked, renamed) shouldn't leave a dead URL. */
watch([mailboxes, activeMailboxId], ([items, id]) => {
  if (!items.length || !id) return
  if (!items.some(item => item.channelId === id)) void navigateTo(mailPath(items[0]!.channelId), { replace: true })
}, { immediate: true })

watch(folder, () => { searchInput.value = '' })

/** A new email written outside the pane moves the conversation it belongs to; reopen its folder. */
function conversationChanged() {
  void qc.invalidateQueries({ queryKey: ['mail-threads', activeMailboxId.value] })
  void qc.invalidateQueries({ queryKey: ['mailboxes'] })
}

async function compose() {
  const mailboxId = activeMailboxId.value
  if (!mailboxId || !canSend.value || !composeSubject.value.trim() || !composeBody.value.trim() || uploadingFiles.value) return
  const to = mergeMailAddresses(composeTo.value.split(/[;,\s]+/u).filter(Boolean))
  if (!to.length) return
  sending.value = true
  const draftId = await composeSaver.settle()
  try {
    const result = await api<{ threadId: string; thread: MailThreadDTO; message: MailMessageDTO }>(`/api/mail/mailboxes/${mailboxId}/send`, {
      method: 'POST',
      body: {
        to, cc: mergeMailAddresses(composeCc.value.split(/[;,\s]+/u).filter(Boolean)), bcc: mergeMailAddresses(composeBcc.value.split(/[;,\s]+/u).filter(Boolean)),
        subject: composeSubject.value.trim(), content: composeBody.value.trim(), format: composeFormat.value,
        attachmentIds: composeFiles.value.map(file => file.id), draftId: draftId ?? undefined, clientId: composeKey.value,
      },
    })
    composeKey.value = newRequestKey()
    composeSaver.reset()
    forgetDraft(draftId)
    nav.composeOpen.value = false
    if (result.message.email?.deliveryStatus === 'failed') {
      toast.add({ title: 'Your email was saved but not delivered', description: result.message.email.deliveryError || 'You can retry it from the conversation.', color: 'error' })
    }
    await navigateTo(mailPath(mailboxId, folder.value === 'all' ? 'all' : 'sent', result.threadId))
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { sending.value = false }
}

/** Forward opens a new email with the original quoted, like any mail client, and copies its files. */
async function forward(message: MailMessageDTO, subject: string) {
  const mailboxId = activeMailboxId.value
  if (!message.email || !mailboxId) return
  const forwarded = forwardedEmail({ subject, date: formatDateTime(message.createdAt), content: message.content, ...message.email })
  composeSaver.reset()
  composeTo.value = ''
  composeCc.value = ''
  composeBcc.value = ''
  composeCopies.value = false
  composeSubject.value = forwarded.subject
  composeBody.value = forwarded.body
  composeFiles.value = []
  composeFormat.value = 'text'
  composeKey.value = newRequestKey()
  nav.composeOpen.value = true
  if (!message.attachments.length) return
  if (!filesAvailable.value) { toast.add({ title: 'Attachments are not forwarded: this Server has no file storage', color: 'warning' }); return }
  uploadingFiles.value += 1
  try {
    for (const attachment of message.attachments) {
      const result = await api<{ attachment: AttachmentDTO }>(`/api/mail/mailboxes/${mailboxId}/attachments`, { method: 'POST', body: { forwardAttachmentId: attachment.id } })
      composeFiles.value = [...composeFiles.value, result.attachment]
    }
  }
  catch (error) { toast.add({ title: `Not every attachment was copied: ${errorMessage(error)}`, color: 'error' }) }
  finally { uploadingFiles.value -= 1 }
}

/** A new email saves a second after typing stops; a reply is written in its Conversation. */
const composeSaver = useMailDraftSaver(activeMailboxId)
function forgetDraft(id: string | null) {
  if (id) qc.setQueryData<{ drafts: MailDraftDTO[] }>(['mail-drafts', activeMailboxId.value], data => data && { drafts: data.drafts.filter(item => item.id !== id) })
}
function composeDraftBody(): MailDraftBody | null {
  const empty = !composeTo.value.trim() && !composeCc.value.trim() && !composeBcc.value.trim() && !composeSubject.value.trim() && !composeBody.value.trim() && !composeFiles.value.length
  return empty ? null : {
    threadId: null, to: composeTo.value.split(/[;,\s]+/u).filter(Boolean), cc: composeCc.value.split(/[;,\s]+/u).filter(Boolean), bcc: composeBcc.value.split(/[;,\s]+/u).filter(Boolean),
    subject: composeSubject.value, content: composeBody.value, format: composeFormat.value, attachmentIds: composeFiles.value.map(file => file.id),
  }
}
watch([composeTo, composeCc, composeBcc, composeSubject, composeBody, composeFiles, composeFormat], () => {
  if (nav.composeOpen.value && canSend.value) composeSaver.schedule(composeDraftBody)
})
function clearCompose() {
  composeTo.value = ''
  composeCc.value = ''
  composeBcc.value = ''
  composeSubject.value = ''
  composeBody.value = ''
  composeCopies.value = false
  composeFiles.value = []
  composeFormat.value = 'text'
}
/** Closing the new email keeps it in Drafts; the next one starts empty. */
watch(() => nav.composeOpen.value, (open) => {
  if (open) return
  void composeSaver.flush()
  composeSaver.reset()
  clearCompose()
})

/** A new email draft opens in the composer; a reply draft opens in its conversation. */
function openDraft(item: MailDraftDTO) {
  if (item.threadId) { openThread(item.threadId); return }
  composeSaver.reset(item.id)
  composeTo.value = item.to.join(', ')
  composeCc.value = item.cc.join(', ')
  composeBcc.value = item.bcc.join(', ')
  composeCopies.value = Boolean(item.cc.length || item.bcc.length)
  composeSubject.value = item.subject
  composeBody.value = item.content
  composeFiles.value = item.attachments
  composeFormat.value = item.format
  composeKey.value = newRequestKey()
  nav.composeOpen.value = true
}

async function discardCompose() {
  const files = composeFiles.value
  const id = await composeSaver.settle()
  if (id) { await composeSaver.discard(); forgetDraft(id) }
  else for (const file of files) void api(`/api/mail/mailboxes/${activeMailboxId.value}/attachments`, { method: 'DELETE', body: { attachmentId: file.id } }).catch(() => {})
  composeSaver.reset()
  nav.composeOpen.value = false
}

function draftTitle(item: MailDraftDTO) {
  return item.subject.trim() || '(no subject)'
}

const folderLabel = computed(() => folder.value === 'all' ? 'All mail' : folder.value.charAt(0).toUpperCase() + folder.value.slice(1))
</script>

<template>
  <div class="h-full min-h-0 min-w-0">
    <!-- The conversation list is resizable, like the chat panels; the conversation gets the rest. -->
    <div class="grid h-full min-h-0 min-w-0 grid-cols-1 md:grid-cols-[var(--mail-list-width)_minmax(0,1fr)]" :style="{ '--mail-list-width': `${ui.mailListWidth}px` }">
      <section class="relative min-h-0 border-e border-default" :class="activeThreadId ? 'hidden md:block' : 'block'">
        <LayoutResizeHandle
          v-model="ui.mailListWidth"
          class="hidden md:block"
          :min="240"
          :max="560"
          side="end"
          label="Resize conversation list"
        />
        <div class="h-full overflow-y-auto">
        <div class="df-top-row sticky top-0 z-10 flex items-center gap-2 border-b border-default bg-default/90 px-3 backdrop-blur">
          <LayoutMobileMenuButton />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-highlighted">{{ folderLabel }}</p>
            <p class="truncate text-[11px] text-muted">{{ activeMailbox?.address || 'Mail' }}</p>
          </div>
          <UTooltip text="Refresh mail">
            <UButton type="button" icon="i-ph-arrows-clockwise" aria-label="Refresh mail" color="neutral" variant="ghost" size="sm" square :loading="refreshing" @click="refreshMail" />
          </UTooltip>
          <UButton v-if="canSend" label="Compose" trailing-icon="i-ph-pencil-simple" size="sm" @click="nav.composeOpen.value = true" />
        </div>
        <div v-if="activeMailbox && folder !== 'drafts'" class="border-b border-default px-3 py-2">
          <UInput v-model="searchInput" icon="i-ph-magnifying-glass" :placeholder="`Search ${folderLabel}`" :aria-label="`Search ${folderLabel}`" size="sm" class="w-full" />
        </div>
        <LayoutSkeleton v-if="listPending" variant="rows" :rows="6" />
        <template v-else-if="folder === 'drafts'">
          <div v-if="!drafts.length" class="px-6 py-16 text-center">
            <UIcon name="i-ph-note-pencil" class="size-8 text-dimmed" />
            <p class="mt-3 text-sm font-medium text-highlighted">No drafts</p>
            <p class="mt-1 text-sm text-muted">Email you start writing is saved here until you send it.</p>
          </div>
          <button
            v-for="item in drafts"
            :key="item.id"
            type="button"
            class="block w-full border-b border-default px-4 py-3 text-start hover:bg-elevated/60"
            :class="item.threadId && item.threadId === activeThreadId ? 'bg-accented' : ''"
            @click="openDraft(item)"
          >
            <div class="flex items-baseline gap-2">
              <span class="min-w-0 flex-1 truncate text-sm text-default">{{ item.to.join(', ') || 'No recipients' }}</span>
              <span class="shrink-0 text-[11px] text-muted">{{ formatDateTime(item.updatedAt) }}</span>
            </div>
            <p class="mt-0.5 truncate text-sm text-default">{{ draftTitle(item) }}</p>
            <p class="mt-0.5 line-clamp-2 text-xs text-muted">
              <span class="text-warning">Draft</span><template v-if="item.attachments.length"> · {{ item.attachments.length }} {{ item.attachments.length === 1 ? 'file' : 'files' }}</template> · {{ item.content.slice(0, 240) }}
            </p>
          </button>
        </template>
        <div v-else-if="!mailboxes.length || !threads.length" class="px-6 py-16 text-center">
          <UIcon :name="mailboxes.length ? 'i-ph-tray' : 'i-ph-envelope-simple'" class="size-8 text-dimmed" />
          <p class="mt-3 text-sm font-medium text-highlighted">{{ !mailboxes.length ? 'No mailbox assigned' : search ? 'No conversations match' : `${folderLabel} is empty` }}</p>
          <p v-if="!mailboxes.length" class="mt-1 text-sm text-muted">Ask a server admin for access to a mailbox.</p>
        </div>
        <button
          v-for="item in threads"
          :key="item.channelId"
          type="button"
          class="block w-full border-b border-default px-4 py-3 text-start hover:bg-elevated/60"
          :class="item.channelId === activeThreadId ? 'bg-accented' : ''"
          @mouseenter="prefetchThread(item.channelId)"
          @focus="prefetchThread(item.channelId)"
          @click="openThread(item.channelId)"
        >
          <div class="flex items-baseline gap-2">
            <span class="min-w-0 flex-1 truncate text-sm" :class="item.unread ? 'font-semibold text-highlighted' : 'text-default'">{{ item.participants.join(', ') || 'Unknown sender' }}</span>
            <span class="shrink-0 text-[11px] text-muted">{{ formatDateTime(item.lastMessageAt) }}</span>
          </div>
          <p class="mt-0.5 truncate text-sm" :class="item.unread ? 'font-medium text-highlighted' : 'text-default'">{{ item.subject }}</p>
          <p class="mt-0.5 line-clamp-2 text-xs text-muted">{{ item.preview }}</p>
        </button>
        <div v-if="folder !== 'drafts' && threadsQ.hasNextPage.value" class="p-3">
          <UButton
            label="Load older conversations"
            color="neutral"
            variant="soft"
            block
            :loading="threadsQ.isFetchingNextPage.value"
            @click="threadsQ.fetchNextPage()"
          />
        </div>
        </div>
      </section>

      <section class="flex min-h-0 min-w-0 flex-col" :class="activeThreadId ? 'flex' : 'hidden md:flex'">
        <CustomersConversationPane
          v-if="activeThreadId"
          :key="activeThreadId"
          :conversation-id="activeThreadId"
          :server-id="serverId"
          @back="openThread(null)"
          @changed="conversationChanged"
          @forward="forward"
        />
        <div v-else class="grid flex-1 place-items-center text-sm text-muted">Choose a conversation</div>
      </section>
    </div>

    <UModal v-model:open="nav.composeOpen.value" title="New email">
      <template #body>
        <div class="space-y-4">
          <UFormField label="To" hint="Separate addresses with commas"><UInput v-model="composeTo" type="text" autofocus class="w-full" /></UFormField>
          <UButton v-if="!composeCopies" label="Add Cc/Bcc" size="xs" color="neutral" variant="ghost" @click="composeCopies = true" />
          <template v-else>
            <UFormField label="Cc"><UInput v-model="composeCc" class="w-full" /></UFormField>
            <UFormField label="Bcc" hint="Hidden from other recipients"><UInput v-model="composeBcc" class="w-full" /></UFormField>
          </template>
          <UFormField label="Subject"><UInput v-model="composeSubject" class="w-full" /></UFormField>
          <UFormField label="Message">
            <MailFormatBar v-model="composeBody" v-model:format="composeFormat" :field="composeField" class="mb-1" />
            <UTextarea ref="composeField" v-model="composeBody" :rows="8" class="w-full" />
          </UFormField>
          <MailAttachments v-if="activeMailboxId" v-model="composeFiles" v-model:uploading="uploadingFiles" :mailbox-id="activeMailboxId" :available="filesAvailable" />
        </div>
      </template>
      <template #footer>
        <span v-if="composeSaver.savedId.value" class="me-auto text-xs text-muted">Saved to Drafts</span>
        <UButton label="Discard" color="neutral" variant="ghost" @click="discardCompose" />
        <UButton label="Close" color="neutral" variant="ghost" @click="nav.composeOpen.value = false" />
        <UButton label="Send email" trailing-icon="i-ph-paper-plane-tilt" :loading="sending" :disabled="!composeTo.trim() || !composeSubject.trim() || !composeBody.trim() || uploadingFiles > 0" @click="compose" />
      </template>
    </UModal>
  </div>
</template>
