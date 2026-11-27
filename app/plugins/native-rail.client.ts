/** A phone has no room for the app's Server rail beside a page, so it joins the More screen. Sign-in has no drawer. */
export default defineNuxtPlugin(() => {
  const setRail = window.__ZUGOID_NATIVE_RAIL__
  if (!setRail) return
  const ui = useUiStore()
  const session = useSessionStore()
  watch(() => !session.user || ui.mobilePane === 'sections', (visible) => { void setRail(visible).catch(() => undefined) }, { immediate: true })
})
