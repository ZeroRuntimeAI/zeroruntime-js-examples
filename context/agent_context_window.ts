// Bounding a long call's context: ContextWindow summarises or truncates the
// older part of the conversation before each LLM turn and keeps recent turns
// verbatim. System messages, handoffs and config updates always survive.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, ContextWindow, Pipeline, Room, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('agent_context_window');

const AGENT_ID = process.env.AGENT_ID ?? 'context-window';

const pipeline = Pipeline({
  stt: DeepgramSTT({ model: 'nova-2' }),
  llm: GoogleLLM({ model: 'gemini-2.5-flash' }),
  tts: CartesiaTTS(),
  vad: SileroVAD(),
  turn_detector: TurnDetector(),
  context_window: ContextWindow({
    max_tokens: 1500,
    keep_recent_turns: 4,
    summary_llm: GoogleLLM({ model: 'gemini-2.5-flash' }),
  }),
});

/** Worth watching here: compaction costs a model call on the turn it fires. */
pipeline.metrics.on('llm', (data: Record<string, unknown>) => {
  logger.info(`llm ${JSON.stringify(data)}`);
});

class LongCallAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a patient support agent. The caller may talk for a long time. ' +
        'Refer back to what they told you earlier.',
      agent_id: AGENT_ID,
      pipeline,
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say('Hello! Tell me what is going on, in as much detail as you like.');
  }

  async on_exit(): Promise<void> {
    const history = await this.session!.get_context_history();
    logger.info(`conversation ended with ${history.length} items in context`);
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Context Window', playground: true }),
  });
}

await zeroruntime.serve(LongCallAgent, { on_ready });
