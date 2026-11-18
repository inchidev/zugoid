import { readFile } from 'node:fs/promises'
import { zugoidNitroPlugins, zugoidNodeAliases } from './nitro.runtime.mjs'
import { communityRailIcons, uiIcons } from './packages/client-ui/icons'
import { SERVER_PERMISSIONS_POLICY } from './shared/security-headers'

const devPublicHost = process.env.ZUGOID_DEV_HOST?.trim() || ''
const requestedClientMode = process.env.ZUGOID_CLIENT_MODE
const clientMode = requestedClientMode === 'native' || requestedClientMode === 'extension'
  ? requestedClientMode
  : 'web'
const bundledClient = clientMode !== 'web'
const staticWebClient = process.env.ZUGOID_STATIC_CLIENT === 'true'
const devProxyOrigin = process.env.ZUGOID_DEV_PROXY_ORIGIN
  ? new URL(process.env.ZUGOID_DEV_PROXY_ORIGIN).origin
  : null
const remoteFrontend = Boolean(devProxyOrigin && process.env.NODE_ENV === 'development')
const stackFrontend = process.env.ZUGOID_DEV_STACK === 'true' && process.env.NODE_ENV === 'development'
const rawSqlPlugin = {
  name: 'zugoid-raw-sql',
  async load(id: string) {
    const computeAsset = /\/packages\/compute-node\/(?:src\/[a-z-]+\.mjs|Dockerfile\.workspace)\?raw$/u.test(id)
    if (!id.endsWith('.sql?raw') && !computeAsset) return null
    const source = await readFile(id.slice(0, -4), 'utf8')
    // Nitro rewrites import.meta in generated JavaScript, including string
    // literals. Encode source assets so the guest receives the exact bytes.
    if (computeAsset) return `export default new TextDecoder().decode(Uint8Array.from(atob(${JSON.stringify(Buffer.from(source).toString('base64'))}), c => c.charCodeAt(0)))`
    return `export default ${JSON.stringify(source)}`
  },
}

export default defineNuxtConfig({
  ...(stackFrontend ? {
    buildDir: '.deployment/dev-stack/nuxt-client',
    serverDir: '.deployment/dev-stack/frontend-server',
  } : {}),
  compatibilityDate: '2026-10-16',
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  modules: ['@nuxt/ui', '@pinia/nuxt', '@vueuse/nuxt', '@nuxt/eslint'],
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
  },
  // Every icon ships in the Client: a Server reaches no icon service, and works without one.
  icon: {
    provider: 'none',
    fallbackToApi: false,
    serverBundle: false,
    clientBundle: {
      icons: [...communityRailIcons, ...Object.values(uiIcons).map(icon => icon.replace('i-ph-', 'ph:'))],
      scan: { globInclude: ['app/**/*.{vue,ts}', 'packages/client-ui/**/*.{vue,ts}', 'shared/**/*.ts'] },
      sizeLimitKb: 512,
    },
  },
  runtimeConfig: {
    public: {
      clientMode,
      devRemoteOrigin: remoteFrontend && devProxyOrigin ? devProxyOrigin : '',
    },
  },
  nitro: bundledClient || staticWebClient ? {
    preset: 'static',
    prerender: { ignore: ['/pwa/manifest.webmanifest', '/pwa/icon'] },
    ...(staticWebClient ? { output: { dir: '.client-output' } } : {}),
    rollupConfig: {
      plugins: [rawSqlPlugin],
    },
  } : {
    preset: remoteFrontend ? 'node-server' : 'cloudflare-module',
    entry: process.env.NODE_ENV === 'development' ? undefined : './cloudflare-entry.ts',
    alias: zugoidNodeAliases,
    rollupConfig: {
      plugins: [rawSqlPlugin, ...(stackFrontend ? [] : zugoidNitroPlugins())],
    },
    errorHandler: './server/error',
    ...(remoteFrontend
      ? {}
      : {
          cloudflare: {
            nodeCompat: true,
            deployConfig: false,
            dev: {
              configPath: 'wrangler.dev.jsonc',
            },
          },
        }),
    typescript: {
      tsConfig: {
        compilerOptions: {
          types: ['@cloudflare/workers-types'],
        },
      },
    },
    routeRules: {
      '/**': {
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          // Also written to _headers for static assets; documents get the full
          // set (CSP, HSTS) from server/middleware/00-security.ts.
          'Permissions-Policy': SERVER_PERMISSIONS_POLICY,
        },
      },
    },
    devProxy: devProxyOrigin
      ? {
          '/api': {
            target: `${devProxyOrigin}/api`,
            changeOrigin: true,
            cookieDomainRewrite: '',
            headers: { origin: devProxyOrigin },
          },
        }
      : undefined,
  },
  vite: {
    optimizeDeps: {
      include: ['@cloudflare/realtimekit'],
    },
    server: {
      ...(stackFrontend ? {
        origin: process.env.ZUGOID_DEV_PROXY_ORIGIN,
        ws: { clientPort: Number(new URL(process.env.ZUGOID_DEV_PROXY_ORIGIN!).port) },
      } : {}),
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        ...(devPublicHost
          ? [devPublicHost, `.${devPublicHost.split('.').slice(1).join('.')}`]
          : []),
      ],
      ...(devPublicHost
        ? {
            ws: {
              protocol: 'wss',
              host: devPublicHost,
              clientPort: 443,
            },
          }
        : {}),
    },
  },
  router: {
    options: {
      hashMode: clientMode === 'extension',
    },
  },
  app: {
    head: {
      title: 'Zugoid',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'color-scheme', content: 'dark light' },
        { name: 'theme-color', content: '#000000', media: '(prefers-color-scheme: dark)' },
        { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' },
        { name: 'description', content: 'One workspace for humans and agents.' },
        { property: 'og:title', content: 'Zugoid' },
        { property: 'og:description', content: 'One workspace for humans and agents.' },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: 'Zugoid' },
        { name: 'twitter:description', content: 'One workspace for humans and agents.' },
        { name: 'application-name', content: 'Zugoid' },
        { name: 'apple-mobile-web-app-title', content: 'Zugoid' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'shortcut icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/pwa/icon' },
        { rel: 'manifest', href: '/pwa/manifest.webmanifest' },
      ],
    },
  },
  typescript: {
    strict: true,
    typeCheck: false,
    tsConfig: {
      compilerOptions: {
        types: ['@cloudflare/workers-types'],
      },
      include: ['../types/**/*.d.ts', '../workers/**/*.ts', '../shared/**/*.ts'],
    },
  },
})
