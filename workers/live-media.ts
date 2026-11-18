import { getServerId } from '../shared/server-id'
import { cloudflareApiToken } from './cloudflare-rest'
import { asRpc, callsProvider, type ZugoidEnv } from './env'
import { withIntegrations } from './integrations'
import { liveKitRooms, loadLiveKitConfig } from './livekit'
import type { RestRealtimeKitApp } from './realtimekit-rest'
import type { LiveProvider } from '../shared/types'
import {
  addParticipant,
  createMeeting,
  endMeeting,
  RealtimeKitHttpError,
  loadRealtimeKitConfig,
  realtimekitConfigured,
  removeParticipants,
  type RealtimeKitRuntimeConfig,
} from './realtimekit'

/** A seat in a meeting: the media plane's participant id and the token the Client connects with. */
export type LiveSeat = { id: string, token: string }

/**
 * The media plane behind a Live room. The Channel Durable Object decides who
 * may join and who is a host; this only creates meetings and seats in them.
 * It is LiveKit when the Server has one, and RealtimeKit otherwise.
 */
export type LiveMedia = {
  provider: LiveProvider
  /** Where a LiveKit client connects; RealtimeKit's token carries its own address. */
  url?: string
  createMeeting: (title: string) => Promise<{ id: string }>
  addParticipant: (meetingId: string, seat: { name: string, customId: string, host: boolean }) => Promise<LiveSeat>
  removeParticipants: (meetingId: string, participantIds: string[]) => Promise<void>
  endMeeting: (meetingId: string) => Promise<void>
  /** Turn off someone's microphone from the Server. RealtimeKit does it from the host's Client instead. */
  muteParticipant?: (meetingId: string, participantId: string) => Promise<void>
}

/**
 * The media plane for this server, or null when Live is not connected.
 * Credentials come from server deployment bindings or encrypted server settings.
 */
function mediaFor(config: Pick<RealtimeKitRuntimeConfig, 'accountId' | 'appId' | 'apiToken' | 'hostPreset' | 'participantPreset'>): LiveMedia {
  return {
    provider: 'realtimekit',
    createMeeting: title => createMeeting(config, title),
    addParticipant: (meetingId, seat) => addParticipant(config, meetingId, {
      name: seat.name,
      customId: seat.customId,
      preset: seat.host ? config.hostPreset : config.participantPreset,
    }),
    removeParticipants: (meetingId, participantIds) => removeParticipants(config, meetingId, participantIds),
    endMeeting: meetingId => endMeeting(config, meetingId),
  }
}

async function restMedia(env: ZugoidEnv): Promise<LiveMedia | null> {
  const apiToken = cloudflareApiToken(env)
  if (!apiToken) return null
  const server = asRpc<{ restRealtimeKitApp: (failedRevision?: string) => Promise<RestRealtimeKitApp | null> }>(
    env.SERVER_DO.getByName(`server:${await getServerId(env.DB)}`),
  )
  const app = await server.restRealtimeKitApp()
  if (!app) return null
  let currentApp = app
  const token = apiToken
  const currentMedia = () => mediaFor({ ...currentApp, apiToken: token })

  // Repair only after a definite 404, once. Never replay failed writes on
  // auth/network/provider errors, or move an existing meeting to another app.
  async function withRepair<T>(action: (media: LiveMedia) => Promise<T>, existingMeeting = false): Promise<T> {
    const failedApp = currentApp
    try { return await action(currentMedia()) }
    catch (error) {
      if (!(error instanceof RealtimeKitHttpError) || error.status !== 404) throw error
      const repaired = await server.restRealtimeKitApp(failedApp.revision)
      if (!repaired || (existingMeeting && repaired.appId !== failedApp.appId)) throw error
      currentApp = repaired
      return action(currentMedia())
    }
  }
  return {
    provider: 'realtimekit',
    createMeeting: title => withRepair(next => next.createMeeting(title)),
    addParticipant: (meetingId, seat) => withRepair(next => next.addParticipant(meetingId, seat), true),
    removeParticipants: (meetingId, participantIds) => currentMedia().removeParticipants(meetingId, participantIds),
    endMeeting: meetingId => currentMedia().endMeeting(meetingId),
  }
}

function liveKitMedia(rooms: ReturnType<typeof liveKitRooms>, url: string): LiveMedia {
  return {
    provider: 'livekit',
    url,
    createMeeting: () => rooms.createRoom(),
    addParticipant: (room, seat) => rooms.addParticipant(room, seat),
    removeParticipants: (room, identities) => rooms.removeParticipants(room, identities),
    endMeeting: room => rooms.endRoom(room),
    muteParticipant: (room, identity) => rooms.muteParticipant(room, identity),
  }
}

export async function liveMedia(deployment: ZugoidEnv): Promise<LiveMedia | null> {
  const env = await withIntegrations(deployment)
  const livekit = await loadLiveKitConfig(env)
  if (livekit) return liveKitMedia(liveKitRooms(livekit, await getServerId(env.DB)), livekit.url)
  const config = await loadRealtimeKitConfig(env)
  if (realtimekitConfigured(config)) return mediaFor(config)
  if (callsProvider(env) !== 'realtimekit-rest') return null
  return restMedia(env)
}
