const quotedLine = /^>(?:[>\s]|$)/u
const originalMessage = /^-{5,}\s*Original Message\s*-{5,}\s*$/iu

/** Find a quoted tail. Keep inline replies and messages made entirely of quotes visible. */
export function splitMailQuote(content: string): { body: string; quote: string } {
  const lines = content.split(/\r?\n/u)
  const last = lines.findLastIndex(line => line.trim())
  let start = lines.length
  if (quotedLine.test(lines[last] ?? '')) {
    start = last
    while (start > 0 && (!lines[start - 1]!.trim() || quotedLine.test(lines[start - 1]!))) start--
    if (/^On .+ wrote:\s*$/u.test(lines[start - 1] ?? '')) start--
  }
  const original = lines.findIndex((line, index) => originalMessage.test(line)
    && lines.slice(index + 1, index + 4).some(header => /^From:\s+\S/iu.test(header)))
  if (original !== -1) start = Math.min(start, original)
  if (start === lines.length) return { body: content, quote: '' }
  const body = lines.slice(0, start).join('\n').trimEnd()
  return body.trim() ? { body, quote: lines.slice(start).join('\n').trim() } : { body: content, quote: '' }
}
