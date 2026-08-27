// Tuning the handoff between caller and agent on a cascade pipeline: EOU config
// decides when the caller has finished speaking, interruption config decides
// when a barge-in stops the agent. Also shows an uninterruptible utterance.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, EOUConfig, InterruptConfig, Pipeline, Room } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const AGENT_ID = process.env.AGENT_ID ?? 'cascade-advanced';

class VoiceAgent extends Agent {
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
        eou_config: EOUConfig({
          mode: 'ADAPTIVE',
          min_max_speech_wait_timeout: [0.5, 0.8],
        }),
        interrupt_config: InterruptConfig({
          mode: 'HYBRID',
          interrupt_min_duration: 0.2,
          interrupt_min_words: 2,
          false_interrupt_pause_duration: 2.0,
          resume_on_false_interrupt: true,
        }),
      }),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say(
      'This example script showcases advanced cascade features, including ' +
        'interruptible speech. This message cannot be interrupted.',
      { interruptible: false },
    );
  }

  async on_exit(): Promise<void> {
    await this.session!.say('Goodbye!');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Cascade Advanced', playground: true }),
  });
}

await zeroruntime.serve(VoiceAgent, { on_ready });
