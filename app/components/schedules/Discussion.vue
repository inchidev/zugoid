<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { ClientMsg, MemberDTO } from '~~/shared/types'

const props = defineProps<{ scheduleId: string }>()
const { api } = useApi()
const { serverId } = useServer()
const ui = useUiStore()
const directory = useQuery({
  queryKey: computed(() => ['members', serverId.value]),
  queryFn: () => api<{ members: MemberDTO[] }>(`/api/servers/${serverId.value}/members`),
  enabled: computed(() => Boolean(serverId.value)),
})
const members = computed(() => directory.data.value?.members ?? [])
const discussion = useQuery({
  queryKey: computed(() => ['schedule-discussion', props.scheduleId]),
  queryFn: () => api<{ channelId: string; canSend: boolean }>(`/api/schedules/${props.scheduleId}/discussion`),
})
const channelId = computed(() => discussion.data.value?.channelId ?? '')
const { send, retry } = useChannelSocket(channelId)
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col">
    <LayoutPageHeader title="Scheduled work" icon="i-ph-clock">
      <template #actions>
        <UButton to="/schedules" label="All schedules" color="neutral" variant="ghost" />
      </template>
    </LayoutPageHeader>
    <LayoutLoadError v-if="discussion.isError.value" message="The schedule chat is unavailable." :retry="discussion.refetch" />
    <LayoutSkeleton v-else-if="!channelId" variant="messages" :rows="3" class="flex-1" />
    <template v-else>
      <ChatMessageList
        :channel-id="channelId"
        :members="members"
        channel-name="scheduled work"
        :show-intro="false"
        :allow-threads="false"
        @reply="id => ui.startReply(channelId, id)"
        @read="messageId => send({ t: 'read', messageId } as ClientMsg)"
        @retry="retry"
      />
      <ChatComposer
        v-if="discussion.data.value?.canSend"
        :channel-id="channelId"
        :server-id="serverId"
        :members="members"
        :send="send"
        placeholder="Discuss a run"
      />
    </template>
  </div>
</template>
