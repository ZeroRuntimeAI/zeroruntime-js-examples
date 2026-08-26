// Switching a live call from a cascade pipeline to a realtime model. The swap
// must be detached, since it tears down the pipeline running the tool that
// called it, and idempotent, since the new pipeline still has that tool.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, function_tool, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import {
  CartesiaTTS,
  DeepgramSTT,
  GeminiRealtime,
  GoogleLLM,
  SileroVAD,
} from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('cascade_to_realtime_handoff');

const AGENT_ID = process.env.AGENT_ID ?? 'support';

/** The whole pipeline, not a patch -- realtime replaces stt/llm/tts. */
function make_realtime_pipeline(): Pipeline {
  return Pipeline({
    realtime: GeminiRealtime({
      model: 'gemini-3.1-flash-live-preview',
      config: { voice: 'Leda', response_modalities: ['AUDIO'] },
    }),
  });
}

class SupportAgent extends Agent {
  private _switched = false;
  private _switch_task: Promise<void> | null = null;

  constructor() {
    super({
      instructions:
        'You are a support agent. Answer questions about orders. If the caller ' +
        'asks for faster or more natural responses, call switch_to_realtime.',
      agent_id: AGENT_ID,
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
    await this.session!.say("Hi, you've reached support. How can I help?");
  }

  async on_exit(): Promise<void> {
    logger.info(`call finished (realtime=${this._switched})`);
  }

  lookup_order = function_tool({
    name: 'lookup_order',
    description: 'Look up the status of an order.',
    parameters: {
      order_id: { type: 'string', description: 'The order number the caller gives you.' },
    },
    execute: async ({ order_id }) => ({ order_id, status: 'shipped', eta: 'Tuesday' }),
  });

  switch_to_realtime = function_tool({
    name: 'switch_to_realtime',
    description:
      'Switch the conversation to a low-latency realtime voice model. Call this ' +
      'when the caller asks for faster or more natural responses.',
    execute: async function (this: SupportAgent) {
      if (this._switched) {
        logger.info('already on realtime; ignoring repeat switch');
        return { status: 'already on the realtime pipeline' };
      }
      this._switched = true;

      const do_switch = async (): Promise<void> => {
        const mode = await this.session!.change_pipeline(make_realtime_pipeline());
        logger.info(`now on ${mode}`);
        await this.session!.say(
          "Done -- I've switched to realtime mode. I still have our whole " +
            "conversation, so let's keep going.",
        );
      };

      // Detached: the swap tears down the pipeline running this very tool, so
      // awaiting it here would deadlock the turn that asked for it.
      this._switch_task = do_switch();
      void this._switch_task;

      return { status: 'switching to the realtime pipeline' };
    },
  });
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Cascade to Realtime', playground: true }),
  });
}

await zeroruntime.serve(SupportAgent, { on_ready });
