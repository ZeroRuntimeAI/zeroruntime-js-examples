# Human in the loop

An agent that asks a person when it must not guess. `ask_human` is an ordinary
MCP tool, but its server posts the question into a Discord thread and blocks
until somebody replies.

Run `customer_agent.ts`. It spawns `discord_mcp_server.ts` itself — you never
start the server directly.

## Install

The MCP client ships with `@zeroruntime/js-sdk`. The Discord server is this example's
own, so its library is an optional dependency of this repo:

```bash
npm install discord.js
```

## Create the Discord bot

1. Open the [Discord Developer Portal](https://discord.com/developers/applications)
   and create a new application.
2. **Bot** tab → reset the token and copy it. This is `DISCORD_TOKEN`.
3. Still on the **Bot** tab, under *Privileged Gateway Intents*, enable
   **Message Content Intent**. Without it the bot sees empty messages and the
   agent waits out its timeout on every question.
4. **OAuth2** → *URL Generator*: tick the `bot` scope, then these permissions:
   - Send Messages
   - Create Public Threads
   - Read Message History
5. Open the generated URL and add the bot to your server.

## Find the two IDs

Turn on Discord's *Settings → Advanced → Developer Mode*, then:

- Right-click the channel escalations should land in → **Copy Channel ID** →
  `DISCORD_CHANNEL_ID`
- Right-click the person who will answer → **Copy User ID** → `DISCORD_USER_ID`

The bot mentions that user in the thread, so it has to be someone who can see
the channel.

## Environment

Add to the `.env` at the repo root, alongside `ZERORUNTIME_AUTH_TOKEN` and the
pipeline's vendor keys:

```bash
DISCORD_TOKEN=...
DISCORD_CHANNEL_ID=...
DISCORD_USER_ID=...
HUMAN_REPLY_TIMEOUT=300     # optional
```

`HUMAN_REPLY_TIMEOUT` is read twice: the agent passes it as the MCP
`session_timeout`, and the server uses it (defaulting to 240s) as how long it
waits on a reply. It has to be in minutes rather than the vendor's 5s default,
which assumes a local subprocess answers immediately — a person does not.
