import { inspectReceivePack, type ExpectedPush } from '../../shared/git-pktline'

/** Where the Server itself reaches a repository over Git smart HTTP, and the Basic credentials it adds there. */
export type BrokeredRemote = { host: string; repository: string; username: string; token: string }

/**
 * Git smart-HTTP push for one approved update of one repository: its refs advertisement, and a receive-pack
 * whose commands are exactly `<old> <sha> <ref>`, read before anything is forwarded. The token is added here;
 * redirects are refused.
 */
export async function brokeredPush(remote: BrokeredRemote, suffix: string, incoming: Request, expected: ExpectedPush) {
  const url = new URL(incoming.url)
  const advertisement = incoming.method === 'GET' && suffix === '/info/refs' && url.searchParams.get('service') === 'git-receive-pack' && [...url.searchParams.keys()].length === 1
  if (!advertisement && !(incoming.method === 'POST' && suffix === '/git-receive-pack' && !url.search)) return new Response('Repository capability denied', { status: 403 })
  let body: ReadableStream<Uint8Array> | undefined
  if (!advertisement) {
    if (![null, 'identity'].includes(incoming.headers.get('content-encoding'))) return new Response('Compressed pushes are not accepted', { status: 403 })
    const inspected = await inspectReceivePack(incoming.body, expected)
    if ('refusal' in inspected) return new Response(inspected.refusal, { status: 403 })
    body = inspected.body
  }
  const headers = new Headers({ Authorization: 'Basic ' + btoa(`${remote.username}:${remote.token}`), 'User-Agent': 'Zugoid-publisher' })
  for (const name of ['content-type', 'accept', 'git-protocol']) { const value = incoming.headers.get(name); if (value) headers.set(name, value) }
  const response = await fetch(`${remote.host}/${remote.repository}.git${suffix}${url.search}`, { method: incoming.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(120000),
    ...(body ? { duplex: 'half' } : {}) } as RequestInit)
  return answer(response)
}

/** Git smart-HTTP read access for one repository. Only upload-pack, never receive-pack; redirects are refused. */
export async function brokeredSourceFetch(remote: BrokeredRemote, suffix: string, incoming: Request) {
  const url = new URL(incoming.url)
  const allowed = incoming.method === 'GET' && suffix === '/info/refs' && url.searchParams.get('service') === 'git-upload-pack' && [...url.searchParams.keys()].length === 1
    || incoming.method === 'POST' && suffix === '/git-upload-pack' && !url.search
  if (!allowed) return new Response('Repository capability denied', { status: 403 })
  const headers = new Headers({ Authorization: 'Basic ' + btoa(`${remote.username}:${remote.token}`), 'User-Agent': 'Zugoid-source-broker' })
  for (const name of ['content-type', 'accept', 'git-protocol', 'content-encoding']) { const value = incoming.headers.get(name); if (value) headers.set(name, value) }
  const response = await fetch(`${remote.host}/${remote.repository}.git${suffix}${url.search}`, { method: incoming.method, headers, body: incoming.method === 'POST' ? incoming.body : undefined, redirect: 'manual', signal: AbortSignal.timeout(120000) })
  return answer(response)
}

async function answer(response: Response) {
  if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); return new Response('Redirect denied', { status: 502 }) }
  const out = new Headers({ 'Cache-Control': 'no-store' })
  for (const name of ['content-type', 'content-encoding']) { const value = response.headers.get(name); if (value) out.set(name, value) }
  return new Response(response.body, { status: response.status, headers: out })
}
