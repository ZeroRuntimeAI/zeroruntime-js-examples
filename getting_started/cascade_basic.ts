// The smallest complete cascading agent: STT, LLM, TTS, VAD and turn detector.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, function_tool } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const AGENT_ID = 'cascade-basic-agent';

class VoiceAgent extends Agent {
  constructor() {
    super({
      agent_id: AGENT_ID,
      instructions:
        'You are a helpful voice assistant that can answer questions and help with tasks.',
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
    await this.session!.say('Hello, how can I help you today?');
  }

  async on_exit(): Promise<void> {
    await this.session!.say('Goodbye!');
  }

  get_weather = function_tool({
    name: 'get_weather',
    description: 'Fetch the current weather for a location.',
    parameters: {
      latitude: { type: 'string', description: 'Latitude of the location. Estimate it; do not ask.' },
      longitude: {
        type: 'string',
        description: 'Longitude of the location. Estimate it; do not ask.',
      },
    },
    execute: async ({ latitude, longitude }) => ({
      latitude,
      longitude,
      temperature_c: 28,
    }),
  });
}

async function invoke_agent(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Cascade Basic', playground: true }),
  });
}

await zeroruntime.serve(VoiceAgent, { on_ready: invoke_agent });
