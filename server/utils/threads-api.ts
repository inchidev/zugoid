import { readLimitedStream } from '../../workers/inbound-email-signature'
import { fail } from './cf'

type ThreadsPath = '/oauth/access_token' | '/access_token' | '/v1.0/keyword_search'

export async function threadsRequest(path: ThreadsPath, params: URLSearchParams, init: RequestInit) {
  const url = new URL(path, 'https://graph.threads.com')
  url.search = params.toString()
  const response = await fetch(url, { ...init, redirect: 'manual' }).catch(() => {
    init.signal?.throwIfAborted()
    fail(502, 'threads_unavailable', 'Could not reach the Threads API')
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
