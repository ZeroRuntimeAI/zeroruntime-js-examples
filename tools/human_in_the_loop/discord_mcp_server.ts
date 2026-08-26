// The MCP server behind customer_agent.ts: one stdio tool that posts the
// agent's question into a Discord thread and blocks until somebody replies.
// Standalone -- nothing here imports zeroruntime, and discord.js is imported
// inside main.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const REPLY_TIMEOUT = Number(process.env.HUMAN_REPLY_TIMEOUT ?? '240');

/** One Discord thread, and whoever is reading it. */
class DiscordHuman {
  readonly user_id: string;
  readonly channel_id: string;
  private readonly _answers: string[] = [];
  private readonly _waiters: Array<(value: string) => void> = [];
  private _client: any = null;

  constructor(user_id: string, channel_id: string) {
    this.user_id = user_id;
    this.channel_id = channel_id;
  }

  async start(token: string): Promise<void> {
    const { Client, GatewayIntentBits, Events } = await import('discord.js');

    this._client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this._client.once(Events.ClientReady, (client: any) => {
      process.stderr.write(`connected as ${client.user.tag}\n`);
    });

    this._client.on(Events.MessageCreate, (message: any) => {
      if (message.author.id === this._client.user?.id) return;
      if (message.channel.id === this.channel_id || message.channel.parentId === this.channel_id) {
        const waiter = this._waiters.shift();
        if (waiter !== undefined) waiter(message.content);
        else this._answers.push(message.content);
      }
    });

    await this._client.login(token);
  }

  /** Post the question and wait for the first human reply. */
  async ask(question: string): Promise<string> {
    const channel = this._client?.channels?.cache?.get(this.channel_id);
    if (channel === undefined || channel === null) return 'I could not reach a supervisor.';

    await channel.send(`<@${this.user_id}> ${question}`);

    const queued = this._answers.shift();
    if (queued !== undefined) return queued;

    return await new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        const index = this._waiters.indexOf(waiter);
        if (index >= 0) this._waiters.splice(index, 1);
        resolve('No supervisor replied in time.');
      }, REPLY_TIMEOUT * 1000);

      const waiter = (value: string): void => {
        clearTimeout(timer);
        resolve(value);
      };
      this._waiters.push(waiter);
    });
  }
}

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const user_id = process.env.DISCORD_USER_ID;
  const channel_id = process.env.DISCORD_CHANNEL_ID;
  if (!(token && user_id && channel_id)) {
    throw new Error('set DISCORD_TOKEN, DISCORD_USER_ID and DISCORD_CHANNEL_ID');
  }

  const human = new DiscordHuman(user_id, channel_id);
  void human.start(token);

  const server = new McpServer({ name: 'DiscordHumanServer', version: '1.0.0' });

  server.tool(
    'ask_human',
    'Ask a human supervisor a question the agent must not answer itself, such ' +
      'as a discount percentage.',
    { question: z.string() },
    async ({ question }) => {
      process.stderr.write(`asking a human: ${question}\n`);
      const answer = await human.ask(question);
      process.stderr.write(`human said: ${answer}\n`);
      return { content: [{ type: 'text' as const, text: answer }] };
    },
  );

  await server.connect(new StdioServerTransport());
}

await main();
