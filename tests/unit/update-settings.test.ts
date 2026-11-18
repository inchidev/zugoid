// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref, watch } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import Updates from '../../app/components/settings/UpdateSettings.vue'
import type { ServerUpdateJob } from '../../shared/server-updates'

const Button = defineComponent({ inheritAttrs: false, props: ['label', 'disabled', 'loading'], setup: (p, { attrs }) => () => h('button', { ...attrs, disabled: p.disabled || p.loading }, p.label) })
const Select = defineComponent({ props: ['items', 'modelValue', 'disabled'], emits: ['update:modelValue'], setup: (p, { emit }) => () => h('select', { value: p.modelValue, disabled: p.disabled, onChange: (e: Event) => emit('update:modelValue', (e.target as HTMLSelectElement).value) }, p.items.map((i: { label: string; value: string }) => h('option', { value: i.value }, i.label))) })
const Checkbox = defineComponent({ props: ['modelValue', 'label', 'disabled'], emits: ['update:modelValue'], setup: (p, { emit }) => () => h('label', [p.label, h('input', { type: 'checkbox', checked: p.modelValue, disabled: p.disabled, onChange: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).checked) })]) })
let api: ReturnType<typeof vi.fn>, savedJob: ServerUpdateJob | null, client: QueryClient, coverage: Record<string, unknown> | undefined
const release = (tagName: string) => ({ tagName, name: tagName, publishedAt: '2026-10-21T00:00:00Z', url: `https://github.com/inchidev/zugoid/releases/tag/${tagName}`, notes: 'Release notes' })
beforeEach(() => {
  savedJob = null
  coverage = undefined
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  api = vi.fn(async (url: string, options?: { body?: Record<string, unknown>; query?: { prereleases?: boolean } }) => {
    if (url.endsWith('/updates')) return { installedVersion: '0.2.1', releases: [release('v0.2.600'), release('v0.2.2'), release('v0.2.0'), ...(options?.query?.prereleases ? [release('v0.3.0-alpha.1')] : [])], updateControl: { available: true, configured: true, mode: 'build', source: 'binding', job: savedJob }, coverage }
    if (url.endsWith('/progress')) return { installedVersion: '0.2.1', configured: true, mode: 'installer', job: savedJob, launchUrl: 'https://zugoid.com/create?update=x' }
    if (url.endsWith('/request')) {
      savedJob = { id: String(options?.body?.requestId), serverId: 'server', requestedBy: 'owner', sourceVersion: '0.2.1', targetVersion: String(options?.body?.release).slice(1), stage: 'queued', buildId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), backup: null, error: null }
      return { job: savedJob }
    }
    throw Error('Unexpected API call')
  })
  for (const [name, fn] of Object.entries({ ref, computed, watch, useApi: () => ({ api }), useNuxtApp: () => ({ $pwa: { waiting: ref(false), check: vi.fn() } }), useToast: () => ({ add: vi.fn() }), useAppConfig: () => ({ version: '0.2.21' }), errorMessage: String })) vi.stubGlobal(name, fn)
})
afterEach(() => { client.clear(); vi.unstubAllGlobals() })
function view() {
  return mount(Updates, { props: { serverId: 'server' }, global: { plugins: [[VueQueryPlugin, { queryClient: client }]], stubs: { UButton: Button, USelect: Select, UCheckbox: Checkbox, UBadge: { props: ['label'], template: '<span>{{ label }}</span>' }, UFormField: { template: '<label><slot /></label>' }, UAlert: { props: ['title', 'description'], template: '<p>{{ title }} {{ description }}</p>' }, LayoutSkeleton: true, UInput: true, SettingsCloudflareAccessCard: true, ChatMarkdownView: true } } })
}
it('selects only newer numeric versions, explicitly includes prereleases, and starts one idempotent backup/update request', async () => {
  const v = view(); await flushPromises()
  expect(v.findAll('option').map(o => o.text())).toEqual(['v0.2.600', 'v0.2.2'])
  await v.get('input[type="checkbox"]').setValue(true); await flushPromises()
  expect(v.text()).toContain('v0.3.0-alpha.1')
  await v.get('select').setValue('v0.2.2')
  const start = v.findAll('button').find(b => b.text() === 'Back up and update')!
  await start.trigger('click'); await flushPromises()
  const requests = api.mock.calls.filter(([url]) => url.endsWith('/request'))
  expect(requests).toHaveLength(1)
  expect(requests[0]![1]?.body).toMatchObject({ release: 'v0.2.2', prereleases: true })
  expect(String(requests[0]![1]?.body?.requestId)).toMatch(/^[a-f0-9-]{36}$/)
  expect(v.text()).toContain('Waiting to start')
  const installer = v.findAll('button').find(b => b.text() === 'Continue on zugoid.com')!
  expect(installer.attributes('target')).toBe('_blank')
  expect(installer.attributes('rel')).toBe('noopener')
  // The release picker steps aside while an update is in progress.
  expect(v.find('select').exists()).toBe(false)
  expect(v.get('[data-update-blocked]').attributes('data-update-blocked')).toBe('true')
  v.unmount()
  client.clear()
  const reopened = view(); await flushPromises()
  expect(reopened.text()).toContain('Waiting to start')
  expect(api.mock.calls.filter(([url]) => url.endsWith('/request'))).toHaveLength(1)
  reopened.unmount()
})
it('offers recovery when a persisted active job becomes stale without a page reload', async () => {
  vi.useFakeTimers()
  const now = new Date('2026-10-21T05:00:00Z'); vi.setSystemTime(now)
  savedJob = { id: crypto.randomUUID(), serverId: 'server', requestedBy: 'owner', sourceVersion: '0.2.1', targetVersion: '0.2.2', stage: 'backing_up', buildId: crypto.randomUUID(), createdAt: now.toISOString(), updatedAt: now.toISOString(), backup: null, error: null }
  const v = view()
  try {
    await flushPromises()
    expect(v.text()).not.toContain('Open the official installer')
    await vi.advanceTimersByTimeAsync(310000)
    await flushPromises()
    expect(v.text()).toContain('Open the official installer')
  } finally { v.unmount(); client.clear(); vi.useRealTimers() }
})

it('offers no release to a Server zugoid.com does not cover, says why and links to subscribe', async () => {
  coverage = { covered: false, reason: 'none', freeUntil: '2026-10-01T00:00:00Z', message: 'This Server has no Zugoid subscription, so zugoid.com offers it no new release. It keeps working as it is.', subscribeUrl: 'https://zugoid.com/billing/checkout?server=s&origin=https%3A%2F%2Fserver.example' }
  const v = view(); await flushPromises()
  expect(v.find('select').exists()).toBe(false)
  expect(v.findAll('button').some(b => b.text() === 'Back up and update')).toBe(false)
  expect(v.text()).toContain('No subscription')
  expect(v.text()).toContain('No new release for this Server')
  expect(v.text()).toContain('It keeps working as it is.')
  v.unmount()
})

it('says until when a Server in its first 30 days gets releases', async () => {
  coverage = { covered: true, reason: 'free', freeUntil: '2026-12-18T00:00:00Z', message: null, subscribeUrl: 'https://zugoid.com/billing/checkout?server=s' }
  const v = view(); await flushPromises()
  expect(v.findAll('option').map(o => o.text())).toEqual(['v0.2.600', 'v0.2.2'])
  expect(v.text()).toContain('free for its first 30 days')
  v.unmount()
})
