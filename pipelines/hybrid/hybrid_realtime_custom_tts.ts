// A realtime model that thinks, with your own TTS on the output -- a brand
// voice, a cloned voice, or a language its built-in voices do not cover. Its
// ears are untouched, so this is still speech-to-speech on the way in.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room } from '@zeroruntime/js-sdk';
import { CartesiaTTS, GeminiLiveConfig, GeminiRealtime } from '@zeroruntime/js-sdk/plugins';

const AGENT_ID = process.env.AGENT_ID ?? 'hybrid-tts-agent';

class HybridVoiceAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a helpful voice assistant that can answer questions and help with tasks.',
      agent_id: AGENT_ID,
      pipeline: Pipeline({
        realtime: GeminiRealtime({
          model: 'gemini-3.1-flash-live-preview',
          config: GeminiLiveConfig({ voice: 'Leda', response_modalities: ['AUDIO'] }),
        }),
        tts: CartesiaTTS(),
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
    room: Room({ name: 'Hybrid TTS', playground: true }),
  });
}

await zeroruntime.serve(HybridVoiceAgent, { on_ready });
