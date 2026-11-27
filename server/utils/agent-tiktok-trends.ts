import { z } from 'zod'
import type { AgentRun } from '../../shared/agent-execution'
import { integrationFields } from '../../shared/integrations'
import type { ZugoidEnv } from '../../workers/env'
import { readLimitedStream } from '../../workers/inbound-email-signature'
import { fail } from './cf'

export const tiktokTrendsDescription = 'Find trending public TikTok videos for one hashtag in TikTok for Business Discovery. Only hashtags in the selected country and period’s trending list are searchable. Cite the returned video links.'

const countryCode = z.string().regex(/^[A-Z]{2}$/u)
export const tiktokTrendsInput = z.object({
  hashtag: z.string().trim().min(1).max(201).refine(value => /^#?[\p{L}\p{M}\p{N}_]{1,100}$/u.test(value), 'Enter one hashtag using letters, numbers, or underscores')
    .describe('One exact trending hashtag, with or without the leading #'),
  country: countryCode.default('US').describe('TikTok country code, such as US or GB'),
  dateRange: z.enum(['1DAY', '7DAY', '30DAY', '120DAY']).default('7DAY').describe('Trend ranking period'),
}).strict()

const vendorId = z.string().regex(/^[1-9]\d{0,31}$/u)
const envelope = z.object({ code: z.number().int(), data: z.unknown().optional() })
const hashtagList = z.object({ list: z.array(z.object({
  hashtag_id: vendorId,
  hashtag_name: z.string().min(1).max(201),
  top_country_list: z.array(countryCode).nullish(),
})) })
const videoList = z.object({ list: z.array(z.object({
  hashtag_id: vendorId,
  top_video_list: z.array(z.unknown()),
})) })
const videoSchema = z.object({ video_id: vendorId, share_url: z.string().max(2048).nullish() })

export function tiktokTrendsCredentials(env: ZugoidEnv) {
  const advertiserId = integrationFields.TIKTOK_ADVERTISER_ID.schema.safeParse(env.TIKTOK_ADVERTISER_ID).data
  const token = integrationFields.TIKTOK_ADVERTISER_ACCESS_TOKEN.schema.safeParse(env.TIKTOK_ADVERTISER_ACCESS_TOKEN).data
  return advertiserId && token ? { advertiserId, token } : null
}

function postUrl(video: z.output<typeof videoSchema>): string {
  if (video.share_url) {
    try {
      const url = new URL(video.share_url)
      const match = /^\/@[a-z0-9_.]+\/video\/(\d+)\/?$/iu.exec(url.pathname)
      if (url.protocol === 'https:' && !url.username && !url.password && !url.port
        && ['tiktok.com', 'www.tiktok.com'].includes(url.hostname) && match?.[1] === video.video_id) {
        return `https://www.tiktok.com${url.pathname.replace(/\/$/u, '')}`
      }
    } catch { /* Use the official player URL if the share URL is unavailable. */ }
  }
  return `https://www.tiktok.com/player/v1/${video.video_id}`
}

async function discoveryRequest(edge: 'trending_list' | 'video_list', params: Record<string, string>, token: string, signal: AbortSignal) {
  signal.throwIfAborted()
  const url = new URL(`https://business-api.tiktok.com/open_api/v1.3/discovery/${edge}/`)
  url.search = new URLSearchParams(params).toString()
  const response = await fetch(url, { headers: { 'Access-Token': token }, redirect: 'manual', signal }).catch(() => {
    signal.throwIfAborted()
    fail(502, 'tiktok_trends_failed', 'Could not reach TikTok for Business')
  })
  // The hashtag list can include a month of daily rankings for each of its entries.
  const body = await readLimitedStream(response.body, 1500000)
  signal.throwIfAborted()
  let value: unknown
  if (body.ok) {
    try { value = JSON.parse(new TextDecoder().decode(body.bytes)) }
    catch { /* Use a safe error for a malformed response. */ }
  }
  const parsed = envelope.safeParse(value).data
  if (response.ok && parsed?.code === 0) return parsed.data
  if (response.status === 401 || parsed?.code === 40105) {
    fail(409, 'tiktok_trends_auth', 'Replace the TikTok advertiser access token in Server settings → Integrations → TikTok Trends')
  }
  if (response.status === 429 || parsed?.code === 40100) {
    fail(429, 'tiktok_trends_rate_limited', 'TikTok has limited Discovery requests. Try again later.')
  }
  if (response.status === 403 || parsed?.code === 40001) {
    fail(409, 'tiktok_trends_permission', 'Check that the TikTok app and advertiser account have access to the Discovery API')
  }
  fail(502, 'tiktok_trends_failed', 'TikTok could not complete the trends request. Check the advertiser connection and country.')
}

export async function searchTikTokTrends(env: ZugoidEnv, run: AgentRun, input: z.output<typeof tiktokTrendsInput>, signal?: AbortSignal) {
  const credentials = tiktokTrendsCredentials(env)
  if (!credentials) fail(409, 'tiktok_trends_unavailable', 'Set the advertiser ID and token in Server settings → Integrations → TikTok Trends')
  const remaining = Date.parse(run.deadline) - Date.now()
  if (remaining <= 0) fail(403, 'run_expired', 'The Run deadline has passed')
  const deadline = AbortSignal.timeout(Math.min(20000, remaining))
  const abortSignal = signal ? AbortSignal.any([deadline, signal]) : deadline

  const { country, dateRange } = input
  const hashtag = input.hashtag.replace(/^#/u, '')
  const result = { hashtag, country, dateRange }
  const params = { advertiser_id: credentials.advertiserId, discovery_type: 'HASHTAG', country_code: country, date_range: dateRange }
  const lookup = await discoveryRequest('trending_list', params, credentials.token, abortSignal)
  const tags = hashtagList.safeParse(lookup).data
  if (!tags) fail(502, 'tiktok_trends_failed', 'TikTok returned an unreadable trending hashtag list')
  const normalizeHashtag = (tag: string) => tag.replace(/^#/u, '').normalize('NFC').toLowerCase()
  const match = tags.list.find(tag => normalizeHashtag(tag.hashtag_name) === normalizeHashtag(hashtag))
  if (!match) return { ...result, videos: [], notice: 'This hashtag is outside TikTok’s trending list for this country and period.' }
  const availableCountries = match.top_country_list ?? []
  if (availableCountries.length && !availableCountries.includes(country)) {
    return { ...result, videos: [], availableCountries, notice: 'TikTok lists trending videos for this hashtag in the available countries.' }
  }

  const data = await discoveryRequest('video_list', { ...params, hashtag_ids: JSON.stringify([match.hashtag_id]) }, credentials.token, abortSignal)
  const ranked = videoList.safeParse(data).data
  if (!ranked) fail(502, 'tiktok_trends_failed', 'TikTok returned an unreadable trending video list')
  const videos = new Map<string, { url: string }>()
  const entries = ranked.list.find(group => group.hashtag_id === match.hashtag_id)?.top_video_list ?? []
  for (const entry of entries.slice(0, 20)) {
    const video = videoSchema.safeParse(entry).data
    if (video && !videos.has(video.video_id)) videos.set(video.video_id, { url: postUrl(video) })
  }
  return { ...result, videos: [...videos.values()] }
}
