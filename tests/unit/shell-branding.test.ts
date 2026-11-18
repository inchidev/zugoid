import { describe, expect, it } from 'vitest'
import { brandedShell } from '../../server/utils/shell-branding'

const shell = `<html><head><title>Zugoid</title><meta name="description" content="One workspace for humans and agents."><meta property="og:title" content="Zugoid"><meta name="twitter:title" content="Zugoid"><meta name="application-name" content="Zugoid"><meta name="apple-mobile-web-app-title" content="Zugoid"><link rel="icon" href="/favicon.svg"></head><body><div aria-label="Opening"></div></body></html>`

describe('the page shell under Appearance', () => {
  it('names the Server and drops Zugoid’s tagline', () => {
    const html = brandedShell(shell, 'Пати <Вася & Ко>')
    expect(html).not.toContain('Zugoid')
    expect(html).not.toContain('One workspace')
    expect(html).toContain('<title>Пати &lt;Вася &amp; Ко&gt;</title>')
    expect(html).toContain('<meta name="application-name" content="Пати &lt;Вася &amp; Ко&gt;">')
  })

  it('keeps Zugoid’s icon', () => {
    expect(brandedShell(shell, 'Пати')).toContain('href="/favicon.svg"')
  })
})
