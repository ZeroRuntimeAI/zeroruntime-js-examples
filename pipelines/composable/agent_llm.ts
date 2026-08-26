// Text in, text out -- Pipeline({ llm }) infers LLM_ONLY. Input arrives on one
// pubsub topic and answers go out on another, so the agent does not read its
// own replies back as new input.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, RoomMessage, Session, get_logger } from '@zeroruntime/js-sdk';
import { GoogleLLM } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('agent_llm');

const AGENT_ID = process.env.AGENT_ID ?? 'llm-only-agent';
const IN_TOPIC = 'CHAT';
const OUT_TOPIC = 'AGENT_RESPONSE';

const pipeline = Pipeline({ llm: GoogleLLM() });

let session: Session | null = null;

/** The agent's answer, as text. With no TTS this is the only output there is. */
pipeline.on('llm', async (data: Record<string, any>) => {
  const text = data?.text ?? '';
  if (!text.trim() || session === null) return;
  logger.info(`agent: ${text}`);
  await session.publish(OUT_TOPIC, text);
});

class LlmAgent extends Agent {
  constructor() {
    super({
      instructions: 'You are a helpful assistant. Answer in text, concisely.',
      agent_id: AGENT_ID,
      pipeline,
    });
  }

  async on_enter(): Promise<void> {
    session = this.session;
  }

  async on_message(message: RoomMessage): Promise<void> {
    if (message.backlog || message.topic !== IN_TOPIC) return;
    if (!message.text.trim()) return;

    logger.info(`user: ${message.text}`);
    await this.session!.process_text(message.text);
  }

  async on_exit(): Promise<void> {
    logger.info('call finished');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'LLM Only', playground: true, subscribe: [IN_TOPIC] }),
  });
  logger.info(`publish text on '${IN_TOPIC}'; answers arrive on '${OUT_TOPIC}'`);
}

await zeroruntime.serve(LlmAgent, { on_ready });
