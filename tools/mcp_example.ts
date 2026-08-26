// Giving the agent tools from an MCP server. The connection is made here, in
// your process -- a stdio server needs your files and credentials -- and the
// discovered tools travel like any other.

import 'dotenv/config';

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, MCPServerStdio, Pipeline, Room, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('mcp_example');

const AGENT_ID = process.env.AGENT_ID ?? 'mcp-agent';

const here = dirname(fileURLToPath(import.meta.url));
const MCP_SERVER = resolve(
  process.env.MCP_SERVER ?? join(here, 'mcp_servers', 'current_time.ts'),
);

class MCPAgent extends Agent {
  constructor() {
    if (!existsSync(MCP_SERVER)) {
      throw new Error(`no MCP server at ${MCP_SERVER}. Set MCP_SERVER to one you have.`);
    }

    super({
      instructions:
        'You are a helpful voice assistant that can answer questions and help ' +
        'with tasks. You have tools available -- use them rather than guessing.',
      agent_id: AGENT_ID,
      pipeline: Pipeline({
        stt: DeepgramSTT({ model: 'nova-2' }),
        llm: GoogleLLM({ model: 'gemini-2.5-flash' }),
        tts: CartesiaTTS(),
        vad: SileroVAD(),
        turn_detector: TurnDetector(),
      }),
      mcp_servers: [
        MCPServerStdio({
          // `npx tsx` so the server runs straight from TypeScript source,
          // with no build step in between.
          executable_path: 'npx',
          process_arguments: ['tsx', MCP_SERVER],
          session_timeout: 30,
        }),
      ],
    });
  }

  async on_enter(): Promise<void> {
    const names = this.tools.map((tool) => tool._tool_info.name);
    logger.info(`${names.length} tool(s) available: ${names.join(', ')}`);

    await this.session!.say('Hello, how can I help you today?');
  }

  async on_exit(): Promise<void> {
    await this.session!.say('Goodbye!');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'MCP Agent', playground: true }),
  });
}

await zeroruntime.serve(MCPAgent, { on_ready });
