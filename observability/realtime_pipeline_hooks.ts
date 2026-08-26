// The turn lifecycle of a realtime call, through the same observation hooks a
// cascade pipeline reports. Handlers run in this process and their return value
// is discarded, so a slow one cannot stall a call.

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, get_logger } from '@zeroruntime/js-sdk';
import { GeminiRealtime } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('realtime_pipeline_hooks');

const AGENT_ID = process.env.AGENT_ID ?? 'realtime-hooks-agent';

const pipeline = Pipeline({
  realtime: GeminiRealtime({
    model: 'gemini-3.1-flash-live-preview',
    config: { voice: 'Leda', response_modalities: ['AUDIO'] },
  }),
});

pipeline.on('user_turn_start', async (transcript: string) => {
  logger.info(`[USER TURN START] ${transcript}`);
});

pipeline.on('user_turn_end', async () => {
  logger.info('[USER TURN END]');
});

pipeline.on('agent_turn_start', async () => {
  logger.info('[AGENT TURN START]');
});

pipeline.on('agent_turn_end', async () => {
  logger.info('[AGENT TURN END]');
});

/**
 * The answer as text, even though the model is speaking it.
 *
 * A realtime model produces audio; this is the transcript of what it said.
 * Useful for logging a call whose audio you are not keeping.
 */
pipeline.on('llm', async (data: Record<string, any>) => {
  const text = data?.text ?? '';
  if (text) logger.info(`agent said: ${text}`);
});

class MyVoiceAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a helpful voice assistant that can answer questions and help with tasks.',
      agent_id: AGENT_ID,
      pipeline,
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
    room: Room({ name: 'Realtime Pipeline Hooks', playground: true }),
  });
}

await zeroruntime.serve(MyVoiceAgent, { on_ready });
