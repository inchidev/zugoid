import { DEFAULT_SERVER_THEME, serverThemeCss, type ServerTheme } from '~~/shared/server-theme'

/** The theme from Server settings → Appearance, as the public health check carries it. */
export function useServerTheme() {
  const session = useSessionStore()
  return computed<ServerTheme>(() => session.health?.theme ?? DEFAULT_SERVER_THEME)
}

/** Whether members see Zugoid's own name and mark, or only this Server's. */
export function useShowZugoid() {
  const theme = useServerTheme()
  return computed(() => !theme.value.hideZugoid)
}

/** Sidebar sections this Server leaves out (Server settings → Appearance), with their pages. */
export function useHiddenSections() {
  const theme = useServerTheme()
  return computed(() => new Set<string>(theme.value.hiddenSections))
}

/** Puts the Server's theme on the page. Called once, from app.vue. */
export function applyServerTheme() {
  const theme = useServerTheme()
  useHead(() => ({ style: [{ key: 'server-theme', innerHTML: serverThemeCss(theme.value) }] }))
}
