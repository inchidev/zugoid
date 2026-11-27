/// <reference types="@cloudflare/workers-types" />

import { cloudflareRestConfigured } from './cloudflare-rest'

export type Rpc<T> = { fetch: (request: Request) => Promise<Response> } & T

export function asRpc<T>(stub: unknown): Rpc<T> {
  return stub as Rpc<T>
}

export type ZugoidEnv = {
  /** Optional paid Factory bindings. Absent from Free deployments. */
  FACTORY_COMPUTE?: DurableObjectNamespace
  FACTORY_CODE?: Artifacts
  FACTORY_IMAGE?: string
  FACTORY_POLICY?: string
  /** Dedicated repository integration, separate from GitHub sign-in. Never exposed to compute. */
  GITHUB_AGENT_APP_ID?: string
  GITHUB_AGENT_APP_PRIVATE_KEY?: string
  /** Isolated Pi executor transport. Never exposed to agents or browser clients. */
  AGENT_RUN_DO?: DurableObjectNamespace
  AGENT_SCHEDULE_DO?: DurableObjectNamespace
  /** One Durable Object per Portal. Absent on Servers installed before it. */
  PORTAL_DO?: DurableObjectNamespace
  /** A Cloudflare Realtime TURN key for Portals; without it a Server in its own account makes one with its kept access. */
  REALTIME_TURN_KEY_ID?: string
  REALTIME_TURN_KEY_API_TOKEN?: string
  /** A Cloudflare Realtime SFU app for Portals with several viewers; same rule as the TURN key. */
  REALTIME_SFU_APP_ID?: string
  REALTIME_SFU_APP_TOKEN?: string
  /** `1` lets a Server in its own Cloudflare account make its SFU app with its kept access (stage 3, unverified). */
  PORTAL_SFU_AUTO?: string
  AGENT_COMPUTE?: DurableObjectNamespace
  AGENT_RUNNER_URL?: string
  AGENT_RUNNER_TOKEN?: string
  /** Server address reachable from a VPS agent's private Docker network. */
  AGENT_CALLBACK_ORIGIN?: string
  /** Optional search provider credential; never sent to compute. */
  EXA_API_KEY?: string
  XAI_API_KEY?: string
  INSTAGRAM_ACCOUNT_ID?: string
  INSTAGRAM_USER_ACCESS_TOKEN?: string
  TIKTOK_ADVERTISER_ID?: string
  TIKTOK_ADVERTISER_ACCESS_TOKEN?: string

  DB: D1Database
  BACKUPS?: R2Bucket
  /** Legacy installer binding; the updater removes it after moving to D1. */
  BACKUP_BUCKET_NAME?: string
  FILES?: R2Bucket
  TICKETS: KVNamespace
  CHANNEL_DO: DurableObjectNamespace
  SERVER_DO: DurableObjectNamespace
  RATE_LIMIT_DO: DurableObjectNamespace
  NOTIFICATION_DO: DurableObjectNamespace
  AGENT_DO: DurableObjectNamespace
  AI?: Ai
  /** OpenAI-compatible chat completions base, including `/v1` when the server expects it. */
  AI_BASE_URL?: string
  /** Secret. Sent as a bearer token to `AI_BASE_URL`. */
  AI_API_KEY?: string
  /** Model id for the OpenAI-compatible provider. */
  AI_MODEL?: string
  BROWSER?: {
    quickAction: (action: 'markdown' | 'screenshot' | 'links', options: { url: string }) => Promise<Response>
  }
  /** Chromium DevTools endpoint, `http://127.0.0.1:9222` or a `ws://` browser socket. */
  BROWSER_CDP_URL?: string
  EMAIL?: SendEmail
  MAIL_EMAIL?: SendEmail
  /** Cloudflare service binding, or an http(s) URL for the same JSON send protocol. */
  MAIL_GATEWAY?: Fetcher | string
  MAIL_GATEWAY_URL?: string
  MAIL_GATEWAY_TOKEN?: string
  /** HTTP gateway that relays outbound mail over SMTP. Inbound mail is a separate webhook. */
  SMTP_GATEWAY_URL?: string
  SMTP_GATEWAY_TOKEN?: string
  /**
   * Shared secret for `POST /api/email/inbound`. At least 32 characters.
   * The Email Routing bridge signs with the same value.
   */
  INBOUND_EMAIL_SECRET?: string
  /** HTTP Basic password for `POST /api/email/inbound/postmark`. At least 32 characters. */
  POSTMARK_INBOUND_SECRET?: string
  /** Mailgun HTTP webhook signing key for `POST /api/email/inbound/mailgun`. At least 32 characters. */
  MAILGUN_WEBHOOK_SIGNING_KEY?: string
  /** Amazon SNS topic ARN allowed to call `POST /api/email/inbound/ses`. */
  SES_SNS_TOPIC_ARN?: string
  /** `cloudflare` or `workers` keeps Cloudflare-network features; `celld` is a VPS (shared/server-runtime.ts). */
  ZUGOID_RUNTIME?: string
  /** A VPS installer Server's host updater proves itself with this (server/utils/host-updates.ts). */
  ZUGOID_HOST_TOKEN?: string
  /** The site that sells this Server's subscription: https://zugoid.com, or https://zugoid.ru for a Server bought there. */
  ZUGOID_SITE?: string
  /** Legacy installer binding; the updater removes it after moving to D1. */
  ZUGOID_EMAIL_DOMAINS?: string
  /** The Server's own Cloudflare account, for update and domain launch URLs. */
  ACCOUNT_ID?: string
  /** The permanent Server UUID on runtimes that cannot seed D1 before boot. */
  SERVER_ID?: string
  ASSETS?: { fetch: (request: Request) => Promise<Response> }
  REALTIMEKIT_ACCOUNT_ID?: string
  REALTIMEKIT_APP_ID?: string
  REALTIMEKIT_API_TOKEN?: string
  REALTIMEKIT_PRESET_HOST?: string
  REALTIMEKIT_PRESET_PARTICIPANT?: string
  /** LiveKit for Live instead of RealtimeKit: its `wss://` address, API key and secret. All three, or the ones saved in Server settings. */
  LIVEKIT_URL?: string
  LIVEKIT_API_KEY?: string
  LIVEKIT_API_SECRET?: string
  AUTH_SECRET?: string
  /** '1' lets a request ask for a Server-Timing header and a request.timing log line (Zugoid-Timing: 1 or a zugoid_timing=1 cookie). */
  SERVER_TIMING?: string
  AUTH_MODE?: string
  CF_ACCESS_ISS?: string
  CF_ACCESS_AUD?: string
  PUBLIC_ORIGIN?: string
  /** Optional aliases for environments that manage origins through deployment configuration. */
  ZUGOID_ORIGINS?: string
  TWITTER_CLIENT_ID?: string
  TWITTER_CLIENT_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  LINKEDIN_CLIENT_ID?: string
  LINKEDIN_CLIENT_SECRET?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY?: string
  EMAIL_FROM?: string
  EMAIL_FROM_NAME?: string
  MAIL_APP_HOSTNAME?: string
  MAIL_DEFAULT_LOCAL_PART?: string
  AUTH_REGISTRATION_MODE?: string
  VAPID_SUBJECT?: string
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  /** Suggested on the setup form; with ADMIN_PASSWORD, creates the Owner on first start. */
  ADMIN_USERNAME?: string
  /** Cloudflare Access only: the address Access proves for the first Owner. */
  ACCESS_OWNER_EMAIL?: string
  SETUP_TOKEN?: string
  /**
   * A partner's platform made this Server: it signs short tickets with this key (HS256, 32+ characters) that sign a
   * person in as one of the partner's people, and that remove one. Unset everywhere else.
   */
  PARTNER_SIGNIN_KEY?: string
  /** Display name of this Server’s sign-in partner. */
  PARTNER_DISPLAY_NAME?: string
  /** The Host a proxy rewrites this Server's requests to, for a runtime that picks the Worker by Host: served as PUBLIC_ORIGIN. */
  ZUGOID_INTERNAL_HOST?: string
  ADMIN_PASSWORD?: string
  ADMIN_NAME?: string
  ADMIN_HANDLE?: string
  ADMIN_SERVER?: string
  AGENT_MODEL?: string
  /** Legacy installer bindings; the updater removes them after moving to D1. */
  ZUGOID_ACCOUNT_ID?: string
  ZUGOID_WORKER_NAME?: string
  ZUGOID_CUSTOM_DOMAIN?: string
  ZUGOID_ZONE_ID?: string
  ZUGOID_ZONE_NAME?: string
  ZUGOID_APP_SUBDOMAIN?: string
  ZUGOID_SERVER_MARKER?: string
  ZUGOID_VERSION?: string
  /** Legacy Build hook; kept only until the next #9 update removes it. */
  ZUGOID_UPDATE_HOOK?: string
  /** Official installer origin used to run an update with fresh Cloudflare consent. */
  UPDATE_SITE?: string
  ZUGOID_UPDATE_SITE?: string
  ZUGOID_APP_HOSTNAME?: string
  /** Cloudflare account id used to call Workers AI, Browser Run, Email Sending, and RealtimeKit over REST. */
  CLOUDFLARE_ACCOUNT_ID?: string
  /** Secret. Account API token for `CLOUDFLARE_ACCOUNT_ID`. Not `ACCOUNT_ID`. */
  CLOUDFLARE_API_TOKEN?: string
}

export type AiProviderName = 'workers-ai' | 'workers-ai-rest' | 'openai-compatible' | null
export type BrowserProviderName = 'workers' | 'cloudflare-rest' | 'cdp' | null
export type CallsProviderName = 'realtimekit' | 'realtimekit-rest' | null

export function aiProvider(env: ZugoidEnv): AiProviderName {
  if (env.AI) return 'workers-ai'
  if (cloudflareRestConfigured(env)) return 'workers-ai-rest'
  if (env.AI_BASE_URL?.trim() && env.AI_API_KEY?.trim() && env.AI_MODEL?.trim()) return 'openai-compatible'
  return null
}

export function agentBrowserConfigured(env: ZugoidEnv): boolean {
  return browserProvider(env) !== null
}

export function browserProvider(env: ZugoidEnv): BrowserProviderName {
  if (env.BROWSER) return 'workers'
  if (cloudflareRestConfigured(env)) return 'cloudflare-rest'
  if (env.BROWSER_CDP_URL?.trim()) return 'cdp'
  return null
}

export function agentRuntimeConfigured(env: ZugoidEnv): boolean {
  return Boolean(env.AGENT_DO && aiProvider(env))
}

/** RealtimeKit calls and Email Routing need Cloudflare's network. */
export function cloudflareNetwork(env: ZugoidEnv): boolean {
  const runtime = env.ZUGOID_RUNTIME?.trim().toLowerCase()
  if (runtime === 'cloudflare' || runtime === 'workers') return true
  if (runtime) return false
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/celld/i.test(ua)) return false
  return true
}

/**
 * RealtimeKit is reached over HTTPS from any runtime, so the owner can always
 * connect it in Live settings. Off Cloudflare's network, the shared Cloudflare
 * API token also drives RealtimeKit's REST API without that step.
 */
export function callsProvider(env: ZugoidEnv): CallsProviderName {
  if (!cloudflareNetwork(env) && cloudflareRestConfigured(env)) return 'realtimekit-rest'
  return 'realtimekit'
}

export const DEFAULT_WORKERS_MODEL = '@cf/zai-org/glm-5.3'

/** Profile ids that start with `@cf/` are Workers AI ids and are not sent to an OpenAI-compatible endpoint. */
export function resolveAgentModelId(env: ZugoidEnv, profileModel?: string | null): string {
  const profile = profileModel?.trim() || ''
  if (aiProvider(env) === 'openai-compatible') {
    if (profile && !profile.startsWith('@cf/')) return profile
    return env.AI_MODEL!.trim()
  }
  return profile || env.AGENT_MODEL?.trim() || DEFAULT_WORKERS_MODEL
}

/** Pi is available when its isolated execution provider is configured, or the
 * experimental embedded harness can run (model provider reachable, run DO and
 * file storage bound). The embedded executor uses the model gateway only. */
export function piRuntimeConfigured(env: ZugoidEnv): boolean {
  if (!env.AGENT_RUN_DO || (!env.FILES && !env.TICKETS)) return false
  if (env.AGENT_COMPUTE || (env.AGENT_RUNNER_URL && env.AGENT_RUNNER_TOKEN)) return true
  // Embedded pi-durable executor: needs a resolvable model provider.
  return Boolean(aiProvider(env))
}
