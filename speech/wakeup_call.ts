// Nudging a caller who has gone quiet: a wake_up timer on the agent, with the
// callback as a method so the handler travels with the agent that owns it.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { AnthropicLLM, DeepgramSTT, GoogleTTS, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const AGENT_ID = 'wakeup-call-agent';

class VoiceAgent extends Agent {
  constructor() {
    super({
      agent_id: AGENT_ID,
      instructions:
        'You are a helpful voice assistant that can answer questions and help ' +
        'with tasks and help with horoscopes and weather.',
      pipeline: Pipeline({
        stt: DeepgramSTT(),
        llm: AnthropicLLM(),
        tts: GoogleTTS(),
        vad: SileroVAD(),
        turn_detector: TurnDetector(),
      }),
      wake_up: 15,
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say('Hello, how can I help you today?');
  }

  async on_exit(): Promise<void> {
    await this.session!.say('Goodbye!');
  }

  async on_wake_up(): Promise<void> {
    await this.session!.say('Hello, are you there?');
  }
}

async function invoke_agent(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Wakeup Call', playground: true }),
  });
}

await zeroruntime.serve(VoiceAgent, { on_ready: invoke_agent });
