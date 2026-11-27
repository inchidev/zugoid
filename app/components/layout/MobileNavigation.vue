<script setup lang="ts">
import { sectionLinkLabel, type ServerSectionLink } from '~/composables/useServerSectionViews'
import { isMobilePrimarySection, serverNavigationSection, type ServerNavigationSection } from '~~/shared/server-navigation'

const props = defineProps<{
  views: ServerSectionLink[]
  section: ServerNavigationSection | null
  showSections: boolean
}>()
const emit = defineEmits<{ selectSection: [path: string]; toggleSections: [] }>()

const primary = computed(() => props.views.filter(view => isMobilePrimarySection(view.path)))
const moreActive = computed(() => props.showSections || props.views.some(view => (
  serverNavigationSection(view.path) === props.section && !isMobilePrimarySection(view.path)
)))
const moreUnread = computed(() => props.views.some(view => !isMobilePrimarySection(view.path) && (view.dot || view.count)))
</script>

<template>
  <nav aria-label="Mobile navigation" class="shrink-0 px-3 pb-[max(0.5rem,var(--df-safe-area-bottom))] pt-1.5">
    <ul class="mobile-tab-bar mx-auto flex max-w-[30rem] items-stretch gap-0.5 rounded-[1.625rem] p-1">
      <li v-for="item in primary" :key="item.path" class="min-w-0 flex-1">
        <NuxtLink
          :to="item.to"
          :aria-current="!showSections && section === serverNavigationSection(item.path) ? 'page' : undefined"
          :aria-label="sectionLinkLabel(item)"
          class="mobile-tab relative flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[1.25rem] text-[10px] font-medium leading-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          @click="emit('selectSection', item.path)"
        >
          <UIcon :name="item.icon" class="size-5" aria-hidden="true" />
          <span>{{ item.label }}</span>
          <span v-if="item.count" class="absolute start-1/2 top-0.5 ml-1.5 min-w-3.5 rounded-full bg-primary px-0.5 text-center text-[9px] leading-3.5 text-inverted" aria-hidden="true">{{ item.count > 99 ? '99+' : item.count }}</span>
          <span v-else-if="item.dot" class="absolute start-1/2 top-1.5 ml-2.5 size-1.5 rounded-full bg-primary" aria-hidden="true" />
        </NuxtLink>
      </li>
      <li class="min-w-0 flex-1">
        <button
          type="button"
          aria-controls="channel-navigation"
          :aria-label="moreUnread ? 'More, unread' : 'More'"
          :aria-expanded="showSections"
          :aria-current="!showSections && moreActive ? 'true' : undefined"
          :data-current="moreActive || undefined"
          class="mobile-tab relative flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-[1.25rem] text-[10px] font-medium leading-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          @click="emit('toggleSections')"
        >
          <UIcon name="i-ph-dots-three" class="size-5" aria-hidden="true" />
          <span>More</span>
          <span v-if="moreUnread" class="absolute start-1/2 top-1.5 ml-2.5 size-1.5 rounded-full bg-primary" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.mobile-tab-bar {
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  box-shadow: 0 3px 12px rgb(0 0 0 / 0.10);
}

@supports (backdrop-filter: blur(1px)) {
  .mobile-tab-bar {
    background: linear-gradient(
      to bottom,
      color-mix(in oklab, var(--ui-bg-elevated) 66%, transparent),
      color-mix(in oklab, var(--ui-bg-accented) 80%, transparent)
    );
    backdrop-filter: blur(18px) saturate(125%);
  }
}

.mobile-tab {
  color: var(--ui-text-muted);
}

.mobile-tab:is([aria-current="page"], [data-current]) {
  background: var(--ui-bg-inverted);
  color: var(--ui-text-inverted);
  font-weight: 600;
}

@media (prefers-reduced-transparency: reduce) {
  .mobile-tab-bar {
    background: var(--ui-bg-elevated);
    backdrop-filter: none;
  }
}

@media (forced-colors: active) {
  .mobile-tab:is([aria-current="page"], [data-current]) {
    outline: 1px solid Highlight;
    outline-offset: -2px;
  }
}
</style>
