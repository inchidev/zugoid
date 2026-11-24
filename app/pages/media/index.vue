<script setup lang="ts">
import { useInfiniteQuery, useQueryClient } from '@tanstack/vue-query'
import { formatBytes } from '~~/shared/format'
import { isVideoType, type MediaItemDTO, type MediaPageDTO } from '~~/shared/media'
import { collectCandidates, runMediaImport, type ImportProgress } from '~/utils/media-import'

definePageMeta({ layout: 'server', middleware: ['auth'] })
const { serverId } = useServer()
const { api, serverUrl } = useApi()
const route = useRoute()
const toast = useToast()
const queryClient = useQueryClient()
const isMobile = useIsMobile()

type Source = 'mine' | 'space' | 'chats'
const source = computed<Source>(() => route.query.source === 'space' || route.query.source === 'chats' ? route.query.source : 'mine')
const titles: Record<Source, string> = { mine: 'My library', space: 'Shared in this Space', chats: 'From conversations' }
const empty: Record<Source, string> = {
  mine: 'Your photos and videos, by when they were taken. Import them from your device or a folder.',
  space: 'Nothing here yet. Items someone shares with this Space appear here.',
  chats: 'Photos and videos sent in conversations you are in appear here.',
}

const key = computed(() => ['media', serverId.value, source.value])
const q = useInfiniteQuery({
  queryKey: key,
  initialPageParam: undefined as string | undefined,
  queryFn: ({ pageParam }) => api<MediaPageDTO>('/api/media', { query: { source: source.value, cursor: pageParam } }),
  getNextPageParam: last => last.nextCursor ?? undefined,
  enabled: computed(() => Boolean(serverId.value)),
})
const items = computed(() => q.data.value?.pages.flatMap(page => page.items) ?? [])

const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const groups = computed(() => {
  const list: Array<{ label: string; items: MediaItemDTO[] }> = []
  for (const item of items.value) {
    const label = monthFormat.format(new Date(item.takenAt))
    const last = list.at(-1)
    if (last?.label === label) last.items.push(item)
    else list.push({ label, items: [item] })
  }
  return list
})

// Loads the next page when the end of the list comes into view.
const sentinel = ref<HTMLElement | null>(null)
useIntersectionObserver(sentinel, ([entry]) => {
  if (entry?.isIntersecting && q.hasNextPage.value && !q.isFetchingNextPage.value) void q.fetchNextPage()
}, { rootMargin: '800px' })

// Viewer
const openIndex = ref<number | null>(null)
const active = computed(() => openIndex.value === null ? null : items.value[openIndex.value] ?? null)
const viewerOpen = computed({ get: () => active.value !== null, set: (value) => { if (!value) openIndex.value = null } })
function step(delta: number) {
  if (openIndex.value === null) return
  const next = openIndex.value + delta
  if (next >= 0 && next < items.value.length) openIndex.value = next
  if (next >= items.value.length - 5 && q.hasNextPage.value) void q.fetchNextPage()
}
onKeyStroke('ArrowLeft', () => viewerOpen.value && step(-1))
onKeyStroke('ArrowRight', () => viewerOpen.value && step(1))
const takenFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' })
const duration = (ms: number | null) => ms === null ? '' : `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

const busy = ref(false)
async function share(item: MediaItemDTO) {
  busy.value = true
  try {
    const { item: updated } = await api<{ item: MediaItemDTO }>(`/api/media/${item.id}`, { method: 'PATCH', body: { visibility: item.visibility === 'space' ? 'private' : 'space' } })
    item.visibility = updated.visibility
    await queryClient.invalidateQueries({ queryKey: ['media', serverId.value, 'space'] })
  }
  catch (error) { toast.add({ title: 'Could not change who sees it', description: errorMessage(error), color: 'error' }) }
  finally { busy.value = false }
}
async function remove(item: MediaItemDTO) {
  if (!window.confirm(`Delete ${item.filename} from Media? This cannot be undone.`)) return
  busy.value = true
  try {
    await api(`/api/media/${item.id}`, { method: 'DELETE' })
    const index = items.value.findIndex(entry => entry.id === item.id)
    queryClient.setQueryData<{ pages: MediaPageDTO[]; pageParams: unknown[] }>(key.value, data => data && ({ ...data, pages: data.pages.map(page => ({ ...page, items: page.items.filter(entry => entry.id !== item.id) })) }))
    if (!items.value.length) openIndex.value = null
    else if (index >= items.value.length) openIndex.value = items.value.length - 1
  }
  catch (error) { toast.add({ title: 'Could not delete', description: errorMessage(error), color: 'error' }) }
  finally { busy.value = false }
}

// Import
const filesInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)
const progress = reactive<ImportProgress>({ total: 0, done: 0, skipped: 0, failed: 0, bytes: 0, current: null, errors: [] })
const importing = ref(false)
const preparing = ref(false)
let controller: AbortController | null = null
function stopImport() { controller?.abort() }
const importItems = [[
  { label: 'Photos and videos', icon: 'i-ph-images', onSelect: () => filesInput.value?.click() },
  { label: 'A folder', icon: 'i-ph-folder', onSelect: () => folderInput.value?.click() },
]]

async function picked(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (!files.length || importing.value) return
  Object.assign(progress, { total: 0, done: 0, skipped: 0, failed: 0, bytes: 0, current: null, errors: [] })
  importing.value = true
  preparing.value = true
  controller = new AbortController()
  try {
    const candidates = await collectCandidates(files)
    preparing.value = false
    if (!candidates.length) {
      toast.add({ title: 'No photos or videos found', description: 'Media takes JPEG, PNG, GIF, WebP, HEIC, AVIF, MP4, MOV and WebM, alone or in a folder.', color: 'warning' })
      return
    }
    await runMediaImport(api, candidates, progress, controller.signal, () => {
      if (source.value === 'mine') void queryClient.invalidateQueries({ queryKey: ['media', serverId.value, 'mine'] })
    })
    toast.add({ title: controller.signal.aborted ? 'Import stopped' : 'Import finished', description: summary.value, color: progress.failed ? 'warning' : 'success' })
  }
  catch (error) {
    toast.add({ title: 'Import failed', description: errorMessage(error), color: 'error' })
  }
  finally {
    importing.value = false
    preparing.value = false
    controller = null
    await queryClient.invalidateQueries({ queryKey: ['media', serverId.value, 'mine'] })
  }
}
const summary = computed(() => {
  const added = progress.done - progress.skipped - progress.failed
  return [`${added} added`, progress.skipped ? `${progress.skipped} already here` : '', progress.failed ? `${progress.failed} failed` : '', progress.bytes ? formatBytes(progress.bytes) : ''].filter(Boolean).join(' · ')
})
onBeforeRouteLeave(() => {
  if (importing.value && !window.confirm('An import is running. Leave and stop it?')) return false
  controller?.abort()
})
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col">
    <LayoutPageHeader :title="titles[source]" icon="i-ph-images">
      <template #actions>
        <UDropdownMenu v-if="source === 'mine'" :items="importItems" :content="{ align: 'end' }">
          <UButton icon="i-ph-upload-simple" label="Import" color="neutral" variant="soft" :disabled="importing" />
        </UDropdownMenu>
      </template>
    </LayoutPageHeader>
    <input ref="filesInput" type="file" multiple accept="image/*,video/*,.heic,.heif,.mov" class="hidden" @change="picked">
    <input ref="folderInput" type="file" webkitdirectory class="hidden" @change="picked">

    <main class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
        <div v-if="importing" class="mb-5 rounded-lg border border-default bg-elevated/50 p-4">
          <div class="flex items-center gap-3">
            <UIcon name="i-ph-upload-simple" class="size-5 shrink-0 text-muted" />
            <p class="min-w-0 flex-1 text-sm font-medium text-highlighted">
              {{ preparing ? 'Reading what you picked…' : `Importing ${progress.done} of ${progress.total}` }}
            </p>
            <UButton label="Stop" color="neutral" variant="ghost" size="sm" @click="stopImport" />
          </div>
          <UProgress v-if="!preparing" :model-value="progress.total ? (progress.done / progress.total) * 100 : 0" class="mt-3" />
          <p class="mt-2 truncate text-xs text-muted">{{ summary }}<template v-if="progress.current"> · {{ progress.current }}</template></p>
        </div>
        <details v-if="!importing && progress.errors.length" class="mb-5 rounded-lg border border-warning/40 p-3 text-sm">
          <summary class="cursor-pointer text-warning">{{ progress.failed }} files were not imported</summary>
          <ul class="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-muted">
            <li v-for="line in progress.errors" :key="line" class="break-all">{{ line }}</li>
          </ul>
        </details>

        <LayoutLoadError v-if="q.error.value" inline message="Media did not load." :retry="() => q.refetch()" />
        <LayoutSkeleton v-else-if="q.isPending.value" variant="nav" :rows="4" />
        <LayoutEmptyState v-else-if="!items.length" icon="i-ph-images" :title="titles[source]" :description="empty[source]" />

        <section v-for="group in groups" :key="group.label" class="mb-6">
          <h2 class="sticky top-0 z-[1] -mx-1 mb-2 bg-default/90 px-1 py-1 text-sm font-semibold text-highlighted backdrop-blur">{{ group.label }}</h2>
          <ul class="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            <li v-for="item in group.items" :key="item.id">
              <button type="button" class="group relative block aspect-square w-full overflow-hidden rounded-sm bg-muted" :aria-label="item.filename" @click="openIndex = items.indexOf(item)">
                <img v-if="item.thumbUrl || !isVideoType(item.contentType)" :src="serverUrl(item.thumbUrl ?? item.url)" :alt="item.filename" loading="lazy" decoding="async" class="size-full object-cover transition-opacity group-hover:opacity-90">
                <span v-else class="flex size-full items-center justify-center"><UIcon name="i-ph-film-strip" class="size-8 text-dimmed" /></span>
                <span v-if="isVideoType(item.contentType)" class="absolute bottom-1 end-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
                  <UIcon name="i-ph-play-fill" class="size-3" />{{ duration(item.durationMs) }}
                </span>
                <UIcon v-if="source === 'mine' && item.visibility === 'space'" name="i-ph-users-three-fill" class="absolute end-1 top-1 size-4 text-white drop-shadow" />
              </button>
            </li>
          </ul>
        </section>
        <div ref="sentinel" class="h-8" />
        <LayoutSkeleton v-if="q.isFetchingNextPage.value" variant="nav" :rows="2" />
      </div>
    </main>

    <UModal
      v-model:open="viewerOpen"
      :title="active?.filename || 'Media'"
      :description="active ? `${takenFormat.format(new Date(active.takenAt))} · ${formatBytes(active.sizeBytes)}` : undefined"
      :fullscreen="isMobile"
      :ui="isMobile ? { content: 'bg-black', body: 'flex min-h-0 flex-1 p-0 sm:p-0' } : { content: 'sm:max-w-5xl' }"
    >
      <template #body>
        <div v-if="active" class="relative flex min-h-48 w-full items-center justify-center overflow-hidden" :class="isMobile ? 'h-full bg-black' : 'rounded-lg bg-black/30'">
          <video v-if="isVideoType(active.contentType)" :key="active.id" :src="serverUrl(active.url)" :poster="active.thumbUrl ? serverUrl(active.thumbUrl) : undefined" controls autoplay playsinline class="block max-h-[75vh] max-w-full" />
          <img v-else :key="active.id" :src="serverUrl(active.url)" :alt="active.filename" class="block max-h-[75vh] max-w-full object-contain">
          <UButton v-if="openIndex! > 0" icon="i-ph-caret-left" color="neutral" variant="solid" size="lg" square class="absolute start-3 top-1/2 -translate-y-1/2 rounded-full" aria-label="Previous" @click="step(-1)" />
          <UButton v-if="openIndex! < items.length - 1" icon="i-ph-caret-right" color="neutral" variant="solid" size="lg" square class="absolute end-3 top-1/2 -translate-y-1/2 rounded-full" aria-label="Next" @click="step(1)" />
        </div>
      </template>
      <template #footer>
        <div v-if="active" class="flex w-full flex-wrap items-center gap-2">
          <UButton v-if="active.message" :to="active.message.path" icon="i-ph-chat-circle" label="Open in conversation" color="neutral" variant="soft" @click="openIndex = null" />
          <template v-if="active.mine && !active.message">
            <UButton :icon="active.visibility === 'space' ? 'i-ph-lock-simple' : 'i-ph-users-three'" :label="active.visibility === 'space' ? 'Make private' : 'Share with Space'" color="neutral" variant="soft" :loading="busy" @click="share(active)" />
            <UButton icon="i-ph-trash" label="Delete" color="error" variant="ghost" :disabled="busy" @click="remove(active)" />
          </template>
          <UButton :to="serverUrl(active.url)" target="_blank" icon="i-ph-arrow-square-out" label="Open original" color="neutral" variant="soft" class="ms-auto" />
        </div>
      </template>
    </UModal>
  </div>
</template>
