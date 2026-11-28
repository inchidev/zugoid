# Software Factory: the Agent on its box

A person assigns a repository-backed Task to a Pi Agent. The Task gets one **box** for its whole life: a container with an ordinary Git checkout, where Pi runs with its own read, write, edit and shell tools. Commands, tests, builds and commits run in the box at local speed and make no request to the Server. What leaves the box is gated: pushes, network windows, Project secrets and merges. Repositories can keep their own CI. Projects with an Artifacts repository can also use the Builds workflow below.

A Server knows one kind of Node, the Compute Node, and two ways to get one: the operator's own VPS (the Docker Node below) and the operator's own Cloudflare account (Containers, below). All of them speak Node protocol 2. A Node of protocol 1, which ran one command at a time, is refused, and **Server settings → Compute** marks it **Needs this release’s Compute Node** with what to do. The Server's own VPS Node is replaced in place (below); any other Node is paired again.

## Builds from Artifacts

A Server operator binds its private `FILES` bucket, `FACTORY_CODE` Artifacts namespace, `FACTORY_LIZARD_KEY` secret and `FACTORY_LIZARD_PROJECT`. Set `FACTORY_PIPELINE_PROJECTS` to a JSON map keyed by Zugoid Project ID. An App entry has `{"kind":"app","app":"APP_ID"}` for an existing draft or published App in the Project's Space. An Unot entry has `{"kind":"unot","game":"farm"}` and uses the pilot studio's `FACTORY_UNOT_KEY` secret.

Put `factory.sh` at the root of the Artifacts repository. The runner checks out the recorded SHA, runs the script in Lizard and expects `factory-build.json` in the same directory. For an App the output has a `spec` object and optional `name` and `description`; the App renderer reads Data using the editor's access in Preview. The Unot destination accepts a bundle containing `game.json`, a Rooms server and the built client files. The sandbox receives a short-lived, read-only source token during checkout. The Server uses the destination credential after the build, outside Lizard.

Publishing a Task branch from Zugoid, merging it, or creating a tag from **Versions** queues a build. **Builds** shows the commit and check log and can rebuild a ref on demand. **Stage preview** sends the checked artifact to the destination. A Project Version tag is required for publication. In Zugoid the App publisher confirms the release. In Unot the studio owner opens the private Preview and publishes there.

## Set up on a VPS

Opt in during a fresh install with `ZUGOID_FACTORY=true ZUGOID_SHARED_KERNEL_TRUSTED=1`, or later:

```sh
sudo zugoid compute enable --trust-shared-kernel
```

`zugoid factory` is the same command. It downloads the verified Compute Node and box image from the release, so no Git clone, source build or registry is needed. Preflight requires Linux amd64, local Docker, 17 GiB free disk, 2 GiB available RAM and working loop mounts (`fallocate`, `mkfs.ext4`, `mount`, `umount`, `findmnt`, `losetup`). The service needs systemd as process 1 and checks it before writing anything. After the Owner is claimed, the service pairs itself with a narrowly scoped host signature and keeps only its private Node connection.

A host without systemd, such as a container, adds `--no-systemd`. That writes `factory/factory.env` with four variables (`ZUGOID_SERVER_ORIGIN`, `ZUGOID_NODE_STATE`, `ZUGOID_WORKSPACE_IMAGE`, `ZUGOID_SHARED_KERNEL_TRUSTED`); start the Node yourself:

```sh
set -a; . /opt/zugoid/factory/factory.env; set +a
/opt/zugoid/factory/releases/VERSION/node /opt/zugoid/factory/releases/VERSION/src/pair-local.mjs /opt/zugoid/.env
/opt/zugoid/factory/releases/VERSION/node /opt/zugoid/factory/releases/VERSION/src/daemon.mjs
```

Use `zugoid compute status|logs|restart|disable|backup|release-old-disks [--yes]|remove --keep-source`. `status` and `logs` say so when systemd is not running. Disable and remove keep Task disks. Factory backups are separate from the Server backup and include the backing disk images; copy them encrypted off the host.

The image pin accepts the loaded image id when it equals the published image id, config digest or OCI index digest, since the classic Docker image store and containerd report different ids for one release.

### Updating the VPS Node

The local Node always runs the release of its Server. `zugoid upgrade` replaces it after the Server is up and healthy, while its service is installed; `sudo zugoid compute enable --trust-shared-kernel` does the same at any time, for example after a failed attempt or for a Node whose service was removed. Both take the daemon and box image from the release being installed, verified like a fresh install. The running Node stops only after the new files, image and disk probe check out; then `factory.env` and the service point at the new release, `ZUGOID_NODE_BOXES` and `ZUGOID_WORKSPACE_DISK_BYTES` are kept, and the earlier release's files and box image are removed. A failed replacement never rolls back the Server; the command to retry is printed.

As it starts, the Node signs its new capabilities with its own credential and the host signature, so the Server updates the same Node: its ID, pairing, repository environments, boxes and box disks stay. That is also how a protocol 1 Node of an earlier release becomes a protocol 2 Node. A Node an Owner disabled and revoked stays off; its start fails and says so.

At its first start the new daemon removes the containers, networks and `zugoid-ws-*` volumes the per-command Factory labelled for this Node. Their workspaces were dropped with migration `0004`, but their disk images stay in `factory/state/workspace-disks` until the operator releases them: `zugoid compute release-old-disks` lists them, `zugoid compute backup` exports them, and `zugoid compute release-old-disks --yes` unmounts and deletes them. A disk-space check for a replacement asks for 8 GiB instead of 17, since the Node's Task disks already exist.

### A remote Docker Node

Any trusted Linux Docker host can be a Node. It connects out to the Server, so the Server needs no Docker and no inbound route to it. Create a one-use pairing code in **Server settings → Compute → Add compute → Connect node** (it expires after ten minutes), build the box image from the release you run, push it to your registry and start the daemon with its immutable digest:

```sh
docker build -f packages/compute-node/Dockerfile.workspace -t YOUR_REGISTRY/zugoid-box:VERSION .
docker push YOUR_REGISTRY/zugoid-box:VERSION
export ZUGOID_SERVER_ORIGIN=https://YOUR_SERVER ZUGOID_NODE_STATE=/PRIVATE/COMPUTE_STATE ZUGOID_SHARED_KERNEL_TRUSTED=1
export ZUGOID_WORKSPACE_IMAGE=YOUR_REGISTRY/zugoid-box@sha256:DIGEST
read -r -s -p 'One-use pairing code: ' ZUGOID_PAIRING_TOKEN; export ZUGOID_PAIRING_TOKEN
sudo --preserve-env=ZUGOID_SERVER_ORIGIN,ZUGOID_NODE_STATE,ZUGOID_WORKSPACE_IMAGE,ZUGOID_SHARED_KERNEL_TRUSTED,ZUGOID_PAIRING_TOKEN node packages/compute-node/src/daemon.mjs
```

The daemon refuses mutable tags and needs Node 24. A remote Server must use HTTPS; plain HTTP is accepted only on loopback. Keep `ZUGOID_SERVER_ORIGIN` set on every start: the stored credential must match it. The credential and the box records live in `node-state.sqlite`, mode 0600, in a 0700 directory. No public port or Docker socket is opened.

## Set up on Cloudflare

In **Server settings → Compute → Server compute setup**, choose **Enable compute node in Cloudflare**. The official installer opens with a fresh Cloudflare consent that includes Artifacts Read and Write; without that grant it stops and asks you to connect again. It needs Workers Paid and Containers access and never changes your plan. Choose the box size (small, standard or large), how many boxes may run at once (4 by default, at most 64) and the process limit. The number of boxes becomes the container application's `max_instances` and the Node's capacity. The installer uploads only checksum-verified released image layers and keeps the installed Server module, its secrets, UUID, D1, files and Git connections. Return to Settings, confirm the authorization and choose **Activate compute node**. **Pause compute node and retain source** stops the boxes and keeps their checkpoints. R2 is independent of all this.

## Set up the Server side

1. In **Server settings → Git**, connect a dedicated GitHub App, a GitLab access token (personal, group or project, with the `api` scope) or a Gitea or Forgejo bot account (Codeberg included, through the same Gitea connection). The App needs Contents, Pull requests, Issues, Checks, Commit statuses, Actions and Deployments as described in [Agents](agents.md#github-code-work). It never needs administration or protection bypass. Or skip this step and create the Project's repository inside Zugoid (below).
2. Add a repository environment in **Git → Environments**: the repository, its base branch, the Compute Node, any required check names and allowed preview domains.
3. Attach the repository to a Project. A repository outside a Project has no network beyond this Server and no Git flow settings but the defaults.
4. Give the Agent a Role with Read projects, Read tasks, Execute assigned tasks, Use a computer, Send messages and Propose code changes. The person who starts the work needs the same, and Approve agent actions to approve pushes and windows or to merge.

Without a connected Node there is no box. The Agent can then still read the repository and propose text-file changes through `publish_code_changes`; see [Agents](agents.md#github-code-work).

## A repository in Zugoid

A Project on a Cloudflare-based Server with Compute enabled can own its repository inside Zugoid, with no GitHub, GitLab, Gitea or Forgejo. On the Project page, **Connect repository → Create a repository in Zugoid** makes one in the Server's own Artifacts namespace, the one Compute provisioned, named after the Project, with `main` and a README, and attaches it with a repository environment like a connected one. The provider is `artifacts`; the Server's binding is its connection, and there is no row in Git connections.

The Task's box works on it as on any repository: it clones the pinned base through the egress layer with a short read token the Server mints and revokes, and `factory_publish` pushes the approved commit to `<prefix><box id>` with a short write token that lives only in the egress layer. Artifacts tokens are repository-wide, so Zugoid keeps the branch rule itself: the outbound Worker on Cloudflare, or the Server's transport for a VPS Node, allows exactly `<old> <approved sha> refs/heads/<prefix><box id>` and nothing else. There is no pull request: the receipt points at the Run, where the diff is read, and `factory_feedback` reports no checks. A person merges from the Task after reading the diff; the Task says plainly that nothing tested the head. The Agent never merges in a Zugoid repository, whatever the Git flow says, since there are no checks to pass.

**The Server does the merge.** Artifacts writes only through `git push`, so the Server builds the merge itself (`server/utils/git-pack.ts`): a squash commit of the approved head's tree on the base branch's head, a merge commit with both parents, or a fast-forward for `rebase`, pushed with a token minted for the merge and revoked after it. The approved head must include the base branch's current commit; Zugoid does not resolve a three-way merge, and asks the Agent to bring `main` into its branch and publish again when `main` moved.

**Versions** are annotated tags `v<version>` on the base branch, made from the Project page under **Versions** by someone who may merge there (`POST /api/projects/:id/releases`), and recorded in `project_releases` because Artifacts lists no refs. Detaching the repository or archiving the Project keeps the repository and its history.

A celld Server says a repository in Zugoid needs a Cloudflare-based Server.

## The box

**Capacity.** A Node announces its CPU, memory and number of boxes. A VPS Node reads them from the host: one box per CPU while each still gets 1 GiB, or `ZUGOID_NODE_BOXES` (1 to 64). A Cloudflare Node has one container size times its number of boxes. The Server admits waiting boxes in order while a box is free and an equal share of CPU and memory fits beside the running ones; the rest wait, and the Task says "Waiting for a free box". Four Tasks on a 4-vCPU Node run at the same time.

**Lease.** A VPS Node syncs about every two seconds, a Cloudflare box's object every 15 seconds. Each sync reports its boxes and renews the lease of every box it lists for a minute. A box whose lease ended must stop or take a new one, so two Nodes never run one box. A Done Task's box is released.

**VPS.** Each box is one long-lived container, `zugoid-box-<id>`, with the Task's 10 GiB hard-quota disk at `/work` and the checkout at `/work/repo`. It runs as uid 1000 with a read-only root, no capabilities, no-new-privileges, 512 processes, its CPU and memory share, no Docker socket and no Git credential. Its only way out is its own egress proxy, `zugoid-egress-<id>`, on an internal network. On the first start the trusted fetch broker brings the pinned commit and its history with a short read grant, and a throwaway container with no network clones it into the disk. A box with no turn stops after 15 minutes; its disk stays until the Task is Done.

**Cloudflare.** Each box is one Durable Object and one container from the same image and runtime. There is no daemon: the box's object syncs its own box through the same admission. The box runtime runs as uid 1000 through `setpriv`. The checkout is restored from the Task's Artifacts repository, or cloned from the pinned source on the first start. The container's disk is temporary, so the work is checkpointed to Artifacts when a turn ends, and again before a box stops after 10 minutes without a turn. Dependencies, build output and running processes are not kept. A Done Task's box releases its container and its Artifacts repository.

**A turn.** The Run's turn reaches the box through `control.mjs`, which the daemon runs by `docker exec` (the Cloudflare object execs the same). Pi runs in the checkout with the model behind the Server's gateway and a credential scoped to the Run; provider keys, budgets and the audit stay on the Server. The box pushes its events to the gateway in batches, about every 150 ms while text flows and every 10 s otherwise. It resends from the last acknowledged event, and each answer carries cancellation and steering. The Run streams the events into the conversation as embedded Pi does. A turn begun in a box that stopped ends with an error instead of running twice.

The Agent's Zugoid tools in a box are `factory_status`, `factory_publish`, `factory_feedback`, `request_network_window`, `factory_plan` in plan mode and `factory_merge` where the Git flow allows it.

**A screen and a browser.** A box on a Docker Node has a screen: the box runtime keeps Xvfb running on `DISPLAY=:99` (1280×720, framebuffer in shared memory, no network listener), and the Agent's shell has `DISPLAY` set. Debian's Chromium is `/usr/bin/chromium`, flagged for the box (no sandbox of its own, since the box is the sandbox and has no user namespaces; WebGL drawn by SwiftShader), and `playwright-core` is installed globally (`NODE_PATH` finds it from a `.cjs` script; launch with `executablePath: '/usr/bin/chromium'`). So the Agent opens and plays the game it builds the way a player sees it, with screenshots and console errors, instead of testing with Node alone. A box on Cloudflare has no screen yet. The Agent is told this in its brief (`boxRunBrief`).

## Git and publication

The checkout is an ordinary repository. Binary files, lockfiles and large changes are ordinary commits. Git LFS is not supported yet. D1 keeps only SHAs, statuses and digests; review diffs are in R2.

The Agent commits, then calls `factory_publish {sha, title, body}`. Each request is a row in `factory_approvals`. The Agent's tool call waits once, until it is settled.

**On a VPS Node** the daemon copies the commit out of the box. A throwaway container with no network and the box's disk read-only fetches it into a bare repository on a scratch disk with hardened Git: no system or global config, hooks, fsmonitor, replace objects, external diff or textconv, and every object checked. The commit must descend from the Task's pinned base. For a review it writes the diff (up to 2 MB of patch) and sends it to the Server. Once the push is approved, the daemon claims a grant: a single-repository Contents write token on GitHub, or a Server-proxied `git-receive-pack` with a capability bound to the approval and the box's lease on Gitea and GitLab, where the Server adds the token itself (GitLab takes it as the password of the user `oauth2`). Another throwaway container pushes exactly that commit with `--force-with-lease` on the head this Task last published. The GitHub token is revoked afterwards.

**On Cloudflare** a trusted helper makes the copy and the push, reading the checkout's objects as an alternate. BoxOutbound reads the ref commands at the start of the `git-receive-pack` request, refuses anything but `<old> <approved sha> refs/heads/<prefix><box id>` and adds the credential itself.

After either push the Server reads the branch back. It opens or updates the Task's draft pull request only if the branch is at the approved commit (for a repository in Zugoid it records the commit for review instead). Anything else is **uncertain**: nothing is retried, and a person looks at the repository. When a push fails, Git's own reason comes back with its credentials removed.

`factory_feedback` reads the checks, commit statuses, Actions jobs and logs, and deployments of exactly the pull request's head. On GitLab it reads the merge request's head pipeline, as a check named `pipeline`, each CI job's commit status and, when asked, one job's log; on Gitea and Forgejo the commit statuses, where a skipped job neither passes nor blocks. Old results never count for a new SHA. To repair, the Agent edits, commits and publishes again on the same branch.

## Approvals by mode

The Server's execution mode (**Server settings → Agents → Execution**) gates what leaves the box, not commands. Every decision approves an exact commit SHA, host or plan, read from Git or the request.

| | Push of the Agent's branch | Window to a host in the Project's network | Window to another host | Project secret at its bound host |
| --- | --- | --- | --- | --- |
| `role` (default) | Needs nobody | Needs nobody | A person | Used on its own |
| `plan` | Covered by the latest approved plan | Needs nobody without secrets; covered by the plan | Covered if the plan names it, else a person | Only those the plan names |
| `review` | A person, after reading the diff | Needs nobody without secrets, else a person | A person | Only through a window a person opened |

`factory_plan` names the plan's steps, hosts and secrets. A person approves it once in the Inbox or the Run, and it covers the Task until the Agent proposes a new one. A window that names a secret, once a person opens it, allows that secret at its host in any mode. Decisions are made by the person who started the Run, in the Inbox or on the Run page, or in a partner's own chat (below). A request waits for that decision for 30 minutes, as long as one box turn. The box holds its turn while a request waits, and on Zugoid Compute it is paid by the minute. A request nobody answered in that time closes, and the turn stops saying the Agent waited for an answer; the Agent asks again in its next turn. A Task may publish 50 times by default and its box may run six hours in all; both are execution settings.

## Network windows and Project secrets

A box reaches this Server and nothing else until its Project opens more. On the Project page, under Repositories, whoever may manage the Project sets:

- **Presets:** npm, PyPI, crates.io and GitHub read. None carries a credential.
- **Hosts:** public DNS names only, at most 50, such as an API the code talks to. No IP addresses, ports, wildcards or local names.
- **Secrets:** a name, a value and the hosts it is bound to. The value is encrypted on the Server and never shown again, to anyone. The API (`GET|PUT|DELETE /api/projects/:id/secrets[/:secretId]`) returns names, placeholders, hosts and dates, never a value.

For anything else the Agent calls `request_network_window {host, minutes, secrets, reason}`, for 1 to 480 minutes. An open window lasts its minutes from the decision, across the Task's Runs. A window without a secret gives the box the network and nothing else.

The Agent sees a placeholder such as `ZUGOID_SECRET_TELEGRAM_TOKEN`. The egress layer replaces it in headers, the URL and text bodies up to 1 MB, only on a request to a bound host where the secret is in effect, and takes the value out of the answer again. A request that carries a known placeholder to a host where it is not in effect is refused with 403, telling the Agent which window to ask for. A token pasted into a conversation is history its members can read and is sent to the model; a Project secret is the place for it instead.

**On a VPS Node** each sync carries the compiled hosts and their revision. The daemon writes them to a policy file the proxy reads read-only. It fetches the values in effect and hands them, with the box's certificate authority, to the proxy's control socket by `docker exec`; they live only in the proxy's memory. The authority is new for each start, and only its certificate is installed in the box, through `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `GIT_SSL_CAINFO` and `REQUESTS_CA_BUNDLE`. The proxy terminates TLS only for hosts with a bound secret and verifies the real host itself. Every other open host stays a plain CONNECT tunnel, so a package manager that pins certificates still works there. On a terminated connection only the response headers the proxy knows reach the box, such as content, caching, rate-limit and GitHub headers; any other is dropped. Private, numeric and rebinding destinations are refused.

**On Cloudflare** BoxOutbound checks every request against the same list and does the same replacement and scrubbing. It also checks the box's lease on every request.

## A request nobody answers

A turn that runs out of time while one of its requests waits for a person stops with that reason in plain words, such as "The agent waited for your answer about unpkg.com until its turn ran out of time, and stopped. Ask it to continue, and answer when it asks again." The request closes with the turn; the Agent asks again in the next one.

## Git flow and merge

Each Project sets its Git flow on the Project page, with the same permission as its network:

- **Agent branch prefix:** `zugoid-agent/` by default. A push goes to `<prefix><box id>`.
- **Who merges:** a person (the default); the Agent after checks pass; or a direct push to the base branch, for experiments.
- **Merge method:** squash (default), merge or rebase. The repository must allow it.

The target is always the repository's base branch. Branch protection on GitHub, GitLab, Gitea or Forgejo stays the ceiling: a push or merge it refuses comes back with its reason and is never worked around. A repository in Zugoid has no protection of its own; Zugoid is the ceiling there, as described above.

**A person merges** from the Task, on the board or on the Run page, where they may approve Agent actions in the repository's Project (`POST /api/tasks/:id/merge` with the head SHA they saw). The Server reads the checks again at that head. When any check or status exists, every one must have passed, along with every required check of the repository environment. When the provider reports no checks, statuses or Actions jobs at all and the environment requires none, the person may still merge; the Task and the answer say plainly that no checks were reported. Right after a push CI may not have registered its checks yet, so for two minutes after the Server confirmed the push of that head (`pushedAt` on the pull request's receipt) no checks counts as pending and the Task shows "Waiting for checks to register…". A receipt without a recorded push gets no grace. The provider is asked to merge exactly that head with the Project's method, after a draft is made ready (GitHub), the `WIP:` prefix is removed (Gitea) or the `Draft:` prefix is removed (GitLab). GitLab's merge method is a project setting, so there the Project's method chooses only whether to squash: `merge` needs a project that makes merge commits and `rebase` one set to fast-forward, where GitLab merges a head already on top of the base branch without rewriting it; any other combination is refused with the reason before GitLab is asked. A merge marks the Task's code work Merged and leaves the Task's status to its people.

**The Agent merges** with `factory_merge`, offered only under "the Agent after checks". It needs at least one passing check, none failed or pending, and every required check passed. An Agent never merges unchecked code.

**A direct push** sends the approved commit to the base branch as a fast-forward only. The Server reads the branch's head when the push is claimed; the pusher checks that the commit descends from it and pushes with a lease on it, and the receive-pack check allows only `<that head> <approved sha>`. Afterwards the Server compares the two heads; only a fast-forward to exactly the approved commit completes. There is no pull request.

Every merge attempt is a `factory_approvals` row of kind `merge`, completed, failed or uncertain.

## Limits

| | VPS Node | Cloudflare |
| --- | --- | --- |
| Box CPU and memory | An equal share of the host | 0.25 CPU/1 GiB, 0.5 CPU/4 GiB or 1 CPU/6 GiB |
| Boxes at once | One per CPU while each gets 1 GiB, or `ZUGOID_NODE_BOXES` (≤ 64) | Chosen at setup, 4 by default (≤ 64) |
| Task disk | 10 GiB hard quota (or 1 GiB with `ZUGOID_WORKSPACE_DISK_BYTES`), kept until Done | 4, 8 or 12 GB temporary; the checkout is checkpointed |
| Scratch disk | One at a time for a review or a push: 2 GiB, or what `ZUGOID_SCRATCH_DISK_BYTES` says (256 MiB to 2 GiB) | — |
| Processes | 512 per box | Chosen at setup, 128 by default |
| Idle stop | 15 minutes without a turn | 10 minutes without a turn |

Per Task: 50 publications and six hours of box runtime by default. Per review: 2 MB of patch and 200 commits shown; more is marked truncated. A window lasts at most eight hours and names at most ten secrets. The Run's own model, token and duration budgets apply as for any Run.

## Isolation, and what it does not protect against

The box holds no provider key, Git write token or secret value. `scripts/test-box-isolation.mjs` plants canaries for the Run capability's source, a GitHub token and a Project secret, and finds none in the box's environment, `/proc/*/environ`, `/proc/*/cmdline`, filesystem or Docker's view of it, while the secret still reaches its bound host through the proxy from Node, Python and Git.

What the boundary does not cover:

- **Docker shares the host kernel.** A VPS Node is for code and people the operator trusts. Commands from untrusted authors need a VM or microVM provider; do not admit hostile public tenants to the Docker path.
- **An open host can receive anything the box has.** That includes the repository and, at its bound host, a secret's effect. Open hosts and bind secrets with that in mind.
- **The Run's own credential is in the box.** It lets the box call the model and the Run's tools through the gateway, within the Run's authority and budgets, until the Run ends.
- **Repository content is untrusted.** Code, CI logs and pull request text never authorize a push, window or merge. Trusted components read the box's repository only through the hardened copy in throwaway containers.
- **Review approves a SHA, not intent.** A person who approves a push should read its diff; Git's hashes guarantee only that what was read is what is pushed.

Windows and macOS hosts, a preview of a box's port (a dev server's own address) or of a box's screen, Git LFS and Destinations (setting up deployment from Zugoid) are not built.

## Verification

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm test
corepack pnpm --filter @zugoid/agent-runtime test
corepack pnpm --filter @zugoid/compute-node test
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm model:check
corepack pnpm db:schema:check
corepack pnpm db:migrations:check
corepack pnpm build:deployment && corepack pnpm test:server
docker build -t zugoid-workspace:test -f packages/compute-node/Dockerfile.workspace .
node scripts/test-factory-workspace.mjs
node scripts/test-box-isolation.mjs
docker build --build-arg WORKSPACE_IMAGE=zugoid-workspace:test -t zugoid-workspace:cloud-test -f packages/compute-node/Dockerfile.cloud .
ZUGOID_FACTORY_CLOUD_TEST_IMAGE=zugoid-workspace:cloud-test ZUGOID_FACTORY_CLOUD_LIFECYCLE_IMAGE=zugoid-workspace:cloud-test node --test packages/compute-node/test/cloud-state.test.mjs
```

`test:server` includes `scripts/test-factory-transport.mjs`, which syncs as a protocol 2 Node over HTTP and is refused for forged operations, unknown fields, boxes it holds no lease on, another Server and after revocation. `test-factory-workspace.mjs` runs a real box in Docker against a stand-in Git server: history, edits, a commit, the hardened copy, a review diff, a push to the Task's branch and a fast-forward push to main. The Docker steps run in the Pi runtime workflow on pull requests that touch the runtime, the Node or these scripts. None of these tests authorize a real GitHub installation; acceptance with a real repository, model and phone is checked by hand, apart from these tests.
