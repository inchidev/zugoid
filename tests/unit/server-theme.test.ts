import { describe, expect, it } from 'vitest'
import { embedOrigin, frameAncestorsFor, parseServerEmbedding, serverEmbeddingSchema } from '../../shared/server-embedding'
import { contrastRatio, DEFAULT_SERVER_THEME, isDefaultTheme, parseServerTheme, serverThemeCss, serverThemeSchema, textOn } from '../../shared/server-theme'

describe('Server theme', () => {
  it('is neutral and adds no CSS by default', () => {
    expect(isDefaultTheme(DEFAULT_SERVER_THEME)).toBe(true)
    expect(serverThemeCss(DEFAULT_SERVER_THEME)).toBe('')
  })

  it('normalises colours and refuses anything that is not #rrggbb', () => {
    expect(serverThemeSchema.parse({ accent: '#1F6FEB' }).accent).toBe('#1f6feb')
    for (const accent of ['red', '#fff', 'url(x)', '#1f6feb; color: red']) expect(serverThemeSchema.safeParse({ accent }).success).toBe(false)
    expect(serverThemeSchema.safeParse({ unknown: true }).success).toBe(false)
  })

  it('falls back to the default for a stored value it cannot read', () => {
    expect(parseServerTheme('{nope')).toEqual(DEFAULT_SERVER_THEME)
    expect(parseServerTheme(JSON.stringify({ accent: 'javascript:' }))).toEqual(DEFAULT_SERVER_THEME)
    expect(parseServerTheme(JSON.stringify({ accent: '#112233', hideZugoid: true }))).toMatchObject({ accent: '#112233', hideZugoid: true })
  })

  it('writes the accent, its readable text, the dark accent, font and sign-in background', () => {
    const css = serverThemeCss(serverThemeSchema.parse({ accent: '#ffd400', accentDark: '#0a3d91', font: 'serif', signInBackground: '#101010' }))
    expect(css).toContain(':root { --ui-primary: #ffd400; --zugoid-on-primary: #000000; --font-sans: ui-serif')
    expect(css).toContain('--zugoid-sign-in-background: #101010')
    expect(css).toContain(':root.dark { --ui-primary: #0a3d91; --zugoid-on-primary: #ffffff }')
  })

  it('hides sidebar sections other than Chat, each once', () => {
    expect(serverThemeSchema.parse({ hiddenSections: ['customers', 'factory', 'customers'] }).hiddenSections).toEqual(['customers', 'factory'])
    expect(serverThemeSchema.parse({ hiddenSections: ['schedules'] }).hiddenSections).toEqual(['schedules'])
    expect(serverThemeSchema.safeParse({ hiddenSections: ['chat'] }).success).toBe(false)
    expect(serverThemeSchema.safeParse({ hiddenSections: ['gadgets'] }).success).toBe(false)
    expect(isDefaultTheme(serverThemeSchema.parse({ hiddenSections: ['customers'] }))).toBe(false)
    expect(parseServerTheme(JSON.stringify({ hideZugoid: true })).hiddenSections).toEqual([])
  })

  it('picks white or black text by contrast', () => {
    expect(textOn('#1f6feb')).toBe('#ffffff')
    expect(textOn('#ffd400')).toBe('#000000')
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0)
  })
})

describe('Server embedding', () => {
  it('accepts exact https origins only', () => {
    expect(embedOrigin('https://Partner.example/')).toBe('https://partner.example')
    expect(embedOrigin('https://studio.example:8443')).toBe('https://studio.example:8443')
    for (const value of ['http://partner.example', 'https://*.partner.example', 'https://partner.example/app', 'https://user@partner.example', 'https://localhost', "'self'", 'https://a.example; script-src *']) {
      expect(embedOrigin(value)).toBeNull()
    }
  })

  it('refuses a list with a bad address, removes repeats and keeps this Server first', () => {
    expect(serverEmbeddingSchema.safeParse({ origins: ['https://ok.example', 'ftp://no.example'] }).success).toBe(false)
    expect(serverEmbeddingSchema.parse({ origins: ['https://ok.example', 'https://ok.example/'] }).origins).toEqual(['https://ok.example'])
    expect(serverEmbeddingSchema.safeParse({ origins: Array.from({ length: 11 }, (_, index) => `https://s${index}.example`) }).success).toBe(false)
    expect(frameAncestorsFor([])).toBe("'self'")
    expect(frameAncestorsFor(['https://ok.example'])).toBe("'self' https://ok.example")
  })

  it('drops stored values that are not origins', () => {
    expect(parseServerEmbedding(JSON.stringify(['https://ok.example', 'https://*.bad.example', 42]))).toEqual({ origins: ['https://ok.example'] })
    expect(parseServerEmbedding('not json')).toEqual({ origins: [] })
  })
})
