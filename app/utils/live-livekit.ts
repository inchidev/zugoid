import type { LocalParticipant, Participant, RemoteParticipant, RemoteTrack, Room as LiveKitRoom } from 'livekit-client'
import { LiveEmitter, type LiveMeeting, type LiveParticipantMedia, type LiveSelfMedia } from './live-media'

/**
 * A LiveKit room in the shape the Live store already drives for RealtimeKit (`LiveMeeting`).
 * The Server gives the address and a token for one seat; everything else happens between this
 * browser and LiveKit. Remote audio plays through hidden <audio> elements this wrapper owns.
 */
export async function createLiveKitMeeting(opts: { url: string; token: string; audio: boolean; video: boolean }): Promise<LiveMeeting> {
  const { Room, RoomEvent, ParticipantEvent, Track, DisconnectReason } = await import('livekit-client')
  const room: LiveKitRoom = new Room({ adaptiveStream: true, dynacast: true })
  const joinedEvents = new LiveEmitter()
  const participantEvents = new LiveEmitter()
  const remotes = new Map<string, LiveParticipantMedia & { emitter: LiveEmitter }>()
  const audioElements = new Map<RemoteTrack, HTMLMediaElement>()
  let leaving = false

  const userIdOf = (participant: Participant) => {
    try { return (JSON.parse(participant.metadata || '{}') as { userId?: string }).userId || participant.identity.split('.')[0] }
    catch { return participant.identity.split('.')[0] }
  }
  const trackOf = (participant: Participant, source: (typeof Track.Source)[keyof typeof Track.Source]) =>
    participant.getTrackPublication(source)?.track?.mediaStreamTrack ?? null
  const cameraTrack = (participant: Participant) => participant.getTrackPublication(Track.Source.Camera)?.track ?? null

  /** One participant, read live from LiveKit, with media events in RealtimeKit's names. */
  function wrap(participant: Participant): LiveParticipantMedia & { emitter: LiveEmitter } {
    const emitter = new LiveEmitter()
    const media = {
      emitter,
      get id() { return participant.identity },
      get name() { return participant.name || '' },
      picture: null,
      get customParticipantId() { return userIdOf(participant) },
      get audioEnabled() { return participant.isMicrophoneEnabled },
      get videoEnabled() { return participant.isCameraEnabled },
      get screenShareEnabled() { return participant.isScreenShareEnabled },
      get audioTrack() { return trackOf(participant, Track.Source.Microphone) },
      get videoTrack() { return trackOf(participant, Track.Source.Camera) },
      get screenShareTracks() { return { video: trackOf(participant, Track.Source.ScreenShare) } },
      registerVideoElement(element: HTMLVideoElement) { cameraTrack(participant)?.attach(element) },
      deregisterVideoElement(element: HTMLVideoElement) { cameraTrack(participant)?.detach(element) },
      async disableAudio() { /* LiveKit mutes others from the Server */ },
      on: (event: string, callback: (...args: unknown[]) => void) => emitter.on(event, callback),
      off: (event: string, callback: (...args: unknown[]) => void) => emitter.off(event, callback),
    }
    const changed = (source?: string) => {
      if (source === Track.Source.Microphone) emitter.emit('audioUpdate')
      else if (source === Track.Source.ScreenShare || source === Track.Source.ScreenShareAudio) emitter.emit('screenShareUpdate')
      else emitter.emit('videoUpdate')
    }
    const onTrack = (...args: unknown[]) => changed((args[0] as { source?: string } | undefined)?.source)
    for (const event of [ParticipantEvent.TrackSubscribed, ParticipantEvent.TrackUnsubscribed, ParticipantEvent.TrackMuted, ParticipantEvent.TrackUnmuted, ParticipantEvent.LocalTrackPublished, ParticipantEvent.LocalTrackUnpublished]) {
      (participant as unknown as { on: (name: string, callback: (...args: unknown[]) => void) => void }).on(event, onTrack)
    }
    return media
  }

  const local = room.localParticipant as LocalParticipant
  const localMedia = wrap(local)
  const self: LiveSelfMedia = Object.assign(localMedia, {
    async enableAudio() { await local.setMicrophoneEnabled(true) },
    async disableAudio() { await local.setMicrophoneEnabled(false) },
    async enableVideo() { await local.setCameraEnabled(true) },
    async disableVideo() { await local.setCameraEnabled(false) },
    async enableScreenShare() { await local.setScreenShareEnabled(true) },
    async disableScreenShare() { await local.setScreenShareEnabled(false) },
    getAllDevices: () => navigator.mediaDevices.enumerateDevices(),
    async setDevice(device: MediaDeviceInfo) { await room.switchActiveDevice(device.kind, device.deviceId) },
  })

  const addRemote = (participant: RemoteParticipant) => {
    if (!remotes.has(participant.identity)) remotes.set(participant.identity, wrap(participant))
  }
  room.on(RoomEvent.ParticipantConnected, (participant) => {
    addRemote(participant)
    joinedEvents.emit('participantJoined', remotes.get(participant.identity))
  })
  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    remotes.delete(participant.identity)
    joinedEvents.emit('participantLeft')
  })
  room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
    addRemote(participant)
    if (track.kind === Track.Kind.Audio) {
      const element = track.attach()
      element.style.display = 'none'
      document.body.appendChild(element)
      audioElements.set(track, element)
    }
  })
  room.on(RoomEvent.TrackUnsubscribed, (track) => {
    const element = audioElements.get(track)
    if (element) {
      track.detach(element)
      element.remove()
      audioElements.delete(track)
    }
  })
  room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
    const speaker = speakers.find(participant => participant.identity !== local.identity)
    participantEvents.emit('activeSpeaker', { peerId: speaker?.identity })
  })
  room.on(RoomEvent.Disconnected, (reason) => {
    for (const [track, element] of audioElements) {
      track.detach(element)
      element.remove()
    }
    audioElements.clear()
    // The same states RealtimeKit reports, which the store already knows how to handle.
    const state = leaving || reason === DisconnectReason.CLIENT_INITIATED
      ? 'left'
      : reason === DisconnectReason.ROOM_DELETED
        ? 'ended'
        : reason === DisconnectReason.PARTICIPANT_REMOVED || reason === DisconnectReason.DUPLICATE_IDENTITY
          ? 'kicked'
          : reason === DisconnectReason.JOIN_FAILURE
            ? 'rejected'
            : undefined
    localMedia.emitter.emit('roomLeft', { state })
  })

  return {
    async join() {
      await room.connect(opts.url, opts.token)
      for (const participant of room.remoteParticipants.values()) addRemote(participant)
      await Promise.allSettled([
        opts.audio ? local.setMicrophoneEnabled(true) : Promise.resolve(),
        opts.video ? local.setCameraEnabled(true) : Promise.resolve(),
      ])
    },
    async leave() {
      leaving = true
      await room.disconnect()
    },
    self,
    participants: {
      on: (event, callback) => participantEvents.on(event, callback),
      off: (event, callback) => participantEvents.off(event, callback),
      joined: {
        on: (event, callback) => joinedEvents.on(event, callback),
        off: (event, callback) => joinedEvents.off(event, callback),
        toArray: () => [...remotes.values()],
      },
    },
    audio: {
      setSpeakerDevice(deviceId: string) { void room.switchActiveDevice('audiooutput', deviceId) },
      async play() { await room.startAudio() },
    },
  }
}
