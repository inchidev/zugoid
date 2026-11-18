import type { H3Event } from 'h3'
import { inlineScriptHashes, withScriptSources } from '../../shared/security-headers'
import { WIDGET_LIMITS, widgetFrameCsp } from '../../shared/customer-widgets'
import { cf } from './cf'
import { clientIp, requireRateLimit } from './rate-limit'
import type { PublicWidget, WidgetVisitor } from './widget-visitors'

/**
 * The two things a website gets from a Widget: a small loader script that draws a button
 * in a Shadow DOM, and the frame it opens. The frame is a standalone page of this Server,
 * like the Portal guest page: no Client code, no Server cookies, its own policy that lets
 * only the Widget's sites frame it. The site's scripts cannot read the frame, so they never
 * see the Visitor's token or messages, and the site's styles cannot reach the chat.
 *
 * Version 1 polls: every few seconds while the chat is open, rarely while it is closed.
 * A `CustomerWidget` Durable Object holding Visitor sockets is the later design.
 */

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[char]!)
}

/** The loader. It knows only its Server, its Widget and the sites that may show it. */
export function widgetLoaderScript(input: { serverOrigin: string; publicId: string; sites: string[] }): string {
  const config = JSON.stringify({ origin: input.serverOrigin, id: input.publicId, sites: input.sites }).replace(/</gu, '\\u003c')
  return `(() => {
  const c = ${config}
  const w = window.__zugoidWidgets = window.__zugoidWidgets || {}
  if (w[c.id]) return
  w[c.id] = true
  const here = location.protocol === 'https:' ? location.host.toLowerCase() : null
  // The frame refuses other sites anyway; this only keeps a button that cannot open off them.
  const allowed = here && c.sites.some(site => {
    const listed = site.slice(8)
    return listed.startsWith('*.') ? here.endsWith(listed.slice(1)) && here.length > listed.length - 1 : listed === here
  })
  if (!allowed) return
  const mount = () => {
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483000;'
    const root = host.attachShadow({ mode: 'closed' })
    root.innerHTML = '<style>'
      + ':host{all:initial}'
      + 'button{width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;background:#4f46e5;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.25);display:grid;place-items:center;padding:0}'
      + 'button:focus-visible{outline:3px solid #a5b4fc;outline-offset:2px}'
      + 'svg{width:26px;height:26px;fill:currentColor}'
      + '.badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:#dc2626;color:#fff;font:600 12px/20px system-ui,sans-serif;text-align:center;padding:0 5px;box-sizing:border-box}'
      + 'iframe{position:absolute;right:0;bottom:72px;width:min(380px,calc(100vw - 40px));height:min(600px,calc(100vh - 112px));border:0;border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,.3);background:transparent;color-scheme:normal}'
      + '[hidden]{display:none}'
      + '</style>'
      + '<button type="button" aria-label="Open chat" aria-expanded="false"><svg viewBox="0 0 256 256" aria-hidden="true"><path d="M128 24a104 104 0 0 0-91.2 154l-11.3 39.6a12 12 0 0 0 14.9 14.9L80 221.2A104 104 0 1 0 128 24Z"/></svg></button>'
      + '<span class="badge" hidden></span>'
    const button = root.querySelector('button')
    const badge = root.querySelector('.badge')
    let frame = null
    let open = false
    const tell = () => frame && frame.contentWindow && frame.contentWindow.postMessage({ type: 'zugoid-widget:open', open }, c.origin)
    const toggle = (next) => {
      open = next
      if (open && !frame) {
        frame = document.createElement('iframe')
        frame.title = 'Chat'
        frame.src = c.origin + '/widget/' + c.id + '/frame'
        frame.addEventListener('load', tell)
        root.appendChild(frame)
      }
      if (frame) frame.hidden = !open
      button.setAttribute('aria-expanded', String(open))
      button.setAttribute('aria-label', open ? 'Close chat' : 'Open chat')
      tell()
    }
    button.addEventListener('click', () => toggle(!open))
    window.addEventListener('message', (event) => {
      if (event.origin !== c.origin || !frame || event.source !== frame.contentWindow) return
      const data = event.data || {}
      if (data.type === 'zugoid-widget:close') toggle(false)
      if (data.type === 'zugoid-widget:unread') {
        const count = Math.max(0, Math.min(99, Number(data.count) || 0))
        badge.hidden = !count || open
        badge.textContent = String(count)
      }
    })
    document.body.appendChild(host)
  }
  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount)
})()
`
}

/** The frame's script. It reads the Widget from the page, so its hash is the same for every Widget. */
const FRAME_SCRIPT = `(() => {
  const id = document.body.dataset.widget
  const base = '/widget/' + id
  const key = 'zugoid-widget:' + id
  const embedded = window.parent !== window
  const log = document.getElementById('log')
  const form = document.getElementById('form')
  const text = document.getElementById('text')
  const send = document.getElementById('send')
  const status = document.getElementById('status')
  const intro = document.getElementById('intro')
  let token = null
  try { token = localStorage.getItem(key) } catch {}
  let cursor = null
  let open = !embedded
  let unread = 0
  let timer = 0
  const seen = new Set()
  const save = (value) => {
    token = value
    try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key) } catch {}
  }
  const tellParent = (message) => { if (embedded) window.parent.postMessage(message, '*') }
  const call = async (path, init = {}) => {
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = 'Bearer ' + token
    const response = await fetch(base + path, { ...init, headers, credentials: 'omit', cache: 'no-store' })
    if (response.status === 401) { save(null); cursor = null; intro.hidden = false; const error = new Error('Your chat has ended. Write again to start a new one.'); error.session = true; throw error }
    if (!response.ok) {
      let message = response.status === 429 ? 'Too many messages. Wait a moment.' : 'Something went wrong. Try again.'
      try { const body = await response.json(); if (response.status !== 429 && body && (body.message || body.statusMessage)) message = body.message || body.statusMessage } catch {}
      throw new Error(message)
    }
    return response.json()
  }
  const show = (message) => {
    if (seen.has(message.id)) return
    seen.add(message.id)
    const item = document.createElement('div')
    item.className = 'msg ' + message.direction
    if (message.authorName) {
      const name = document.createElement('div')
      name.className = 'who'
      name.textContent = message.authorName
      item.appendChild(name)
    }
    const body = document.createElement('div')
    body.className = 'body'
    body.textContent = message.content
    item.appendChild(body)
    log.appendChild(item)
    log.scrollTop = log.scrollHeight
    if (message.direction === 'outbound' && !open) { unread += 1; tellParent({ type: 'zugoid-widget:unread', count: unread }) }
  }
  const poll = async () => {
    clearTimeout(timer)
    if (token) {
      try {
        const page = await call('/messages' + (cursor ? '?after=' + encodeURIComponent(cursor) : ''))
        page.messages.forEach(show)
        if (page.cursor) cursor = page.cursor
        intro.hidden = true
      } catch {}
    }
    timer = setTimeout(poll, open && document.visibilityState === 'visible' ? 4000 : 30000)
  }
  const submit = async () => {
    const content = text.value.trim()
    if (!content || send.disabled) return
    send.disabled = true
    status.textContent = ''
    const claims = { name: document.getElementById('name').value.trim() || undefined, email: document.getElementById('email').value.trim() || undefined }
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          if (!token) save((await call('/session', { method: 'POST', body: JSON.stringify(claims) })).token)
          const answer = await call('/messages', { method: 'POST', body: JSON.stringify({ content, ...claims }) })
          text.value = ''
          intro.hidden = true
          show(answer.message)
          break
        } catch (error) {
          if (!error.session || attempt) throw error
        }
      }
    } catch (error) {
      status.textContent = error.message
    } finally {
      send.disabled = false
      text.focus()
    }
  }
  form.addEventListener('submit', (event) => { event.preventDefault(); void submit() })
  text.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void submit() }
  })
  document.getElementById('close').hidden = !embedded
  document.getElementById('close').addEventListener('click', () => tellParent({ type: 'zugoid-widget:close' }))
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || !event.data || event.data.type !== 'zugoid-widget:open') return
    open = Boolean(event.data.open)
    if (open) { unread = 0; tellParent({ type: 'zugoid-widget:unread', count: 0 }); text.focus() }
    void poll()
  })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void poll() })
  if (token) intro.hidden = true
  void poll()
})()`

const FRAME_STYLE = `
  :root { color-scheme: light dark; --bg: #ffffff; --panel: #f4f4f5; --line: #e4e4e7; --text: #18181b; --muted: #71717a; --accent: #4f46e5; --accent-text: #ffffff; --mine: #4f46e5; --mine-text: #ffffff; --theirs: #f4f4f5; --error: #dc2626; }
  @media (prefers-color-scheme: dark) { :root { --bg: #18181b; --panel: #27272a; --line: #3f3f46; --text: #fafafa; --muted: #a1a1aa; --theirs: #27272a; --error: #f87171; } }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { display: flex; flex-direction: column; background: var(--bg); color: var(--text); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  header { display: flex; align-items: center; gap: 8px; padding: 12px 14px; background: var(--accent); color: var(--accent-text); }
  header h1 { flex: 1; margin: 0; font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  header button { border: 0; background: transparent; color: inherit; font-size: 22px; line-height: 1; cursor: pointer; padding: 2px 6px; border-radius: 6px; }
  header button:focus-visible { outline: 2px solid var(--accent-text); }
  #log { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
  .greeting { margin: 0 0 4px; padding: 10px 12px; border-radius: 12px; background: var(--theirs); white-space: pre-wrap; overflow-wrap: anywhere; }
  .msg { max-width: 85%; padding: 8px 12px; border-radius: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .msg.inbound { align-self: flex-end; background: var(--mine); color: var(--mine-text); border-bottom-right-radius: 4px; }
  .msg.outbound { align-self: flex-start; background: var(--theirs); border-bottom-left-radius: 4px; }
  .who { font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 2px; }
  form { border-top: 1px solid var(--line); padding: 10px; display: flex; flex-direction: column; gap: 6px; }
  #intro { display: flex; gap: 6px; }
  #intro[hidden] { display: none; }
  input, textarea { width: 100%; font: inherit; color: var(--text); background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; }
  input:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  .row { display: flex; gap: 6px; align-items: flex-end; }
  textarea { resize: none; min-height: 40px; max-height: 120px; }
  #send { flex: none; border: 0; border-radius: 10px; padding: 0 14px; height: 40px; background: var(--accent); color: var(--accent-text); font: inherit; font-weight: 600; cursor: pointer; }
  #send:disabled { opacity: .6; cursor: default; }
  #status { min-height: 0; margin: 0; font-size: 12px; color: var(--error); }
  #status:empty { display: none; }
  .note { margin: 0; font-size: 11px; color: var(--muted); }
`

/** The frame page for one Widget. The name and greeting are the only Widget text in it, escaped. */
export function widgetFrameHtml(widget: Pick<PublicWidget, 'publicId' | 'name' | 'greeting'>): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(widget.name)}</title>
<style>${FRAME_STYLE}</style>
</head>
<body data-widget="${escapeHtml(widget.publicId)}">
<header><h1>${escapeHtml(widget.name)}</h1><button id="close" type="button" aria-label="Close chat">&times;</button></header>
<main id="log" aria-live="polite">${widget.greeting.trim() ? `<p class="greeting">${escapeHtml(widget.greeting)}</p>` : ''}</main>
<form id="form" autocomplete="on">
<div id="intro"><input id="name" name="name" maxlength="${WIDGET_LIMITS.claimedName}" placeholder="Name (optional)" autocomplete="name"><input id="email" name="email" type="email" maxlength="254" placeholder="Email (optional)" autocomplete="email"></div>
<div class="row"><textarea id="text" rows="1" maxlength="${WIDGET_LIMITS.message}" placeholder="Write a message" aria-label="Message"></textarea><button id="send" type="submit">Send</button></div>
<p id="status" role="alert"></p>
<p class="note">This chat keeps your messages, browser and country so the team can answer you.</p>
</form>
<script>${FRAME_SCRIPT}</script>
</body>
</html>
`
}

/** Serves the frame with its own policy: only the Widget's sites may frame it. */
export async function sendWidgetFrame(event: H3Event, widget: PublicWidget): Promise<string> {
  const html = widgetFrameHtml(widget)
  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'Referrer-Policy', 'no-referrer')
  setHeader(event, 'X-Robots-Tag', 'noindex')
  setHeader(event, 'Content-Security-Policy', withScriptSources(widgetFrameCsp(widget.sites), await inlineScriptHashes(html)))
  return html
}

/** The country Cloudflare saw the request come from, when it says. */
export function requestCountry(event: H3Event): string | null {
  const request = cf(event).request as (Request & { cf?: { country?: unknown } }) | undefined
  const country = request?.cf?.country
  return typeof country === 'string' && /^[A-Z]{2}$/u.test(country) ? country : null
}

/** Widget answers are never cached and never readable by another site's script. */
export function widgetJsonHeaders(event: H3Event) {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'X-Robots-Tag', 'noindex')
}

/**
 * Where Turnstile would go: a Widget may later require it before a Visitor's first
 * session. Nothing is checked yet; the per-address and per-Visitor limits hold alone.
 */
export async function requireWidgetHuman(_event: H3Event, _widget: PublicWidget): Promise<void> {}

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** New Visitors from one address. */
export function limitWidgetSession(event: H3Event, widget: PublicWidget) {
  const ip = clientIp(event)
  return requireRateLimit(event, [
    { key: `widget:session:${widget.channelId}:${ip}`, limit: 10, windowMs: 60 * MINUTE },
    { key: `widget:session:ip:${ip}`, limit: 30, windowMs: 60 * MINUTE },
  ], 'Too many new chats from this address. Try again later.')
}

/** Messages from one Visitor and from one address, per minute and per day. */
export function limitWidgetMessage(event: H3Event, visitor: WidgetVisitor) {
  const ip = clientIp(event)
  return requireRateLimit(event, [
    { key: `widget:send:${visitor.id}`, limit: 10, windowMs: MINUTE },
    { key: `widget:send-day:${visitor.id}`, limit: 300, windowMs: DAY },
    { key: `widget:send:ip:${ip}`, limit: 30, windowMs: MINUTE },
  ], 'Too many messages. Wait a moment.')
}

/** Reading: a poll every few seconds fits easily. */
export function limitWidgetRead(event: H3Event, visitor: WidgetVisitor) {
  return requireRateLimit(event, [
    { key: `widget:read:${visitor.id}`, limit: 60, windowMs: MINUTE },
  ], 'Too many requests. Wait a moment.')
}
