<script setup lang="ts">
import { partnerDestination } from '~~/shared/partner-destination'
/**
 * Where a partner's app sends its people: `/partner#ticket=…`. The ticket stays in the fragment, so it never reaches
 * a log or a Referer; it is spent once and the person lands in the Server signed in.
 */
definePageMeta({ layout: 'auth' })

const session = useSessionStore()
const { api } = useApi()
const error = ref<string | null>(null)

onMounted(async () => {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const ticket = params.get('ticket') || ''
  const handoff = partnerDestination(params.get('next'))
  window.history.replaceState({}, '', window.location.pathname)
  if (!ticket) {
    error.value = 'This link is incomplete. Open the server again from the app.'
    return
  }
  try {
    const result = await api<{ next?: string }>('/api/auth/partner/sign-in', { method: 'POST', body: { ticket } })
    const next = result.next ? partnerDestination(result.next) : handoff
    await session.refresh(api)
    await navigateTo(session.user?.onboardingRequired ? { path: '/signup/accept', query: { next } } : next, { replace: true })
  }
  catch (err) {
    error.value = errorMessage(err)
  }
})
</script>

<template>
  <div>
    <h2 class="text-2xl font-semibold tracking-tight text-highlighted">Opening the server</h2>
    <template v-if="error">
      <UAlert color="error" variant="subtle" :title="error" class="mt-6" />
      <UButton to="/login" color="neutral" variant="soft" class="mt-4" label="Back to sign in" />
    </template>
    <div v-else class="mt-6 flex items-center gap-3 text-muted">
      <UIcon name="i-ph-spinner-gap" class="size-5 animate-spin" />
      Signing you in
    </div>
  </div>
</template>
