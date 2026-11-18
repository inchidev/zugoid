<script setup lang="ts">
const route = useRoute()
const onContacts = computed(() => route.path === '/customers' || route.path.startsWith('/customers/contacts'))
const onCompanies = computed(() => route.path.startsWith('/customers/companies'))
</script>

<template>
  <div class="space-y-3">
    <ul class="px-2">
      <li>
        <LayoutNavRow to="/customers" :active="onContacts">
          <template #leading>
            <UIcon name="i-ph-users-three" class="size-[18px] shrink-0 text-dimmed" />
          </template>
          Contacts
        </LayoutNavRow>
      </li>
      <li>
        <LayoutNavRow to="/customers/companies" :active="onCompanies">
          <template #leading>
            <UIcon name="i-ph-buildings" class="size-[18px] shrink-0 text-dimmed" />
          </template>
          Companies
        </LayoutNavRow>
      </li>
    </ul>
    <LayoutMailNav />
    <LayoutWidgetsNav />
  </div>
</template>
