<script setup lang="ts">
import ServerAvatar from '../../../packages/client-ui/ServerAvatar.vue'
import { navigateTo } from '#imports'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ChannelCategoryDTO, ChannelDTO, ServerDTO } from '~~/shared/types'
import { sectionLinkLabel, type useServerSectionViews } from '~/composables/useServerSectionViews'
import { Permission } from '~~/shared/permissions'
import { channelPath } from '~~/shared/paths'
import { useClipboard, useMounted } from '@vueuse/core'
import { hasServerNavigationMenu, isMobilePrimarySection, serverNavigationSection } from '~~/shared/server-navigation'
import { publicIconPath } from '~~/shared/server-appearance'

const props = defineProps<{
  serverId: string
  navigation: ReturnType<typeof useServerSectionViews>
  showSections: boolean
}>()
const emit = defineEmits<{ selectSection: [path: string]; selectResource: [navigates: boolean] }>()
const ui = useUiStore()
const route = useRouter().currentRoute
const mounted = useMounted()
const compact = computed(() => mounted.value && ui.sectionIconsOnly)
const qc = useQueryClient()
const toast = useToast()
const session = useSessionStore()
const live = useLiveStore()
const nav = useNavActions()
const commands = useCommandPalette()
const { copy } = useClipboard()
const { api, serverUrl } = useApi()

const { membersQ, channels, categories, dmsQ, views, can, showsTasks, showsFactory } = props.navigation
const { activeSpace, canSwitch: hasSpaces, isSpaceAdmin } = useSpaces(() => props.serverId)

const serverQ = useQuery({
  queryKey: computed(() => ['server', props.serverId]),
  queryFn: () => api<{ server: ServerDTO }>(`/api/servers/${props.serverId}`),
  refetchInterval: 60_000,
})
const connectedPath = computed(() => {
  const id = live.currentChannelId
  if (!id) return '/channels'
  const conversation = [...channels.value, ...(dmsQ.data.value?.channels ?? [])].find(item => item.id === id)
  return conversation ? channelPath(conversation) : `/channels/${id}`
})

const section = computed(() => serverNavigationSection(route.value.path))
const hasMenu = computed(() => hasServerNavigationMenu(route.value.path))
function isViewActive(path: string) {
  return section.value === serverNavigationSection(path)
}
function selectResource(event: MouseEvent) {
  emit('selectResource', event.target instanceof Element && Boolean(event.target.closest('a[href]')))
}
const menuTitle = computed(() => views.value.find(view => isViewActive(view.path))?.label || '')
function leaveLiveOnPageExit() {
  if (!live.currentChannelId || !live.inRoom) return
  navigator.sendBeacon?.(`/api/channels/${live.currentChannelId}/live/leave`)
}

watch(() => live.notice, (message) => {
  if (!message) return
  toast.add({ title: message, icon: live.currentKind === 'call' ? 'i-ph-phone-disconnect' : 'i-ph-waveform' })
  live.notice = null
})

onMounted(() => {
  window.addEventListener('pagehide', leaveLiveOnPageExit)
})

onBeforeUnmount(() => {
  window.removeEventListener('pagehide', leaveLiveOnPageExit)
})

const newName = ref('')
const newPrivate = ref(false)
const newMemberIds = ref<string[]>([])
const newCategoryName = ref('')
const inviteUrl = ref('')
const inviting = ref(false)
const creating = ref(false)
const creatingCategory = ref(false)

const categoryOptions = computed(() => [
  { label: 'Uncategorized', value: null },
  ...categories.value.map(category => ({ label: category.name, value: category.id })),
])
const serverName = computed(() => serverQ.data.value?.server.name || '')
const serverIconUrl = computed(() => {
  const server = serverQ.data.value?.server
  if (!server?.iconR2Key) return undefined
  return serverUrl(`${publicIconPath}?v=${encodeURIComponent(server.updatedAt)}`)
})
const canOpenServerSettings = computed(() => isSpaceAdmin.value || [
  Permission.useAgents,
  Permission.useExternalTools,
  Permission.manageServer,
  Permission.manageAgents,
  Permission.manageChannels,
  Permission.manageRoles,
  Permission.invite,
  Permission.kick,
].some(flag => can(flag)))

// In an app: the device's Server list. A Server's page never learns what else is on it.
const showServers = import.meta.client ? window.__ZUGOID_NATIVE_SHOW_SERVERS__ : undefined
const serverLinks = useServerLinks()
// A Server rail already carries the Zugoid mark, right beside this one.
const showZugoid = useShowZugoid()
const railShown = computed(() => Boolean(showServers) || serverLinks.links.value.length > 0)
const serverItems = computed<DropdownMenuItem[][]>(() => {
  const servers: DropdownMenuItem[] = showServers
    ? [{ label: 'All Servers', icon: 'i-ph-squares-four', onSelect: () => { void showServers() } }]
    : [{ label: 'Add a Server', icon: 'i-ph-squares-four', onSelect: () => { serverLinks.adding.value = true } }]
  const invite: DropdownMenuItem[] = can(Permission.invite) && session.health?.authMode !== 'access'
    ? [{ label: 'Invite People', icon: 'i-ph-user-plus', color: 'primary', onSelect: () => { nav.inviteOpen.value = true } }]
    : []
  const manage: DropdownMenuItem[] = []
  if (can(Permission.manageChannels)) {
    manage.push(
      { label: 'Create Channel', icon: 'i-ph-hash', onSelect: () => { nav.openCreateChannel(categories.value[0]?.id ?? null) } },
      { label: 'Create Category', icon: 'i-ph-folder-plus', onSelect: () => { nav.createCategoryOpen.value = true } },
    )
  }
  if (can(Permission.manageAgents)) manage.push({ label: 'Create Agent', icon: 'i-ph-robot', onSelect: () => { nav.createAgentOpen.value = true } })
  if (canOpenServerSettings.value) {
    manage.push({ label: 'Server settings', icon: 'i-ph-gear', onSelect: () => { nextTick(() => { nav.serverSettingsOpen.value = true }) } })
  }
  // A page with no menu pane has no header to hold the search button.
  const search: DropdownMenuItem[] = [{ label: 'Search and commands', icon: 'i-ph-magnifying-glass', kbds: ['meta', 'k'], onSelect: () => { nextTick(() => { commands.show() }) } }]
  return [search, servers, invite, manage].filter(group => group.length)
})

async function createChannel() {
  if (!newName.value.trim()) return
  creating.value = true
  try {
    const res = await api<{ channel: ChannelDTO }>(`/api/servers/${props.serverId}/channels`, {
      method: 'POST',
      body: {
        name: newName.value.trim().toLowerCase().replace(/\s+/g, '-'),
        type: 'text',
        visibility: newPrivate.value ? 'private' : 'server',
        categoryId: nav.createChannelCategoryId.value,
        memberIds: newPrivate.value ? newMemberIds.value : undefined,
      },
    })
    await qc.invalidateQueries({ queryKey: ['channels', props.serverId] })
    nav.createChannelOpen.value = false
    newName.value = ''
    newPrivate.value = false
    newMemberIds.value = []
    await navigateTo(channelPath(res.channel))
  }
  finally {
    creating.value = false
  }
}

async function createCategory() {
  const name = newCategoryName.value.trim()
  if (!name) return
  creatingCategory.value = true
  try {
    const res = await api<{ category: ChannelCategoryDTO }>(`/api/servers/${props.serverId}/categories`, {
      method: 'POST',
      body: { name },
    })
    await qc.invalidateQueries({ queryKey: ['channels', props.serverId] })
    newCategoryName.value = ''
    nav.createCategoryOpen.value = false
    nav.openCreateChannel(res.category.id)
  }
  finally {
    creatingCategory.value = false
  }
}

async function makeInvite() {
  inviting.value = true
  try {
    const res = await api<{ invite: { code: string; url: string } }>(`/api/servers/${props.serverId}/invites`, { method: 'POST', body: {} })
    inviteUrl.value = serverUrl(res.invite.url)
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
    nav.inviteOpen.value = false
  }
  finally {
    inviting.value = false
  }
}

async function copyInvite() {
  if (!inviteUrl.value) return
  await copy(inviteUrl.value)
  toast.add({ title: 'Invite copied', color: 'success' })
}

watch(nav.inviteOpen, (open) => {
  if (open) {
    inviteUrl.value = ''
    void makeInvite()
  }
})
</script>

<template>
  <div class="relative flex h-full min-h-0 w-full select-none flex-col">
    <div class="flex min-h-0 flex-1">
      <div
        class="min-h-0 min-w-0 flex-1 flex-col bg-default md:w-[72px] md:flex-none md:border-e md:border-default md:bg-muted md:pt-[var(--df-safe-area-top)] dark:bg-black"
        :class="showSections ? 'flex' : 'hidden md:flex'"
      >
        <div class="df-top-row flex shrink-0 items-center gap-2 border-b border-default px-3 md:h-auto md:border-0 md:px-0 md:pt-0">
          <h2 v-if="showSections" tabindex="-1" data-nav-heading class="min-w-0 flex-1 text-base font-semibold text-highlighted outline-none md:hidden">More</h2>
          <UDropdownMenu :items="serverItems" :ui="{ content: 'w-56' }">
            <button
              type="button"
              class="group flex size-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-primary md:h-12 md:w-full"
              :aria-label="serverName ? `Server menu, ${serverName}` : 'Server menu'"
              :title="serverName || 'Server menu'"
            >
              <span class="server-avatar flex size-10 items-center justify-center rounded-xl transition-colors group-data-[state=open]:bg-accented">
                <UAvatar v-if="serverIconUrl" size="lg" :src="serverIconUrl" :alt="serverName" class="size-8 rounded-lg" />
                <ServerAvatar v-else-if="railShown || !showZugoid" :name="serverName || 'Server'" class="size-8 rounded-lg bg-accented text-xs" />
                <BrandLogo v-else size="xl" alt="" />
              </span>
            </button>
          </UDropdownMenu>
          <UButton v-if="showSections" icon="i-ph-x" color="neutral" variant="ghost" class="size-11 justify-center md:hidden" aria-label="Close More" @click="ui.mobilePane = 'chat'" />
        </div>
        <LayoutSpaceSwitcher :server-id="serverId" />

        <nav :aria-label="showSections ? 'More sections' : 'Server views'" class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2 md:px-1">
          <div v-if="membersQ.isPending.value" class="space-y-1" aria-label="Loading views" aria-busy="true">
            <div v-for="index in (compact ? 9 : 7)" :key="index" class="flex min-h-12 w-full items-center gap-3 px-3 md:flex-col md:justify-center md:gap-1.5 md:px-0" :class="compact ? 'md:min-h-11' : 'md:aspect-square'">
              <USkeleton class="size-5" />
              <USkeleton class="h-2 w-10" :class="{ 'md:hidden': compact }" />
            </div>
          </div>
          <UButton v-else-if="membersQ.error.value" icon="i-ph-arrow-clockwise" color="neutral" variant="ghost" aria-label="Retry loading views" class="min-h-11 w-full justify-center rounded-lg" @click="membersQ.refetch()" />
          <ul v-else class="space-y-1">
            <li v-for="item in views" :key="item.path" :class="{ 'max-md:hidden': isMobilePrimarySection(item.path) }">
              <UTooltip :text="item.label" :disabled="!compact || showSections" :content="{ side: 'right' }">
                <NuxtLink
                  :to="item.to"
                  :aria-current="isViewActive(item.path) ? 'page' : undefined"
                  :aria-label="sectionLinkLabel(item)"
                  class="relative flex min-h-12 w-full items-center gap-3 rounded-lg px-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary md:flex-col md:justify-center md:gap-1 md:px-0.5"
                  :class="[
                    compact ? 'md:min-h-11' : 'md:aspect-square',
                    isViewActive(item.path) ? 'bg-accented text-highlighted' : 'text-muted hover:bg-elevated hover:text-default',
                  ]"
                  @click="emit('selectSection', item.path)"
                >
                  <UIcon :name="item.icon" class="size-[22px] shrink-0" aria-hidden="true" />
                  <span class="min-w-0 truncate text-sm font-medium md:max-w-full md:text-[11px] md:leading-3" :class="{ 'md:sr-only': compact }">{{ item.label }}</span>
                  <span v-if="item.count" class="ms-auto min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 text-inverted md:absolute md:end-1 md:top-1" aria-hidden="true">{{ item.count > 99 ? '99+' : item.count }}</span>
                  <span v-else-if="item.dot" class="ms-auto size-1.5 rounded-full bg-primary md:absolute md:end-3 md:top-1.5" aria-hidden="true" />
                </NuxtLink>
              </UTooltip>
            </li>
          </ul>
        </nav>
        <div class="hidden shrink-0 justify-center border-t border-default p-1 md:flex">
          <UTooltip :text="compact ? 'Show section labels' : 'Hide section labels'" :content="{ side: 'right' }">
            <UButton
              icon="i-ph-text-aa"
              color="neutral"
              variant="ghost"
              square
              class="size-8 justify-center"
              aria-label="Only show section icons"
              :aria-pressed="compact"
              @click="ui.sectionIconsOnly = !ui.sectionIconsOnly"
            />
          </UTooltip>
        </div>
      </div>

      <div
        v-if="hasMenu"
        class="flex min-h-0 min-w-0 flex-1 flex-col bg-default md:bg-muted dark:bg-black"
        :class="{ 'max-md:hidden': showSections }"
      >
        <header class="df-top-row flex shrink-0 items-center gap-2 border-b border-default px-3">
          <h2 tabindex="-1" data-nav-heading class="min-w-0 flex-1 truncate text-sm font-semibold text-highlighted outline-none">{{ menuTitle }}</h2>
          <UButton icon="i-ph-magnifying-glass" color="neutral" variant="ghost" class="size-9 justify-center" aria-label="Search and commands (Ctrl or Command K)" title="Search and commands" @click="commands.show()" />
          <UButton icon="i-ph-x" color="neutral" variant="ghost" class="size-11 justify-center md:hidden" aria-label="Close section menu" @click="ui.mobilePane = 'chat'" />
        </header>
        <LayoutSpaceSwitcher :server-id="serverId" class="md:hidden" />
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3" @click.capture="selectResource">
          <nav v-if="section === 'chat'" aria-label="Conversations" class="space-y-4">
            <LayoutChatNav :server-id="serverId" />
            <LayoutDirectMessages :server-id="serverId" kind="human" />
          </nav>
          <LayoutInboxNav v-else-if="section === 'inbox'" :server-id="serverId" />
          <LayoutAgentsNav v-else-if="section === 'agents'" :server-id="serverId" />
          <LayoutTasksNav v-else-if="section === 'tasks' && showsTasks" :server-id="serverId" />
          <LayoutFactoryNav v-else-if="section === 'factory' && showsFactory" :server-id="serverId" />
          <LayoutDatabasesNav v-else-if="section === 'data' && can(Permission.readData)" :server-id="serverId" />
          <LayoutGadgetsNav v-else-if="section === 'gadgets' && (can(Permission.useGadgets) || can(Permission.manageGadgets))" :server-id="serverId" />
          <LayoutCustomersNav v-else-if="section === 'customers'" />
          <LayoutMediaNav v-else-if="section === 'media'" />
        </div>
      </div>
    </div>
    <div
      class="shrink-0 flex-col border-t border-default bg-default px-2 py-2 md:flex md:bg-muted md:pb-[max(0.5rem,var(--df-safe-area-bottom))] dark:bg-black"
      :class="showSections ? 'flex gap-1' : 'hidden'"
    >
      <UButton
        v-if="live.connection === 'connected' && live.currentChannelId"
        :icon="live.currentKind === 'call' ? 'i-ph-phone' : 'i-ph-waveform'"
        :label="hasMenu || showSections ? (live.currentTitle || 'Live') : undefined"
        :aria-label="`Return to ${live.currentTitle || 'live conversation'}`"
        color="success"
        variant="soft"
        class="mb-1 min-w-0"
        :class="{ 'justify-center': !hasMenu && !showSections }"
        :ui="{ label: 'truncate' }"
        @click="ui.mobilePane = 'chat'; navigateTo(connectedPath)"
      />
      <LayoutUserPanel :compact="!hasMenu && !showSections" />
    </div>
    <SettingsAgentEditorModal v-if="can(Permission.manageAgents)" v-model:open="nav.createAgentOpen.value" :server-id="serverId" />
    <ProjectsCreateModal v-if="can(Permission.manageProjects)" v-model:open="nav.createProjectOpen.value" :server-id="serverId" />
    <ProjectsCreateBoardModal v-if="can(Permission.manageTasks)" :server-id="serverId" />
    <SettingsServerSettings v-if="canOpenServerSettings" v-model:open="nav.serverSettingsOpen.value" v-model:section="nav.serverSettingsSection.value" :server-id="serverId" />

    <UModal v-model:open="nav.createChannelOpen.value" title="Create Channel">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Channel name" class="w-full">
            <UInput v-model="newName" placeholder="new-channel" autofocus class="w-full" @keyup.enter="createChannel" />
          </UFormField>
          <UFormField label="Category">
            <USelect v-model="nav.createChannelCategoryId.value" :items="categoryOptions" class="w-full" />
          </UFormField>
          <UCheckbox v-model="newPrivate" label="Private channel" />
          <UFormField v-if="newPrivate" label="Members">
            <div class="max-h-40 space-y-2 overflow-y-auto rounded-md border border-default p-3">
              <UCheckbox
                v-for="member in membersQ.data.value?.members ?? []"
                :key="member.user.id"
                :model-value="newMemberIds.includes(member.user.id)"
                :label="member.nickname || member.user.displayName"
                @update:model-value="(checked) => newMemberIds = checked
                  ? [...new Set([...newMemberIds, member.user.id])]
                  : newMemberIds.filter((id) => id !== member.user.id)"
              />
            </div>
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" label="Cancel" @click="nav.createChannelOpen.value = false" />
        <UButton label="Create Channel" :loading="creating" :disabled="!newName.trim()" @click="createChannel" />
      </template>
    </UModal>

    <UModal v-model:open="nav.createCategoryOpen.value" title="Create Category">
      <template #body>
        <UFormField label="Category name" class="w-full">
          <UInput v-model="newCategoryName" placeholder="Category" autofocus class="w-full" @keyup.enter="createCategory" />
        </UFormField>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" label="Cancel" @click="nav.createCategoryOpen.value = false" />
        <UButton label="Create Category" :loading="creatingCategory" :disabled="!newCategoryName.trim()" @click="createCategory" />
      </template>
    </UModal>

    <UModal v-model:open="nav.inviteOpen.value" :title="hasSpaces && activeSpace ? `Invite people to ${activeSpace.name}` : 'Invite people'" description="Share this link. Anyone with it can join.">
      <template #body>
        <USkeleton v-if="inviting" class="h-9" />
        <UInput v-else v-model="inviteUrl" readonly class="w-full">
          <template #trailing>
            <UButton size="xs" label="Copy" @click="copyInvite" />
          </template>
        </UInput>
      </template>
    </UModal>
    <LiveIncomingCall />
  </div>
</template>

<style scoped>
/* The rail's hover language does not paint filled boxes behind avatars, and the
   accent square also matched the avatar's own background. Hover and open states
   morph the avatar radius instead. */
.server-avatar img {
  border-radius: 0.5rem;
  transition: border-radius 150ms ease;
}

.group:hover .server-avatar img,
.group[data-state='open'] .server-avatar img {
  border-radius: 0.25rem;
}
</style>
