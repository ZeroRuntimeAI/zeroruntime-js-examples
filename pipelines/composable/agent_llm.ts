// Text in, text out -- Pipeline({ llm }) infers LLM_ONLY. Input arrives on one
// pubsub topic and answers go out on another, so the agent does not read its
// own replies back as new input.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import {
  Agent,
  Pipeline,
  PubSubPublishConfig,
  PubSubSubscribeConfig,
  Room,
  get_logger,
} from '@zeroruntime/js-sdk';
import { GoogleLLM } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('agent_llm');

const AGENT_ID = process.env.AGENT_ID ?? 'llm-only-agent';
const IN_TOPIC = 'CHAT';
const OUT_TOPIC = 'AGENT_RESPONSE';

const pipeline = Pipeline({ llm: GoogleLLM() });

const room = Room({ name: 'LLM Only', playground: true });

class LlmAgent extends Agent {
  constructor() {
    super({
      instructions: 'You are a helpful assistant. Answer in text, concisely.',
      agent_id: AGENT_ID,
      pipeline,
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.subscribe_to_pubsub(
      PubSubSubscribeConfig({ topic: IN_TOPIC, cb: this.on_chat.bind(this) }),
    );
  }

  /** The agent's answer, as text. With no TTS this is the only output there is. */
  async on_llm(data: Record<string, any>): Promise<void> {
    const text = String(data?.text ?? '');
    if (!text.trim()) return;
    logger.info(`agent: ${text}`);
    await this.session!.publish_to_pubsub(
      PubSubPublishConfig({ topic: OUT_TOPIC, message: text }),
    );
  }

  /**
   * One frame on IN_TOPIC. The second parameter is what keeps the agent from
   * answering everything typed before it joined.
   */
  async on_chat(frame: Record<string, any>, backlog: boolean): Promise<void> {
    const text = String(frame?.message ?? '');
    if (backlog || !text.trim()) return;

    logger.info(`user: ${text}`);
    await this.session!.process_text(text);
  }

  async on_exit(): Promise<void> {
    logger.info('call finished');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, { room });
  logger.info(`publish text on '${IN_TOPIC}'; answers arrive on '${OUT_TOPIC}'`);
}

await zeroruntime.serve(LlmAgent, { on_ready });
