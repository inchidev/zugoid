<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { CustomerCompanyDTO, CustomerContactDTO } from '~~/shared/types'
import { errorMessage } from '~/composables/useApi'

definePageMeta({ layout: 'server', middleware: ['auth'] })

const { api } = useApi()
const route = useRoute()
const qc = useQueryClient()
const toast = useToast()
const companyId = computed(() => String(route.params.id || ''))

const companyQ = useQuery({
  queryKey: computed(() => ['customer-company', companyId.value]),
  queryFn: () => api<{ company: CustomerCompanyDTO; contacts: CustomerContactDTO[] }>(`/api/customers/companies/${companyId.value}`),
})
const company = computed(() => companyQ.data.value?.company ?? null)
const contacts = computed(() => companyQ.data.value?.contacts ?? [])

const name = ref('')
const domains = ref('')
watch(company, (value) => {
  if (!value) return
  name.value = value.name
  domains.value = value.domains.join(', ')
}, { immediate: true })
const dirty = computed(() => Boolean(company.value) && (name.value.trim() !== company.value!.name || domains.value.split(/[\s,;]+/u).filter(Boolean).join(',') !== company.value!.domains.join(',')))

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await api(`/api/customers/companies/${companyId.value}`, { method: 'PATCH', body: { name: name.value.trim(), domains: domains.value.split(/[\s,;]+/u).filter(Boolean) } })
    await Promise.all([qc.invalidateQueries({ queryKey: ['customer-company', companyId.value] }), qc.invalidateQueries({ queryKey: ['customer-companies'] })])
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
  finally { saving.value = false }
}

const deleteOpen = ref(false)
async function remove() {
  try {
    await api(`/api/customers/companies/${companyId.value}`, { method: 'DELETE' })
    await qc.invalidateQueries({ queryKey: ['customer-companies'] })
    await navigateTo('/customers/companies')
  }
  catch (error) { toast.add({ title: errorMessage(error), color: 'error' }) }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <LayoutPageHeader icon="i-ph-buildings" :crumbs="[{ label: 'Companies', to: '/customers/companies' }, { label: company?.name ?? '' }]" :loading="companyQ.isPending.value">
      <template v-if="company" #actions>
        <UButton icon="i-ph-trash" color="neutral" variant="ghost" size="sm" aria-label="Delete company" @click="deleteOpen = true" />
      </template>
    </LayoutPageHeader>
    <LayoutSkeleton v-if="companyQ.isPending.value" variant="rows" :rows="6" />
    <LayoutEmptyState v-else-if="!company" icon="i-ph-buildings" title="Company not found" description="It was removed, or it is in a Space you cannot reach." />
    <div v-else class="min-h-0 flex-1 overflow-y-auto">
      <form class="max-w-xl space-y-3 border-b border-default px-4 py-5" @submit.prevent="save">
        <UFormField label="Name">
          <UInput v-model="name" class="w-full" />
        </UFormField>
        <UFormField label="Email domains" help="Contacts with a verified address on these domains join the company. Free mail providers cannot be added.">
          <UInput v-model="domains" placeholder="example.com" class="w-full" />
        </UFormField>
        <UButton type="submit" label="Save" size="sm" :loading="saving" :disabled="!dirty || !name.trim()" />
      </form>
      <section class="px-4 py-4">
        <h3 class="mb-2 text-sm font-semibold text-highlighted">People</h3>
        <p v-if="!contacts.length" class="text-sm text-muted">No Contacts in this company yet.</p>
        <ul v-else class="divide-y divide-default rounded-md border border-default">
          <li v-for="contact in contacts" :key="contact.id">
            <NuxtLink :to="`/customers/contacts/${contact.id}`" class="flex items-center gap-3 px-3 py-2 hover:bg-elevated/60">
              <UAvatar :alt="contact.name" size="xs" />
              <span class="min-w-0 flex-1 truncate text-sm text-highlighted">{{ contact.name }}</span>
              <span class="truncate text-xs text-muted">{{ contact.companies.find(item => item.id === company!.id)?.title }}</span>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </div>
    <UModal v-model:open="deleteOpen" title="Delete company?" :description="`${company?.name ?? ''} is removed. Its Contacts and their conversations stay.`">
      <template #footer>
        <UButton label="Cancel" color="neutral" variant="outline" @click="deleteOpen = false" />
        <UButton label="Delete company" color="error" @click="remove" />
      </template>
    </UModal>
  </div>
</template>
