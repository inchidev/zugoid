<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { CustomerTelegramBotDTO } from '~~/shared/types'
import { telegramPath, telegramSettingsPath, WIDGET_FOLDERS, type WidgetFolder } from '~~/shared/paths'
import { errorMessage } from '~/composables/useApi'

const route = useRoute()
const { api } = useApi()
const qc = useQueryClient()
const toast = useToast()

const botsQ = useQuery({
  queryKey: ['customer-telegram-bots'],
  queryFn: () => api<{ bots: CustomerTelegramBotDTO[]; canManage: boolean }>('/api/customers/telegram'),
  refetchInterval: 30_000,
})
const bots = computed(() => botsQ.data.value?.bots ?? [])
const canManage = computed(() => Boolean(botsQ.data.value?.canManage))
const activeBotId = computed(() => route.path.startsWith('/customers/telegram/') ? String(route.params.bot || '') : '')
const activeFolder = computed(() => String(route.params.folder || (route.path.endsWith('/settings') ? 'settings' : 'open')))

const folderMeta: Record<WidgetFolder, { label: string; icon: string }> = {
  open: { label: 'Open', icon: 'i-ph-chat-circle-dots' },
  waiting: { label: 'Waiting', icon: 'i-ph-hourglass' },
  resolved: { label: 'Resolved', icon: 'i-ph-check-circle' },
  spam: { label: 'Spam', icon: 'i-ph-warning' },
  trash: { label: 'Trash', icon: 'i-ph-trash' },
}

const connectOpen = ref(false)
const token = ref('')
const updates = ref<'webhook' | 'polling'>('webhook')
const apiBase = ref('')
const connecting = ref(false)
const updateItems = [
  { value: 'webhook', label: 'Telegram calls this Server', description: 'Instant. Needs this Server at a public https address.' },
  { value: 'polling', label: 'This Server asks Telegram', description: 'Works without a public address, such as on a local network.' },
]
async function connect() {
  connecting.value = true
  try {
    const { channelId } = await api<{ channelId: string }>('/api/customers/telegram', {
      method: 'POST',
      body: { token: token.value.trim(), updates: updates.value, apiBase: apiBase.value.trim() || null },
    })
    connectOpen.value = false
    token.value = ''
    apiBase.value = ''
    await qc.invalidateQueries({ queryKey: ['customer-telegram-bots'] })
    await navigateTo(telegramSettingsPath(channelId))
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { connecting.value = false }
}
</script>

<template>
  <LayoutNavSection
    label="Telegram"
    collapse-key="customers:telegram"
    :create-label="canManage ? 'Connect a bot' : undefined"
    @create="connectOpen = true"
  >
    <LayoutSkeleton v-if="botsQ.isPending.value" variant="nav" :rows="1" />
    <p v-else-if="!bots.length" class="px-2 py-3 text-sm text-muted">
      {{ canManage ? 'Answer people who write to your bot.' : 'No bot assigned yet.' }}
    </p>
    <ul v-else>
      <li v-for="bot in bots" :key="bot.channelId">
        <LayoutNavRow
          :to="bot.member ? telegramPath(bot.channelId) : telegramSettingsPath(bot.channelId)"
          :title="`@${bot.username}`"
          :ancestor="bot.channelId === activeBotId"
          :unread="bot.openCount > 0"
        >
          <template #leading>
            <UIcon :name="bot.channelId === activeBotId ? 'i-ph-caret-down' : 'i-ph-caret-right'" class="size-3 shrink-0 text-dimmed" />
          </template>
          @{{ bot.username }}
          <template #trailing>
            <UIcon v-if="bot.lastError" name="i-ph-warning-circle" class="size-4 shrink-0 text-error" role="img" :aria-hidden="false" aria-label="Telegram refused updates" />
            <span v-else-if="!bot.enabled" class="shrink-0 text-[11px] uppercase tracking-wide text-dimmed">Off</span>
            <UBadge
              v-else-if="bot.openCount && bot.channelId !== activeBotId"
              color="neutral"
              variant="subtle"
              size="sm"
              :label="bot.openCount > 99 ? '99+' : String(bot.openCount)"
            />
          </template>
        </LayoutNavRow>
        <ul v-if="bot.channelId === activeBotId" class="ms-4 border-s border-default ps-2">
          <template v-if="bot.member">
            <li v-for="folder in WIDGET_FOLDERS" :key="folder">
              <LayoutNavRow :to="telegramPath(bot.channelId, folder)" :active="folder === activeFolder">
                <template #leading><UIcon :name="folderMeta[folder].icon" class="size-[18px] shrink-0 text-dimmed" /></template>
                {{ folderMeta[folder].label }}
              </LayoutNavRow>
            </li>
          </template>
          <li>
            <LayoutNavRow :to="telegramSettingsPath(bot.channelId)" :active="activeFolder === 'settings'">
              <template #leading><UIcon name="i-ph-gear-six" class="size-[18px] shrink-0 text-dimmed" /></template>
              Settings
            </LayoutNavRow>
          </li>
        </ul>
      </li>
    </ul>

    <UModal v-model:open="connectOpen" title="Connect a Telegram bot" description="People write to the bot in Telegram; you answer them here.">
      <template #body>
        <form id="connect-telegram" class="space-y-4" @submit.prevent="connect">
          <UFormField label="Bot token" help="In Telegram, ask @BotFather for /newbot and paste the token it gives. It is kept encrypted on this Server.">
            <UInput v-model="token" type="password" autocomplete="off" autofocus placeholder="123456789:AA…" class="w-full" />
          </UFormField>
          <UFormField label="Updates">
            <URadioGroup v-model="updates" :items="updateItems" value-key="value" />
          </UFormField>
          <UCollapsible>
            <UButton label="Bot API address" color="neutral" variant="link" size="xs" trailing-icon="i-ph-caret-down" class="px-0" />
            <template #content>
              <UFormField class="pt-2" help="Only if this Server cannot reach api.telegram.org: the address of your own Bot API server or a proxy to it.">
                <UInput v-model="apiBase" placeholder="https://api.telegram.org" class="w-full" />
              </UFormField>
            </template>
          </UCollapsible>
        </form>
      </template>
      <template #footer>
        <UButton label="Cancel" color="neutral" variant="ghost" @click="connectOpen = false" />
        <UButton type="submit" form="connect-telegram" label="Connect bot" :loading="connecting" :disabled="!token.trim()" />
      </template>
    </UModal>
  </LayoutNavSection>
</template>
