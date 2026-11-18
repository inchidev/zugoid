# Customers: one engine for mail, website chat and other Sources, with Contacts and Companies

Decided on 2026-11-17. The stages at the end say what is built.

## Problem

A team talks to the people outside it in several places: email, a chat on its website, Telegram, later forms and WhatsApp. Crisp, Intercom, Chatwoot and HubSpot each do part of this, and the team's customers live there, apart from its Chat, Tasks, Data and Agents. When Vasya writes by email, then on the website, then in Telegram, the team should see one person with one history, answer him from wherever he wrote, and let an Agent take the first line. Website analytics and goals, in the way PostHog does them, will later hang off the same people.

Zugoid already has most of the engine, in Mail. A Mailbox is a private channel; mail is stored as ordinary messages with an `email_messages` row beside each, written by the synthetic author `mail-external`; an internal note is a message with no such row, so it never leaves. Inbox, unread state, notifications, attachments in R2, Grants on a resource, rate limits, Space quotas, Agent Runs and Turnstile are there too. Three things are missing: a model of who wrote (identities that join into one person), a person outside the Server writing from a website without an Account, and a place where the team sees its people and their companies.

Mail also has two shapes that do not fit. Each Email Conversation is a Thread, so its first email is stored in the Mailbox channel and the rest in the Thread. And Mailbox channels are kept out of Chat by `NOT EXISTS (SELECT 1 FROM email_mailboxes …)` copied into about twelve queries, so one more kind of hidden channel would need twelve more copies, and one miss would leak a customer's words into Chat.

## The words

- **Source**: where messages come from, set up once. A Mailbox, a **Widget** (a chat on a website), later a Telegram bot, a form, WhatsApp. A Source belongs to one Space.
- **Conversation**: one exchange from one Source, with a status and an assignee. People and Agents reply in it; notes stay inside.
- **Identity**: an address someone wrote from: an email address, a browser on a website, a Telegram user, a phone number, the site's own user ID. An Identity is **verified** or not; how is set out below.
- **Contact**: a person the team deals with. Identities point at a Contact, and a Contact sees all its Conversations from every Source.
- **Company**: an organization Contacts work in.
- **Visitor**: someone writing through a Widget. Not an Account and not a Member.

The rail section is **Customers**. It is not called Clients, because the Client is the interface, and not People, because "person" already means a Member everywhere in this repository.

## One engine for every Source

- **A Conversation is a channel of type `conversation`**, with the Source's channel as `parent_id` and no `parent_message_id`, and a `customer_conversations` row: Source, Contact, status (`open`, `waiting`, `resolved`, `spam`, `trash`), assignee, last message time. It inherits the Source's Space through the existing `channels_thread_inherits_space` trigger and its access through `parent_id`, as a Thread does. An Agent answers in it directly, as in a Thread, not in a Thread below it. Every place that treats `type = 'thread'` as "inherits its parent" (`server/utils/channel-access.ts` first) learns the new type.
- **A Source is a private channel** with its own row: `email_mailboxes` for a Mailbox, `customer_widgets` for a Widget, one table per later kind. Its channel members are the team that answers it, and Grants on it give read, reply and manage. A `customer_sources` row names the kind and holds what every kind shares: the first-line Agent and whether it may answer.
- **A message is an ordinary message.** One from outside is written by a synthetic author per kind (`mail-external`, `customer-visitor`, later one per channel) and shown with the Identity's name. Each kind keeps a **delivery row** beside its messages: `email_messages` as today, `customer_widget_messages` for a Widget, and so on. The row holds the protocol, the direction and delivery state.
- **The outside sees only messages with a delivery row.** A note, an edit history, a reaction, a mention or an Agent's tool output has none, so it never leaves. This is the rule mail already follows, and every Source keeps it.
- **A reply goes out through its Conversation's Source:** an email reply by the Mailbox's transport, a Widget reply to the Visitor's socket. Answering Vasya in Telegram about what he wrote by email is a new Conversation in that Source, started from his Contact.
- **Mail joins the engine.** Every Mailbox is a Source and every Email Conversation becomes a `conversation` channel in Customers. Every email, the first included, is stored in its Conversation's channel; status, assignee and time live in `customer_conversations`, subject and participants stay in `email_threads`, and every correspondent gets a Contact. The Mail section becomes the Mailboxes view inside Customers: folders, composing a new email, drafts and signatures.

## Customer channels never appear in Chat

- **A channel says which section it belongs to.** `channels` gains `section`: `chat` or `customers`, set at creation and copied to children by the trigger that already copies the Space. Sources and Conversations are `customers`.
- **Chat reads only `section = 'chat'`.** The twelve `NOT EXISTS (SELECT 1 FROM email_mailboxes …)` checks (channel list, unread, search, attention, chat alerts, role mentions, notifications, Live audience, creator recovery, archiving and the rest) become that one condition.
- **What reaches a Member comes through Customers:** its own lists, unread counts and search, and Conversations in the Inbox. A message in a Conversation is never a Chat mention, notification or search result.
- **A test holds it.** A Conversation with messages, a note and a mention is created, and the Chat list, unread, search, attention, notifications and the channel MCP tools all come back without it.

## Joining Identities into one Contact

- **`customer_identities`** holds one row per kind and value in a Space, pointing at one Contact, with whether it is verified and how. A new Identity gets a new Contact, named from what it gave (an email's display name, a Telegram name) or "Visitor" with a number.
- **Verified Identities join automatically.** An email address is verified when inbound mail from it passed sender authentication (`auth_verdict = 'verified'`, already recorded) or when its owner entered a code sent to it. A Telegram user is verified by Telegram. A site user is verified when the site's backend signs their ID and email with the Widget's identity secret. A verified Identity that already belongs to a Contact puts the new Conversation on that Contact.
- **Unverified claims only suggest.** A name or email typed into a Widget is shown and stored, and if it matches another Contact the team sees "looks like the same person". A Member or an Agent merges; the merge is audited and can be undone, because it records which Identities moved.
- **Joining is for the team, never for the outside.** In a Widget, a Visitor sees only Conversations of Identities they have proven themselves: their browser, and an email or site account they verified. A merge the team made never shows a Visitor another Identity's history. This is the rule that access is never granted by email matching.

## Contacts and Companies are our tables, extended the way Tasks are

- **`customer_contacts`** holds the fixed core: name, avatar, owner (a Member, human or Agent), first and last seen, last contacted, and the Space. Email, phone and the rest are its Identities, so they are never stored twice.
- **`customer_companies`** holds name, domains, owner and the Space. **`customer_contact_companies`** links Contacts to Companies with a title and whether it is current, so a person can move between companies and keep their history. A verified email on a Company's domain links its Contact to that Company; free mail providers never do.
- **Extended by the primitives Tasks use:** labels per Space, attachments, an owner, a hidden discussion channel for talk about one Contact or Company, and `data_references` gaining `contact` and `company`, so Items, Tasks and Agent tools link to them and show backlinks. A Task about Vasya is an ordinary Task that references his Contact.
- **Custom fields** use Data's design: `customer_fields` per Space maps a name and a type onto bounded typed slots on `customer_contacts` and `customer_companies`, so they can be filtered and sorted. Views over Contacts and Companies use the same configuration shape as Database Views.

## A Widget, and the website script

- **Creating one.** A Member with Manage customers names the Widget and lists its **sites**: exact origins such as `https://example.com`, wildcards only for subdomains of a listed domain. The Server answers with the **embed code**: `<script src="https://<server address>/widget/<public id>.js" async></script>`. The public ID is random and is not the channel ID. Changing the sites never changes the code.
- **A frame that is not the Client.** The loader draws the button in a Shadow DOM and opens a frame at `/widget/<public id>/frame`, a standalone page like the Portal guest page: no Server cookies, no Client code, its own CSP with `frame-ancestors` set to the Widget's sites. The Client keeps `frame-ancestors 'self'`. The site's scripts cannot read the Visitor's token or messages, and its styles cannot break the chat.
- **The Visitor's credential.** On first contact the frame gets a random token, stored hashed on the browser Identity. It opens that Visitor's own Conversations on that Widget and nothing else, is never a session and cannot be used on any other route. Widget routes are `unscoped` in the route policy, check the Origin against the sites first, are rate-limited per Visitor and per IP, and may require Turnstile before a first message.
- **Live updates.** A Visitor's socket never joins a channel's Durable Object, whose sockets carry Member events. A `CustomerWidget` Durable Object per Widget holds Visitor sockets tagged by Conversation, and the Server forwards to it only messages with a delivery row. Until it is built, the frame polls: every few seconds while the chat is open, every 30 seconds while it is closed, and the team's open Conversation polls too.
- **The same script will carry site analytics:** page views, events and goals under the browser Identity, so what Vasya did before writing is on his Contact and funnels count Contacts. Where those events are stored is its own decision: D1 is not built for an event stream, and Workers Analytics Engine aggregates well but does not keep one person's timeline.

## Agents

- A Source may name one Agent of its Space as its **first line**. A message from outside in a Conversation with no human assignee starts a Run there as if the Agent had been mentioned, and its reply goes out through the Source.
- The Agent hands over with a tool that sets the Conversation `waiting` and puts it in the team's Inbox. A Member who replies takes it over, and the Agent stops answering there until it is handed back.
- External email from an Agent needs human approval today. For a Source with a first-line Agent the Owner gives that approval once, for that Agent on that Source; without it every Agent reply waits for a person, as now. Someone outside is typing into the Run, so the Agent's Role should be narrow, and the Source settings say so.

## No price of its own

Customers is part of the Server. Nothing is priced per Source, operator seat, Conversation, Contact or Company. Space quotas may cap Conversations per month as they cap emails.

## Consequences

- **In the schema from the start.** Nothing was released before Customers, so the schema starts again at a `server-v2` baseline that holds it; no migration moves mail. Later stages rewrite that baseline until it is released.
- **What the first release holds:** `channels.section` and the type `conversation` (with checks that require `parent_id` and forbid `parent_message_id` for it); `customer_sources`, `customer_conversations` (with the `identity_id` a Visitor reads by), `customer_identities` (kinds `email` and `browser`), `customer_contacts`, `customer_companies`, `customer_contact_companies`, `customer_fields`, `customer_labels`, `customer_widgets`, `customer_visitors`, `customer_widget_messages`; the synthetic `customer-visitor` user.
- **New permissions:** read, reply and manage customers, also as MCP scopes, so Agents and MCP clients can work the queue and the Contacts.
- **Inbox.** Unassigned and `waiting` Conversations in Sources a Member answers, and those assigned to them, join the Inbox, replacing unread mail.
- **Contacts outlive Sources.** Deleting a Source removes its Conversations, never its Contacts or Companies.
- **Privacy.** A Contact holds IP-derived country, browser and pages for Widget Identities. The Widget frame says so in a line the Owner can edit, and deleting a Contact deletes its Identities, Conversations and events.
- **Not settled here:** files from Visitors (size, types, scanning), typing and seen indicators, the Widget in the native apps, the event store, and each later Source kind.

## Stages

1. **This design and the product language.**
2. **Engine (built).** `channels.section` and Chat reading only its own, the `conversation` type, Mail on it with every email in its Conversation's channel, `customer_sources`, `customer_conversations`, `customer_identities` and `customer_contacts`, Identities and Contacts from everyone who writes or is written to, and the Customers section with Contacts and the Mailboxes view. A trigger makes every Mailbox a Source in Customers. Mail's folders read a Conversation's status: Inbox is open or waiting, Archive is resolved. Until Customers has its own permissions, a Member sees the Contacts of a Space where they hold a Mailbox grant, and the Conversations of those Mailboxes only. Not yet: assignees and `waiting` in the interface, Companies, merging, labels and custom fields.
3. **Widget (built, polling).** A Widget is a private channel with a `customer_widgets` row (public ID, sites, greeting, on or off); a trigger makes it a Source in Customers. The Owner or Manage server creates and changes it and chooses who answers: its channel members, the creator and the Owner from the start. Widget members see its Conversations, Contacts and Companies without a Mailbox. The loader (`/widget/<public id>.js`, cached five minutes) draws the button in a closed Shadow DOM and opens `/widget/<public id>/frame`, a standalone page whose policy names the sites in `frame-ancestors` and talks only to its own Server. A Visitor's first message starts a session (`POST /widget/<public id>/session`): a random token, kept by the Server as a SHA-256 in `customer_visitors`, a `browser` Identity and a Contact of its own. The JSON routes under `/widget/<public id>/` sit outside `/api`, read only `Authorization: Bearer`, never a Server session, answer 404 for an unknown or disabled Widget, and are limited per Visitor and per address through `RATE_LIMIT_DO`. A Visitor reads only messages with a `customer_widget_messages` row in Conversations of their own Identity (`customer_conversations.identity_id`), so notes, other Visitors and joins the team made never reach them. A typed name and email are claims on the Visitor, never an `email` Identity. In Customers each Widget lists its Conversations by status, with replies, notes, status and assignee (`PATCH /api/customers/conversations/<id>` serves both kinds). A new message goes into the Visitor's latest open, waiting or Spam Conversation; after one is resolved or put in Trash, a new one starts. Not yet: the `CustomerWidget` Durable Object and live updates, Turnstile before a first session (the seam is `requireWidgetHuman`), Inbox entries and notifications for Widget Conversations, files from Visitors, verifying a typed email by a code, the site's identity secret, an editable privacy line, typing and seen indicators, and the Widget's own look.
4. **Contacts and Companies (partly built).** Built: renaming a Contact and giving it an owner; joining one Contact into another (its Identities, Conversations and Companies move, and the audit row lists what moved); Companies with their email domains (`customer_companies`, `customer_company_domains`, never a free mail provider), a Contact's place in a Company with a title and whether it is current (`customer_contact_companies`), and verified addresses on a Company's domain joining it on their own. Changing Contacts and Companies takes a Mailbox the Member can send from in that Space. Not yet: undoing a join from the audit row, suggestions that two Contacts look alike, labels, references, custom fields and views.
5. **First line.** Agents on a Source, hand-over, the one-time approval for email.
6. **More Sources and analytics:** Telegram, forms, site events and goals.
