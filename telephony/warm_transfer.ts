// Handing a live call to a human, having first briefed them on it.
//
// The agent puts the caller on hold, dials a supervisor into a second room,
// reads them a summary of the call so far, and only then bridges the two.
//
// Requires a live SIP leg: warm transfer reads the caller's SIP call id off the
// room, so a playground-only session cannot reach the first phase. Start this,
// note the room id it prints, and point an inbound call at that room (or place
// an outbound one) before asking for a supervisor.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import {
  Agent,
  Pipeline,
  Room,
  SIPDestination,
  WarmTransferConfig,
  function_tool,
} from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const AGENT_ID = 'warm-transfer';
const SUPERVISOR_JOIN_TIMEOUT = 120.0;
const BRIEFING_TIMEOUT = 180.0;
const TRANSFER_BUDGET = SUPERVISOR_JOIN_TIMEOUT + BRIEFING_TIMEOUT + 60.0;
const TOOL_TIMEOUT = Math.trunc(TRANSFER_BUDGET) + 30;

function _pipeline(): Pipeline {
  return Pipeline({
    stt: DeepgramSTT(),
    llm: GoogleLLM(),
    tts: CartesiaTTS(),
    vad: SileroVAD(),
    turn_detector: TurnDetector(),
  });
}

class CustomerServiceAgent extends Agent {
  constructor() {
    super({
      agent_id: AGENT_ID,
      instructions:
        'You are a helpful customer service agent. If the caller asks to speak ' +
        'to a manager or supervisor, or their issue needs a human, call the ' +
        'escalate_to_human tool. Do not promise a transfer before the tool has ' +
        'come back.',
      pipeline: _pipeline(),
      tool_timeout_seconds: TOOL_TIMEOUT,
    });
  }

  async on_enter(): Promise<void> {
    this.session!.on_warm_transfer(null, (payload) => this._on_transfer_phase(payload));
    await this.session!.say('Hi, how can I help you today?');

    await this.session!.play_background_audio(
      process.env.BACKGROUND_AUDIO_URL ??
        'https://cdn.zeroruntime.ai/zrt/bg-audio/bg-noise-1.ogg',
      { volume: 0.5, looping: true },
    );
  }

  async on_exit(): Promise<void> {}

  private _on_transfer_phase(payload: Record<string, any>): void {
    console.log(`[warm transfer] ${payload.phase} ${JSON.stringify(payload.data)}`);
  }

  escalate_to_human = function_tool({
    name: 'escalate_to_human',
    description: 'Escalate this call to a human supervisor with a warm transfer.',
    parameters: {
      reason: {
        type: 'string',
        description: 'Short description of why the escalation is happening.',
      },
    },
    execute: async function (this: CustomerServiceAgent, { reason }) {
      void reason;
      const routing_rule_id = process.env.WARM_TRANSFER_ROUTING_RULE_ID ?? '';
      const call_to = process.env.WARM_TRANSFER_TO ?? '';
      const call_from = process.env.WARM_TRANSFER_FROM ?? '';
      if (!(routing_rule_id && call_to && call_from)) {
        return (
          'Transfer is not configured, so I cannot reach a supervisor. ' +
          'Keep helping the caller.'
        );
      }

      const config = WarmTransferConfig({
        destination: SIPDestination({
          routing_rule_id,
          sip_call_to: call_to,
          sip_call_from: call_from,
        }),
        summary_llm: GoogleLLM(),
        briefing_pipeline: _pipeline(),
        supervisor_join_timeout: SUPERVISOR_JOIN_TIMEOUT,
        briefing_timeout: BRIEFING_TIMEOUT,
      });

      const result = await this.session!.warm_transfer(config, { timeout: TRANSFER_BUDGET });
      if (result.success) return 'Connected to a supervisor.';
      console.log(`[warm transfer] failed at ${result.phase}: ${result.error}`);
      return (
        "I couldn't reach a supervisor right now. " +
        'Let me keep helping you in the meantime.'
      );
    },
  });
}

async function invoke_agent(): Promise<void> {
  const started = await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Warm Transfer Demo', playground: true }),
  });
  console.log(`room_id=${started.room_id} -- point a SIP call at this room`);
}

await zeroruntime.serve(CustomerServiceAgent, {
  // on_ready: invoke_agent,
  room: Room({ recording: true, background_audio: true }),
});
