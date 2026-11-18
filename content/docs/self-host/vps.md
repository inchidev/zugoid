---
title: Run a Server on a VPS
description: Operator reference for the Zugoid VPS installer and the zugoid command, from install and addresses to backups, upgrades, restore and uninstall.
order: 1
---

The VPS installer runs one standalone Zugoid Server on a Linux machine you control. It uses Docker Compose to run the Server on a single [celld](https://celld.dev) node, a private [RustFS](https://github.com/rustfs/rustfs) bucket for storage and Caddy for public HTTPS. The Server's Accounts, UUID, files and realtime all stay on that machine.

This page is the operator reference. For a short first install, see [Install on a VPS](../get-started/install-on-a-vps.md).

> [!NOTE]
> The Cloudflare path is verified first. The VPS path is newer: fresh-VM HTTPS and browser acceptance are still being recorded. Test your Server (claim, invite, chat, files) before you invite many people.

## Requirements

- A dedicated **amd64** VPS running Debian 12 or 13, or Ubuntu 22.04 or 24.04. VPS releases support Linux amd64 only.
- At least 2 GiB RAM and 5 GiB free disk.
- A domain whose A/AAAA records point at the VPS. A domain is required; there is no automatic IP-based hostname.
- Inbound TCP 80 and 443 open. UDP 443 is optional (HTTP/3).
- `bash`, `curl`, CA certificates and the standard core utilities.

The script installs missing `jq`, OpenSSL and iproute2. If Docker is missing, it installs Docker Engine and Compose from Docker's official apt repository. An existing Docker must be Engine 24 or newer with Compose 2.24.4 or newer; it is never replaced. Snap Docker and remote Docker daemons are refused.

Caddy gets and renews certificates itself. Its [HTTPS requirements](https://caddyserver.com/docs/automatic-https) need correct DNS and reachable ports. If the VPS already runs another reverse proxy, use [Docker Compose](docker.md) instead.

## Install

Run as root on the VPS:

```bash
curl -fsSL https://zugoid.com/install.sh | sudo env \
  ZUGOID_DOMAIN=chat.example.com \
  ZUGOID_ADMIN_USERNAME=owner \
  bash
```

The **VPS** tab on the [Create page](https://zugoid.com/create?tab=vps) builds the same command from your domain and Owner username.

The downloaded script pins its exact version, Git commit and the SHA-256 of the runtime image and Compose files. It never builds source on the VPS. A checksum failure stops the script before it installs packages, loads an image or writes any installation files.

When it finishes, the installer waits for the Server to be healthy and checks its public address, version and UUID. If the Server has no Owner yet, it prints a private link ending in `/setup#claim=…`. Open it, choose the Owner password, then invite a member.

> [!WARNING]
> The setup link is printed only to your terminal. It is not written to a log or a file. Do not paste terminal output into shared logs.

### Inspect the script first

To download and check a named release before running it:

```bash
version='<published-version>'
base="https://github.com/inchidev/zugoid/releases/download/v${version}"
curl -fSLO "$base/install.sh"
curl -fSLO "$base/SHA256SUMS"
awk '$2 == "install.sh"' SHA256SUMS | sha256sum --check
less install.sh
sudo env ZUGOID_DOMAIN=chat.example.com ZUGOID_ADMIN_USERNAME=owner bash install.sh
```

For a prerelease (alpha, beta or rc), add `ZUGOID_CHANNEL=prerelease`. Checksums and provenance come from GitHub over HTTPS; releases are not cryptographically signed.

### What the installer creates

- `/opt/zugoid`, mode 0700, with the private `.env` (mode 0600).
- A private copy of the CLI and `/usr/local/bin/zugoid`.
- A generated `SERVER_ID` UUIDv4 in `.env`. It names the Server, its resources and its backups.

Running the same installer again restarts and verifies the Server without changing `.env`, credentials, volumes or UUID. To move to another version, use `zugoid upgrade`. If an install fails, the private configuration is kept so you can fix DNS, firewall or settings and rerun the same script.

## Everyday commands

```bash
sudo zugoid status
sudo zugoid logs
sudo zugoid stop
sudo zugoid start
sudo zugoid backup
sudo zugoid upgrade
```

`status` shows the containers, version and primary address. `logs` follows the last 100 lines.

## Server addresses

A Server can answer at several addresses. One is the **primary address**; the others are **aliases**. All of them reach the same Server, Accounts and content.

```bash
sudo zugoid domain list
sudo zugoid domain add chat.example.com
sudo zugoid domain primary chat.example.com
sudo zugoid domain remove old.example.com
```

To add an address:

1. Point the new hostname's DNS at the VPS.
2. Run `sudo zugoid domain add <hostname>`.

The command adds the origin to `ZUGOID_ORIGINS`, adds the name to Caddy, restarts the stack, waits for a certificate and checks discovery at every address. If any check fails, it restores the previous `.env` and configuration.

`domain primary` changes the primary address (`PUBLIC_ORIGIN`) and keeps the old one as an alias. You cannot remove the primary address; promote another one first.

## Backups

```bash
sudo zugoid backup
```

A backup stops the stack for consistency, archives `.env`, the deployment and CLI files, and the RustFS, celld and Caddy volumes, then starts the stack again (also when the archive fails). Archives are mode 0600 under `/var/backups/zugoid/<installation-key>`. The latest seven are kept; set `ZUGOID_BACKUP_KEEP` on first install to change this.

> [!IMPORTANT]
> celld stores the Server's Worker variables, including `AUTH_SECRET`, in plaintext inside its private bucket. Treat the VPS disk and every backup archive as secrets. Copy backups off the host, encrypted, and test a restore.

Scheduled backups are not supported yet. Run `zugoid backup` yourself or from your own scheduler.

## Upgrade

```bash
sudo zugoid upgrade                                         # latest stable release
sudo env ZUGOID_CHANNEL=prerelease zugoid upgrade <version>   # a named prerelease
```

An upgrade:

1. Downloads the selected release's installer and verifies it.
2. Refuses a downgrade.
3. Verifies and loads the new runtime image.
4. Takes a mandatory backup.
5. Starts the new version and checks it.

If startup or discovery fails, it stops the failed stack, restores the previous Compose files, `.env`, CLI and all four volumes, and checks the old version again. The old image stays on the machine. Expect a short outage, because a single node restarts. If the rollback itself fails, the backup is kept and the command fails; read `zugoid logs` before you change anything else.

Automatic updates are not supported yet.

## Restore

Restore onto a fresh host that uses the same DNS name, with a published `install.sh`:

```bash
sudo env ZUGOID_DIR=/opt/zugoid bash install.sh restore /private/zugoid-backup-….tar.gz
```

The target directory must not exist and the four volumes must be empty. Restore verifies the archive, downloads and checks the runtime version that made the backup, restores the original secrets and UUID, and checks discovery. Point DNS at the restored host. Check that existing Accounts, sessions and private files work before switching traffic.

> [!WARNING]
> Never run two active copies of the same Server at once.

## Uninstall

```bash
sudo zugoid uninstall           # confirms the project and backs up first
sudo zugoid uninstall --purge   # also removes this Server's live volumes
```

`--yes` confirms without a prompt; `--no-backup` explicitly skips the backup. Uninstall keeps the configuration, the CLI, all backup archives, Docker and shared images. It never prunes Docker. After a plain uninstall, `zugoid start` brings the Server back. After `--purge`, restore from a backup.

## Configuration

Inputs apply on first install. Reruns keep the saved values.

| Input | Default and meaning |
| --- | --- |
| `ZUGOID_DOMAIN` | Required on first install. Domain without scheme or path. |
| `ZUGOID_ADMIN_USERNAME` | Username of the first Owner. Defaults to `owner`. |
| `ZUGOID_ADMIN_PASSWORD` | Optional, at least 12 characters. Creates the first Owner with this password, so no claim link is printed. It is stored in `.env`; change it after signing in. |
| `PUBLIC_ORIGIN`, `ZUGOID_ORIGINS` | Primary origin and comma-separated aliases. Managed by `zugoid domain`; do not edit by hand. |
| `ZUGOID_DIR` | `/opt/zugoid`. Use the same value with every CLI command if you change it. |
| `ZUGOID_CHANNEL` | `stable`. Set `prerelease` to install or upgrade to an alpha, beta or rc. |
| `ZUGOID_ACME_EMAIL` | Optional. Contact for Caddy's ACME account, for certificate notices. |
| `ZUGOID_HTTP_PORT`, `ZUGOID_HTTPS_PORT` | `80` and `443`. Custom ports need public ACME challenge ports forwarded. |
| `ZUGOID_NO_TLS` | `false`. `true` serves plain HTTP, for isolated tests only. |
| `ZUGOID_SKIP_DOCKER_INSTALL` | `false`. `true` requires an existing local Docker Engine and Compose. |
| `ZUGOID_BACKUP_DIR` | `/var/backups/zugoid/<installation-key>`. Must be outside `ZUGOID_DIR`. |
| `ZUGOID_BACKUP_KEEP` | `7`. |
| `ZUGOID_FACTORY`, `ZUGOID_SHARED_KERNEL_TRUSTED` | Set both (`true`, `1`) to add a [Compute Node](compute-nodes.md) during install. |

The version is chosen by the installer or `zugoid upgrade`, never by editing an environment variable.

### Optional providers

Mail, AI models, page reading and calls are optional. To add them, edit the private `/opt/zugoid/.env` using the keys listed in [`self-host/.env.example`](https://github.com/inchidev/zugoid/blob/main/self-host/.env.example), then run `sudo zugoid start`. See [Providers off Cloudflare](docker.md#optional-providers) for what each key does.

## Related

- [Docker Compose](docker.md) for a manual stack behind your own proxy.
- [Compute Nodes](compute-nodes.md) to let Agents work on repositories on this VPS.
- [Releases and updates](../concepts/releases-and-updates.md).
- [Troubleshooting](../reference/troubleshooting.md).
