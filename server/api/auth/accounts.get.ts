import { requireUser } from '../../utils/auth'
import { cf } from '../../utils/cf'
import { PARTNER_PROVIDER } from '../../utils/partner-signin'
import { authFromEvent } from '../../utils/better-auth'

export default defineEventHandler(async (event): Promise<{ providers: string[], partnerName?: string }> => {
  await requireUser(event)
  const auth = await authFromEvent(event)
  const accounts = await auth.api.listUserAccounts({ headers: event.headers })
  const providers = [...new Set(accounts.map(account => account.providerId))]
  const partnerName = providers.includes(PARTNER_PROVIDER)
    ? cf(event).env.PARTNER_DISPLAY_NAME?.trim().slice(0, 60)
    : undefined
  return { providers, partnerName }
})
