// The agent ends the call itself: an end_call function tool the model invokes
// when the caller asks to hang up.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, function_tool } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const AGENT_ID = 'ag_rymsiuLocal';

const sleep = (seconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000));

class VoiceAgent extends Agent {
  constructor() {
    super({
      agent_id: AGENT_ID,
      instructions:
        'You are a helpful voice assistant that can answer questions. When the ' +
        'user asks to hang up, end the call, or stop the conversation, call the ' +
        'end_call function tool.',
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

  end_call = function_tool({
    name: 'end_call',
    description: 'End the call when the user asks to hang up or says goodbye.',
    execute: async function (this: VoiceAgent) {
      // Detached: the hangup tears down the turn this tool is answering, so
      // awaiting it here would never return a result to the model.
      void this._announce_and_hangup();
      return { status: 'ending_call' };
    },
  });

  private async _announce_and_hangup(): Promise<void> {
    await this.session!.interrupt();
    await sleep(1);
    const handle = await this.session!.say('I am ending the call now.', {
      interruptible: false,
    });
    await handle.wait();
    await this.hangup('agent ended the call', 'Goodbye!');
  }
}

async function invoke_agent(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Agent Hangup', playground: true }),
  });
}

await zeroruntime.serve(VoiceAgent, { on_ready: invoke_agent });
