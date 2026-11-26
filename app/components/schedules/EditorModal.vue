<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { Permission } from '~~/shared/permissions'
import { formatScheduleTime, relativeScheduleTime, resolveScheduleTime, scheduleLocalTime, type PublicSchedule } from '~~/shared/schedules'
import type { ChannelDTO, TaskAgentDTO, TaskBoardDTO } from '~~/shared/types'

const props = defineProps<{ schedule: PublicSchedule | null; workAvailable: boolean }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: []; closed: [] }>()
const { api } = useApi()
const { serverId } = useServer()
const { can } = useRoleGrants()
const formId = useId()
const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const timezones = [...new Set([browserZone, 'UTC', ...((Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? [])])].sort()
const kind = ref<PublicSchedule['kind']>('reminder')
const content = ref('')
const channelId = ref('')
const taskId = ref('')
const firstAt = ref('')
const recurrence = ref<PublicSchedule['recurrence']>('once')
const timezone = ref(browserZone)
const saving = ref(false)
const formError = ref('')

const channels = useQuery({
  queryKey: computed(() => ['channels', serverId.value]),
  queryFn: () => api<{ channels: ChannelDTO[] }>(`/api/servers/${serverId.value}/channels`),
  enabled: computed(() => open.value && Boolean(serverId.value)),
})
const dms = useQuery({
  queryKey: ['dms'],
  queryFn: () => api<{ channels: ChannelDTO[] }>('/api/dms'),
  enabled: open,
})
const canLoadTasks = computed(() => open.value && kind.value === 'work' && can(Permission.readTasks))
const boards = useQuery({
  queryKey: computed(() => ['schedule-tasks', serverId.value]),
  queryFn: () => api<{ boards: TaskBoardDTO[] }>(`/api/servers/${serverId.value}/boards`),
  enabled: canLoadTasks,
})
const agents = useQuery({
  queryKey: computed(() => ['schedule-agents', serverId.value]),
  queryFn: () => api<{ agents: TaskAgentDTO[] }>(`/api/servers/${serverId.value}/task-agents`),
  enabled: canLoadTasks,
})
const channelOptions = computed(() => [...(channels.data.value?.channels ?? []), ...(dms.data.value?.channels ?? [])].map(channel => ({ label: channel.name, value: channel.id })))
const tasks = computed(() => boards.data.value?.boards.flatMap(board => board.tasks).filter(task => agents.data.value?.agents.some(agent => agent.id === task.assigneeId && agent.status === 'active') && !task.archivedAt && task.status !== 'done') ?? [])
const actionItems = computed(() => [{ label: 'Reminder', value: 'reminder' },
  ...(can(Permission.executeTasks) ? [{ label: 'Run an assigned task', value: 'work', disabled: !props.workAvailable }] : [])])
const resolved = computed(() => resolveScheduleTime(firstAt.value, timezone.value))
const canSave = computed(() => Boolean(content.value.trim() && channelId.value && resolved.value && (kind.value === 'reminder' || taskId.value)))
const preview = computed(() => {
  if (!resolved.value) return null
  const local = timezone.value === browserZone ? '' : ` · ${formatScheduleTime(resolved.value.at)} your time`
  return `Runs ${formatScheduleTime(resolved.value.at, timezone.value)} (${timezone.value})${local} · ${relativeScheduleTime(resolved.value.at)}`
})
const dstWarning = computed(() => resolved.value?.issue === 'gap'
  ? `That time does not exist in ${timezone.value} on this date because clocks move forward. It will run at ${resolved.value.wallTime.slice(11)} instead.`
  : resolved.value?.issue === 'overlap' ? `That time happens twice in ${timezone.value} on this date because clocks move back. The first occurrence is used.` : null)

// Remember what the form displayed, including the resolved wall time, so edits send only changes.
let originalAt: string | null = null
watch(open, (opened) => {
  if (!opened) return
  const schedule = props.schedule
  kind.value = schedule?.kind ?? 'reminder'
  content.value = schedule?.content ?? ''
  channelId.value = schedule?.channelId ?? ''
  taskId.value = schedule?.taskId ?? ''
  timezone.value = schedule?.timezone ?? browserZone
  recurrence.value = schedule?.recurrence ?? 'once'
  firstAt.value = schedule ? scheduleLocalTime(schedule) : ''
  originalAt = resolved.value?.at ?? null
  formError.value = ''
})
watch(() => props.workAvailable, (available) => {
  if (!available && kind.value === 'work' && !props.schedule) kind.value = 'reminder'
})

async function save() {
  if (saving.value || !canSave.value || !resolved.value) return
  saving.value = true
  formError.value = ''
  try {
    const schedule = props.schedule
    const timing = { firstAt: resolved.value.at, timezone: timezone.value, recurrence: recurrence.value }
    const task = tasks.value.find(task => task.id === taskId.value)
    const work = kind.value === 'work' ? { taskId: taskId.value, agentId: task?.assigneeId } : {}
    if (schedule) {
      const retimed = timing.firstAt !== originalAt || timing.timezone !== schedule.timezone || timing.recurrence !== schedule.recurrence
      const body = {
        ...(content.value.trim() !== schedule.content ? { content: content.value } : {}),
        ...(retimed ? timing : {}),
        ...(kind.value === 'work' && taskId.value !== schedule.taskId ? work : {}),
      }
      if (Object.keys(body).length) await api(`/api/schedules/${schedule.id}`, { method: 'PATCH', body: { action: 'edit', ...body } })
    } else {
      await api('/api/schedules', { method: 'POST', body: { kind: kind.value, channelId: channelId.value, content: content.value, ...timing, ...work } })
    }
    open.value = false
    emit('saved')
  } catch (error) { formError.value = errorMessage(error) }
  finally { saving.value = false }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="schedule ? 'Edit schedule' : 'New schedule'"
    :dismissible="!saving"
    :close="!saving"
    :ui="{ content: 'max-w-xl' }"
    @after:leave="emit('closed')"
  >
    <template #body>
      <form :id="formId" @submit.prevent="save">
        <fieldset :disabled="saving" class="min-w-0 space-y-4">
          <UFormField label="What should happen?" required>
            <UTextarea v-model="content" class="w-full" required placeholder="Review the market research" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Action" :help="schedule ? 'The action cannot change. Cancel and create a new schedule instead.' : can(Permission.executeTasks) && !workAvailable ? 'Running tasks needs agent execution, which this Server has not configured.' : undefined">
              <USelect v-model="kind" :items="actionItems" class="w-full" :disabled="!!schedule" />
            </UFormField>
            <UFormField label="Conversation" :help="schedule ? 'The conversation cannot change.' : undefined" required>
              <USelect v-model="channelId" :items="channelOptions" placeholder="Choose a conversation" class="w-full" required :disabled="!!schedule" />
            </UFormField>
            <UFormField v-if="kind === 'work'" label="Assigned task" required>
              <USelect v-model="taskId" :items="tasks.map(task => ({ label: task.title, value: task.id }))" placeholder="Choose a task" class="w-full" required />
            </UFormField>
            <UFormField :label="schedule ? 'Next time' : 'First time'" help="Enter time in the selected timezone." required>
              <UInput v-model="firstAt" type="datetime-local" class="w-full" required />
            </UFormField>
            <UFormField label="Repeat">
              <USelect v-model="recurrence" :items="[{ label: 'Once', value: 'once' }, { label: 'Daily', value: 'daily' }, { label: 'Weekly', value: 'weekly' }]" class="w-full" />
            </UFormField>
            <UFormField label="Timezone">
              <USelectMenu v-model="timezone" :items="timezones" aria-label="Timezone" :search-input="{ placeholder: 'Search timezones' }" virtualize class="w-full" />
            </UFormField>
          </div>
          <p v-if="preview" class="text-sm text-muted" aria-live="polite">{{ preview }}</p>
          <UAlert v-if="dstWarning" :description="dstWarning" color="warning" variant="subtle" icon="i-ph-warning" />
        </fieldset>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full flex-col gap-3">
        <UAlert v-if="formError" :description="formError" color="error" variant="subtle" icon="i-ph-warning-circle" role="alert" />
        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" :disabled="saving" @click="open = false" />
          <UButton :form="formId" type="submit" :label="schedule ? 'Save changes' : 'Schedule'" :loading="saving" :disabled="!canSave" />
        </div>
      </div>
    </template>
  </UModal>
</template>
