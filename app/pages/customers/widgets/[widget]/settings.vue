<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useClipboard } from '@vueuse/core'
import type { CustomerWidgetDTO, MemberDTO } from '~~/shared/types'
import { errorMessage } from '~/composables/useApi'

definePageMeta({ layout: 'server', middleware: ['auth'] })

const { api } = useApi()
const { serverId } = useServer()
const route = useRoute()
const qc = useQueryClient()
const toast = useToast()
const { copy, copied } = useClipboard()

const widgetId = computed(() => String(route.params.widget || ''))
const widgetQ = useQuery({
  queryKey: computed(() => ['customer-widget', widgetId.value]),
  queryFn: () => api<{ widget: CustomerWidgetDTO; memberIds: string[] }>(`/api/customers/widgets/${widgetId.value}`),
  enabled: computed(() => Boolean(widgetId.value)),
})
const widget = computed(() => widgetQ.data.value?.widget ?? null)
const canManage = computed(() => Boolean(widget.value?.canManage))

const name = ref('')
const sites = ref('')
const greeting = ref('')
const enabled = ref(true)
const answering = ref<string[]>([])
function load() {
  const value = widgetQ.data.value
  if (!value) return
  name.value = value.widget.name
  sites.value = value.widget.sites.join('\n')
  greeting.value = value.widget.greeting
  enabled.value = value.widget.enabled
  answering.value = [...value.memberIds]
}
watch(() => widgetQ.data.value, load, { immediate: true })
const siteList = computed(() => sites.value.split(/[\s,]+/u).filter(Boolean))
const dirty = computed(() => Boolean(widget.value) && (
  name.value.trim() !== widget.value!.name || siteList.value.join('\n') !== widget.value!.sites.join('\n')
  || greeting.value.trim() !== widget.value!.greeting || enabled.value !== widget.value!.enabled))
const membersDirty = computed(() => [...answering.value].sort().join() !== [...(widgetQ.data.value?.memberIds ?? [])].sort().join())

const membersQ = useQuery({
  queryKey: computed(() => ['members', serverId.value]),
  queryFn: () => api<{ members: MemberDTO[] }>(`/api/servers/${serverId.value}/members`),
  enabled: computed(() => Boolean(serverId.value)),
})
const memberItems = computed(() => (membersQ.data.value?.members ?? [])
  .filter(member => member.user.kind === 'human' || member.user.kind === 'agent')
  .map(member => ({ value: member.user.id, label: member.nickname || member.user.displayName })))

async function refresh() {
  await Promise.all([qc.invalidateQueries({ queryKey: ['customer-widget', widgetId.value] }), qc.invalidateQueries({ queryKey: ['customer-widgets'] })])
}
const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await api(`/api/customers/widgets/${widgetId.value}`, {
      method: 'PATCH',
      body: { name: name.value.trim(), sites: siteList.value, greeting: greeting.value.trim(), enabled: enabled.value },
    })
    if (membersDirty.value) await api(`/api/customers/widgets/${widgetId.value}/members`, { method: 'PUT', body: { userIds: answering.value } })
    await refresh()
    toast.add({ title: 'Widget saved' })
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { saving.value = false }
}

const deleteOpen = ref(false)
async function remove() {
  try {
    await api(`/api/customers/widgets/${widgetId.value}`, { method: 'DELETE' })
    deleteOpen.value = false
    await qc.invalidateQueries({ queryKey: ['customer-widgets'] })
    await navigateTo('/customers')
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <LayoutPageHeader icon="i-ph-chat-circle-dots" :crumbs="[{ label: 'Widgets' }, { label: widget?.name ?? '' }, { label: 'Settings' }]" :loading="widgetQ.isPending.value">
      <template v-if="widget && canManage" #actions>
        <UButton icon="i-ph-trash" color="neutral" variant="ghost" size="sm" aria-label="Delete widget" @click="deleteOpen = true" />
      </template>
    </LayoutPageHeader>
    <LayoutSkeleton v-if="widgetQ.isPending.value" variant="rows" :rows="6" />
    <LayoutEmptyState v-else-if="!widget" icon="i-ph-chat-circle-dots" title="Widget not found" description="It was removed, or it is in a Space you cannot reach." />
    <div v-else class="min-h-0 flex-1 overflow-y-auto">
      <section class="max-w-2xl space-y-2 border-b border-default px-4 py-5">
        <h3 class="text-sm font-semibold text-highlighted">Embed code</h3>
        <p class="text-sm text-muted">Add this line to every page of your site where the chat should appear, before <code>&lt;/body&gt;</code>. Changing the sites below never changes it.</p>
        <div class="flex items-start gap-2">
          <code class="min-w-0 flex-1 break-all rounded-md border border-default bg-elevated px-3 py-2 text-xs">{{ widget.embedCode }}</code>
          <UButton :icon="copied ? 'i-ph-check' : 'i-ph-copy'" :label="copied ? 'Copied' : 'Copy'" color="neutral" variant="soft" size="sm" @click="copy(widget.embedCode)" />
        </div>
        <p v-if="!widget.sites.length" class="text-sm text-warning">The chat appears on no site until you list one below.</p>
      </section>
      <form class="max-w-2xl space-y-4 px-4 py-5" @submit.prevent="save">
        <UFormField label="Name" hint="Visitors see it on top of the chat">
          <UInput v-model="name" :disabled="!canManage" maxlength="80" class="w-full" />
        </UFormField>
        <UFormField label="Sites" help="One per line. Exact addresses like https://example.com; https://*.example.com allows its subdomains. Other sites cannot show the chat.">
          <UTextarea v-model="sites" :disabled="!canManage" :rows="3" placeholder="https://example.com" class="w-full" />
        </UFormField>
        <UFormField label="Greeting" help="The first line a visitor reads.">
          <UTextarea v-model="greeting" :disabled="!canManage" :rows="2" maxlength="500" placeholder="Hi! How can we help?" class="w-full" />
        </UFormField>
        <UFormField label="Who answers" help="These Members see the widget's conversations and reply to visitors. The Owner always does.">
          <USelectMenu v-model="answering" :items="memberItems" value-key="value" multiple :disabled="!canManage" placeholder="Choose Members" class="w-full" />
        </UFormField>
        <USwitch v-model="enabled" :disabled="!canManage" label="On" description="When off, the chat disappears from your sites and visitors cannot write." />
        <UButton v-if="canManage" type="submit" label="Save" size="sm" :loading="saving" :disabled="(!dirty && !membersDirty) || !name.trim()" />
        <p v-else class="text-sm text-muted">Only the Owner or someone with Manage server changes a widget.</p>
      </form>
    </div>
    <UModal v-model:open="deleteOpen" title="Delete widget?" :description="`${widget?.name ?? ''} disappears from your sites and its conversations are removed. Its Contacts stay.`">
      <template #footer>
        <UButton label="Cancel" color="neutral" variant="outline" @click="deleteOpen = false" />
        <UButton label="Delete widget" color="error" @click="remove" />
      </template>
    </UModal>
  </div>
</template>
