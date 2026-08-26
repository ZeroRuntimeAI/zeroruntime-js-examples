// Driving the agent from outside the conversation: a room message makes it speak
// or cuts it off mid-sentence. say, reply and process_text are three different
// things; interrupt({ force: true }) also cuts uninterruptible utterances.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, RoomMessage, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { AnthropicLLM, DeepgramSTT, ElevenLabsTTS, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('reply_interrupt_agent');

const AGENT_ID = process.env.AGENT_ID ?? 'reply-interrupt-agent';
const TOPIC = 'CHAT';

class ControllableAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a helpful voice assistant that can answer questions and help with tasks.',
      agent_id: AGENT_ID,
      pipeline: Pipeline({
        stt: DeepgramSTT(),
        llm: AnthropicLLM(),
        tts: ElevenLabsTTS(),
        vad: SileroVAD(),
        turn_detector: TurnDetector(),
      }),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say('Hello, how can I help you today?');
  }

  async on_message(message: RoomMessage): Promise<void> {
    if (message.backlog || message.topic !== TOPIC) return;

    if (message.text === 'reply') {
      logger.info('replying');
      const handle = await this.session!.reply(
        'Create a random number between 1 and 100. Tell the user a joke using ' +
          'that number.',
      );
      logger.info(`utterance ${handle.utterance_id} started`);
    } else if (message.text === 'interrupt') {
      logger.info('interrupting');
      await this.session!.interrupt();
    }
  }

  async on_exit(): Promise<void> {
    await this.session!.say('Goodbye!');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Reply / Interrupt', playground: true, subscribe: [TOPIC] }),
  });
  logger.info(`publish 'reply' or 'interrupt' on the '${TOPIC}' topic`);
}

await zeroruntime.serve(ControllableAgent, { on_ready });
