// An agent that asks a human when it must not guess. ask_human is an ordinary
// MCP tool whose server waits on a person, so session_timeout has to be minutes
// rather than the vendor's 5s default meant for a local subprocess.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, MCPServerStdio, Pipeline, Room, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { AnthropicLLM, DeepgramSTT, GoogleTTS, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('customer_agent');

const AGENT_ID = process.env.AGENT_ID ?? 'customer-agent';
const SERVER = join(dirname(fileURLToPath(import.meta.url)), 'discord_mcp_server.ts');

const HUMAN_TIMEOUT = Number(process.env.HUMAN_REPLY_TIMEOUT ?? '300');

class CustomerAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a customer-facing agent. You have tools to help with ' +
        'enquiries. When the caller asks about a discount percentage, always ' +
        'use the tool to get the answer from your human supervisor -- never ' +
        'estimate one. Tell the caller you are checking before you call it, ' +
        'because the answer takes a moment.',
      agent_id: AGENT_ID,
      mcp_servers: [
        MCPServerStdio({
          executable_path: 'npx',
          process_arguments: ['tsx', SERVER],
          session_timeout: HUMAN_TIMEOUT,
        }),
      ],
      pipeline: Pipeline({
        stt: DeepgramSTT(),
        llm: AnthropicLLM(),
        tts: GoogleTTS(),
        vad: SileroVAD(),
        turn_detector: TurnDetector(),
      }),
    });
  }

  async on_enter(): Promise<void> {
    const names = this.tools.map((tool) => tool._tool_info.name);
    logger.info(`${names.length} tool(s): ${names.join(', ') || 'none'}`);
    await this.session!.say('Hello, how can I help you today?');
  }

  async on_exit(): Promise<void> {
    await this.session!.say('Goodbye!');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Customer Agent', playground: true }),
  });
}

await zeroruntime.serve(CustomerAgent, { on_ready });
