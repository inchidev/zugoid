<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { HideableSection, ServerTheme } from '~~/shared/server-theme'

const props = defineProps<{ serverId: string }>()
const { api } = useApi()
const toast = useToast()
const session = useSessionStore()

/**
 * The Owner's module switches. A module turned off leaves the sidebar, its pages redirect to the
 * start page and its API answers 404; nothing is deleted, and turning it back on brings it all back.
 */
const saved = useQuery({
  queryKey: computed(() => ['modules', props.serverId]),
  queryFn: () => api<{ hiddenSections: HideableSection[] }>(`/api/servers/${props.serverId}/modules`),
})
const hidden = ref<HideableSection[]>([])
watch(() => saved.data.value?.hiddenSections, (value) => { if (value) hidden.value = [...value] }, { immediate: true })
const saving = ref(false)

const MODULES: Array<{ id: HideableSection; label: string; description: string }> = [
  { id: 'inbox', label: 'Inbox', description: 'Everything that needs you, in one list.' },
  { id: 'schedules', label: 'Scheduled', description: 'Reminders and recurring work.' },
  { id: 'tasks', label: 'Tasks', description: 'Boards and Tasks.' },
  { id: 'factory', label: 'Factory', description: 'Projects, repositories, Runs, Git and compute.' },
  { id: 'customers', label: 'Customers', description: 'Customer Conversations: the chat Widget, Telegram bots and Mail.' },
  { id: 'agents', label: 'Agents', description: 'Agents, their conversations and Runs.' },
  { id: 'data', label: 'Data', description: 'Databases, items and Data sources.' },
  { id: 'media', label: 'Media', description: 'The photo and video library.' },
]

function enabled(id: HideableSection) {
  return !hidden.value.includes(id)
}

function toggle(id: HideableSection, value: boolean) {
  hidden.value = value ? hidden.value.filter(section => section !== id) : [...new Set([...hidden.value, id])]
}

async function save() {
  saving.value = true
  try {
    const result = await api<{ hiddenSections: HideableSection[] }>(`/api/servers/${props.serverId}/modules`, { method: 'PUT', body: { hiddenSections: hidden.value } })
    hidden.value = result.hiddenSections
    if (session.health?.theme) session.health = { ...session.health, theme: { ...session.health.theme, hiddenSections: result.hiddenSections } as ServerTheme }
    await saved.refetch()
    toast.add({ title: 'Modules saved', color: 'success' })
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { saving.value = false }
}
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold">Modules</h2>
      <p class="mt-1 text-sm text-muted">What this Server uses. A module turned off leaves the sidebar and its API answers 404. Nothing is deleted: turning it back on brings everything back. Chat, Members, Spaces and Settings are always there.</p>
    </div>

    <LayoutLoadError v-if="saved.error.value" message="Modules did not load." :retry="saved.refetch" />
    <LayoutSkeleton v-else-if="!saved.data.value" variant="form" />
    <form v-else class="space-y-4" @submit.prevent="save">
      <div class="divide-y divide-default rounded-md border border-default">
        <label v-for="module in MODULES" :key="module.id" class="flex items-center gap-4 px-4 py-3">
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium text-highlighted">{{ module.label }}</span>
            <span class="block text-xs text-muted">{{ module.description }}</span>
          </span>
          <USwitch :model-value="enabled(module.id)" :aria-label="`${module.label} module`" @update:model-value="value => toggle(module.id, Boolean(value))" />
        </label>
      </div>
      <div class="flex justify-end">
        <UButton type="submit" label="Save modules" :loading="saving" />
      </div>
    </form>
  </section>
</template>
