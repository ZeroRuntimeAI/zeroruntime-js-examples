// Speech to speech with one model doing all of it -- the counterpart to
// cascade_basic.ts. Filling the realtime slot is what makes it a realtime
// pipeline; the mode is inferred from the components, never declared.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room } from '@zeroruntime/js-sdk';
import { GeminiLiveConfig, GeminiRealtime } from '@zeroruntime/js-sdk/plugins';

const AGENT_ID = process.env.AGENT_ID ?? 'realtime-basic';

class MyVoiceAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a helpful voice assistant that can answer questions and help with tasks.',
      agent_id: AGENT_ID,
      pipeline: Pipeline({
        realtime: GeminiRealtime({
          model: 'gemini-3.1-flash-live-preview',
          config: GeminiLiveConfig({
            voice: 'Leda',
            response_modalities: ['AUDIO'],
          }),
        }),
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
    room: Room({ name: 'Realtime Basic', playground: true }),
  });
}

await zeroruntime.serve(MyVoiceAgent, { on_ready });
