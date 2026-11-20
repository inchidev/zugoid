---
title: Customers
description: Keep everyone your team talks to outside the Server in one place, with Contacts, Companies, a chat on your website, a Telegram bot and all their conversations.
order: 3
---

**Customers** is the section for the people outside your Server: customers, partners, leads. Messages reach it from **Sources**. Today a Source is a [Mailbox](mail.md), a **Widget** (a chat on your website) or a **Telegram bot**.

Customers never mixes with Chat. A conversation with a customer is not a channel in Chat, does not count as unread there and never turns up in Chat search or notifications.

## Contacts

Everyone who writes to a Mailbox, a Widget or a Telegram bot, and everyone you email from a Mailbox, becomes a **Contact**. A Contact is one person with every address they wrote from and all their conversations, whichever Mailbox they came through.

- An email address counts as **verified** when the mail from it passed the sender checks of the receiving mail service. Mail that failed them still arrives, but it never verifies an address.
- A Contact you emailed first is named by its address until that person writes back with a name.
- **Rename** a Contact with the pencil next to its name.
- **Join into…** moves a Contact's addresses, conversations and companies into another Contact in the same Space, for when one person wrote from two addresses. The join is recorded in the audit log. Nobody outside the Server ever sees that two Contacts were joined.

## Chat on your website

A **Widget** puts a chat button on your website. Visitors write without an account, and you answer them in Customers.

1. In Customers, press **+** next to **Widgets**, give the Widget a name and list your **sites**: exact addresses such as `https://example.com`, or `https://*.example.com` for all its subdomains. Creating a Widget takes the Owner or **Manage server**.
2. Copy the **embed code** from the Widget's **Settings** and add it to your site before `</body>`:

   ```html
   <script src="https://your-server.example/widget/…" async></script>
   ```

   The line stays the same when you change the sites later. On a site you did not list, the chat does not appear.
3. In **Settings**, choose **Who answers**: the Members who see the Widget's conversations and reply. Its creator and the Owner answer it from the start. There you also change the greeting a visitor reads first, and turn the chat off.

Each visitor becomes a Contact named "Visitor" with a number, or the name they typed. An email address a visitor types is shown as **not verified**: it never joins them to a Contact with that address. Join them yourself with **Join into…** if they are the same person; the visitor never learns about it and still sees only their own chat.

A Widget's conversations are listed by status: **Open**, **Waiting**, **Resolved**, **Spam** and **Trash**. In a conversation:

- **Reply** reaches the visitor. **Internal note** stays with the team and never reaches them. The conversation works like a channel in Chat: attach pictures, record a voice message, react, and mention a teammate in a note.
- Set the **status** and the **assignee**, a Member of the Space. A visitor who writes again reopens a Waiting conversation; after you resolve one, their next message starts a new conversation. A conversation in Spam stays there quietly.

Visitors can send pictures and voice messages too. What a visitor writes appears in an open conversation at once; the visitor's side refreshes every few seconds. A reply or a visitor's message can't be edited or deleted once it was sent: the other side already has it. Notifications for new chat messages and an Agent answering first are coming.

## Telegram

Connect a **Telegram bot**, and people who write to it in Telegram reach you in Customers.

1. In Telegram, open **@BotFather**, send `/newbot` and follow its steps. It gives you a token like `123456789:AA…`.
2. In Customers, press **+** next to **Telegram** and paste the token. Connecting a bot takes the Owner or **Manage server**. The token is kept encrypted on your Server.
3. Choose how your Server gets new messages:
   - **Telegram calls this Server**: instant, for a Server at a public `https` address.
   - **This Server asks Telegram**: for a Server Telegram cannot reach, such as one on a local network.
4. In the bot's **Settings**, choose **Who answers** and write the greeting someone gets after pressing **Start**.

Everyone who writes to the bot becomes a Contact named as in Telegram, and Telegram itself confirms who they are. Text, pictures, voice messages, videos and round video messages come through. Your replies arrive in the same Telegram chat as messages from the bot, with pictures and voice messages you record. A reply Telegram did not take is marked **Not delivered**, and the bot's settings show what Telegram said.

If your Server cannot reach `api.telegram.org`, set **Bot API address** in the bot's settings to your own [Bot API server](https://github.com/tdlib/telegram-bot-api) or a proxy to it. The bot answers private chats; groups are not supported yet.

## Companies

A **Company** is an organization your Contacts work in. Give it its email domains, such as `example.com`, and every Contact with a verified address on one of them joins it on their own, now and later. Free mail providers such as Gmail cannot be a Company's domain.

On a Contact you can also add it to a Company yourself, mark that the person has left, or remove the Company. A Contact who left keeps the Company in their history.

## Who sees what

You see the Contacts and Companies of a Space where you can read a Mailbox or answer a Widget or a Telegram bot, and only the conversations of those Sources. Renaming, joining and Companies need a Mailbox you can send from, or a Widget or bot you answer, in that Space. Mailbox access is set in **Server settings → Mail**; see [Mail](mail.md#who-can-use-a-mailbox).
