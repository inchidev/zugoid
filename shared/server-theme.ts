import { z } from 'zod'
import type { ServerNavigationSection } from './server-navigation'

/**
 * A Server's theme: how its Client looks to everyone who opens it, set by a manager in
 * Server settings → Appearance. The logo is the Server icon from Overview. Kept in `server_settings` under {@link SERVER_THEME_KEY}.
 */
export const SERVER_THEME_KEY = 'appearance.theme'

export const THEME_FONTS = ['default', 'system', 'serif', 'rounded', 'mono'] as const
export type ThemeFont = typeof THEME_FONTS[number]

/** Font stacks only: a font file would need its own upload, and `font-src` allows only this Server. */
export const THEME_FONT_STACKS: Record<Exclude<ThemeFont, 'default'>, string> = {
  system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
}

/** Sidebar sections a Server can leave out. Chat is always there: it is where the Server opens. */
export const HIDEABLE_SECTIONS = ['inbox', 'tasks', 'factory', 'customers', 'agents', 'data'] as const satisfies readonly ServerNavigationSection[]
export type HideableSection = typeof HIDEABLE_SECTIONS[number]

const hexColor = z.string().trim().regex(/^#[0-9a-f]{6}$/iu, 'Use a colour like #1f6feb').transform(value => value.toLowerCase())

export const serverThemeSchema = z.object({
  /** The accent: buttons, links, focus and selection. Null keeps the neutral house look. */
  accent: hexColor.nullable().default(null),
  /** The accent in dark mode; null uses `accent`. */
  accentDark: hexColor.nullable().default(null),
  /** The side of the sign-in page that carries the logo. Null keeps the default. */
  signInBackground: hexColor.nullable().default(null),
  font: z.enum(THEME_FONTS).default('default'),
  /** Members see this Server's name and icon where they would see Zugoid's. */
  hideZugoid: z.boolean().default(false),
  /**
   * Sections left out of this Server's sidebar, with their pages: a Server for a team that never mails customers need
   * not show Customers. Its data, API and Agent tools stay; showing the section again brings it all back.
   */
  hiddenSections: z.array(z.enum(HIDEABLE_SECTIONS)).default([]).transform(sections => [...new Set(sections)]),
}).strict()

export type ServerTheme = z.infer<typeof serverThemeSchema>

export const DEFAULT_SERVER_THEME: ServerTheme = serverThemeSchema.parse({})

/** A stored theme that fails to parse (an older or hand-edited value) falls back to the default. */
export function parseServerTheme(value: string | null | undefined): ServerTheme {
  if (!value) return DEFAULT_SERVER_THEME
  try { return serverThemeSchema.parse(JSON.parse(value)) }
  catch { return DEFAULT_SERVER_THEME }
}

export function isDefaultTheme(theme: ServerTheme): boolean {
  return !theme.accent && !theme.accentDark && !theme.signInBackground && theme.font === 'default' && !theme.hideZugoid && !theme.hiddenSections.length
}

function channel(value: number) {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of `#rrggbb`. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16))
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!)
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

/** Text that reads on a filled accent button: white or black, whichever contrasts more. */
export function textOn(hex: string): '#ffffff' | '#000000' {
  return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#000000') ? '#ffffff' : '#000000'
}

/**
 * The CSS the Client adds for a theme. Nuxt UI paints with `--ui-primary`; filled controls put
 * `--ui-text-inverted` on it, so that follows the accent too. Empty for the default theme.
 */
export function serverThemeCss(theme: ServerTheme): string {
  const rules: string[] = []
  const root: string[] = []
  const dark: string[] = []
  if (theme.accent) root.push(`--ui-primary: ${theme.accent}`, `--zugoid-on-primary: ${textOn(theme.accent)}`)
  const darkAccent = theme.accentDark || theme.accent
  if (darkAccent) dark.push(`--ui-primary: ${darkAccent}`, `--zugoid-on-primary: ${textOn(darkAccent)}`)
  if (theme.font !== 'default') root.push(`--font-sans: ${THEME_FONT_STACKS[theme.font]}`)
  if (theme.signInBackground) root.push(`--zugoid-sign-in-background: ${theme.signInBackground}`)
  if (root.length) rules.push(`:root { ${root.join('; ')} }`)
  if (dark.length) rules.push(`:root.dark { ${dark.join('; ')} }`)
  return rules.join('\n')
}
