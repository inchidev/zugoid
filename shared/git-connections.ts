import { z } from 'zod'
const githubAccount = z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u)
/** A personal App needs no account: GitHub creates it for the signed-in user. Organizations appear in the URL. */
export const githubSetupSchema = z.object({ name: z.string().trim().min(1).max(34).optional(), account: githubAccount.optional(), organization: z.boolean().default(false) }).strict()
  .refine(input => !input.organization || input.account, { message: 'Organization name is required', path: ['account'] })
/** `artifacts` is a repository inside the Server's own Artifacts namespace: the Server's binding is its connection. */
export type GitProvider = 'github' | 'gitea' | 'gitlab' | 'artifacts'
/** A self-hosted Git server's HTTPS origin; a sub-path install is not supported yet. */
const providerOrigin = (provider: string, example: string) => z.string().trim().max(500).transform((value, context) => {
  let url: URL
  try { url = new URL(value) } catch { context.addIssue({ code: 'custom', message: `Enter the HTTPS address of your ${provider}` }); return z.NEVER }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/+$/u, '') !== '') {
    context.addIssue({ code: 'custom', message: `Use the HTTPS origin of your ${provider}, for example ${example}` }); return z.NEVER
  }
  return url.origin
})
/** Gitea and Forgejo serve from an HTTPS origin; a sub-path install is not supported yet. */
export const giteaOrigin = providerOrigin('Gitea or Forgejo', 'https://codeberg.org or https://git.example.com')
/** A bot account's access token. Repository access is whatever that account can reach in Gitea or Forgejo. */
export const giteaConnectSchema = z.object({ host: giteaOrigin, token: z.string().trim().regex(/^[A-Za-z0-9_-]{20,200}$/u, 'Paste the access token Gitea or Forgejo showed once'), name: z.string().trim().min(1).max(80).optional() }).strict()
/** GitLab.com or a self-managed GitLab at its own HTTPS origin; one under a relative URL root is not supported yet. */
export const gitlabOrigin = providerOrigin('GitLab', 'https://gitlab.com or https://gitlab.example.com')
/** A personal, group or project access token with the `api` scope. Repository access is whatever its user or bot can reach. */
export const gitlabConnectSchema = z.object({ host: gitlabOrigin, token: z.string().trim().regex(/^[A-Za-z0-9_.-]{20,300}$/u, 'Paste the access token GitLab showed once'), name: z.string().trim().min(1).max(80).optional() }).strict()
export type GitConnection = { id: string; name: string; provider: GitProvider; host: string; account: string; appId: string; appSlug: string; enabled: boolean; setupUrl: string }
