import type { H3Event } from 'h3'
import { inlineScriptHashes, withScriptSources } from '../../shared/security-headers'
import { WIDGET_LIMITS, widgetFrameCsp } from '../../shared/customer-widgets'
import { DEFAULT_SERVER_THEME, textOn, THEME_FONT_STACKS, type ServerTheme } from '../../shared/server-theme'
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

/**
 * The Widget's look: the Client's own neutral surfaces, with the Server's Appearance accent (and font) when it has one,
 * so a Widget looks like the Server that answers it. Light and dark follow the visitor's system.
 */
export type WidgetLook = { light: { primary: string; onPrimary: string }; dark: { primary: string; onPrimary: string }; font: string }

const HOUSE_FONT = '"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

export function widgetLook(theme: ServerTheme = DEFAULT_SERVER_THEME): WidgetLook {
  const light = theme.accent ?? '#171717'
  const dark = theme.accentDark ?? theme.accent ?? '#ededed'
  return {
    light: { primary: light, onPrimary: theme.accent ? textOn(light) : '#fafafa' },
    dark: { primary: dark, onPrimary: theme.accentDark ?? theme.accent ? textOn(dark) : '#0a0a0a' },
    font: theme.font === 'default' ? HOUSE_FONT : THEME_FONT_STACKS[theme.font],
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[char]!)
}

/** The loader. It knows only its Server, its Widget and the sites that may show it. */
export function widgetLoaderScript(input: { serverOrigin: string; publicId: string; sites: string[]; look?: WidgetLook }): string {
  const look = input.look ?? widgetLook()
  const config = JSON.stringify({ origin: input.serverOrigin, id: input.publicId, sites: input.sites, look }).replace(/</gu, '\\u003c')
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
    // Colours come from the Server's look (widgetLook); only #rrggbb and font stacks reach this style.
    const css = (mode) => 'button{background:' + c.look[mode].primary + ';color:' + c.look[mode].onPrimary + '}'
    root.innerHTML = '<style>'
      + ':host{all:initial}'
      + 'button{width:48px;height:48px;border-radius:12px;border:1px solid rgba(0,0,0,.08);cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.16);display:grid;place-items:center;padding:0;transition:transform .15s ease}'
      + 'button:hover{transform:translateY(-1px)}'
      + 'button:focus-visible{outline:2px solid currentColor;outline-offset:2px}'
      + css('light')
      + 'svg{width:22px;height:22px}'
      + '.badge{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;border-radius:9px;background:#b91c1c;color:#fff;font:600 11px/18px ' + c.look.font + ';text-align:center;padding:0 5px;box-sizing:border-box}'
      + 'iframe{position:absolute;right:0;bottom:60px;width:min(380px,calc(100vw - 40px));height:min(600px,calc(100vh - 100px));border:1px solid #e5e5e5;border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,.18);background:#fff;color-scheme:normal}'
      + '@media (prefers-color-scheme: dark){' + css('dark') + 'button{border-color:rgba(255,255,255,.12)}iframe{border-color:#262626;background:#000;box-shadow:0 16px 48px rgba(0,0,0,.6)}}'
      + '@media (prefers-reduced-motion: reduce){button{transition:none}button:hover{transform:none}}'
      + '[hidden]{display:none}'
      + '</style>'
      + '<button type="button" aria-label="Open chat" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4z"/></svg></button>'
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

/** The frame's style: the Client's surfaces, radius and type (packages/client-ui/theme.css), and the Server's look. */
function frameStyle(look: WidgetLook): string {
  return `
  @font-face { font-family: "Geist"; src: url("/fonts/geist-variable.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }
  :root { color-scheme: light dark; --bg: #ffffff; --soft: #f5f5f5; --line: #e5e5e5; --text: #171717; --strong: #000000; --muted: #707070; --primary: ${look.light.primary}; --on-primary: ${look.light.onPrimary}; --error: #b91c1c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #000000; --soft: #171717; --line: #262626; --text: #e5e5e5; --strong: #fafafa; --muted: #8a8a8a; --primary: ${look.dark.primary}; --on-primary: ${look.dark.onPrimary}; --error: #f87171; } }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { display: flex; flex-direction: column; background: var(--bg); color: var(--text); font: 14px/1.5 ${look.font}; -webkit-font-smoothing: antialiased; }
  header { display: flex; align-items: center; gap: 8px; padding: 12px 12px 12px 16px; border-bottom: 1px solid var(--line); }
  header h1 { flex: 1; margin: 0; font-size: 14px; font-weight: 600; color: var(--strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  header button { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; padding: 0; }
  header button:hover { background: var(--soft); color: var(--text); }
  header button:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
  header svg { width: 16px; height: 16px; }
  #log { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
  .greeting { margin: 0 0 4px; padding: 8px 12px; border-radius: 6px; background: var(--soft); white-space: pre-wrap; overflow-wrap: anywhere; max-width: 85%; }
  .msg { max-width: 85%; padding: 8px 12px; border-radius: 6px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .msg.inbound { align-self: flex-end; background: var(--primary); color: var(--on-primary); }
  .msg.outbound { align-self: flex-start; background: var(--soft); }
  .who { font-size: 12px; font-weight: 500; color: var(--muted); margin-bottom: 2px; }
  form { border-top: 1px solid var(--line); padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  #intro { display: flex; gap: 8px; }
  #intro[hidden] { display: none; }
  input, textarea { width: 100%; font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 7px 10px; }
  input::placeholder, textarea::placeholder { color: var(--muted); }
  input:focus, textarea:focus { outline: 2px solid var(--primary); outline-offset: -1px; border-color: transparent; }
  .row { display: flex; gap: 8px; align-items: flex-end; }
  textarea { resize: none; min-height: 38px; max-height: 120px; }
  #send { flex: none; border: 0; border-radius: 6px; padding: 0 14px; height: 38px; background: var(--primary); color: var(--on-primary); font: inherit; font-weight: 500; cursor: pointer; }
  #send:hover { opacity: .9; }
  #send:disabled { opacity: .5; cursor: default; }
  #status { min-height: 0; margin: 0; font-size: 12px; color: var(--error); }
  #status:empty { display: none; }
  .note { margin: 0; font-size: 12px; color: var(--muted); }
`
}

/** The frame page for one Widget. The name and greeting are the only Widget text in it, escaped. */
export function widgetFrameHtml(widget: Pick<PublicWidget, 'publicId' | 'name' | 'greeting'>, look: WidgetLook = widgetLook()): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(widget.name)}</title>
<style>${frameStyle(look)}</style>
</head>
<body data-widget="${escapeHtml(widget.publicId)}">
<header><h1>${escapeHtml(widget.name)}</h1><button id="close" type="button" aria-label="Close chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
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
export async function sendWidgetFrame(event: H3Event, widget: PublicWidget, look: WidgetLook = widgetLook()): Promise<string> {
  const html = widgetFrameHtml(widget, look)
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
