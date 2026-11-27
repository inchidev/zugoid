<script setup lang="ts">
import { keepsHorizontalSwipe } from '~/composables/useSwipeToClose'
import { hasServerNavigationMenu, serverNavigationSection } from '~~/shared/server-navigation'
import { useEventListener, useMounted } from '@vueuse/core'
import { serverConnectionKey } from '../../composables/useServerSocket'

const ui = useUiStore()
const props = defineProps<{
  serverId?: string
}>()
const { serverId: defaultServerId } = useServer()

const isMobile = useIsMobile()
const serverId = computed(() => props.serverId || defaultServerId.value || ui.last()?.serverId)
const navigation = useServerSectionViews(() => serverId.value || '')
const keyboardHeight = ref<number | null>(null)
const keyboardOpen = computed(() => keyboardHeight.value !== null)
let fullViewportHeight = 0
let viewportWidth = 0

// Browsers can shrink only the visual viewport, while the native WebView shrinks the layout.
function updateKeyboard() {
  const width = window.innerWidth
  if (width !== viewportWidth) {
    viewportWidth = width
    fullViewportHeight = 0
  }
  fullViewportHeight = Math.max(fullViewportHeight, window.innerHeight)
  const editing = document.activeElement?.matches(
    'textarea, input:not([type]), input:is([type=text], [type=search], [type=email], [type=password], [type=tel], [type=url], [type=number]), [contenteditable=true], [contenteditable=plaintext-only]',
  )
  const visibleHeight = window.visualViewport?.height ?? window.innerHeight
  keyboardHeight.value = isMobile.value && editing && fullViewportHeight - visibleHeight > 120
    ? Math.floor(visibleHeight)
    : null
}

onMounted(updateKeyboard)
useEventListener('resize', updateKeyboard)
useEventListener(() => import.meta.client ? window.visualViewport : null, 'resize', updateKeyboard)
useEventListener(['focusin', 'focusout'], () => requestAnimationFrame(updateKeyboard))

// Presence, unread dots, and incoming calls must keep working on every page, not
// only while a conversation is open, so the server connection lives here.
const session = useSessionStore()
const presence = usePresenceStore()
watch(() => session.user?.id, id => presence.setSelf(id ?? null), { immediate: true })
const { connection: serverConnection } = useServerSocket(() => serverId.value || '')
provide(serverConnectionKey, serverConnection)
const showSections = computed(() => isMobile.value && ui.mobilePane === 'sections')
const open = computed(() => isMobile.value && (ui.mobilePane === 'channels' || showSections.value))

// Follow the router's live route: page-level routes miss child-only changes,
// such as opening a thread of the current channel from the drawer.
const liveRoute = useRouter().currentRoute
const hasMenu = computed(() => hasServerNavigationMenu(liveRoute.value.path))
const section = computed(() => serverNavigationSection(liveRoute.value.path))
const sectionIntent = ref<ReturnType<typeof serverNavigationSection>>(null)
function selectSection(path: string) {
  if (!isMobile.value) return
  sectionIntent.value = serverNavigationSection(path) === 'chat' ? 'chat' : null
  ui.mobilePane = sectionIntent.value ? 'channels' : 'chat'
}
function selectResource(navigates: boolean) {
  sectionIntent.value = null
  // Selecting the already-open conversation does not change the URL.
  if (isMobile.value && navigates) ui.mobilePane = 'chat'
}
watch(() => liveRoute.value.fullPath, () => {
  if (!isMobile.value) return
  if (sectionIntent.value === section.value && ui.mobilePane === 'channels' && hasMenu.value) return
  sectionIntent.value = null
  ui.mobilePane = 'chat'
})

// Swipe right to open the current section menu, swipe left to close the navigation.
// The drawer follows the finger and settles by distance or flick velocity.
const drawer = ref<HTMLElement | null>(null)
const dragOffset = ref<number | null>(null)
let gesture: { x: number, y: number, t: number, width: number, axis: 'x' | 'y' | null, fromOpen: boolean } | null = null

const EDGE_PX = 24
const AXIS_LOCK_PX = 10

function onTouchStart(event: TouchEvent) {
  if (!isMobile.value || !serverId.value || event.touches.length !== 1) return
  if (ui.mobilePane === 'members' || keyboardOpen.value || (!open.value && !hasMenu.value)) return
  const touch = event.touches[0]!
  const target = event.target
  if (!open.value && touch.clientX > EDGE_PX && keepsHorizontalSwipe(target)) return
  if (target instanceof Element && target.closest('input[type="range"], [role="slider"], [contenteditable="true"] *')) return
  gesture = {
    x: touch.clientX,
    y: touch.clientY,
    t: performance.now(),
    width: drawer.value?.offsetWidth || 300,
    axis: null,
    fromOpen: open.value,
  }
}

function onTouchMove(event: TouchEvent) {
  if (!gesture) return
  const touch = event.touches[0]!
  const dx = touch.clientX - gesture.x
  const dy = touch.clientY - gesture.y
  if (!gesture.axis) {
    if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
    gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y'
    if (gesture.axis === 'y' || (gesture.fromOpen ? dx > 0 : dx < 0)) {
      gesture = null
      return
    }
  }
  const base = gesture.fromOpen ? gesture.width : 0
  dragOffset.value = Math.min(gesture.width, Math.max(0, base + dx))
}

function onTouchEnd(event: TouchEvent) {
  if (!gesture) return
  const current = gesture
  gesture = null
  if (dragOffset.value === null) return
  const dx = (event.changedTouches[0]?.clientX ?? current.x) - current.x
  const velocity = dx / Math.max(1, performance.now() - current.t)
  const shouldOpen = Math.abs(velocity) > 0.4
    ? velocity > 0
    : dragOffset.value > current.width / 2
  dragOffset.value = null
  if (!shouldOpen) sectionIntent.value = null
  if (!shouldOpen || !current.fromOpen) ui.mobilePane = shouldOpen ? 'channels' : 'chat'
}

// The phone/desktop split lives in CSS (see .channel-drawer) so the first paint is
// right before hydration; script only adds the open state and finger tracking.
const mounted = useMounted()
const drawerStyle = computed(() => {
  // The saved width lives in localStorage, which the server cannot see; apply it
  // after mount so hydration matches and the CSS default covers the first paint.
  if (!mounted.value) return {}
  if (!isMobile.value) return { '--channel-pane-width': `${ui.channelPaneWidth}px` }
  if (dragOffset.value !== null) {
    return { transform: `translateX(calc(${dragOffset.value}px - 100%))`, transition: 'none' }
  }
  return { transform: open.value ? 'translateX(0)' : 'translateX(-100%)' }
})

let navigationTrigger: HTMLElement | null = null
watch([open, showSections, section], async ([isOpen], [wasOpen]) => {
  if (isOpen && !wasOpen) {
    const active = document.activeElement
    navigationTrigger = active instanceof HTMLElement && active.closest('[aria-controls="channel-navigation"], [aria-label="Mobile navigation"]')
      ? active
      : null
  }
  await nextTick()
  if (open.value) {
    drawer.value?.querySelector<HTMLElement>('[data-nav-heading]')?.focus({ preventScroll: true })
  }
  else if (wasOpen) {
    navigationTrigger?.focus({ preventScroll: true })
    navigationTrigger = null
  }
})

watch(isMobile, (mobile) => {
  if (!mobile) closeNavigation()
})

const backdropOpacity = computed(() => {
  if (dragOffset.value !== null) return dragOffset.value / (drawer.value?.offsetWidth || 300)
  return open.value ? 1 : 0
})

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented || !open.value) return
  closeNavigation()
}

function closeNavigation() {
  sectionIntent.value = null
  ui.mobilePane = 'chat'
}

function toggleSections() {
  if (showSections.value) closeNavigation()
  else {
    sectionIntent.value = null
    ui.mobilePane = 'sections'
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div
    class="flex h-full min-h-0 flex-col overflow-hidden bg-default dark:bg-black"
    :style="keyboardHeight ? { height: `${keyboardHeight}px` } : undefined"
  >
    <div
      class="relative flex min-h-0 flex-1 overflow-hidden"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
      @touchend.passive="onTouchEnd"
      @touchcancel.passive="onTouchEnd"
    >
      <aside
        v-if="serverId"
        id="channel-navigation"
        ref="drawer"
        class="channel-drawer flex min-h-0 shrink-0 bg-muted dark:bg-black md:border-e md:border-default"
        :class="{ 'rail-only': !hasMenu }"
        :style="drawerStyle"
        :aria-hidden="isMobile && !open ? 'true' : undefined"
        :inert="isMobile && !open"
      >
        <LayoutNavShell
          :server-id="serverId"
          :navigation="navigation"
          :show-sections="showSections"
          @select-section="selectSection"
          @select-resource="selectResource"
        />
        <LayoutResizeHandle
          v-if="!isMobile && hasMenu"
          v-model="ui.channelPaneWidth"
          :min="200"
          :max="360"
          side="end"
          label="Resize section menu"
        />
      </aside>
      <button
        v-if="serverId"
        type="button"
        class="channel-backdrop absolute inset-0 z-20 bg-black/60 md:hidden"
        :class="open || dragOffset !== null ? '' : 'pointer-events-none'"
        :style="{ opacity: backdropOpacity, transition: dragOffset !== null ? 'none' : undefined }"
        tabindex="-1"
        aria-label="Close navigation"
        @click="closeNavigation"
      />
      <div
        class="server-content flex min-h-0 min-w-0 flex-1 flex-col dark:bg-black"
        :class="serverId && !keyboardOpen ? 'md:pb-[var(--df-safe-area-bottom)]' : 'pb-[var(--df-safe-area-bottom)]'"
        :inert="open"
      >
        <slot />
      </div>
    </div>
    <LayoutMobileNavigation
      v-if="serverId && !keyboardOpen"
      :views="navigation.views.value"
      :section="section"
      :show-sections="showSections"
      class="md:hidden"
      @select-section="selectSection"
      @toggle-sections="toggleSections"
    />
  </div>
</template>

<style scoped>
:global(.dark) .server-content { --ui-bg: #000; }
/* Phones: an off-canvas drawer over the page. */
.channel-drawer {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  z-index: 30;
  width: 100%;
  transform: translateX(-100%);
  transition: transform 260ms cubic-bezier(0.32, 0.72, 0, 1);
  will-change: transform;
}

/* Wider screens: a fixed 72px rail plus the selected section's resizable menu. */
@media (min-width: 768px) {
  .channel-drawer {
    position: relative;
    z-index: auto;
    width: calc(72px + var(--channel-pane-width, 240px));
    transform: none;
    transition: none;
  }

  .channel-drawer.rail-only {
    width: 72px;
  }
}

.channel-backdrop {
  opacity: 0;
  transition: opacity 220ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .channel-drawer,
  .channel-backdrop {
    transition-duration: 1ms;
  }
}
</style>
