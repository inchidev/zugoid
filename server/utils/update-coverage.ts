import { z } from 'zod'
import type { UpdateCoverageDTO } from '../../shared/releases'
import type { ZugoidEnv } from '../../workers/env'
import { partnerSignInKey } from './partner-signin'

/**
 * Whether zugoid.com offers this Server new releases. Every Server is free for
 * its first 30 days; after that its own subscription covers it. The check sends
 * only the Server's UUID. A Server that is not covered keeps working: it is just
 * offered no new release, and Settings says so. When zugoid.com cannot be
 * reached, nothing is held back.
 */
const SITE = 'https://zugoid.com'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const answer = z.object({
  covered: z.boolean(),
  reason: z.enum(['open', 'free', 'subscription', 'none']).catch('none'),
  freeUntil: z.string().nullable().catch(null),
  message: z.string().max(500).nullable().catch(null),
  subscribeUrl: z.string().url().nullable().catch(null),
})

const unchecked = (reason: UpdateCoverageDTO['reason']): UpdateCoverageDTO => ({ covered: true, reason, freeUntil: null, message: null, subscribeUrl: null })

export async function updateCoverage(env: Pick<ZugoidEnv, 'PARTNER_SIGNIN_KEY'>, serverId: string, origin: string, fetcher: typeof fetch = fetch): Promise<UpdateCoverageDTO> {
  // A partner's platform made this Server and delivers its releases itself.
  if (partnerSignInKey(env)) return unchecked('partner')
  if (!UUID.test(serverId)) return unchecked('unknown')
  try {
    const response = await fetcher(`${SITE}/api/servers/${serverId}/coverage`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Zugoid update check' },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) return unchecked('unknown')
    const parsed = answer.safeParse(await response.json())
    if (!parsed.success) return unchecked('unknown')
    const subscribe = parsed.data.subscribeUrl ? new URL(parsed.data.subscribeUrl) : null
    // zugoid.com's checkout adds this Server to the account first, by its address.
    if (subscribe?.origin === SITE) subscribe.searchParams.set('origin', origin)
    return { ...parsed.data, subscribeUrl: subscribe?.origin === SITE ? subscribe.toString() : null }
  } catch {
    return unchecked('unknown')
  }
}
