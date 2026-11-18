<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { CustomerCompanyDTO } from '~~/shared/types'
import { errorMessage } from '~/composables/useApi'

definePageMeta({ layout: 'server', middleware: ['auth'] })

const { api } = useApi()
const qc = useQueryClient()
const toast = useToast()
const searchInput = ref('')
const search = refDebounced(computed(() => searchInput.value.trim()), 300)

const companiesQ = useQuery({
  queryKey: computed(() => ['customer-companies', search.value]),
  queryFn: () => api<{ companies: CustomerCompanyDTO[] }>('/api/customers/companies', { query: search.value ? { q: search.value } : {} }),
  placeholderData: previous => previous,
})
const companies = computed(() => companiesQ.data.value?.companies ?? [])

const createOpen = ref(false)
const newName = ref('')
const newDomains = ref('')
const creating = ref(false)
async function create() {
  creating.value = true
  try {
    const domains = newDomains.value.split(/[\s,;]+/u).filter(Boolean)
    const { companyId } = await api<{ companyId: string }>('/api/customers/companies', { method: 'POST', body: { name: newName.value, domains } })
    createOpen.value = false
    newName.value = ''
    newDomains.value = ''
    await qc.invalidateQueries({ queryKey: ['customer-companies'] })
    await navigateTo(`/customers/companies/${companyId}`)
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { creating.value = false }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <LayoutPageHeader icon="i-ph-buildings" title="Companies">
      <template #actions>
        <UInput v-model="searchInput" icon="i-ph-magnifying-glass" placeholder="Search name or domain" size="sm" class="w-56" />
        <UButton icon="i-ph-plus" label="New company" size="sm" @click="createOpen = true" />
      </template>
    </LayoutPageHeader>
    <LayoutSkeleton v-if="companiesQ.isPending.value" variant="rows" :rows="8" />
    <LayoutEmptyState
      v-else-if="!companies.length"
      icon="i-ph-buildings"
      :title="search ? 'No company matches' : 'No companies yet'"
      :description="search ? 'Try another name or domain.' : 'Add a company with its email domain, and Contacts who write from that domain join it.'"
    />
    <ul v-else class="min-h-0 flex-1 divide-y divide-default overflow-y-auto">
      <li v-for="company in companies" :key="company.id">
        <NuxtLink :to="`/customers/companies/${company.id}`" class="flex items-center gap-3 px-4 py-3 hover:bg-elevated/60">
          <UAvatar :alt="company.name" size="sm" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-highlighted">{{ company.name }}</p>
            <p class="truncate text-xs text-muted">{{ company.domains.join(', ') }}</p>
          </div>
          <span class="shrink-0 text-xs text-muted">{{ company.contactCount === 1 ? '1 contact' : `${company.contactCount} contacts` }}</span>
        </NuxtLink>
      </li>
    </ul>
    <UModal v-model:open="createOpen" title="New company">
      <template #body>
        <form id="new-company" class="space-y-3" @submit.prevent="create">
          <UFormField label="Name" required>
            <UInput v-model="newName" class="w-full" autofocus />
          </UFormField>
          <UFormField label="Email domains" help="Separated by commas. Contacts with a verified address on these domains join the company.">
            <UInput v-model="newDomains" placeholder="example.com" class="w-full" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <UButton label="Cancel" color="neutral" variant="outline" @click="createOpen = false" />
        <UButton type="submit" form="new-company" label="Create" :loading="creating" :disabled="!newName.trim()" />
      </template>
    </UModal>
  </div>
</template>
