<script setup lang="ts">
definePageMeta({ middleware: [to => {
  const { gadget, ...query } = to.query
  return navigateTo({ path: '/apps', query: { ...query, app: query.app ?? gadget }, hash: to.hash }, { replace: true })
}] })
</script>
<template>
  <div />
</template>
