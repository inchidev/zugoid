<script setup lang="ts">
const url = useRequestURL()
const image = `${url.origin}/og-image.png`
const { native } = useClientServers()
const servers = useServerLinks()
const session = useSessionStore()
const showZugoid = useShowZugoid()
const siteName = computed(() => showZugoid.value ? 'Zugoid' : session.health?.appName || 'Server')
const description = computed(() => showZugoid.value ? 'One workspace for humans and agents.' : siteName.value)
applyServerTheme()

useSeoMeta({
  // Pages and layouts that name themselves (sign-in, MCP consent) override this.
  title: siteName,
  ogTitle: siteName,
  ogDescription: description,
  ogImage: image,
  twitterCard: 'summary_large_image',
  twitterTitle: siteName,
  twitterDescription: description,
  twitterImage: image,
})
</script>

<template>
  <UApp :toaster="{ position: 'top-right', ui: { viewport: 'top-[max(1rem,env(safe-area-inset-top))]' } }">
    <NuxtRouteAnnouncer />
    <div class="flex h-dvh min-w-0 overflow-hidden bg-default">
      <ClientServerRail v-if="native" />
      <ClientServerLinkRail v-else-if="servers.available" />
      <div class="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <ClientUpdateBanner />
        <div class="min-h-0 flex-1 overflow-hidden"><NuxtLayout><NuxtPage /></NuxtLayout></div>
      </div>
    </div>
  </UApp>
</template>
