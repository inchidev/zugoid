type ZugoidNativeNotificationStatus = 'prompt' | 'subscribed' | 'blocked' | 'error'

interface Window {
  __ZUGOID_OPEN_AUTH__?: (url: string) => Promise<void>
  __ZUGOID_NATIVE_SHOW_SERVERS__?: () => Promise<void>
  /** Whether this page has room for the app's Server rail right now. */
  __ZUGOID_NATIVE_RAIL__?: (visible: boolean) => Promise<void>
  /** Share a window of this Mac through a Portal: the app asks the person first. Resolves false when they decline. */
  __ZUGOID_NATIVE_PORTAL__?: {
    share: (link: string) => Promise<boolean>
  }
  __ZUGOID_NATIVE_NOTIFICATIONS__?: {
    status: () => Promise<ZugoidNativeNotificationStatus>
    enable: () => Promise<ZugoidNativeNotificationStatus>
    disable: () => Promise<void>
    setBadge: (count: number) => Promise<void>
    notify: (notification: { id: string; title: string; body: string; badge: number; url: string }) => Promise<void>
  }
}
