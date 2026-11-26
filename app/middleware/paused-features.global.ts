import { pausedSections } from '~~/shared/features'
import { serverNavigationModule, serverNavigationSection } from '~~/shared/server-navigation'

/**
 * Paused areas and modules this Server hides (Server settings → Modules) keep their data. Old links and bookmarks
 * land on the Server's start page.
 */
export default defineNuxtRouteMiddleware((to) => {
  const section = serverNavigationSection(to.path)
  if (!section) return
  const module = serverNavigationModule(section)
  const hidden = useSessionStore().health?.theme?.hiddenSections as readonly string[] | undefined
  if (pausedSections.has(module) || hidden?.includes(module)) return navigateTo('/', { replace: true })
})
