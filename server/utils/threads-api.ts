import { requestMetaGraph } from './meta-graph'

type ThreadsPath = '/oauth/access_token' | '/access_token' | '/v1.0/keyword_search'

export function threadsRequest(path: ThreadsPath, params: URLSearchParams, init: RequestInit) {
  const url = new URL(path, 'https://graph.threads.com')
  url.search = params.toString()
  return requestMetaGraph(url, init, 'threads')
}
