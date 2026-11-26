import { pausedSections } from '~~/shared/features'
import { serverNavigationSection } from '~~/shared/server-navigation'

/**
 * Paused areas and modules this Server hides (Server settings → Modules) keep their data. Old links and bookmarks
 * land on the Server's start page.
 */
export default defineNuxtRouteMiddleware((to) => {
  const section = serverNavigationSection(to.path)
  if (!section) return
  const hidden = useSessionStore().health?.theme?.hiddenSections as readonly string[] | undefined
  if (pausedSections.has(section) || hidden?.includes(section)) return navigateTo('/', { replace: true })
})
