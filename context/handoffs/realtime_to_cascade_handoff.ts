// The mirror of cascade_to_realtime_handoff.ts: a live call moving from a
// realtime model back to stt/llm/tts, to buy back a specific voice, a specialist
// STT or a cheaper model. Same two traps -- detached, and idempotent.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, function_tool, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GeminiLiveConfig, GeminiRealtime, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('realtime_to_cascade_handoff');

const AGENT_ID = process.env.AGENT_ID ?? 'realtime-support';

/** The whole pipeline. Every slot named -- omitting one empties it. */
function make_cascade_pipeline(): Pipeline {
  return Pipeline({
    stt: DeepgramSTT({ model: 'nova-2' }),
    llm: GoogleLLM({ model: 'gemini-2.5-flash' }),
    tts: CartesiaTTS(),
    vad: SileroVAD(),
    turn_detector: TurnDetector(),
  });
}

class RealtimeSupportAgent extends Agent {
  private _switched = false;
  private _switch_task: Promise<void> | null = null;

  constructor() {
    super({
      instructions:
        'You are a support agent. If the caller asks for a different voice, or ' +
        'for a cheaper or more configurable mode, call switch_to_cascade.',
      agent_id: AGENT_ID,
      pipeline: Pipeline({
        realtime: GeminiRealtime({
          model: 'gemini-3.1-flash-live-preview',
          config: GeminiLiveConfig({ voice: 'Leda', response_modalities: ['AUDIO'] }),
        }),
      }),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say("Hi, you've reached support. How can I help?");
  }

  async on_exit(): Promise<void> {
    logger.info(`call finished (cascade=${this._switched})`);
  }

  switch_to_cascade = function_tool({
    name: 'switch_to_cascade',
    description:
      'Switch to a cascade pipeline with a configurable voice. Call this when ' +
      'the caller asks for a different voice, or for a cheaper or more ' +
      'configurable mode.',
    execute: async function (this: RealtimeSupportAgent) {
      if (this._switched) {
        logger.info('already on cascade; ignoring repeat switch');
        return { status: 'already on the cascade pipeline' };
      }
      this._switched = true;

      const do_switch = async (): Promise<void> => {
        const mode = await this.session!.change_pipeline(make_cascade_pipeline());
        logger.info(`now on ${mode}`);
        await this.session!.say("Done -- I've switched. I still have our whole conversation.");
      };

      this._switch_task = do_switch();
      void this._switch_task;

      return { status: 'switching to the cascade pipeline' };
    },
  });
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Realtime to Cascade', playground: true }),
  });
}

await zeroruntime.serve(RealtimeSupportAgent, { on_ready });
