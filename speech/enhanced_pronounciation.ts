// Fixing how the agent pronounces things: a list of PronunciationRule
// substitutions applied in the agent process between LLM and TTS, so nothing
// crosses the wire per chunk and the turn pays nothing for them.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, PronunciationRule, Room, get_logger } from '@zeroruntime/js-sdk';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('enhanced_pronounciation');

const AGENT_ID = process.env.AGENT_ID ?? 'enhanced-pronounciation';

const RULES = [
  PronunciationRule('nginx', 'engine x'),
  PronunciationRule('URL', 'U R L'),
  PronunciationRule('API', 'A P I'),
  PronunciationRule('ZeroRuntime', 'Zero Runtime'),
  PronunciationRule('HTTP', 'H T T P'),
  PronunciationRule('HTTPS', 'H T T P S'),
  PronunciationRule('JSON', 'J SON'),
  PronunciationRule('SQL', 'sequel'),
  PronunciationRule('AWS', 'A W S'),
  PronunciationRule('CI/CD', 'C I C D'),
];

const pipeline = Pipeline({
  stt: DeepgramSTT({ model: 'nova-2' }),
  llm: GoogleLLM({ model: 'gemini-2.5-flash' }),
  tts: CartesiaTTS(),
  vad: SileroVAD(),
  pronunciations: RULES,
});

class DocsAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a developer support agent. Answer questions about APIs, HTTP, ' +
        'JSON and SQL. Keep answers short and conversational.',
      agent_id: AGENT_ID,
      pipeline,
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say('Hi! Ask me anything about the API.');
  }

  async on_exit(): Promise<void> {
    logger.info('session finished');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Pronunciation', playground: true }),
  });
}

await zeroruntime.serve(DocsAgent, { on_ready });
