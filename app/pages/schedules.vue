<script setup lang="ts">
import { useInfiniteQuery } from '@tanstack/vue-query'
import { formatScheduleTime, relativeScheduleTime, scheduleEditable, scheduleErrorHint, type PublicSchedule, type ScheduleListPage, type ScheduleStatusFilter } from '~~/shared/schedules'
import { Permission } from '~~/shared/permissions'

definePageMeta({ layout: 'server', middleware: ['auth'] })
const { api } = useApi()
const { can } = useRoleGrants()
const toast = useToast()
const session = useSessionStore()
const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const status = ref<ScheduleStatusFilter>('current')
const statusItems = [{ label: 'Current', value: 'current' }, { label: 'Active', value: 'active' }, { label: 'Paused', value: 'paused' },
  { label: 'Blocked', value: 'blocked' }, { label: 'History', value: 'history' }]
const schedules = useInfiniteQuery({
  queryKey: computed(() => ['schedules', status.value]),
  queryFn: ({ pageParam }) => api<ScheduleListPage & { workAvailable: boolean }>('/api/schedules', { query: { status: status.value, ...(pageParam ? { cursor: pageParam } : {}) } }),
  initialPageParam: '' as string,
  getNextPageParam: last => last.nextCursor ?? undefined,
  enabled: computed(() => can(Permission.manageSchedules)), refetchInterval: 15000,
})
const firstPage = computed(() => schedules.data.value?.pages[0])
const items = computed(() => schedules.data.value?.pages.flatMap(page => page.schedules) ?? [])
const workAvailable = computed(() => firstPage.value?.workAvailable ?? false)
const editorOpen = ref(false)
const editing = ref<PublicSchedule | null>(null)
let editorTrigger: HTMLElement | null = null
const canEdit = (item: PublicSchedule) => scheduleEditable(item) && !item.unavailable && item.principalId === session.user?.id
function openEditor(event: MouseEvent, item: PublicSchedule | null = null) {
  editorTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  editing.value = item
  editorOpen.value = true
}
function restoreEditorFocus() {
  if (editorTrigger?.isConnected) editorTrigger.focus()
  editorTrigger = null
}
async function refresh() { await schedules.refetch() }
async function act(item: PublicSchedule, action: 'pause' | 'resume' | 'dismiss' | 'cancel') {
  try {
    if (action === 'cancel') await api(`/api/schedules/${item.id}`, { method: 'DELETE' })
    else await api(`/api/schedules/${item.id}`, { method: 'PATCH', body: { action } })
    await refresh()
  } catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
}
const statusColor = (value: PublicSchedule['status']) => value === 'blocked' ? 'error' : value === 'paused' ? 'warning' : value === 'active' ? 'success' : 'neutral'
const history = ref<string | null>(null)
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col">
    <LayoutPageHeader title="Scheduled" icon="i-ph-clock">
      <template v-if="can(Permission.manageSchedules)" #actions>
        <UButton label="New schedule" icon="i-ph-plus" @click="openEditor($event)" />
      </template>
    </LayoutPageHeader>
    <main class="mx-auto w-full max-w-3xl flex-1 space-y-6 overflow-auto p-4 sm:p-8">
      <UAlert v-if="!can(Permission.manageSchedules)" title="Your role does not allow schedules" color="neutral" />
      <template v-else>
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <UTabs v-model="status" :items="statusItems" :content="false" variant="link" class="min-w-0 max-w-full overflow-x-auto" />
          <span v-if="firstPage" class="text-xs tabular-nums text-muted">{{ firstPage.activeCount }} of {{ firstPage.activeLimit }} active</span>
        </div>
        <LayoutLoadError v-if="schedules.error.value" message="Schedules did not load." :retry="schedules.refetch" />
        <LayoutEmptyState
          v-else-if="schedules.isSuccess.value && !items.length" icon="i-ph-clock"
          :title="status === 'current' ? 'No schedules yet' : 'Nothing here'"
          :description="status === 'current' ? 'A reminder posts a message to a conversation and notifies you. Recurring work starts an agent Run on its assigned task.' : 'No schedules match this filter.'" />
        <article v-for="item in items" :key="item.id" class="space-y-2 rounded-lg border border-default p-4">
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm" :class="{ 'text-muted italic': item.unavailable }">{{ item.unavailable ? 'Conversation unavailable' : item.content }}</p>
            <UBadge :label="item.status" :color="statusColor(item.status)" variant="subtle" />
          </div>
          <p class="text-xs text-muted">
            <template v-if="item.nextAt && ['active', 'paused'].includes(item.status)">
              {{ formatScheduleTime(item.nextAt, item.timezone) }} ({{ item.timezone }})<template v-if="item.timezone !== browserZone"> · {{ formatScheduleTime(item.nextAt) }} your time</template> · {{ relativeScheduleTime(item.nextAt) }}
            </template>
            <template v-else>No further deliveries · {{ item.timezone }}</template>
            · {{ item.kind === 'work' ? 'task run' : 'reminder' }} · {{ item.recurrence }}
          </p>
          <UAlert v-if="item.lastError" :title="item.lastError" :description="scheduleErrorHint(item.lastErrorCode) ?? undefined" :color="item.status === 'blocked' ? 'error' : 'warning'" variant="subtle" />
          <div class="flex flex-wrap gap-1">
            <UButton v-if="canEdit(item)" label="Edit" color="neutral" variant="ghost" size="sm" @click="openEditor($event, item)" />
            <UButton v-if="item.status === 'active'" label="Pause" color="neutral" variant="ghost" size="sm" @click="act(item, 'pause')" />
            <UButton v-if="item.status === 'paused' || item.status === 'blocked'" label="Resume" color="neutral" variant="ghost" size="sm" @click="act(item, 'resume')" />
            <UButton v-if="['active', 'paused', 'blocked'].includes(item.status)" label="Cancel" color="neutral" variant="ghost" size="sm" @click="act(item, 'cancel')" />
            <UButton v-if="item.status === 'completed' || item.status === 'cancelled'" label="Remove" color="neutral" variant="ghost" size="sm" @click="act(item, 'dismiss')" />
            <UButton :label="history === item.id ? 'Hide history' : 'History'" color="neutral" variant="ghost" size="sm" :aria-expanded="history === item.id" @click="history = history === item.id ? null : item.id" />
          </div>
          <SchedulesHistory v-if="history === item.id" :schedule="item" />
        </article>
        <UButton v-if="schedules.hasNextPage.value" label="Load more" color="neutral" variant="outline" :loading="schedules.isFetchingNextPage.value" @click="schedules.fetchNextPage()" />
      </template>
    </main>
    <SchedulesEditorModal
      v-if="can(Permission.manageSchedules)"
      v-model:open="editorOpen"
      :schedule="editing"
      :work-available="workAvailable"
      @saved="refresh"
      @closed="restoreEditorFocus"
    />
  </div>
</template>
