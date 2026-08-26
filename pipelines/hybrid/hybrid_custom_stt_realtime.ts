// Your own transcriber on the input, a realtime model behind it. Worth doing
// when the model transcribes your callers' language badly. The vad is required
// once transcription is external -- something has to close the turn.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room } from '@zeroruntime/js-sdk';
import { GeminiRealtime, SarvamAISTT, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const AGENT_ID = process.env.AGENT_ID ?? 'hybrid-stt-agent';

class AdditionalSTTAndRealtime extends Agent {
  constructor() {
    super({
      instructions:
        'You are a helpful voice assistant that can answer questions and help with tasks.',
      agent_id: AGENT_ID,
      pipeline: Pipeline({
        realtime: GeminiRealtime({
          model: 'gemini-3.1-flash-live-preview',
          config: { voice: 'Leda', response_modalities: ['AUDIO'] },
        }),
        stt: SarvamAISTT(),
        vad: SileroVAD(),
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
    room: Room({ name: 'Hybrid STT', playground: true }),
  });
}

await zeroruntime.serve(AdditionalSTTAndRealtime, { on_ready });
