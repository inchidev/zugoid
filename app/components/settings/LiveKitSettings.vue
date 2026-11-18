<script setup lang="ts">
import type { LiveKitSettingsAdminDTO } from '~~/shared/types'

const props = defineProps<{ serverId: string }>()
const { api } = useApi()
const toast = useToast()
const session = useSessionStore()
const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const removeConfirm = ref(false)
const editing = ref(false)
const livekit = ref<LiveKitSettingsAdminDTO | null>(null)
const form = reactive({ url: '', apiKey: '', apiSecret: '' })

const managed = computed(() => livekit.value?.source === 'deployment')
const connected = computed(() => Boolean(livekit.value?.configured))
const unreadable = computed(() => livekit.value?.source === 'database' && !livekit.value.secretReadable)
const showForm = computed(() => !managed.value && (!connected.value || editing.value || unreadable.value))

function apply(value: LiveKitSettingsAdminDTO) {
  livekit.value = value
  form.url = value.url ?? ''
  form.apiKey = value.apiKey ?? ''
  form.apiSecret = ''
  // The app shell reads this to decide whether to offer calls at all.
  if (session.health && value.configured) session.health = { ...session.health, realtimekit: true }
}

async function load() {
  loading.value = true
  try { apply((await api<{ livekit: LiveKitSettingsAdminDTO }>(`/api/servers/${props.serverId}/livekit`)).livekit) }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { loading.value = false }
}

async function save() {
  saving.value = true
  try {
    const body = { url: form.url.trim(), apiKey: form.apiKey.trim(), ...(form.apiSecret.trim() ? { apiSecret: form.apiSecret.trim() } : {}) }
    apply((await api<{ livekit: LiveKitSettingsAdminDTO }>(`/api/servers/${props.serverId}/livekit`, { method: 'PUT', body })).livekit)
    editing.value = false
    toast.add({ title: 'LiveKit connected', color: 'success' })
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { saving.value = false }
}

async function test() {
  testing.value = true
  try {
    await api(`/api/servers/${props.serverId}/livekit/test`, { method: 'POST' })
    toast.add({ title: 'LiveKit answers', color: 'success' })
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { testing.value = false }
}

async function remove() {
  saving.value = true
  try {
    apply((await api<{ livekit: LiveKitSettingsAdminDTO }>(`/api/servers/${props.serverId}/livekit`, { method: 'DELETE' })).livekit)
    removeConfirm.value = false
    toast.add({ title: 'LiveKit disconnected', color: 'success' })
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { saving.value = false }
}

onMounted(load)
</script>

<template>
  <section class="mt-10 border-t border-default pt-8">
    <div class="flex items-center gap-3">
      <h2 class="text-lg font-semibold text-highlighted">LiveKit</h2>
      <UBadge :label="connected ? 'In use' : unreadable ? 'Reconnect needed' : 'Not connected'" :color="connected ? 'success' : 'neutral'" variant="subtle" />
    </div>
    <p class="mt-1 text-sm text-muted">
      Run Live on your own LiveKit instead of RealtimeKit: one you host, for example next to this Server, or LiveKit Cloud. When LiveKit is connected, every new live session and call uses it.
    </p>

    <LayoutSkeleton v-if="loading" variant="form" class="mt-6" />
    <template v-else-if="livekit">
      <UAlert v-if="managed" class="mt-6" color="neutral" variant="subtle" title="Managed by the deployment" description="LiveKit comes from the Server's environment and overrides anything saved here." />
      <UAlert v-else-if="unreadable" class="mt-6" color="error" variant="subtle" title="The saved secret can no longer be read" description="AUTH_SECRET is missing or changed since LiveKit was connected. Enter the API secret again." />

      <dl v-if="connected" class="mt-6 grid gap-x-6 gap-y-3 rounded-lg border border-default p-4 text-sm sm:grid-cols-2">
        <div>
          <dt class="text-xs text-muted">Address</dt>
          <dd class="truncate font-mono text-xs text-highlighted">{{ livekit.url }}</dd>
        </div>
        <div>
          <dt class="text-xs text-muted">API key</dt>
          <dd class="truncate font-mono text-xs text-highlighted">{{ livekit.apiKey }}</dd>
        </div>
      </dl>

      <form v-if="showForm" class="mt-6 space-y-4" @submit.prevent="save">
        <UFormField label="Address" description="The LiveKit server's WebSocket address." required>
          <UInput v-model="form.url" placeholder="wss://live.example.com" class="w-full" autocomplete="off" />
        </UFormField>
        <UFormField label="API key" required>
          <UInput v-model="form.apiKey" class="w-full" autocomplete="off" />
        </UFormField>
        <UFormField label="API secret" :description="connected ? 'Leave empty to keep the saved secret.' : 'Stored encrypted and never shown again.'" :required="!connected">
          <UInput v-model="form.apiSecret" type="password" class="w-full" autocomplete="new-password" />
        </UFormField>
        <div class="flex flex-wrap gap-2">
          <UButton type="submit" label="Test and save" :loading="saving" :disabled="!form.url.trim() || !form.apiKey.trim() || (!connected && !form.apiSecret.trim())" />
          <UButton v-if="editing" label="Cancel" color="neutral" variant="ghost" @click="apply(livekit!); editing = false" />
        </div>
        <p class="text-xs text-muted">Saving ends the live sessions that are running now.</p>
      </form>

      <div v-else-if="connected && !managed" class="mt-4 flex flex-wrap gap-2">
        <UButton label="Test" color="neutral" variant="outline" icon="i-ph-pulse" :loading="testing" @click="test" />
        <UButton label="Change" color="neutral" variant="outline" icon="i-ph-pencil-simple" @click="editing = true" />
        <UButton label="Disconnect" color="error" variant="ghost" icon="i-ph-plugs" @click="removeConfirm = true" />
      </div>

      <UModal v-model:open="removeConfirm" title="Disconnect LiveKit?" description="Live sessions running now end. New ones use RealtimeKit if this Server has it.">
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" @click="removeConfirm = false" />
            <UButton label="Disconnect" color="error" :loading="saving" @click="remove" />
          </div>
        </template>
      </UModal>
    </template>
  </section>
</template>
