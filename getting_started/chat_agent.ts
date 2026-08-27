// An agent you only type at: Pipeline({ llm }) infers LLM_ONLY, so there is
// no STT, TTS or VAD -- chat text goes in and a tool posts back.
//
// Everything the call needs is a method on the agent: the topic is subscribed
// in on_enter with `this.on_chat` as the handler, and `on_llm` stands in for a
// pipeline hook. Both reach the call through `this.session`, so nothing here
// holds a module-level reference to it.

import 'dotenv/config';

import { createInterface } from 'node:readline/promises';

import * as zeroruntime from '@zeroruntime/js-sdk';
import {
  Agent,
  Participant,
  Pipeline,
  PubSubPublishConfig,
  PubSubSubscribeConfig,
  Room,
  Session,
  function_tool,
  get_logger,
} from '@zeroruntime/js-sdk';
import { CartesiaTTS, DeepgramSTT, GoogleLLM } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('chat_agent');

const TOPIC = 'CHAT';

const AGENT_ID = process.env.AGENT_ID ?? 'chat-agent';

const room = Room({ name: 'Chat Agent', playground: true });

const pipeline = Pipeline({ stt: DeepgramSTT(), llm: GoogleLLM(), tts: CartesiaTTS() });

class ChatAgent extends Agent {
  constructor() {
    super({
      instructions:
        "You are a helpful assistant in a room's text chat. You can post " +
        "messages to the room's chat when asked. Keep replies short.",
      agent_id: AGENT_ID,
      pipeline,
    });
  }

  /** Every answer the agent produces, echoed back into the chat. */
  async on_llm(data: Record<string, any>): Promise<void> {
    const text = String(data?.text ?? '').trim();
    if (text) {
      await this.session!.publish_to_pubsub(
        PubSubPublishConfig({ topic: TOPIC, message: text }),
      );
    }
  }

  send_chat_message = function_tool({
    name: 'send_chat_message',
    description:
      'Send a message to everyone in the room. Use when the caller asks you to ' +
      'post, announce, or share something with the room.',
    parameters: {
      message: { type: 'string', description: 'The text to post.' },
    },
    execute: async function (this: ChatAgent, { message }) {
      await this.session!.publish_to_pubsub(
        PubSubPublishConfig({ topic: TOPIC, message }),
      );
      return { status: 'sent', topic: TOPIC };
    },
  });

  async on_enter(): Promise<void> {
    await this.session!.subscribe_to_pubsub(
      PubSubSubscribeConfig({ topic: TOPIC, cb: this.on_chat.bind(this) }),
    );
    await this.session!.say('Hi! Say something, or type in the room chat.');
  }

  /** One frame on TOPIC, as the transport delivered it. */
  async on_chat(message: Record<string, any>, backlog: boolean): Promise<void> {
    logger.info(`Pubsub message received: ${JSON.stringify(message)}`);
    const text = String(message?.message ?? '');
    if (!backlog && text.trim()) await this.session!.process_text(text);
  }

  async on_participant_joined(participant: Participant): Promise<void> {
    logger.info(`joined: ${participant.name || 'anonymous'} (${participant.id})`);
    if (participant.name) await this.session!.say(`Welcome, ${participant.name}.`);
  }

  async on_participant_left(participant: Participant): Promise<void> {
    logger.info(`left: ${participant.name || participant.id}`);
  }

  async on_exit(): Promise<void> {
    logger.info('session finished');
  }
}

/**
 * Type at the terminal and the agent answers as though you had spoken.
 *
 * The SDK's example runs this against `pipeline.process_text`; the only
 * difference here is that the pipeline is a process away.
 */
export async function chat_loop(session: Session): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const text = await rl.question('you: ');
      if (['quit', 'exit'].includes(text.trim().toLowerCase())) {
        await session.end('user quit');
        return;
      }
      if (text.trim()) await session.process_text(text);
    }
  } finally {
    rl.close();
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID);
}

await zeroruntime.serve(ChatAgent, { on_ready, room });
