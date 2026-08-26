// Text in, voice out -- Pipeline({ llm, tts }) infers LLM_TTS_ONLY. No STT and
// no VAD, because the input is typed rather than spoken.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, RoomMessage, get_logger } from '@zeroruntime/js-sdk';
import { CartesiaTTS, GoogleLLM } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('agent_text_to_voice');

const AGENT_ID = process.env.AGENT_ID ?? 'text-to-voice-agent';
const IN_TOPIC = 'CHAT';

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
    await this.session!.say('Hello. Type something and I will read my answer aloud.');
  }

  async on_message(message: RoomMessage): Promise<void> {
    if (message.backlog || message.topic !== IN_TOPIC || !message.text.trim()) return;

    logger.info(`user typed: ${message.text}`);
    await this.session!.process_text(message.text);
  }

  async on_exit(): Promise<void> {
    logger.info('call finished');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Text to Voice', playground: true, subscribe: [IN_TOPIC] }),
  });
  logger.info(`publish text on the '${IN_TOPIC}' topic to hear it answered`);
}

await zeroruntime.serve(TextToVoiceAgent, { on_ready });
