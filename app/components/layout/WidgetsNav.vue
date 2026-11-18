<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { CustomerWidgetDTO } from '~~/shared/types'
import { WIDGET_FOLDERS, widgetPath, widgetSettingsPath, type WidgetFolder } from '~~/shared/paths'
import { errorMessage } from '~/composables/useApi'

const route = useRoute()
const { api } = useApi()
const qc = useQueryClient()
const toast = useToast()

const widgetsQ = useQuery({
  queryKey: ['customer-widgets'],
  queryFn: () => api<{ widgets: CustomerWidgetDTO[]; canManage: boolean }>('/api/customers/widgets'),
  refetchInterval: 30_000,
})
const widgets = computed(() => widgetsQ.data.value?.widgets ?? [])
const canManage = computed(() => Boolean(widgetsQ.data.value?.canManage))
const activeWidgetId = computed(() => route.path.startsWith('/customers/widgets/') ? String(route.params.widget || '') : '')
const activeFolder = computed(() => String(route.params.folder || (route.path.endsWith('/settings') ? 'settings' : 'open')))

const folderMeta: Record<WidgetFolder, { label: string; icon: string }> = {
  open: { label: 'Open', icon: 'i-ph-chat-circle-dots' },
  waiting: { label: 'Waiting', icon: 'i-ph-hourglass' },
  resolved: { label: 'Resolved', icon: 'i-ph-check-circle' },
  spam: { label: 'Spam', icon: 'i-ph-warning' },
  trash: { label: 'Trash', icon: 'i-ph-trash' },
}

const createOpen = ref(false)
const name = ref('')
const sites = ref('')
const creating = ref(false)
async function create() {
  creating.value = true
  try {
    const { channelId } = await api<{ channelId: string }>('/api/customers/widgets', {
      method: 'POST',
      body: { name: name.value.trim(), sites: sites.value.split(/[\s,]+/u).filter(Boolean) },
    })
    createOpen.value = false
    name.value = ''
    sites.value = ''
    await qc.invalidateQueries({ queryKey: ['customer-widgets'] })
    await navigateTo(widgetSettingsPath(channelId))
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { creating.value = false }
}
</script>

<template>
  <LayoutNavSection
    label="Widgets"
    collapse-key="customers:widgets"
    :create-label="canManage ? 'Create widget' : undefined"
    @create="createOpen = true"
  >
    <LayoutSkeleton v-if="widgetsQ.isPending.value" variant="nav" :rows="2" />
    <p v-else-if="!widgets.length" class="px-2 py-3 text-sm text-muted">
      {{ canManage ? 'Add a chat to your website.' : 'No widget assigned yet.' }}
    </p>
    <ul v-else>
      <li v-for="widget in widgets" :key="widget.channelId">
        <LayoutNavRow
          :to="widget.member ? widgetPath(widget.channelId) : widgetSettingsPath(widget.channelId)"
          :title="widget.name"
          :ancestor="widget.channelId === activeWidgetId"
          :unread="widget.openCount > 0"
        >
          <template #leading>
            <UIcon :name="widget.channelId === activeWidgetId ? 'i-ph-caret-down' : 'i-ph-caret-right'" class="size-3 shrink-0 text-dimmed" />
          </template>
          {{ widget.name }}
          <template #trailing>
            <span v-if="!widget.enabled" class="shrink-0 text-[11px] uppercase tracking-wide text-dimmed">Off</span>
            <UBadge
              v-else-if="widget.openCount && widget.channelId !== activeWidgetId"
              color="neutral"
              variant="subtle"
              size="sm"
              :label="widget.openCount > 99 ? '99+' : String(widget.openCount)"
            />
          </template>
        </LayoutNavRow>
        <ul v-if="widget.channelId === activeWidgetId" class="ms-4 border-s border-default ps-2">
          <template v-if="widget.member">
            <li v-for="folder in WIDGET_FOLDERS" :key="folder">
              <LayoutNavRow :to="widgetPath(widget.channelId, folder)" :active="folder === activeFolder">
                <template #leading><UIcon :name="folderMeta[folder].icon" class="size-[18px] shrink-0 text-dimmed" /></template>
                {{ folderMeta[folder].label }}
              </LayoutNavRow>
            </li>
          </template>
          <li>
            <LayoutNavRow :to="widgetSettingsPath(widget.channelId)" :active="activeFolder === 'settings'">
              <template #leading><UIcon name="i-ph-gear-six" class="size-[18px] shrink-0 text-dimmed" /></template>
              Settings
            </LayoutNavRow>
          </li>
        </ul>
      </li>
    </ul>

    <UModal v-model:open="createOpen" title="New widget" description="A chat on your website. You get one line of code to add to the site.">
      <template #body>
        <form id="create-widget" class="space-y-4" @submit.prevent="create">
          <UFormField label="Name" hint="Visitors see it on top of the chat">
            <UInput v-model="name" autofocus maxlength="80" placeholder="Support" class="w-full" />
          </UFormField>
          <UFormField label="Sites" hint="Separate with spaces or commas" description="Exact addresses like https://example.com. https://*.example.com allows its subdomains.">
            <UTextarea v-model="sites" :rows="2" placeholder="https://example.com" class="w-full" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <UButton label="Cancel" color="neutral" variant="ghost" @click="createOpen = false" />
        <UButton type="submit" form="create-widget" label="Create widget" :loading="creating" :disabled="!name.trim()" />
      </template>
    </UModal>
  </LayoutNavSection>
</template>
