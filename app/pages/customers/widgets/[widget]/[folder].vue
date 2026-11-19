<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { CustomerWidgetDTO } from '~~/shared/types'
import { isWidgetFolder, type WidgetFolder } from '~~/shared/paths'

definePageMeta({ layout: 'server', middleware: ['auth'] })

const { api } = useApi()
const route = useRoute()
const widgetId = computed(() => String(route.params.widget || ''))
const folder = computed<WidgetFolder>(() => isWidgetFolder(route.params.folder) ? route.params.folder : 'open')
const widgetsQ = useQuery({
  queryKey: ['customer-widgets'],
  queryFn: () => api<{ widgets: CustomerWidgetDTO[]; canManage: boolean }>('/api/customers/widgets'),
})
const widget = computed(() => widgetsQ.data.value?.widgets.find(item => item.channelId === widgetId.value) ?? null)
</script>

<template>
  <CustomersSourceInbox :source-id="widgetId" :source-name="widget?.name || 'Widget'" :folder="folder" empty-hint="What visitors write on your site appears here." />
</template>
