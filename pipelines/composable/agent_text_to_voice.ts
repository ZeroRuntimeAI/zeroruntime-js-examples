// Text in, voice out -- Pipeline({ llm, tts }) infers LLM_TTS_ONLY. No STT and
// no VAD, because the input is typed rather than spoken.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import {
  Agent,
  Pipeline,
  PubSubSubscribeConfig,
  Room,
  get_logger,
} from '@zeroruntime/js-sdk';
import { CartesiaTTS, GoogleLLM } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('agent_text_to_voice');

const AGENT_ID = process.env.AGENT_ID ?? 'text-to-voice-agent';
const IN_TOPIC = 'CHAT';

const room = Room({ name: 'Text to Voice', playground: true });

class TextToVoiceAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a helpful assistant. Keep spoken answers short -- they are read aloud.',
      agent_id: AGENT_ID,
      pipeline: Pipeline({ llm: GoogleLLM(), tts: CartesiaTTS() }),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.subscribe_to_pubsub(
      PubSubSubscribeConfig({ topic: IN_TOPIC, cb: this.on_chat.bind(this) }),
    );
    // Subscribing replays the topic's history, so the handler takes the backlog
    // flag and ignores anything typed before the agent joined.
    await this.session!.say('Hello. Type something and I will read my answer aloud.');
  }

  async on_chat(frame: Record<string, any>, backlog: boolean): Promise<void> {
    const text = String(frame?.message ?? '');
    if (backlog || !text.trim()) return;

    logger.info(`user typed: ${text}`);
    await this.session!.process_text(text);
  }

  async on_exit(): Promise<void> {
    logger.info('call finished');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, { room });
  logger.info(`publish text on the '${IN_TOPIC}' topic to hear it answered`);
}

await zeroruntime.serve(TextToVoiceAgent, { on_ready });
