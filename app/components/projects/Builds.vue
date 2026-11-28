<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { useQuery } from '@tanstack/vue-query'
import type { ProjectBuild } from '~~/shared/factory-builds'
import type { ProjectRepository } from '~~/shared/projects'

const props = defineProps<{ projectId: string; repositories: ProjectRepository[]; canManage: boolean }>()
const { api } = useApi()
const toast = useToast()
const root = computed(() => `/api/projects/${props.projectId}/builds`)
const repoId = ref('')
const gitRef = ref('refs/heads/main')
const busy = ref('')
const selected = ref<ProjectBuild | null>(null)
const repositories = computed(() => props.repositories.filter(repo => repo.provider === 'artifacts'))
const query = useQuery({
  queryKey: computed(() => ['project-builds', props.projectId]),
  queryFn: () => api<{ configured: boolean; builds: ProjectBuild[] }>(root.value),
  enabled: computed(() => repositories.value.length > 0),
})
watch(repositories, value => {
  if (!value.some(repo => repo.id === repoId.value)) repoId.value = value[0]?.id || ''
}, { immediate: true })

const builds = computed(() => query.data.value?.builds ?? [])
const mainPreview = computed(() => builds.value.find(build => build.ref === 'refs/heads/main' && build.previewUrl))
const canStart = computed(() => props.canManage && !busy.value && repoId.value && gitRef.value.trim())

let polling = false
useIntervalFn(async () => {
  if (polling || !query.data.value?.configured) return
  polling = true
  try {
    await query.refetch()
    if (selected.value) selected.value = builds.value.find(build => build.id === selected.value?.id) ?? selected.value
  } catch (error) {
    if (selected.value) toast.add({ title: errorMessage(error), color: 'error' })
  } finally { polling = false }
}, 7000)

async function start() {
  busy.value = 'start'
  try {
    await api(root.value, { method: 'POST', body: { repoId: repoId.value, ref: gitRef.value.trim() } })
    await query.refetch()
  } catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { busy.value = '' }
}

async function act(build: ProjectBuild, action: 'stage' | 'publish') {
  busy.value = build.id
  try {
    await api(`${root.value}/${build.id}/${action}`, { method: 'POST' })
    if (action === 'publish') toast.add({ title: 'App version published', color: 'success' })
    await query.refetch()
  } catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { busy.value = '' }
}

function openPreview(event: MouseEvent, url: string) {
  if (!url.startsWith('https:') || window.parent === window || !document.referrer) return
  const link = new URL(url)
  if (new URL(document.referrer).origin !== link.origin) return
  event.preventDefault()
  window.parent.postMessage({ type: 'zugoid:open-preview', url: link.href }, link.origin)
}
</script>

<template>
  <section v-if="repositories.length" class="space-y-3" aria-labelledby="project-builds">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 id="project-builds" class="font-medium">Builds</h2>
      <UButton v-if="mainPreview?.previewUrl" :to="mainPreview.previewUrl" :target="mainPreview.previewUrl.startsWith('https:') ? '_blank' : undefined" color="neutral" variant="outline" label="Open main preview" @click="openPreview($event, mainPreview.previewUrl)" />
    </div>
    <LayoutLoadError v-if="query.error.value" message="Builds did not load." :retry="query.refetch" />
    <p v-else-if="query.data.value && !query.data.value.configured" class="text-sm text-muted">A Server operator can connect a Lizard runner, private storage and a destination for this project.</p>
    <template v-else-if="query.data.value?.configured">
      <form v-if="canManage" class="flex flex-wrap items-center gap-2" @submit.prevent="start">
        <USelect v-if="repositories.length > 1" v-model="repoId" :items="repositories.map(repo => ({ label: repo.slug, value: repo.id }))" aria-label="Repository" />
        <UInput v-model="gitRef" aria-label="Git ref" placeholder="refs/heads/main" />
        <UButton type="submit" label="Build" :disabled="!canStart" :loading="busy === 'start'" />
      </form>
      <p v-if="!builds.length" class="text-sm text-muted">No builds yet.</p>
      <ul v-else class="divide-y divide-default rounded-lg border border-default">
        <li v-for="build in builds" :key="build.id" class="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
          <button type="button" class="min-w-0 flex-1 break-all text-start hover:underline" @click="selected = build">
            {{ build.ref.replace(/^refs\/(heads|tags)\//, '') }} <span class="font-mono text-xs text-muted">{{ build.sha.slice(0, 9) }}</span>
          </button>
          <UBadge :label="build.state" :color="build.state === 'ready' ? 'success' : build.state === 'failed' ? 'error' : 'neutral'" variant="subtle" />
          <UButton v-if="build.previewUrl" :to="build.previewUrl" :target="build.previewUrl.startsWith('https:') ? '_blank' : undefined" size="xs" color="neutral" variant="outline" label="Preview" @click="openPreview($event, build.previewUrl)" />
          <UButton v-else-if="canManage && build.state === 'ready'" size="xs" label="Stage preview" :loading="busy === build.id" @click="act(build, 'stage')" />
          <UBadge v-if="build.publishedVersion" :label="'Published v' + build.publishedVersion" color="success" variant="subtle" />
          <UButton v-else-if="canManage && build.appRevision && build.ref.startsWith('refs/tags/')" size="xs" label="Publish App" :loading="busy === build.id" @click="act(build, 'publish')" />
        </li>
      </ul>
    </template>
    <UModal :open="!!selected" title="Build log" @update:open="value => { if (!value) selected = null }">
      <template #body>
        <p v-if="selected" class="mb-3 break-all font-mono text-xs">{{ selected.sha }}</p>
        <pre class="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-sm">{{ selected?.log || 'No output yet.' }}</pre>
      </template>
    </UModal>
  </section>
</template>
