---
title: Repositories and code work
description: Connect GitHub, GitLab, Gitea or Forgejo, or create a repository inside Zugoid, and let Zugoid Agents take a Task from a branch to a merge, with a network, secrets and a Git flow per Project.
order: 5
---

An Agent can work on code: it takes a Task and gets a **box** for it, a container with an ordinary Git checkout of your repository. There it edits files, runs commands, tests and builds, and commits, at the speed of the machine. When it publishes, its commit is pushed to its own branch and a **draft pull request** opens (a draft merge request on GitLab). A person merges it from the Task, unless the Project lets the Agent merge after checks pass. Releasing and deploying stay with your repository's own pipeline.

Code work needs five things. **Server settings → Agents** shows them as a checklist, **Set up agents that work on code**, until each is done:

1. **Connect a model.** See [Models and Providers](models-and-providers.md).
2. **Connect GitHub, GitLab, Gitea or Forgejo, or create a repository in Zugoid.** A dedicated GitHub App, a GitLab access token or a Gitea or Forgejo bot account for repositories that live elsewhere; or, on a Cloudflare Server with Compute enabled, a repository inside Zugoid that needs none of them.
3. **Choose a repository for Tasks.** An environment in **Git → Environments**.
4. **Add compute.** A Compute Node where each Task's box runs.
5. **Create an agent** with a Role that has **Use a computer** and **Propose code changes**.

![The Set up agents that work on code checklist in Server settings → Agents with five steps and their buttons](screenshot:agents-code-checklist "The code work checklist")

GitHub, GitLab, Gitea and Forgejo work today: GitLab.com and self-managed GitLab, and Forgejo, including Codeberg, through the Gitea connection. A Project on a Server in your own Cloudflare account with Compute enabled can also keep its repository [inside Zugoid](#or-create-a-repository-in-zugoid), with no account anywhere else. Projects can record Cursor repositories as references only.

## 1. Connect GitHub

Zugoid creates a private GitHub App for your Server, separate from any GitHub login. Only the Owner can set it up, and the Server needs an HTTPS address.

1. Open **Server settings → Git**. On the **GitHub** tab, select **Connect GitHub**. For an organization, select **Connect a GitHub organization** instead and enter its name.
2. GitHub opens in a new tab. Create the App, then choose which repositories it may access.
3. Return to Zugoid. The connection appears in the list with the repositories it can access. Select the refresh button if it does not appear yet.

![Server settings → Git with the GitHub tab, one connection and the Connect GitHub button](screenshot:agents-git-github "Connect GitHub")

The App asks for code and pull request write access, for working branches, draft pull requests and merges from Zugoid, and read access to issues, checks, Actions and deployments. It does not ask for branch-protection administration. The App's key stays encrypted on your Server and is never given to an Agent.

If GitHub asks you to sign in and then says it did not find an App Manifest, return to Zugoid and select **Prepare again after GitHub sign-in**. If you already created the App, refresh the connections instead of creating another.

To manage a connection, open it:

- **Change repositories on GitHub** changes which repositories the App can access.
- **Disable in Zugoid** stops Zugoid from using the connection at once. It does not uninstall the App; uninstall it on GitHub if you also want to remove its access there.

## Or connect Gitea or Forgejo

Forgejo is a fork of Gitea with the same API, so one connection serves both, on your own server or on [Codeberg](https://codeberg.org), which runs Forgejo. Zugoid tells them apart only to name the connection, for example `zugoid-bot on codeberg.org (Forgejo)`.

Gitea and Forgejo have no Apps, so Zugoid uses one account's access token. Use a separate bot account: the account's own access is the limit. Only the Owner can connect Gitea or Forgejo, and it must be served over HTTPS at its own address, not under a path.

1. On your Gitea or Forgejo, create an account for Zugoid, for example `zugoid-bot`.
2. Add it as a collaborator with **Write** access to each repository Agents may work on.
3. Signed in as that account, open **Settings → Applications** and generate a token. Set **Repository and Organization Access** to **All (public, private, and limited)**, so private repositories are included. Give it **Read and Write** for **repository** and **issue**, and **Read** for **user**: Zugoid needs it to identify the account and list its repositories. Copy the token; it is shown only once.
4. In Zugoid, open **Server settings → Git**, select the **Gitea / Forgejo** tab, then **Connect Gitea or Forgejo**. Enter the address, for example `https://codeberg.org` or `https://git.example.com`, paste the token and select **Connect**.

Zugoid checks the token there before saving it. The connection lists the repositories the account can push to. To change them, change the account's collaborator access and refresh.

The token stays encrypted on your Server. Agents never get it, and neither do Compute Nodes: a Node downloads and pushes the repository through your Server, with a permission bound to the Task's box. **Disable in Zugoid** stops Zugoid from using the token at once; delete the token on your Gitea or Forgejo to revoke it there too.

A personal token works too, but then Zugoid can reach every repository that person can.

What does not work:

- Gitea cannot limit a token to chosen repositories. Forgejo can, with **Specific repositories**, but such a token holds no **user** scope and cannot identify its account, so Zugoid refuses it. Use **All (public, private, and limited)** and limit the bot account's collaborator access instead.
- A Gitea or Forgejo served under a path, such as `https://example.com/git`, cannot be connected yet.

Gitea and Forgejo differ from GitHub in a few ways:

- A draft pull request is a pull request whose title starts with `WIP:`. Gitea and Forgejo do not merge it until the prefix is removed.
- **Required CI checks** match commit statuses. Gitea Actions and Forgejo Actions report each job as one. A job its workflow skipped neither passes nor blocks.
- CI job logs stay on your Gitea or Forgejo; open the pull request there to read them.

## Or connect GitLab

GitLab works with an access token: a personal access token of a user made for Zugoid, or a group or project access token, which acts as a bot user of its own. The token's user decides what Zugoid can reach: the groups and projects it is a member of, with the **Developer** role or higher. Only the Owner can connect GitLab. It can be GitLab.com or your own GitLab served over HTTPS at its own address, not under a path.

1. Choose who Zugoid acts as. Either create a GitLab user for Zugoid, for example `zugoid-bot`, and add it with the **Developer** role to the groups or projects Agents may work on; or use a group or project access token, where your GitLab offers them, with the **Developer** role. Give it **Maintainer** instead where it must merge into protected branches that only Maintainers may merge.
2. Create the token with the **api** scope: for a user under **Preferences → Access tokens**, for a group or project under its **Settings → Access tokens**. Copy it; GitLab shows it only once.
3. In Zugoid, open **Server settings → Git**, select the **GitLab** tab, then **Connect GitLab**. Keep `https://gitlab.com` or enter your GitLab's address, paste the token and select **Connect GitLab**.

Zugoid checks the token with GitLab before saving it. The connection lists the projects the token can push to, subgroups included. Archived and empty projects are left out. To change them, change the user's membership in GitLab and refresh.

The token stays encrypted on your Server. Agents never get it, and neither do Compute Nodes: a Node downloads and pushes the repository through your Server, with a permission bound to the Task's box. **Disable in Zugoid** stops Zugoid from using the token at once; revoke the token in GitLab to end it there too.

A personal token of your own works too, but then Zugoid can reach every project you can.

GitLab differs from GitHub in a few ways:

- Agents open a **merge request**, not a pull request. A draft is a merge request whose title starts with `Draft:`; Zugoid removes the prefix when it merges.
- **Required CI checks** match the names of the head commit's statuses: each CI job reports one, and the merge request's pipeline as a whole counts as a check named `pipeline`. A job allowed to fail does not block. Zugoid reads a job's log from GitLab when the Agent asks for it.
- GitLab sets the merge method per project, so the Project's **Merge method** must agree with it: **Squash** works where the project allows squashing, **Merge** needs a project that makes merge commits, and **Rebase** needs a project set to **Fast-forward merge**, where the branch must already be on top of the base branch. Zugoid never rebases the branch itself, so it always merges the commit you saw.
- Your protected branches, merge checks and approval rules decide. A merge GitLab refuses comes back with GitLab's reason.

## Or create a repository in Zugoid

A Project can own its repository inside Zugoid. It lives in your Server's own storage, in the same Cloudflare account, and nobody needs a GitHub, GitLab, Gitea or Forgejo account. This works today on a Server created on Cloudflare with Compute enabled (**Server settings → Compute → Server compute setup**), because Compute provisions the storage that holds repositories. On a VPS it is not available.

1. On the Project page, under **Repositories**, select **Connect repository**, then **Create a repository in Zugoid**. With more than one computer, choose where its Tasks run.
2. Zugoid creates the repository, named after the Project, with a `main` branch and a README, and attaches it to the Project. No environment setup is needed: steps 2 and 3 below are done.

A repository in Zugoid works like a connected one, with these differences:

- **No pull request.** When an Agent publishes, its branch is recorded on the Task as **Published for review**. The diff is on the Run's page, where you approve pushes in review mode too.
- **No CI.** Nothing tests a head before you merge it, and the Task says so. If you want checks, keep the repository on GitHub, GitLab, Gitea or Forgejo, or build from the Zugoid repository with your own pipeline.
- **A person merges.** From the Task, as for any repository, with the Project's merge method. The Agent never merges here, whatever the Git flow says, because there are no checks to pass. Zugoid merges only a branch that includes `main`'s current commit; if `main` moved, ask the Agent to bring it into its branch and publish again.
- **Versions.** Under **Versions** on the Project page, someone who may merge can **Release a version**: a tag `v1.0.0` on `main`'s current commit, listed there. Zugoid records it; what a version means is up to whatever builds from the repository.
- **Nothing deletes it.** Detaching the repository or archiving the Project keeps the repository and its history in your storage.

To work on the repository from your own computer, ask the Server Owner: the repository is reachable with Git over HTTPS and a token from your Cloudflare account's Artifacts namespace. Zugoid does not hand out tokens yet.

## 2. Add a repository environment

An environment tells Tasks which repository, branch and compute to use.

1. In **Server settings → Git**, open the **Environments** tab and select **Add environment**.
2. Enter a **Name**, for example `Website fixes`.
3. Choose the **Git connection**, GitHub, GitLab, Gitea or Forgejo, then the **Source repository**. Select **Refresh repositories** if the list is empty.
4. Choose the **Working repository**: the same repository for ordinary branch-based work, or an optional fork.
5. Choose the **Compute Node** where its Task Runs execute.
6. Enter the **Base branch**.
7. In **Required CI checks**, optionally enter exact check or commit-status names, one per line. A pull request whose required checks are missing or failing cannot be merged from Zugoid. Leave it empty to require every check CI reports.
8. Optionally list **Allowed Preview domains**, one per line, for preview links Agents may report. Preview links must use HTTPS.
9. Select **Save environment**.

Saving changes to an environment stops Runs and Schedules that use its earlier version.

## 3. Add compute

Code runs on a Compute Node, never on the Server itself. In **Server settings → Compute**, select **Add compute** to pair a Docker host on your own VPS, or set up Containers in your own Cloudflare account; **Server compute setup** shows the option that fits where your Server runs. See [Compute Nodes](../self-host/compute-nodes.md).

## 4. Give the Agent and people the right permissions

| Permission | Who needs it |
| --- | --- |
| Use a computer | Both the Agent and the person who starts the work |
| Propose code changes | The Agent, to publish a branch and draft pull request |
| Read tasks, Execute assigned tasks, Send messages | Both, to run a Task |
| Read projects | Both, when the Task belongs to a Project |

No existing Role gets **Use a computer** or **Propose code changes** automatically, not even Admin. The built-in **Developer** Project policy covers working on project Tasks and proposing code; assign it in **Projects → Access**.

## 5. Open the network and add secrets

A box reaches only your Server until its Project opens more. Attach the repository to a Project, then on the Project page, under **Repositories**, whoever may manage the Project sets:

- **Network**: presets for the npm registry, PyPI, crates.io and GitHub (read only, no credentials), and your own hosts, such as an API your code calls. What you open here is open for every Task of the Project.
- **Secrets**: tokens and keys the Agents may use, each bound to the hosts it may go to. You enter a value once; nobody reads it back, Agents included. The Agent sees a placeholder such as `ZUGOID_SECRET_TELEGRAM_TOKEN`, and Zugoid puts the value in only on requests to a bound host.

When a Task needs another host, the Agent asks for a **window**: one host for up to eight hours, with the secrets it needs there. A host outside the Project's network waits for you in your Inbox.

Put a token in a Project secret, never in a conversation: a conversation is history its members can read, and it is sent to the model.

## 6. Choose the Git flow

The Project page also sets each Project's **Git flow**:

- **Who merges**: a person (the default), the Agent once checks pass, or a direct push to the base branch for experiments, with no pull request.
- **Agent branch prefix**: `zugoid-agent/` by default. Each Task's branch is this prefix and its box's id.
- **Merge method**: squash (the default), merge or rebase.

Your branch protection on GitHub, GitLab, Gitea or Forgejo always has the last word. A push or merge it refuses comes back with its reason; Zugoid never works around it. A repository in Zugoid has no protection of its own: Zugoid allows a Task's branch to be pushed and nothing else, and only a person merges.

## 7. Run a Task

1. Create a Task, assign it to the Agent and choose the **Repository environment**.
2. Select **Create and run**, or later **Run assigned agent** on the Task.
3. Follow the Run in the conversation, where its answer appears as it is written, or on the **Runs** page.

The Agent works in the box on the base branch's exact commit and commits as usual. **Server settings → Agents → Execution** decides what needs your approval:

| Mode | Pushes | Secrets |
| --- | --- | --- |
| Autonomous (default) | The Agent pushes its branch on its own | Used at their bound hosts |
| Approve a plan | Covered by the plan you approve once | Only those the plan names |
| Review | You approve each push after reading its diff | Only through a window you open |

Approvals wait in your Inbox and on the Run's page.

After a push, the Agent reads the pull request's checks, CI logs and deployments for exactly that commit, and repairs on the same branch if something fails. Your existing CI, branch rules and preview deployments stay authoritative. A report from the Agent is not CI evidence.

## 8. Merge

The Task shows its pull request (or, for a repository in Zugoid, **Published for review in Zugoid**) and a **Merge** button, on the board and on the Run's page. You can merge when you may approve Agent actions in the Project and every check of the pull request's head passed. If the repository reports no checks at all, you can still merge, and Zugoid says plainly that nothing tested it. For the first two minutes after a push the Task shows **Waiting for checks to register…** instead, because CI may not have reported the new head yet. Zugoid merges exactly the commit you saw, with the Project's merge method, and marks the Task's code **Merged**. The Task's own status stays yours to change.

Under **the Agent once checks pass**, the Agent can merge too, but only after at least one check passed and none failed or is pending.

## Limits

The Owner sets per-Task limits in **Server settings → Agents → Execution**: branch pushes (50 by default) and box runtime (six hours by default). Box size and how many boxes run at once depend on the Compute Node; see [Compute Nodes](../self-host/compute-nodes.md). Git LFS is not supported yet.

## Related

- [Compute Nodes](../self-host/compute-nodes.md)
- [Projects and Tasks](../guides/projects-and-tasks.md)
- [Agents, Tasks and Runs](../concepts/agents-tasks-runs.md)
