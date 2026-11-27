---
title: Models and Providers
description: Connect OpenRouter, Claude, Google Gemini, ChatGPT or Workers AI to your Zugoid Server, choose a default model and assign models to AI functions.
order: 2
---

Agents need a model to reply. You connect model **Providers** in **Server settings → Models**. API keys are stored on your Server, encrypted with its `AUTH_SECRET`, and are never shown to Members or sent to the browser.

The Owner manages Server Providers and defaults. Members with **Use agents** see the same page but can only connect their own ChatGPT plan; they see which models are available, never the credentials.

## Supported Providers

| Provider | How it connects | Who can add it |
| --- | --- | --- |
| OpenRouter | API key. Hundreds of models with one key. | Owner |
| Claude | Anthropic API key. | Owner |
| Google Gemini | Google AI Studio API key. | Owner |
| ChatGPT / Codex | **Continue with ChatGPT** sign-in with your ChatGPT plan. | Owner, or any Member with **Use agents** for their own plan |
| Workers AI | Comes with a Cloudflare Server's deployment, billed to its Cloudflare account. | Listed automatically; the Owner can turn it off |

Claude Pro or Max subscriptions cannot be used: the Claude Provider needs an Anthropic API key.

## Add an API key Provider

1. Open **Server settings → Models**. The Owner sees the **Providers** and **Defaults** tabs.
2. Select **Add provider** and choose **OpenRouter**, **Claude** or **Google Gemini**.
3. Optionally change the **Connection name**, for example to tell a work account from a personal one. You can add several connections of the same Provider.
4. Paste the **API key**.
5. In **Models**, use **Add a model…** to pick models from the Provider's catalog. Each model shows what it accepts (text, images, audio, video, files) and whether it reasons.
6. Keep **Available to agents** on and select **Save**.

![The Add provider form in Server settings → Models with the OpenRouter, Claude and ChatGPT / Codex cards, the API key field and the Models picker](screenshot:agents-add-provider "Add a model Provider")

To change a key later, open the connection and paste a new one. Leaving **API key** empty keeps the saved key. **Remove connection** deletes it.

Models listed for a connection appear in Agent and conversation model pickers. Models without tool support are offered to AI functions only.

> [!TIP]
> Models chosen before Zugoid recorded model capabilities may show none. Open the Provider and select **Save** once to refresh them.

### Context window and answer limit

Each chosen model shows the context window and answer limit an Agent's Run will use, and where each comes from: **reported by the provider**, **set by you**, **from Pi's catalog** or **default** (128,000 and 8,192 tokens). A Run uses at most 200,000 tokens of window and 32,000 for an answer, and at most a quarter of the window for an answer.

When the provider did not report a limit, for example for a private model, select **Set limits** beside it and enter the window or answer limit in tokens, then **Save**. What a provider reported is always used as reported. The model that comes with the deployment, an OpenAI-compatible endpoint set by the operator, has the same **Set limits** under its entry at the top of the list; those figures apply only while the deployment uses that model.

### Exa web search

An Exa key is the other way to search. Enter it in **Server settings → Integrations → Web search**. It takes precedence over OpenRouter.

### OpenRouter web search

An OpenRouter connection has a **Web search** switch. It lets Agents with **Research the web** search through OpenRouter. Additional OpenRouter charges apply. To use it, assign a model that supports tool calls to the **Web search** AI function (see below). If a previously assigned model is marked **Unavailable**, choose one that supports tool calls.

### X Search

In **Server settings → Integrations → X Search**, the Owner can save an xAI API key. With **Research the web** for both the Agent and the person asking, an Agent on any supported model can search public X posts and threads. Ask for a topic, an account, a date range or a particular post. The Agent gets source links with the results. xAI bills the account that owns the key for the search.

## Connect ChatGPT

ChatGPT uses your ChatGPT plan instead of an API key.

1. In **Server settings → Models**, select **Add provider** (Owner) or **Connect ChatGPT** (Members), and choose **ChatGPT / Codex**.
2. Select **Continue with ChatGPT** and approve in the ChatGPT tab that opens.
3. ChatGPT then opens a page at an address starting with `http://127.0.0.1:1455` that cannot load. That is expected: OpenAI returns the sign-in only to your own computer. Copy that page's full address.
4. Paste it into Zugoid and select **Finish connecting**. The address works once and expires in 10 minutes.

When Zugoid runs on your own computer at `localhost` or `127.0.0.1`, the sign-in finishes on its own and you do not need to paste anything.

By default, a ChatGPT connection serves only the person who connected it. To let others use it, the person who connected it turns on **Share with everyone on this Server**. Every Member's Agents and AI functions can then use that plan, and their requests count against its limits. Only the person who connected it can change this.

Connecting ChatGPT does not sign anyone in to Zugoid or grant membership. Removing the connection stops its use in Zugoid and tries to revoke the sign-in. If Zugoid says remote revocation was not confirmed, disconnect Zugoid in your ChatGPT settings.

## Workers AI

On a Cloudflare Server, Workers AI appears at the top of the Providers list as **Included with this Server**. It cannot be removed here. Open it to turn **Available to agents** off or choose which models appear in model pickers.

## Choose a default model

Connecting a Provider never selects a default. Without a default, each Agent needs its own model.

1. Open **Server settings → Models → Defaults**.
2. Under **Model defaults**, choose a **Default model**, or **No default model**.

An Agent's own model overrides the default, and a conversation's model picker overrides both. If a chosen model is disabled or unavailable, Runs fail with an explanation; Zugoid never silently switches to another model.

## AI functions

AI functions are small Server jobs that use a model directly, without an Agent. Assign them in **Server settings → Models → Defaults → AI functions**. All start **Disabled**, and none inherits the default model.

| Function | What it does |
| --- | --- |
| Help with Apps | Drafts Apps from Database Views. Apps are paused in this release. |
| Thread titles | Names new Threads from their first message. Existing titles stay. |
| Web search | Search for Agents. Choose a model that supports tool calls on an OpenRouter connection with **Web search** enabled. An Exa key under **Server settings → Integrations** takes precedence. |
| Images | Draws pictures an Agent asks for while it works in a Task's box, such as the art of a game, and saves each as a file in its checkout. Needs an OpenRouter model that outputs images. Without one, Agents use the Avatars model, or else Nano Banana on the Server's OpenRouter connection. |
| Avatars | Draws profile pictures for Members and Agents. Needs an OpenRouter model that outputs images, such as Nano Banana. |
| YouTube videos | Lets Agents with **Research the web** analyze public YouTube links. Choose a video-capable model on a direct Google Gemini connection. |
| Image descriptions | Describes attached images for Agents whose model cannot see them. |
| Voice transcription | Turns voice messages into text for Agents. |

Each function lists only models that can do the job. Descriptions and transcripts reach the Agent marked as untrusted data. AI function calls are limited to 20 per Member per minute.

Personal ChatGPT connections that are not shared serve only their owner's requests; other Members see them as unavailable.

### Generate avatars

With **Avatars** assigned, profile and Agent settings show **Generate**. Describe the picture, optionally add up to three reference images, and keep **Zugoid style** for a toy-like black-and-white character shaped after the Zugoid logo. Preview it, then select **Use this picture**.

## Watch a YouTube video

In **Server settings → Models → Defaults → AI functions**, choose a Google Gemini model for **YouTube videos**. Any Agent with **Research the web** can then analyze a public YouTube link using that connection. Grant the same permission to the Member who starts the Run.

Paste the link in an Agent conversation and say what you want from the video, such as a summary or the steps in a tutorial with timestamps. The Agent can watch clips of up to five minutes per call and request other time ranges for longer videos. Zugoid sends the video link and the Agent's question to Google. The result includes the original link and the requested time range.

## Images and voice

When a message has images attached, the Agent receives the sender's own images from that conversation if its model accepts images. If it does not, the **Image descriptions** function supplies a description instead; without either, the Agent says it cannot view them. Voice messages reach Agents as text through **Voice transcription**.

## Related

- [Agents overview](overview.md)
- [Create your first Agent](../get-started/first-agent.md)
- [Costs and limits on Cloudflare](../cloudflare/costs-and-limits.md)
