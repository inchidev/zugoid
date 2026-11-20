# Zugoid product language

This is the product glossary. See [product scope](docs/product.md), [runtime architecture](docs/architecture.md), and the stabilization roadmap for behavior, implementation and planned work.

## Zugoid

A source-available workspace for humans and agents. People and Agents discuss work in a Server, organize it into Projects and Tasks, and work with connected repositories and shared information. Chat is a starting point for work. Customers, Data and Apps are capabilities within the same Server.

## Server

An organization with its own Members, Roles, conversations, content and settings. A Member may belong to several Servers; access to one does not imply access to another.

A Server owns its Accounts, Members and content. Its identity is a persistent UUIDv4. The same term is used throughout the product.

## Account

A human's local login identity on one Server: a username and a password, or a linked sign-in provider. Email is optional and counts only once it is verified. Accounts on different Servers are independent. Explicit account linking connects login methods to an Account; matching email addresses do not establish that link.

## Member

A human or Agent participating in one Server. A human's Account identifies them; their server-local membership determines their access. An Account and a Member are different concepts.

## Space

The boundary between departments of one Server. Each Project, Channel, Direct Message, Mailbox, Data resource, App, file, Agent and MCP connection belongs to exactly one Space; what hangs off them (Tasks, Runs, Threads, records) inherits it. Accounts, Roles, domain, backups, Providers and Compute stay at the Server.

Access needs Space membership and then the permission: the Space check runs first, for everyone, and Roles, Policies and Grants work unchanged inside it. A person can belong to several Spaces; someone who belongs to one sees nothing of the rest of the Server, its people included. An Agent belongs to exactly one Space. A **Space admin** manages that Space and not the Server. A **suspended** Space cannot be used by anyone but the Owner until it is resumed, and loses nothing. The Server Owner can manage any Space (members, limits, deletion) but reads its contents only after joining, and joining is recorded in the audit log.

Each Space has **limits**, separate from permissions: **quotas** (storage, people, Agents, Runs and emails per month) and **rate limits** per action. A Server starts with one **default Space**, and the Space switcher appears only once a second one exists. Every rail section shows the active Space; the switcher marks another of a person's Spaces that has something new. Spaces separate departments of one organization. They are not protection between hostile tenants: the database and `AUTH_SECRET` stay shared.

## Role, Project policy and Grant

A Member has one Server Role, which groups Server permissions. A reusable Project policy adds permissions for a person, an Agent or a Server Role in a particular Project. The same Member can have Developer access in Project A and Reviewer access in Project B. Policies add grants; they do not remove broader rights already supplied by a Server Role.

A **Project invite** adds one such Project policy for whoever joins from it, so joining and being able to act there are one step. Making one takes what assigning Project access takes, and it joins the Project's Space.

A Grant gives one Member or Role either a Policy in a Project (or, as Agent access, across the Server) or a set of permissions on one resource: a channel, Mailbox, App or MCP connection. Grants only add permissions; channel denies are kept apart. Evaluate the operation in its Project and resource scope. The Server Owner operates its deployment; Project access does not grant Server administration or private-channel membership.

**Agent access** is a Grant with an Agent: a person or Role may use that Agent with a Policy, in one Project or across the Server, beyond their own Role but never beyond the Agent's. Without it an Agent works no higher than the person who asks. An Agent either answers everyone who may use Agents (open) or only the Owner and holders of its access (granted).

## Channel, Thread and Direct Message

A Channel is a conversation in one Server. A Thread is a child conversation. A Direct Message is a private conversation between Members of the same Server.

A mention names who a message is for: a direct mention names one Member, a role mention a Role's holders, and a group mention (`@channel` or `@here`) everyone who can read the conversation or those of them online. Only a direct mention addresses an Agent.

## Mailbox and Email Conversation

A Mailbox is a shared inbox with its own access rules and email address, and a Source in Customers. An Email Conversation is a Customer Conversation from a Mailbox: incoming mail, outgoing replies and internal notes.

## Customers, Source, Conversation, Contact and Company

**Customers** is the rail section where a Space deals with people outside it: Conversations, Contacts, Companies and, later, analytics. Do not call it Clients: the Client is the interface.

A **Source** is where messages come from: a Mailbox, a **Widget** (a chat on a website, added to the site with one line of embed code), a **Telegram bot**, later forms and others. A **Customer Conversation** is one exchange from one Source: a channel of its own kind with a status and an assignee, where people and Agents reply and internal notes stay inside. Only messages sent outward leave. Customer channels never appear in Chat: no list entry, unread count, mention, notification or search result there.

An **Identity** is an address someone wrote from: an email address, a browser on a website, a Telegram user, the site's own user ID. Identities point at a **Contact**, the person the team deals with, who works in **Companies**. Verified Identities join one Contact automatically; a typed name or email only suggests a merge, which a Member or Agent makes. A **Visitor** writes through a Widget and is not an Account or a Member: they see only their own Conversations and never what the team merged. A Source may name an Agent as its **first line**. See [Customers](docs/customers.md).

## Inbox

The Server rail's Inbox is one Member's queue of what is waiting on them in the active Space: decisions on Runs they started (pushes, plans and network windows that wait for them, and sharing reviews), unread mentions, their Agent work, Tasks assigned to them or waiting for their review, unread mail in Mailboxes they can read, and unread chats. A Mailbox's Inbox folder is a different thing: received email in one Mailbox. Say "Inbox" for the rail section and "the Mailbox's Inbox folder" for mail.

## Agent

A non-human Member with explicit permissions. An Agent can participate in authorized conversations and use authorized tools. It is not a login Account. External email sending requires human approval.

An external Agent works on its own computer, not with this Server's models: a Run wakes it through its webhook and it answers through the Server's MCP as itself, within its Role.

## Session, Run, Environment and Schedule

A Session holds one Agent's context for a conversation. A Run is one attempt to carry out work and may be linked to a Task. An Environment supplies the tools and working files available to a Run. A Schedule triggers a reminder or work under a saved, revocable authorization.

## Rail

The Client's navigation: the Server, the Space switcher for someone with more than one Space, then Inbox, Chat, Tasks, Factory, Customers, Agents, Data and Apps. Each section has the same frame: the rail, a list with groups and a create button beside the group where the new thing lands, then the content. A section is a place in the interface, not a resource.

**Tasks** is the section for everyday work: My tasks and a flat list of boards. **Factory** is the section for coding work: Projects with repositories, and the Runs a Member started. Git and Compute setup is in Server settings. **Schedules** sit in the Agents section.

## Task, Data and App

A board belongs to a Space and holds Tasks. A **Project** is a repository with its access, in Factory. A Task can name a Project for agent work, whichever board it sits on; with none, it follows Server Roles.

A Task records work and its responsibility. It can carry a recording: the original and the frames cut from it are its attachments, the marks (time ranges, a box, a comment) are on the recording, and what was said goes in its text. An image attachment can be its cover, shown on the board. A recording sent from a device arrives by a personal link holding a device key, which opens one upload route in one Space and nothing else, and lands on the person's chosen board or an ordinary board named Shots in the Space. Data comprises user-managed Items, Databases and Views. An Item is a page or Canvas with stable identity, content and optional properties from one Database. Items can nest within Items independently of Database membership; every Item belongs directly to one Space. Records are Items inside a Database. Canvas nodes and edges remain specialized content. Tasks remain separate. An App is a published internal interface over explicitly authorized Data. These resources belong to one Server.

## Client and Server list

The Client is the interface served by a standalone Server, at its own address. Only sites its Owner lists may show it in a frame. A Server's **theme** (accent, font, sign-in background, and whether members see Zugoid's name or only the Server's) is how its Client looks to everyone; a partner's Server wears the partner's look with it.

A **Server list** is the other Servers one browser keeps on one Server's address, on one device. Only that Server's own page can read it. An entry is not an Account or a membership grant. Lists are not synced: each holds what was added there or accepted there. The iOS, Android and macOS apps keep the device's list themselves.

A Server can answer at several public **addresses**. The **primary address** is used for new links and background email. **Aliases** are additional addresses that reach the same Server UUID, Accounts and content. Every listed address is trusted. A Server list recognizes one Server by UUID even when it is added by a different address. An unlisted hostname is not a Server address.

## Provider and Backup

A Provider supplies an optional capability such as email delivery, inference or calls. A Backup is a recovery copy stored separately from live files; it is not a second running Server.

## Compute Node

A Compute Node is where an Agent's repository work runs: it pairs with the Server, announces its capacity (CPU, memory and boxes) and syncs its boxes with it. It runs on the operator's own VPS or in their own Cloudflare account as Containers, and the operator pays that provider directly. A Server holds no provider key for it, and nothing caps how many Agents work at once.

## Box

The machine one Task's code work runs on: a container on a Compute Node with an ordinary Git checkout, kept for the life of the Task and released when the Task is Done. The Agent runs inside it with its own file and shell tools; commands make no request to the Server. A box holds no provider key, Git write token or secret value. What leaves it (a push, a merge, a request to a host) passes the Node's egress layer and is gated by the Server. Say "box", not container or sandbox, in the product.

## Network window and Project secret

A box is closed by default. Its **Project's network** (presets such as npm, and hosts an Owner or Project manager names) is open for every box of the Project. A **network window** opens one more host for one Task for a stated time, once a person or the execution mode allows it.

A **Project secret** is a value entered once for a Project and bound to the hosts it may go to. Nobody reads it back, Agents included. The Agent sees only its placeholder, `ZUGOID_SECRET_<NAME>`, and the egress layer puts the value in on a request to a bound host. A window without a secret gives the network and nothing else.

## Git flow

A Project's rules for how an Agent's work reaches each repository's base branch: the Agent's branch prefix, who merges (a person, the Agent after checks pass, or a direct push for experiments) and the merge method. The repository's own branch protection stays the ceiling. A **merge from Zugoid** merges a Task's pull request at the exact head a person or the Agent saw.

## Conversations

A DM has two participants inside one Server. Larger conversations use channels, which are open or private. Changing a private channel's members preserves its ID, threads and history. Only its creator can add or remove members; existing groups without recorded creators receive no guessed administrator. The Server Owner can explicitly assign a current human participant as creator of such a channel; assignment is audited and grants no membership. Adding a member grants the whole history, with the previous messages treated as read. New messages after the grant remain unread. Agent replies use threads in every conversation. An archived channel leaves Chat navigation and the Inbox and is read-only for everyone, its Threads included: no messages, edits, reactions, pins, new Threads, Live rooms or Agent Runs. Its history stays readable at its links and in search. Members with Manage channels archive and restore it; a private channel, like its visibility, only by its creator. The last active channel cannot be archived.

## Subscription

What Zugoid sells: one flat subscription per Server, whatever it holds or does. A Server runs in production free for its first 30 days and then needs its subscription; development and testing never do. Everything the Server uses (Workers, storage, containers, mail, models, calls) stays in the customer's own provider account and is paid there. Zugoid runs no Servers itself. Releases and updates reach a Server through zugoid.com for an account whose subscription covers it. Prices live only on [Pricing](https://zugoid.com/pricing).
