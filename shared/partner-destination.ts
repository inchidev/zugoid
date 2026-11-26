/** A partner handoff may select a single Studio project on this Server. */
export function partnerDestination(next: string | null): string {
  if (next && /^\/projects\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(next)) return next
  return '/'
}
