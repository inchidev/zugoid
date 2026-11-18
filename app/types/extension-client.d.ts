interface Window {
  __ZUGOID_EXTENSION__?: {
    requestServerAccess: (origin: string) => Promise<boolean>
  }
}
