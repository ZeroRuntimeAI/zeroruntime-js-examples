// An agent whose tools are an n8n workflow, reached over HTTP through its MCP
// trigger node -- same tools and same wire as a stdio server, different
// transport. The pipeline is tuned for a phone caller.

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, EOUConfig, MCPServerHTTP, Pipeline, Room, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('appointment_telephony');

const AGENT_ID = process.env.AGENT_ID ?? 'appointment-agent';
const N8N_URL = process.env.N8N_MCP_URL ?? 'https://your-n8n-instance/mcp/your-trigger-id';

const INSTRUCTIONS =
  "You are a restaurant's appointment assistant, speaking on the phone. Help " +
  'the caller check, book, move or cancel a reservation. Use the tools rather ' +
  'than guessing -- you have no knowledge of the diary beyond what they ' +
  'return. Confirm the date and time back to the caller before you commit to ' +
  'anything. Keep replies short; they are spoken aloud.';

class AppointmentAgent extends Agent {
  constructor() {
    if (N8N_URL.includes('your-n8n-instance')) {
      logger.warning('set N8N_MCP_URL -- the placeholder resolves to nothing');
    }

    super({
      instructions: INSTRUCTIONS,
      agent_id: AGENT_ID,
      mcp_servers: [
        MCPServerHTTP({
          endpoint_url: N8N_URL,
          request_headers: process.env.N8N_API_KEY
            ? { Authorization: `Bearer ${process.env.N8N_API_KEY}` }
            : null,
          session_timeout: 30.0,
        }),
      ],
      pipeline: Pipeline({
        stt: DeepgramSTT({ model: 'nova-2' }),
        llm: GoogleLLM({ model: 'gemini-2.5-flash' }),
        tts: CartesiaTTS(),
        vad: SileroVAD(),
        turn_detector: TurnDetector(),
        eou: EOUConfig({ mode: 'ADAPTIVE', min_max_speech_wait_timeout: [0.6, 1.4] }),
      }),
    });
  }

  async on_enter(): Promise<void> {
    const names = this.tools.map((tool) => tool._tool_info.name);
    logger.info(`${names.length} tool(s) from the workflow: ${names.join(', ')}`);
    await this.session!.say(
      'Thanks for calling. Are you booking a table, or changing a reservation?',
    );
  }

  async on_exit(): Promise<void> {
    logger.info('call finished');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Restaurant Agent', playground: true }),
  });
}

await zeroruntime.serve(AppointmentAgent, { on_ready });
