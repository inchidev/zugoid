type ZugoidNotificationStatus = 'prompt' | 'subscribed' | 'blocked' | 'error'

interface Window {
  __ZUGOID_EXTENSION__?: {
    requestServerAccess: (origin: string) => Promise<boolean>
  }
  __ZUGOID_NATIVE_NOTIFICATIONS__?: {
    status: () => Promise<ZugoidNotificationStatus>
    enable: () => Promise<ZugoidNotificationStatus>
    disable: () => Promise<void>
    setBadge: (count: number) => Promise<void>
    notify: (notification: { id: string; title: string; body: string; badge: number; url: string }) => Promise<void>
  }
}
