<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { contrastRatio, DEFAULT_SERVER_THEME, HIDEABLE_SECTIONS, serverThemeCss, type HideableSection, type ServerTheme, type ThemeFont } from '~~/shared/server-theme'
import { MAX_EMBED_ORIGINS, type ServerEmbedding } from '~~/shared/server-embedding'

const props = defineProps<{ serverId: string; isOwner: boolean }>()
const { api } = useApi()
const toast = useToast()
const session = useSessionStore()

const saved = useQuery({ queryKey: computed(() => ['appearance', props.serverId]), queryFn: () => api<{ theme: ServerTheme }>(`/api/servers/${props.serverId}/appearance`) })
const theme = reactive<ServerTheme>({ ...DEFAULT_SERVER_THEME, hiddenSections: [] })
watch(() => saved.data.value?.theme, (value) => { if (value) Object.assign(theme, { ...value, hiddenSections: [...value.hiddenSections] }) }, { immediate: true })
const themeSaving = ref(false)

const fonts: Array<{ value: ThemeFont; label: string }> = [
  { value: 'default', label: 'Geist (default)' },
  { value: 'system', label: 'System' },
  { value: 'serif', label: 'Serif' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'mono', label: 'Monospace' },
]

// A light accent under white text, or a dark one under black, is hard to read on buttons.
const accentWarning = computed(() => {
  const accent = theme.accent
  if (!accent) return ''
  return Math.max(contrastRatio(accent, '#ffffff'), contrastRatio(accent, '#000000')) < 4.5 ? 'Button text on this accent is hard to read. Choose a darker or lighter shade.' : ''
})

// The page previews the theme while it is edited, and puts the saved one back on leaving.
useHead(() => ({ style: [{ key: 'server-theme-preview', innerHTML: serverThemeCss(theme) }] }))

const SECTION_LABELS: Record<HideableSection, string> = {
  inbox: 'Inbox', tasks: 'Tasks', factory: 'Factory', customers: 'Customers', agents: 'Agents', data: 'Data',
}
const sectionItems = HIDEABLE_SECTIONS.map(value => ({ value, label: SECTION_LABELS[value] }))
const shownSections = computed<HideableSection[]>({
  get: () => HIDEABLE_SECTIONS.filter(section => !theme.hiddenSections.includes(section)),
  set: (shown: HideableSection[]) => { theme.hiddenSections = HIDEABLE_SECTIONS.filter(section => !shown.includes(section)) },
})

function colourModel(key: 'accent' | 'accentDark' | 'signInBackground') {
  return computed({
    get: () => theme[key] ?? '',
    set: (value: string) => { theme[key] = value.trim() ? value.trim().toLowerCase() : null },
  })
}
const accent = colourModel('accent')
const accentDark = colourModel('accentDark')
const signInBackground = colourModel('signInBackground')

async function saveTheme() {
  themeSaving.value = true
  try {
    const result = await api<{ theme: ServerTheme }>(`/api/servers/${props.serverId}/appearance`, { method: 'PUT', body: { ...theme } })
    Object.assign(theme, result.theme)
    if (session.health) session.health = { ...session.health, theme: result.theme }
    await saved.refetch()
    toast.add({ title: 'Appearance saved', color: 'success' })
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { themeSaving.value = false }
}

function resetTheme() { Object.assign(theme, { ...DEFAULT_SERVER_THEME, hiddenSections: [] }) }

const embedding = useQuery({
  queryKey: computed(() => ['embedding', props.serverId]),
  queryFn: () => api<{ embedding: ServerEmbedding }>(`/api/servers/${props.serverId}/embedding`),
  enabled: computed(() => props.isOwner),
})
const origins = ref<string[]>([])
watch(() => embedding.data.value?.embedding.origins, (value) => { if (value) origins.value = [...value] }, { immediate: true })
const newOrigin = ref('')
const embedSaving = ref(false)

async function saveOrigins(next: string[]) {
  embedSaving.value = true
  try {
    const result = await api<{ embedding: ServerEmbedding }>(`/api/servers/${props.serverId}/embedding`, { method: 'PUT', body: { origins: next } })
    origins.value = result.embedding.origins
    newOrigin.value = ''
    await embedding.refetch()
    toast.add({ title: 'Embedding saved', color: 'success' })
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { embedSaving.value = false }
}
function addOrigin() { if (newOrigin.value.trim()) void saveOrigins([...origins.value, newOrigin.value.trim()]) }
function removeOrigin(origin: string) { void saveOrigins(origins.value.filter(item => item !== origin)) }
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold">Appearance</h2>
      <p class="mt-1 text-sm text-muted">How this Server looks to everyone who opens it, including its sign-in page. The logo is the Server icon in Overview.</p>
    </div>

    <LayoutLoadError v-if="saved.error.value" message="Appearance did not load." :retry="saved.refetch" />
    <LayoutSkeleton v-else-if="!saved.data.value" variant="form" />
    <form v-else class="space-y-4" @submit.prevent="saveTheme">
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Accent" description="Buttons, links and selection." :hint="theme.accent ? undefined : 'Neutral'">
          <div class="flex items-center gap-2">
            <input v-model="accent" type="color" aria-label="Pick the accent" class="size-8 shrink-0 cursor-pointer rounded border border-default bg-transparent">
            <UInput v-model="accent" placeholder="#1f6feb" class="w-full" />
          </div>
        </UFormField>
        <UFormField label="Accent in dark mode" description="Leave empty to use the accent.">
          <div class="flex items-center gap-2">
            <input v-model="accentDark" type="color" aria-label="Pick the dark mode accent" class="size-8 shrink-0 cursor-pointer rounded border border-default bg-transparent">
            <UInput v-model="accentDark" placeholder="Same as accent" class="w-full" />
          </div>
        </UFormField>
        <UFormField label="Sign-in background" description="The side of the sign-in page that carries the logo.">
          <div class="flex items-center gap-2">
            <input v-model="signInBackground" type="color" aria-label="Pick the sign-in background" class="size-8 shrink-0 cursor-pointer rounded border border-default bg-transparent">
            <UInput v-model="signInBackground" placeholder="Default" class="w-full" />
          </div>
        </UFormField>
        <UFormField label="Font">
          <USelect v-model="theme.font" :items="fonts" value-key="value" label-key="label" class="w-full" />
        </UFormField>
      </div>
      <UAlert v-if="accentWarning" color="warning" icon="i-ph-warning" :title="accentWarning" />
      <USwitch v-model="theme.hideZugoid" label="Show this Server instead of Zugoid" description="Members see this Server's name and icon on the sign-in page, in the title and while it loads, not Zugoid's." />
      <UFormField label="Sections" description="What the sidebar shows besides Chat. A hidden section keeps its data, and its links open the Server's start page.">
        <UCheckboxGroup v-model="shownSections" :items="sectionItems" value-key="value" label-key="label" orientation="horizontal" class="mt-1" :ui="{ fieldset: 'flex-wrap gap-x-4 gap-y-2' }" />
      </UFormField>
      <div class="flex flex-wrap justify-end gap-2">
        <UButton type="button" color="neutral" variant="ghost" label="Reset to default" @click="resetTheme" />
        <UButton type="submit" label="Save appearance" :loading="themeSaving" />
      </div>
    </form>

    <section v-if="isOwner" class="space-y-3 border-t border-default pt-4">
      <div>
        <h3 class="font-medium">Embed on other sites</h3>
        <p class="mt-1 text-sm text-muted">Sites listed here may show this Server inside a frame. Anything else is refused. Signing in inside a frame works when this Server's address is a subdomain of that site, such as chat.example.com inside example.com.</p>
      </div>
      <LayoutLoadError v-if="embedding.error.value" message="Embedding did not load." :retry="embedding.refetch" />
      <template v-else>
        <ul v-if="origins.length" class="divide-y divide-default rounded-md border border-default">
          <li v-for="origin in origins" :key="origin" class="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <span class="truncate">{{ origin }}</span>
            <UButton icon="i-ph-x" color="neutral" variant="ghost" size="sm" :aria-label="`Stop allowing ${origin}`" :disabled="embedSaving" @click="removeOrigin(origin)" />
          </li>
        </ul>
        <p v-else class="text-sm text-muted">No site may embed this Server.</p>
        <form v-if="origins.length < MAX_EMBED_ORIGINS" class="flex gap-2" @submit.prevent="addOrigin">
          <UInput v-model="newOrigin" placeholder="https://example.com" aria-label="Site address" class="flex-1" />
          <UButton type="submit" label="Allow" :loading="embedSaving" :disabled="!newOrigin.trim()" />
        </form>
      </template>
    </section>
  </section>
</template>
