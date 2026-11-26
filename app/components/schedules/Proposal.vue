<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { useQueryClient } from '@tanstack/vue-query'
import { scheduleConversationPath } from '~~/shared/paths'
import { formatScheduleTime, type ScheduleProposal } from '~~/shared/schedules'

const props = defineProps<{ proposal: ScheduleProposal; runId: string; agentName: string }>()
const { api } = useApi()
const queryClient = useQueryClient()
const mobile = useMediaQuery('(max-width: 639px)')
const open = ref(false)
const busy = ref(false)
const error = ref('')
const confirmed = ref(false)

async function confirm() {
  busy.value = true
  error.value = ''
  try {
    await api(`/api/agent-runs/${props.runId}/schedule`, { method: 'POST', body: { proposalId: props.proposal.id } })
    confirmed.value = true
    open.value = false
    void queryClient.invalidateQueries({ queryKey: ['schedules'] })
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UButton v-if="confirmed || proposal.confirmed" label="Open scheduled chat" :to="scheduleConversationPath(proposal.id)" color="neutral" variant="outline" />
  <UModal v-else v-model:open="open" title="Review schedule" :fullscreen="mobile" :dismissible="!busy">
    <UButton label="Review schedule" icon="i-ph-clock" color="neutral" variant="outline" />
    <template #body>
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt class="text-muted">Agent</dt><dd>{{ agentName }}</dd>
        <dt class="text-muted">First run</dt><dd>{{ formatScheduleTime(proposal.input.firstAt, proposal.input.timezone) }} ({{ proposal.input.timezone }})</dd>
        <dt class="text-muted">Repeat</dt><dd class="capitalize">{{ proposal.input.recurrence }}</dd>
        <template v-if="proposal.input.taskId">
          <dt class="text-muted">Assigned task</dt><dd class="break-all">{{ proposal.input.taskId }}</dd>
        </template>
        <dt class="text-muted">Results</dt><dd>One chat in Scheduled, with start notices in this conversation.</dd>
      </dl>
      <p class="mt-4 whitespace-pre-wrap break-words text-sm">{{ proposal.input.content }}</p>
      <UAlert v-if="error" class="mt-4" color="error" variant="soft" :description="error" role="alert" />
    </template>
    <template #footer="{ close }">
      <UButton label="Cancel" color="neutral" variant="ghost" :disabled="busy" @click="close" />
      <UButton label="Create schedule" :loading="busy" @click="confirm" />
    </template>
  </UModal>
</template>
