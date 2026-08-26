// A realtime model reached through the ZeroRuntime gateway, with no vendor key
// -- the realtime counterpart to zeroruntime_cascade.ts. This row derives from
// its direct-to-vendor twin, so it takes exactly the twin's arguments and the
// only thing that changes is who authenticates: the gateway does, with your
// ZeroRuntime token, and the class takes no api_key.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room } from '@zeroruntime/js-sdk';
import { GeminiRealtime } from '@zeroruntime/js-sdk/inference';

const AGENT_ID = process.env.AGENT_ID ?? 'zeroruntime-realtime-inference-agent';

class MyVoiceAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a helpful voice assistant that can answer questions and help with tasks.',
      agent_id: AGENT_ID,
      pipeline: Pipeline({
        realtime: GeminiRealtime({
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          config: {
            voice: 'Puck',
            language_code: 'en-US',
            response_modalities: ['AUDIO'],
            temperature: 0.7,
          },
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
    room: Room({ name: 'ZeroRuntime Realtime Inference', playground: true }),
  });
}

await zeroruntime.serve(MyVoiceAgent, { on_ready });
