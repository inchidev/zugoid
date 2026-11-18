<script setup lang="ts">
import SettingsEditor from './SettingsEditor.vue'
import { useQueries, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { GitConnection } from '~~/shared/git-connections'
type Repository = { id: number; name: string; fork: boolean; defaultBranch: string }
const {api}=useApi(),qc=useQueryClient(),toast=useToast()
// Shares the GitHub tab's query; each tab shows its own provider.
const connections=useQuery({queryKey:['git-connections'],queryFn:({signal})=>api<{connections:GitConnection[];canConfigure:boolean}>('/api/git-connections',{signal,timeout:15000})})
const gitlab=computed(()=>(connections.data.value?.connections??[]).filter(c=>c.provider==='gitlab'))
const enabled=computed(()=>gitlab.value.filter(c=>c.enabled))
const repositories=useQueries({queries:computed(()=>enabled.value.map(c=>({queryKey:['agent-repositories',c.id],queryFn:({signal}:{signal:AbortSignal})=>api<{configured:boolean;repositories:Repository[]}>('/api/code-environments/repositories',{signal,timeout:30000,query:{connectionId:c.id}}),retry:false})))})
const reposFor=(id:string)=>repositories.value[enabled.value.findIndex(c=>c.id===id)]
const connectOpen=ref(false),detailOpen=ref(false),selectedId=ref<string|null>(null),busy=ref(false)
const selected=computed(()=>gitlab.value.find(c=>c.id===selectedId.value))
const selectedRepos=computed(()=>selectedId.value?reposFor(selectedId.value):undefined)
const host=ref('https://gitlab.com'),token=ref(''),name=ref('')
const hostname=(value:string)=>{try{return new URL(value).hostname}catch{return value}}
async function refresh(){
 await connections.refetch()
 await qc.invalidateQueries({queryKey:['code-environments']})
 await qc.invalidateQueries({queryKey:['agent-repositories']})
}
defineExpose({ connect: () => { connectOpen.value = true }, refresh })
async function connect(){
 busy.value=true
 try{
  await api('/api/git-connections/gitlab',{method:'POST',body:{host:host.value.trim(),token:token.value.trim(),...(name.value.trim()?{name:name.value.trim()}:{})}})
  token.value='';name.value='';connectOpen.value=false
  await refresh()
 }catch(e){toast.add({title:errorMessage(e),color:'error'})}
 finally{busy.value=false}
}
async function disconnect(id:string){
 busy.value=true
 try{await api('/api/git-connections/'+id,{method:'DELETE'});await refresh()}
 catch(e){toast.add({title:errorMessage(e),color:'error'})}finally{busy.value=false}
}
const countLabel=(id:string)=>{
 const q=reposFor(id)
 if(!q||q.isPending)return 'Loading projects…'
 if(q.error)return 'Projects unavailable'
 const n=q.data?.repositories.length??0
 return n?`${n} ${n===1?'project':'projects'}`:'No projects yet'
}
</script>
<template>
 <section class="space-y-4">
  <LayoutLoadError v-if="connections.error.value" message="Git connections did not load." :retry="connections.refetch" />
  <SettingsList :items="gitlab" :item-key="c => c.id" :search-text="c => `${c.name} ${c.account} ${c.host}`" :loading="connections.isPending.value" placeholder="Search connections" :noun="['connection', 'connections']" @select="c => { selectedId = c.id; detailOpen = true }"><template #row="{ item: c }"><span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-elevated text-muted"><UIcon name="i-ph-gitlab-logo" class="size-4" /></span><span class="min-w-0 flex-1"><span class="block text-sm font-medium text-highlighted">{{ c.account }} <span class="font-normal text-muted">on {{ hostname(c.host) }}</span></span><span class="block text-xs text-muted">{{ c.enabled ? countLabel(c.id) : 'Disabled' }}</span></span><UBadge v-if="!c.enabled" label="Disabled" color="neutral" variant="subtle" /></template></SettingsList>
  <p v-if="connections.data.value && !gitlab.length" class="text-sm text-muted">Connect GitLab.com or your own GitLab with an access token. Zugoid works with the projects that token can push to.</p>
  <SettingsEditor v-model:open="detailOpen" back="Git" :title="selected ? `${selected.account} on ${hostname(selected.host)}` : 'GitLab connection'" :description="selected?.name"><template #body><div v-if="selected" class="space-y-4">
   <div v-if="selected.enabled" class="space-y-2">
    <div class="flex items-center justify-between gap-2"><h3 class="text-sm font-medium text-highlighted">Projects</h3><UButton icon="i-ph-arrows-clockwise" aria-label="Refresh projects" color="neutral" variant="ghost" size="sm" :loading="selectedRepos?.isFetching" @click="selectedRepos?.refetch()" /></div>
    <LayoutLoadError v-if="selectedRepos?.error" message="Projects did not load from GitLab." :retry="selectedRepos.refetch" />
    <p v-else-if="selectedRepos?.isPending" class="text-sm text-muted">Loading projects…</p>
    <p v-else-if="!selectedRepos?.data?.repositories.length" class="text-sm text-muted">This token cannot push to any project yet. Give its user the Developer role or higher in GitLab, then refresh.</p>
    <ul v-else class="divide-y divide-default rounded-md border border-default">
     <li v-for="repo in selectedRepos.data.repositories" :key="repo.id" class="flex items-center gap-2 px-3 py-2 text-sm"><UIcon name="i-ph-book-bookmark" class="size-4 shrink-0 text-muted" /><span class="min-w-0 flex-1 truncate">{{ repo.name }}</span><span class="shrink-0 text-xs text-muted">{{ repo.defaultBranch }}</span><UBadge v-if="repo.fork" label="Fork" color="neutral" variant="subtle" /></li>
    </ul>
    <p class="text-xs text-muted">To change which projects Zugoid can use, change this user's membership in GitLab: its groups and projects with the Developer role or higher.</p>
   </div>
   <p v-else class="text-sm text-muted">This connection is disabled in Zugoid.</p>
   <div class="flex flex-wrap gap-2"><UButton v-if="selected.enabled" :to="selected.setupUrl" target="_blank" label="Open account in GitLab" icon="i-ph-arrow-square-out" color="neutral" variant="outline" /><UButton v-if="selected.enabled && connections.data.value?.canConfigure" label="Disable in Zugoid" color="neutral" variant="ghost" :loading="busy" @click="disconnect(selected.id)" /></div>
   <p v-if="selected.enabled" class="text-xs text-muted">Disabling stops Zugoid from using the token at once. Revoke the token in GitLab to end it there too.</p>
  </div></template></SettingsEditor>
  <SettingsEditor v-model:open="connectOpen" back="Git" title="Connect GitLab" description="Works with GitLab.com and self-managed GitLab. Zugoid uses one access token."><template #body>
   <form v-if="connections.data.value?.canConfigure" class="space-y-4" @submit.prevent="connect">
    <ol class="list-decimal space-y-1 pl-5 text-sm text-muted">
     <li>Create a separate GitLab user for Zugoid, for example <span class="font-mono">zugoid-bot</span>, or use a group or project access token, which acts as its own bot user.</li>
     <li>Give that user the Developer role in the groups or projects agents may work on, or Maintainer where they merge into protected branches.</li>
     <li>Create an access token with the <span class="font-mono">api</span> scope: for a user under Preferences → Access tokens, for a group or project under its Settings → Access tokens.</li>
    </ol>
    <UFormField label="GitLab address" help="https://gitlab.com, or the address of your own GitLab."><UInput v-model="host" placeholder="https://gitlab.com" class="w-full" autocomplete="off" /></UFormField>
    <UFormField label="Access token" help="Stored encrypted on this Server. Agents and Compute Nodes never receive it."><UInput v-model="token" type="password" class="w-full" autocomplete="off" /></UFormField>
    <UFormField label="Name" help="Optional. Defaults to the user and address."><UInput v-model="name" class="w-full" /></UFormField>
    <p class="text-xs text-muted">A personal token of your own also works, but then Zugoid can reach every project you can. A project access token keeps it to one project.</p>
    <UButton type="submit" label="Connect GitLab" :disabled="!host.trim() || !token.trim()" :loading="busy" />
   </form>
   <p v-else class="text-sm text-muted">Only the Server Owner can connect GitLab.</p>
  </template></SettingsEditor>
 </section>
</template>
