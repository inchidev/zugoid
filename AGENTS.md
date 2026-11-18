# Zugoid (zugoid.com)

Source-available software under the Business Source License 1.1 (each version turns Apache 2.0 after four years): one workspace for a team and its AI agents. Nuxt 4, Pinia, TanStack Query, Workers/celld, D1, R2, Durable Objects.

## Two repositories

| Repository | Holds | Ships |
| --- | --- | --- |
| `inchidev/zugoid` (this one, public source) | The Server and its Client (`app`, `server`, `workers`, `shared`, `drizzle`), packages including `deployment-core`, native apps, the user docs text in `content` and `docs/release-notes` | Immutable releases only |
| `inchidev/zugoid-cloud` (private) | One Worker for all of zugoid.com: landing, pricing, subscriptions and billing, accounts, `/create`, release delivery to subscribed accounts, Docs, Changelog | From its own `main` |

The Docs text lives here because it describes this code, and it reaches zugoid.com/docs only through a release, pinned as `zugoidRelease` in `zugoid-cloud`. Prices and plans live only in `zugoid-cloud`: the Docs link to [Pricing](https://zugoid.com/pricing) and never quote them. Say what works today plainly, and mark the native apps as coming. There is no Zugoid Cloud: Zugoid runs no customer Server.

This repository deploys nothing of ours. Its code is public to read and audit; production use is governed by [LICENSE](LICENSE).

## Working rules

- A Server is one organization. It owns its Accounts, login, sessions, Worker, D1 database, private files bucket and Durable Objects. Its persistent UUIDv4 is its only Server ID.
- A Space is a department of one Server, with one sign-in and shared people. It is not a boundary between strangers: that is a Server.
- A Client is served only by its own Server. It is framed only by sites its Owner lists in Server settings → Appearance: Server CSP is `frame-ancestors 'self'` plus those exact `https` origins, and the MCP consent page stays `'none'`. Signing in inside a frame needs the Server on a subdomain of that site, since the session cookie stays `SameSite=Lax`. Going to another Server is an ordinary page load.
- Server authorization, removals and roles stay local. Any external identity provider, including a zugoid.com account, must link explicitly; never grant access by email matching.
- A Server a partner's platform made (`PARTNER_SIGNIN_KEY`) takes the partner's word on who belongs: a signed one-use ticket signs a person in, linked by the partner's id for them, and a removal ticket takes them out. The partner's owner becomes the Owner on first open; other roles stay local, and the Owner is never changed by a ticket.
- An Account is a username and password; email is optional and counts for sign-in and reset only once verified. Read the address through `accountEmail()`: an Account without one holds a placeholder that must never leave the Server.
- DM stays inside a Server.
- Keep backup destinations separate from live file buckets. Never delete backup buckets with Servers.
- The Server schema starts at `drizzle/server-migrations/0000_baseline.sql` with marker `server-v2`, for fresh databases only. Unreleased schema is rewritten in place, so one release adds at most one migration. Merged released SQL and published tags and assets are immutable.
- `drizzle/schema.ts` is the source of the tables. While the baseline is unreleased, change it and run `pnpm db:baseline`, which rewrites `0000_baseline.sql` from the schema plus `drizzle/baseline-indexes.sql` (expression indexes) and `drizzle/baseline-custom.sql` (search, triggers, seed rows). After a release, run `pnpm db:generate` for the one new migration, and `pnpm db:generate:custom` for triggers and search. `pnpm db:schema:check` fails if schema and migrations disagree.
- Keep personal targets and credentials in ignored files. Verify the target checkout and Git remote before mutations.
- Changes go through focused PRs to `main`. Only a merged PR labelled `release` that raises the shared version publishes artifacts.
- **Server installation and updates** upload only a published, checksum-verified release, never unreleased or locally built code: from `/create` through the customer's own browser-bound OAuth grant, or from a Server with its Owner's consent. zugoid.com delivers a release only to an account whose subscription covers that Server. Customers need neither Git nor GitHub. Recommend, never require, a separate Cloudflare account per Server.
- **Zugoid sells one subscription per Server.** One flat monthly price per Server, the same whatever it holds or does; a Server runs in production free for its first 30 days, and development and testing are always free. Everything a Server uses (Workers, D1, R2, Containers or the operator's VPS, mail, models, calls) stays in the customer's own provider account and is paid there; Zugoid hosts no Server and resells no compute or model. Subscriptions and billing live only in `zugoid-cloud`. Never add a price per Space, person, Agent, message, Source or feature, never meter use, and never cap how many people or Agents work at once.
- **A Server without a subscription keeps working.** Never lock people out of their data or stop a running Server for licensing. The levers are the license and updates: zugoid.com offers no new release for an uncovered Server, and the Server's update check says so to its Owner in plain words. Never add a license key, a feature that turns off, or a kill switch to the Server.
- **Portal** shares a Mac window into a conversation. The Server relays signalling and hands out keys; what a guest may see or do is enforced on the host's Mac, and a Server page may only ask for it. Relay protocol v1 (one guest) must keep working; v2 (several viewers through a Realtime SFU) is spoken only when the host offers it and the Server has an SFU app. Every SFU call is made by the Portal's Durable Object, one at a time per SFU session, and the SFU app's secret, like the TURN key, never leaves the Server. The guest page is PartyPortal's `web/guest.html`, copied with `scripts/sync-portal-guest.mjs`.

## Guides

- [Product language](CONTEXT.md): canonical terms.
- [Releases](docs/releases.md): shared version, release PR and publication.
- [Deployment](docs/deployment.md): Server boundaries, domains and credentials.
- [Local development](docs/local-development.md): running the Server and Client.
