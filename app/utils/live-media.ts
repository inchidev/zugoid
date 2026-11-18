/**
 * What the Live store and its tiles need from a media session, whichever media plane serves it.
 * RealtimeKit's meeting objects have this shape already; LiveKit's are wrapped to it in `live-livekit.ts`.
 */
export type LiveMediaEvents = {
  on: (event: string, callback: (...args: unknown[]) => void) => unknown
  off: (event: string, callback: (...args: unknown[]) => void) => unknown
}

export type LiveParticipantMedia = LiveMediaEvents & {
  id: string
  name: string
  picture?: string | null
  /** The Member behind this participant. */
  customParticipantId?: string
  audioEnabled: boolean
  videoEnabled: boolean
  screenShareEnabled: boolean
  audioTrack?: MediaStreamTrack | null
  videoTrack?: MediaStreamTrack | null
  screenShareTracks?: { video?: MediaStreamTrack | null }
  registerVideoElement: (element: HTMLVideoElement, self?: boolean) => void
  deregisterVideoElement: (element: HTMLVideoElement, self?: boolean) => void
  /** RealtimeKit only: a host turns someone's microphone off from the Client. */
  disableAudio: () => Promise<void>
}

export type LiveSelfMedia = LiveParticipantMedia & {
  enableAudio: () => Promise<void>
  enableVideo: () => Promise<void>
  disableVideo: () => Promise<void>
  enableScreenShare: () => Promise<void>
  disableScreenShare: () => Promise<void>
  getAllDevices: () => Promise<MediaDeviceInfo[]>
  setDevice: (device: MediaDeviceInfo) => Promise<void>
}

export type LiveMeeting = {
  join: () => Promise<void>
  leave: () => Promise<void>
  self: LiveSelfMedia
  participants: LiveMediaEvents & {
    joined: LiveMediaEvents & { toArray: () => LiveParticipantMedia[] }
  }
  audio: { setSpeakerDevice: (deviceId: string) => void; play: () => Promise<void> }
}

/** A small event emitter with the `on`/`off` shape RealtimeKit uses. */
export class LiveEmitter {
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  on(event: string, callback: (...args: unknown[]) => void) {
    let set = this.listeners.get(event)
    if (!set) this.listeners.set(event, set = new Set())
    set.add(callback)
    return this
  }

  off(event: string, callback: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(callback)
    return this
  }

  emit(event: string, ...args: unknown[]) {
    for (const callback of [...this.listeners.get(event) ?? []]) {
      try { callback(...args) }
      catch (error) { console.error('live: listener failed', error) }
    }
  }
}
