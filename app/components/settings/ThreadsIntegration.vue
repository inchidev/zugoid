<script setup lang="ts">
import type { IntegrationsDTO } from '~~/shared/integrations'

const props = defineProps<{ serverId: string; connection: IntegrationsDTO['threads'] }>()
const emit = defineEmits<{ changed: [] }>()
const { api } = useApi()
const route = useRoute()
const toast = useToast()
const endpoint = computed(() => `/api/servers/${props.serverId}/integrations/threads`)
const formOpen = ref(false)
const appId = ref('')
const appSecret = ref('')
const busy = ref<'connect' | 'disconnect' | null>(null)
const error = ref('')

const outcomeMessages: Record<string, string> = {
  declined: 'Threads authorization was declined. Try connecting again to grant keyword search.',
  expired: 'This Threads authorization request expired or was replaced. Start a new connection.',
  failed: 'Threads could not complete authorization. Check the app credentials and redirect URL, then try again.',
}
onMounted(() => {
  const { threads, ...query } = route.query
  if (typeof threads !== 'string') return
  if (threads === 'connected') toast.add({ title: 'Threads connected', color: 'success' })
  else if (Object.hasOwn(outcomeMessages, threads)) error.value = outcomeMessages[threads]!
  void navigateTo({ path: route.path, query }, { replace: true })
})

async function connect() {
  busy.value = 'connect'
  error.value = ''
  try {
    const { authorizationUrl } = await api<{ authorizationUrl: string }>(endpoint.value, {
      method: 'POST', body: { appId: appId.value, appSecret: appSecret.value },
    })
    appSecret.value = ''
    window.location.assign(authorizationUrl)
  } catch (cause) {
    error.value = errorMessage(cause)
    busy.value = null
  }
}

async function disconnect() {
  busy.value = 'disconnect'
  error.value = ''
  try {
    await api(endpoint.value, { method: 'DELETE' })
    emit('changed')
    toast.add({ title: 'Threads disconnected', color: 'success' })
  } catch (cause) { error.value = errorMessage(cause) }
  finally { busy.value = null }
}

function cancel() {
  formOpen.value = false
  appSecret.value = ''
}

async function copyCallback() {
  try {
    await navigator.clipboard.writeText(props.connection.callbackUrl)
    toast.add({ title: 'Copied', color: 'success' })
  } catch { error.value = 'Could not copy the redirect URL. Select and copy it from the field.' }
}
</script>

<template>
  <article class="space-y-3 rounded-lg border border-default p-4">
    <div class="flex flex-wrap items-center gap-2">
      <h3 class="flex-1 font-medium">Threads Search</h3>
      <UBadge :label="connection.expired ? 'Expired' : connection.expiresAt ? 'Connected' : 'Off'" color="neutral" variant="subtle" />
    </div>
    <p class="text-sm text-muted">Agents with Research the web can search Threads by keyword or topic tag. Your Meta app needs approval for public search.</p>
    <p v-if="connection.expiresAt && !connection.expired" class="text-sm text-muted">Reconnect before {{ connection.expiresAt.slice(0, 10) }} (UTC).</p>
    <UAlert v-if="error" color="error" title="Threads connection" :description="error" />
    <div class="flex flex-wrap gap-2">
      <UButton v-if="!formOpen" :label="connection.expiresAt ? 'Reconnect Threads' : 'Connect Threads'" :disabled="busy !== null" @click="formOpen = true" />
      <UButton v-if="connection.expiresAt" label="Disconnect" color="neutral" variant="outline" :disabled="busy === 'connect'" :loading="busy === 'disconnect'" @click="disconnect" />
    </div>
    <form v-if="formOpen" class="space-y-3" @submit.prevent="connect">
      <p class="text-sm text-muted">Add this URL to your Meta app’s valid OAuth redirect URIs, then enter its Threads App ID and secret.</p>
      <UFormField label="OAuth redirect URL">
        <div class="flex min-w-0 items-center gap-2">
          <UInput :model-value="connection.callbackUrl" readonly class="min-w-0 flex-1" />
          <UButton type="button" label="Copy" color="neutral" variant="outline" @click="copyCallback" />
        </div>
      </UFormField>
      <UFormField label="Threads App ID">
        <UInput v-model="appId" inputmode="numeric" autocomplete="off" required class="w-full" />
      </UFormField>
      <UFormField label="Threads App secret">
        <UInput v-model="appSecret" type="password" autocomplete="off" required class="w-full" />
      </UFormField>
      <div class="flex flex-wrap gap-2">
        <UButton type="submit" label="Continue to Threads" :loading="busy === 'connect'" :disabled="busy !== null || !appId.trim() || !appSecret.trim()" />
        <UButton type="button" label="Cancel" color="neutral" variant="ghost" :disabled="busy !== null" @click="cancel" />
      </div>
    </form>
  </article>
</template>
