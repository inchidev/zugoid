// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, watch } from 'vue'
import AppShell from '../../app/components/layout/AppShell.vue'

const viewport = Object.assign(new EventTarget(), { height: 714, scale: 1 })
const scrollTo = vi.fn(() => vi.stubGlobal('scrollY', 0))
let shell: VueWrapper | undefined

beforeEach(() => {
  viewport.height = 714
  viewport.scale = 1
  scrollTo.mockClear()
  const autoImports = {
    computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch,
    useUiStore: () => reactive({ mobilePane: 'chat', last: () => undefined }),
    useServer: () => ({ serverId: ref('server') }),
    useIsMobile: () => ref(true),
    useServerSectionViews: () => ({ views: ref([]) }),
    useSessionStore: () => ({ user: null }),
    usePresenceStore: () => ({ setSelf: vi.fn() }),
    useServerSocket: () => ({ connection: ref('connected') }),
    useRouter: () => ({ currentRoute: ref({ path: '/channels', fullPath: '/channels' }) }),
  }
  for (const [key, value] of Object.entries(autoImports)) vi.stubGlobal(key, value)
  vi.stubGlobal('innerWidth', 402)
  vi.stubGlobal('innerHeight', 714)
  vi.stubGlobal('visualViewport', viewport)
  vi.stubGlobal('scrollY', 0)
  vi.stubGlobal('scrollTo', scrollTo)
})

afterEach(() => {
  shell?.unmount()
  vi.unstubAllGlobals()
})

async function openKeyboard() {
  shell = mount(AppShell, {
    attachTo: document.body,
    slots: { default: '<textarea aria-label="Message" />' },
    global: { stubs: { LayoutNavShell: true, LayoutMobileNavigation: true, LayoutResizeHandle: true } },
  })
  await nextTick()
  shell.get('textarea').element.focus()
  expect(document.activeElement).toBe(shell.get('textarea').element)
  viewport.height = 377
  vi.stubGlobal('innerHeight', 377)
  expect(window.visualViewport).toBe(viewport)
  expect(window.innerHeight).toBe(377)
  viewport.dispatchEvent(new Event('resize'))
  window.dispatchEvent(new Event('resize'))
  await nextTick()
  return shell
}

it('restores the page when Safari scrolls to the old input position after the shell shrinks', async () => {
  const app = await openKeyboard()
  expect(app.attributes('style')).toContain('height: 377px')
  expect(app.find('layout-mobile-navigation-stub').exists()).toBe(false)

  vi.stubGlobal('scrollY', 337)
  window.dispatchEvent(new Event('scroll'))

  expect(window.scrollY).toBe(0)
  expect(app.get('textarea').element).toBe(document.activeElement)
})

it('leaves a zoomed viewport alone and brings back navigation when the keyboard closes', async () => {
  const app = await openKeyboard()
  viewport.scale = 1.2
  vi.stubGlobal('scrollY', 40)
  window.dispatchEvent(new Event('scroll'))
  expect(scrollTo).not.toHaveBeenCalled()

  app.get('textarea').element.blur()
  viewport.scale = 1
  viewport.height = 714
  vi.stubGlobal('innerHeight', 714)
  window.dispatchEvent(new Event('resize'))
  await nextTick()
  expect(app.find('layout-mobile-navigation-stub').exists()).toBe(true)
})
