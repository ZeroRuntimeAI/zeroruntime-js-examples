// Keypad input and answering-machine detection, both declared on the pipeline
// alongside the providers, with their callbacks as agent methods.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, DTMFHandler, Pipeline, Room, VoiceMailDetector } from '@zeroruntime/js-sdk';
import { TurnDetector,DeepgramSTT, CartesiaTTS, GoogleLLM } from '@zeroruntime/js-sdk/inference';
import { SileroVAD } from '@zeroruntime/js-sdk/plugins';

const AGENT_ID = 'dtmf-voicemail';

class VoiceAgent extends Agent {
  constructor() {
    super({
      agent_id: AGENT_ID,
      instructions: 'You are a helpful voice assistant that can answer questions.',
      pipeline: Pipeline({
        stt: DeepgramSTT(),
        llm: GoogleLLM(),
        tts: CartesiaTTS(),
        vad: SileroVAD(),
        turn_detector: TurnDetector(),
        dtmf_handler: DTMFHandler(),
        voice_mail_detector: VoiceMailDetector({ llm: GoogleLLM() }),
      }),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say('Hello, how can I help you today?');
  }

  async on_exit(): Promise<void> {
    await this.session!.say('Goodbye!');
  }

  /** One keypress. Fire and forget -- nothing in the pipeline waits. */
  async on_dtmf(key: string, payload: Record<string, unknown>): Promise<void> {
    console.log('DTMF message received:', key, payload);
  }

  /** Awaited, so anything said here finishes before the call ends. */
  async on_voicemail(): Promise<void> {
    console.log('Voice Mail detected, Shutting down the agent');
    await this.hangup('reached voicemail');
  }
}

async function invoke_agent(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'DTMF Voicemail', playground: true }),
  });
}

await zeroruntime.serve(VoiceAgent);
// await zeroruntime.serve(VoiceAgent, { on_ready: invoke_agent });
