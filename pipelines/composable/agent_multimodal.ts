// Voice in, voice out -- the full cascade shape, and the map for the other three
// composable pipelines. Which slots you fill decides what the agent can do; the
// mode is inferred from them, never declared.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const AGENT_ID = process.env.AGENT_ID ?? 'multimodal-agent';

class MultimodalAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a helpful voice assistant that can answer questions and help with tasks.',
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
    await this.session!.say('Hello, how can I help you today?');
  }

  async on_exit(): Promise<void> {
    await this.session!.say('Goodbye!');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Multimodal Agent', playground: true }),
  });
}

await zeroruntime.serve(MultimodalAgent, { on_ready });
