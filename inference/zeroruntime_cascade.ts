// A cascade through the ZeroRuntime inference gateway: the only difference from
// getting_started/cascade_basic.ts is the import line, and the pipeline needs
// one credential rather than one per vendor. VAD stays local -- there is no
// gateway twin.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room } from '@zeroruntime/js-sdk';
import {
  AICousticsDenoise,
  CartesiaTTS,
  DeepgramSTT,
  GoogleLLM,
  TurnDetector,
} from '@zeroruntime/js-sdk/inference';
import { SileroVAD } from '@zeroruntime/js-sdk/plugins';

const AGENT_ID = 'zeroruntime-cascade-inference-agent';

class VoiceAgent extends Agent {
  constructor() {
    super({
      agent_id: AGENT_ID,
      instructions:
        'You are a helpful voice assistant that can answer questions and help with tasks.',
      pipeline: Pipeline({
        stt: DeepgramSTT({ model: 'nova-2' }),
        llm: GoogleLLM(),
        tts: CartesiaTTS(),
        vad: SileroVAD(),
        turn_detector: TurnDetector(),
        denoise: AICousticsDenoise({ model_id: 'quail-vf-2.2-l-16khz' }),
      }),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say('Hello, how can I help you today?');
  }

  async on_exit(): Promise<void> {
    await this.session!.say('Goodbye!');
  }
}

async function invoke_agent(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'ZeroRuntime Cascade Inference', playground: true }),
  });
}

await zeroruntime.serve(VoiceAgent, { on_ready: invoke_agent });
