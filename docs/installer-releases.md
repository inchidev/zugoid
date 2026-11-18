# Deployment artifacts

One release contains Server, client assets, Docs and matching migration chains. Deployment bundle and release provenance use schema version 3. The Server manifest declares `zugoid-server-schema-v1`; older formats are not install targets.

| Asset | Purpose |
| --- | --- |
| `zugoid-deployment.json` | Complete verified bundle: the `server` module; static assets; ordered Server migrations. |
| `zugoid-cloudflare-manifest.json` | Server runtime manifest with immutable asset URLs, hashes, compatibility flags and DO classes. |
| `zugoid-worker.mjs` | Bundled server Worker, for installers made before `zugoid-worker-modules.json`. |
| `zugoid-worker-modules.json` | Nitro's server modules as they are (`workerModules` in the manifest). Installers that know it upload these, so a new isolate compiles only the modules a request needs: Cloudflare counts 102 ms of startup instead of 237 ms for the bundled Worker. |
| `zugoid-assets.json` | Server client assets and ordered server migrations. |
| `zugoid-deployment-core-<version>.tgz` | Provisioning library for the browser-bound installer and operator tooling. |
| `zugoid-runtime-linux-amd64.tar.gz` | Portable Docker image, tagged `zugoid:<version>`, loaded with `docker load`. |
| `zugoid-docs.tgz` | Docs text (`content`), contributor docs, README, domain context and license from the release commit. |
| `LICENSE` | The Apache License 2.0 terms for the release. |
| `zugoid-release.json` | Shared version, exact commit, release PR, component list and artifact hashes/sizes. |
| `install.sh`, `zugoid` | Identical pinned VPS installer/operator CLI. |
| `zugoid-compose.yml`, `compose.vps.yml`, `Caddyfile`, `Caddyfile.vps` | Exact common standalone Compose plus VPS HTTPS override. |
| `SHA256SUMS` | Checksums for every accompanying release file. |

`@zugoid/deployment-core` is the provisioning library used by the browser-bound installer and by operator tooling, not a deployed Admin or Server control plane. The installer uploads only the selected published release artifact after verifying its checksums, through the customer's own Cloudflare OAuth grant. It keeps that grant only inside the bounded, encrypted, browser-bound installer session, unless the Owner chooses to keep Cloudflare access on the Server, which receives it once through a single-use capability. Accounts, content and provider credentials remain on each Server.

Build with `pnpm release:installer`. Validate all module SHA-256, asset hashes/sizes, migration order and release provenance. Published tags and assets and merged SQL are immutable. The release workflow packages the portable runtime image and all components before publishing.

Releases containing the VPS installer set `vpsInstaller: 1` in `zugoid-release.json`. Earlier immutable schema-3 releases remain valid Cloudflare targets. The release workflow exports the runtime first, then generates installer pins. Finalization checks `install.sh` and `zugoid` byte for byte before publication. See [VPS installation](vps-installer.md).
