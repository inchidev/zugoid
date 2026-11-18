<script setup lang="ts">
import ServerAvatar from '../../packages/client-ui/ServerAvatar.vue'
import { DEFAULT_APP_NAME } from '~~/shared/app-branding'

const session = useSessionStore()
const showZugoid = useShowZugoid()

// The sign-in stage carries only a mark, centered: the Server's icon when it has one, otherwise Zugoid.
const appName = computed(() => session.health?.appName || DEFAULT_APP_NAME)

useHead(() => ({ title: appName.value }))
</script>

<template>
  <div class="h-full min-h-0 overflow-y-auto bg-default lg:grid lg:grid-cols-[var(--df-auth-stage-width)_minmax(0,1fr)]">
    <aside class="flex min-w-0 items-center justify-center border-b border-default bg-(--zugoid-sign-in-background,var(--ui-bg-muted)) dark:bg-(--zugoid-sign-in-background,black) px-6 pb-6 pt-[max(1.5rem,var(--df-safe-area-top))] lg:min-h-full lg:border-r lg:border-b-0 lg:p-10">
      <ServerAvatar v-if="session.health?.iconUrl" :name="appName" :icon-url="session.health.iconUrl" class="size-12 rounded-xl bg-accented lg:size-24 lg:rounded-2xl" />
      <ServerAvatar v-else-if="!showZugoid" :name="appName" class="size-12 rounded-xl bg-accented text-lg lg:size-24 lg:rounded-2xl lg:text-3xl" />
      <template v-else>
        <BrandLogo size="2xl" :alt="appName" priority class="lg:hidden" />
        <BrandLogo size="hero" :alt="appName" priority class="max-lg:hidden" />
      </template>
    </aside>

    <main class="flex min-w-0 flex-col lg:min-h-full">
      <div class="flex flex-1 items-center justify-center px-6 pb-[max(2rem,var(--df-safe-area-bottom))] pt-8 sm:px-8 sm:py-12 lg:py-16">
        <div class="w-full min-w-0 max-w-[26rem]">
          <slot />
        </div>
      </div>
    </main>
  </div>
</template>
