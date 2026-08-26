// A small stdio MCP server, so mcp_example.ts has something to connect to.
// Standalone: nothing here imports zeroruntime.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'CurrentTimeServer', version: '1.0.0' });

server.tool(
  'get_current_time',
  'Get the current date and time. Takes an IANA timezone name, e.g. ' +
    '"Asia/Kolkata" or "US/Pacific". Defaults to UTC.',
  { timezone: z.string().default('UTC') },
  async ({ timezone }) => {
    let formatted: string;
    try {
      formatted = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(new Date());
    } catch {
      return {
        content: [
          {
            type: 'text' as const,
            text:
              `I do not know the timezone '${timezone}'. Try an IANA name like ` +
              'Asia/Kolkata.',
          },
        ],
      };
    }

    return {
      content: [{ type: 'text' as const, text: `It is ${formatted} in ${timezone}.` }],
    };
  },
);

server.tool(
  'days_until',
  'How many days from today until a given date, as YYYY-MM-DD.',
  { date: z.string() },
  async ({ date }) => {
    const target = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(target.getTime())) {
      return {
        content: [
          { type: 'text' as const, text: `'${date}' is not a date I can read. Use YYYY-MM-DD.` },
        ],
      };
    }

    const today = new Date();
    const utc_today = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const delta = Math.round((target.getTime() - utc_today) / 86_400_000);

    let text: string;
    if (delta === 0) text = 'That is today.';
    else if (delta < 0) text = `That was ${Math.abs(delta)} day(s) ago.`;
    else text = `That is ${delta} day(s) away.`;

    return { content: [{ type: 'text' as const, text }] };
  },
);

await server.connect(new StdioServerTransport());
