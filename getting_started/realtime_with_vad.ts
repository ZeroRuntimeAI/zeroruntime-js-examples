// realtime_basic.ts with two things in front of the model: VAD and denoise.
// A realtime model hears the caller directly, so anything that shapes that
// audio has to sit in the pipeline -- SileroVAD marks where speech starts and
// stops, which is what sharpens time to first byte (TTFB), and AICousticsDenoise
// cleans the inbound stream before either of them sees it.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room } from '@zeroruntime/js-sdk';
import { AICousticsDenoise } from '@zeroruntime/js-sdk/inference';
import { GeminiRealtime, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const AGENT_ID = process.env.AGENT_ID ?? 'realtime-basic-with-vad';

class MyVoiceAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a helpful voice assistant that can answer questions and help with tasks.',
      agent_id: AGENT_ID,
      pipeline: Pipeline({
        llm: GeminiRealtime({
          model: 'gemini-3.1-flash-live-preview',
          config: {
            voice: 'Leda',
            response_modalities: ['AUDIO'],
          },
        }),
        vad: SileroVAD(),
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

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Realtime Basic Vad', playground: true }),
  });
}

await zeroruntime.serve(MyVoiceAgent, { on_ready });
