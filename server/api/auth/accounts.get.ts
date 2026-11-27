import { currentSession, requireUser } from '../../utils/auth'
import { cf } from '../../utils/cf'
import { isPartnerSession, partnerLogin, PARTNER_PROVIDER } from '../../utils/partner-signin'
import { authFromEvent } from '../../utils/better-auth'

export default defineEventHandler(async (event): Promise<{ providers: string[], partnerName?: string, signedInWithPartner?: boolean }> => {
  await requireUser(event)
  const auth = await authFromEvent(event)
  const accounts = await auth.api.listUserAccounts({ headers: event.headers })
  const providers = [...new Set(accounts.map(account => account.providerId))]
  const { env } = cf(event)
  const partnerName = providers.includes(PARTNER_PROVIDER)
    ? env.PARTNER_DISPLAY_NAME?.trim().slice(0, 60)
    : undefined
  if (partnerName && partnerLogin(env)) {
    const session = await currentSession(event)
    const signedInWithPartner = !!session && await isPartnerSession(env, session.session.id)
    return { providers, partnerName, signedInWithPartner }
  }
  return { providers, partnerName }
})
