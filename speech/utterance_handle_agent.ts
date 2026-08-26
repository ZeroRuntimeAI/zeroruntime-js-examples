// UtteranceHandle and interruption-aware tools: say() returns once the request
// is queued, and awaiting handle.wait() waits for the audio to drain. A tool
// checking handle.interrupted can abandon work the caller talked over.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, UtteranceHandle, function_tool, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, OpenAILLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('utterance_handle_agent');

const AGENT_ID = 'utterance-handle-agent';

const sleep = (seconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000));

/** A voice agent demonstrating UtteranceHandle and interruption-aware tools. */
class VoiceAgent extends Agent {
  constructor() {
    super({
      agent_id: AGENT_ID,
      instructions:
        'You are a helpful voice assistant. You can answer questions and fetch ' +
        "weather information using the 'get_weather' tool. You can also perform " +
        "a long-running task using the 'long_running_task' tool.",
      pipeline: Pipeline({
        stt: DeepgramSTT(),
        llm: OpenAILLM(),
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
    description:
      'Fetch the current weather for a location. Supports interruption: if the ' +
      'caller starts speaking while the agent is responding, the work is ' +
      'abandoned rather than spoken over.',
    parameters: {
      latitude: { type: 'string', description: 'Latitude of the location. Estimate it; do not ask.' },
      longitude: {
        type: 'string',
        description: 'Longitude of the location. Estimate it; do not ask.',
      },
    },
    execute: async function (this: VoiceAgent, { latitude, longitude }) {
      const utterance: UtteranceHandle | null = this.session!.current_utterance;
      await sleep(0.5);
      if (utterance !== null && utterance.interrupted) {
        logger.info('caller barged in; dropping the weather result');
        return { status: 'cancelled' };
      }
      return { latitude, longitude, temperature_c: 28 };
    },
  });

  long_running_task = function_tool({
    name: 'long_running_task',
    description: 'Run a task that takes a while, narrating progress.',
    execute: async function (this: VoiceAgent) {
      const first = await this.session!.say('This will take a moment.');
      await first.wait();

      for (let step = 0; step < 3; step += 1) {
        if (this.session!.current_utterance?.interrupted) {
          return { status: 'cancelled', at_step: step };
        }
        await sleep(0.5);
      }

      return { status: 'done' };
    },
  });
}

async function invoke_agent(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Utterance Handle', playground: true }),
  });
}

await zeroruntime.serve(VoiceAgent, { on_ready: invoke_agent });
