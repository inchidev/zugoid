<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { CustomerTelegramBotDTO, MemberDTO } from '~~/shared/types'
import { errorMessage } from '~/composables/useApi'

definePageMeta({ layout: 'server', middleware: ['auth'] })

const { api } = useApi()
const { serverId } = useServer()
const route = useRoute()
const qc = useQueryClient()
const toast = useToast()

const botId = computed(() => String(route.params.bot || ''))
const botQ = useQuery({
  queryKey: computed(() => ['customer-telegram-bot', botId.value]),
  queryFn: () => api<{ bot: CustomerTelegramBotDTO; memberIds: string[] }>(`/api/customers/telegram/${botId.value}`),
  enabled: computed(() => Boolean(botId.value)),
})
const bot = computed(() => botQ.data.value?.bot ?? null)
const canManage = computed(() => Boolean(bot.value?.canManage))

const greeting = ref('')
const updates = ref<'webhook' | 'polling'>('webhook')
const apiBase = ref('')
const token = ref('')
const enabled = ref(true)
const answering = ref<string[]>([])
function load() {
  const value = botQ.data.value
  if (!value) return
  greeting.value = value.bot.greeting
  updates.value = value.bot.updates
  apiBase.value = value.bot.apiBase
  enabled.value = value.bot.enabled
  token.value = ''
  answering.value = [...value.memberIds]
}
watch(() => botQ.data.value, load, { immediate: true })
const dirty = computed(() => Boolean(bot.value) && (
  greeting.value.trim() !== bot.value!.greeting || updates.value !== bot.value!.updates || apiBase.value.trim() !== bot.value!.apiBase
  || enabled.value !== bot.value!.enabled || Boolean(token.value.trim())))
const membersDirty = computed(() => [...answering.value].sort().join() !== [...(botQ.data.value?.memberIds ?? [])].sort().join())
const updateItems = [
  { value: 'webhook', label: 'Telegram calls this Server', description: 'Instant. Needs this Server at a public https address.' },
  { value: 'polling', label: 'This Server asks Telegram', description: 'Works without a public address, such as on a local network.' },
]

const membersQ = useQuery({
  queryKey: computed(() => ['members', serverId.value]),
  queryFn: () => api<{ members: MemberDTO[] }>(`/api/servers/${serverId.value}/members`),
  enabled: computed(() => Boolean(serverId.value)),
})
const memberItems = computed(() => (membersQ.data.value?.members ?? [])
  .map(member => ({ value: member.user.id, label: member.nickname || member.user.displayName })))

async function refresh() {
  await Promise.all([qc.invalidateQueries({ queryKey: ['customer-telegram-bot', botId.value] }), qc.invalidateQueries({ queryKey: ['customer-telegram-bots'] })])
}
const saving = ref(false)
async function save() {
  saving.value = true
  try {
    if (dirty.value) {
      await api(`/api/customers/telegram/${botId.value}`, {
        method: 'PATCH',
        body: {
          greeting: greeting.value.trim(), updates: updates.value, apiBase: apiBase.value.trim() || null, enabled: enabled.value,
          ...token.value.trim() ? { token: token.value.trim() } : {},
        },
      })
    }
    if (membersDirty.value) await api(`/api/customers/telegram/${botId.value}/members`, { method: 'PUT', body: { userIds: answering.value } })
    await refresh()
    toast.add({ title: 'Bot saved' })
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { saving.value = false }
}

const deleteOpen = ref(false)
async function remove() {
  try {
    await api(`/api/customers/telegram/${botId.value}`, { method: 'DELETE' })
    deleteOpen.value = false
    await qc.invalidateQueries({ queryKey: ['customer-telegram-bots'] })
    await navigateTo('/customers')
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <LayoutPageHeader icon="i-ph-telegram-logo" :crumbs="[{ label: 'Telegram' }, { label: bot ? `@${bot.username}` : '' }, { label: 'Settings' }]" :loading="botQ.isPending.value">
      <template v-if="bot && canManage" #actions>
        <UButton icon="i-ph-trash" color="neutral" variant="ghost" size="sm" aria-label="Disconnect bot" @click="deleteOpen = true" />
      </template>
    </LayoutPageHeader>
    <LayoutSkeleton v-if="botQ.isPending.value" variant="rows" :rows="6" />
    <LayoutEmptyState v-else-if="!bot" icon="i-ph-telegram-logo" title="Bot not found" description="It was disconnected, or it is in a Space you cannot reach." />
    <div v-else class="min-h-0 flex-1 overflow-y-auto">
      <section class="max-w-2xl space-y-2 border-b border-default px-4 py-5">
        <h3 class="text-sm font-semibold text-highlighted">@{{ bot.username }}</h3>
        <p class="text-sm text-muted">
          People find the bot in Telegram as <a :href="`https://t.me/${bot.username}`" target="_blank" rel="noopener" class="text-highlighted underline">t.me/{{ bot.username }}</a>.
          Each person who writes becomes a Contact, verified by Telegram.
        </p>
        <UAlert v-if="bot.lastError" color="error" variant="subtle" icon="i-ph-warning-circle" title="Telegram refused" :description="bot.lastError" />
      </section>
      <form class="max-w-2xl space-y-4 px-4 py-5" @submit.prevent="save">
        <UFormField label="Greeting" help="What someone reads after pressing Start. Empty sends nothing.">
          <UTextarea v-model="greeting" :disabled="!canManage" :rows="2" maxlength="2000" placeholder="Hi! Write your question and we will answer here." class="w-full" />
        </UFormField>
        <UFormField label="Who answers" help="These Members see the bot's conversations and reply. The Owner always does.">
          <USelectMenu v-model="answering" :items="memberItems" value-key="value" multiple :disabled="!canManage" placeholder="Choose Members" class="w-full" />
        </UFormField>
        <UFormField label="Updates">
          <URadioGroup v-model="updates" :items="updateItems" value-key="value" :disabled="!canManage" />
        </UFormField>
        <UFormField label="Bot API address" help="Telegram's own, unless this Server cannot reach it: then your own Bot API server or a proxy to it.">
          <UInput v-model="apiBase" :disabled="!canManage" placeholder="https://api.telegram.org" class="w-full" />
        </UFormField>
        <UFormField label="New token" help="Only after BotFather revoked the old one. It must be for the same bot.">
          <UInput v-model="token" type="password" autocomplete="off" :disabled="!canManage" placeholder="Keep the current token" class="w-full" />
        </UFormField>
        <USwitch v-model="enabled" :disabled="!canManage" label="On" description="When off, the bot takes no messages and sends no replies." />
        <UButton v-if="canManage" type="submit" label="Save" size="sm" :loading="saving" :disabled="!dirty && !membersDirty" />
        <p v-else class="text-sm text-muted">Only the Owner or someone with Manage server changes a bot.</p>
      </form>
    </div>
    <UModal v-model:open="deleteOpen" title="Disconnect bot?" :description="`@${bot?.username ?? ''} stops answering here and its conversations are removed. Its Contacts stay. The bot itself stays yours in Telegram.`">
      <template #footer>
        <UButton label="Cancel" color="neutral" variant="outline" @click="deleteOpen = false" />
        <UButton label="Disconnect bot" color="error" @click="remove" />
      </template>
    </UModal>
  </div>
</template>
