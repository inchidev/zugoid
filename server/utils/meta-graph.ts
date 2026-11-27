import { readLimitedStream } from '../../workers/inbound-email-signature'
import { fail } from './cf'

export async function requestMetaGraph(url: URL, init: RequestInit, provider: 'threads' | 'instagram') {
  const response = await fetch(url, { ...init, redirect: 'manual' }).catch(() => {
    init.signal?.throwIfAborted()
    const name = provider === 'threads' ? 'Threads' : 'Instagram'
    fail(502, `${provider}_unavailable`, `Could not reach the ${name} API`)
  })
  const received = await readLimitedStream(response.body, 128000)
  init.signal?.throwIfAborted()
  let data: unknown = null
  if (received.ok) {
    try { data = JSON.parse(new TextDecoder().decode(received.bytes)) }
    catch { /* Callers return a safe error for an unrecognized response. */ }
  }
  return { status: response.status, ok: response.ok, data }
}
