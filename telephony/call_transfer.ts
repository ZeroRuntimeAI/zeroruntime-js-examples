// Moving the caller to another number with a transfer_call function tool.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, function_tool } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const AGENT_ID = 'call-transfer-agent';

class CallTransferAgent extends Agent {
  constructor() {
    super({
      agent_id: AGENT_ID,
      instructions:
        'You are the Call Transfer Agent which helps transfer an ongoing call ' +
        'to a new number. Use the transfer_call tool to transfer.',
      pipeline: Pipeline({
        stt: DeepgramSTT(),
        llm: GoogleLLM(),
        tts: CartesiaTTS(),
        vad: SileroVAD(),
        turn_detector: TurnDetector(),
      }),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say('Hello Buddy, How can I help you today?');
  }

  async on_exit(): Promise<void> {
    await this.session!.say('Goodbye Buddy, Thank you for calling!');
  }

  transfer_call = function_tool({
    name: 'transfer_call',
    description: 'Transfer the call to the configured number.',
    execute: async function (this: CallTransferAgent) {
      const transfer_to = process.env.CALL_TRANSFER_TO ?? '';
      if (!transfer_to) return { ok: false, reason: 'CALL_TRANSFER_TO is not set' };
      try {
        const result = await this.session!.transfer_call(transfer_to);
        return { ok: true, result };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    },
  });
}

async function invoke_agent(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Call Transfer Agent', playground: true }),
  });
}

await zeroruntime.serve(CallTransferAgent, { on_ready: invoke_agent });
