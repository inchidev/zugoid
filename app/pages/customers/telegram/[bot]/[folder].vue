<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { CustomerTelegramBotDTO } from '~~/shared/types'
import { isWidgetFolder, type WidgetFolder } from '~~/shared/paths'

definePageMeta({ layout: 'server', middleware: ['auth'] })

const { api } = useApi()
const route = useRoute()
const botId = computed(() => String(route.params.bot || ''))
const folder = computed<WidgetFolder>(() => isWidgetFolder(route.params.folder) ? route.params.folder : 'open')
const botsQ = useQuery({
  queryKey: ['customer-telegram-bots'],
  queryFn: () => api<{ bots: CustomerTelegramBotDTO[]; canManage: boolean }>('/api/customers/telegram'),
})
const bot = computed(() => botsQ.data.value?.bots.find(item => item.channelId === botId.value) ?? null)
</script>

<template>
  <CustomersSourceInbox
    :source-id="botId"
    :source-name="bot ? `@${bot.username}` : 'Telegram'"
    :folder="folder"
    empty-hint="What people write to the bot in Telegram appears here."
  />
</template>
