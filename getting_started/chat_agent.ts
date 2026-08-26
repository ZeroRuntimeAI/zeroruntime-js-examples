// An agent you only type at: Pipeline({ llm }) infers LLM_ONLY, so there is
// no STT, TTS or VAD -- chat text goes in and a tool posts back. The chat topic
// is named at join, because the room does not exist until the agent has
// connected.

import 'dotenv/config';

import { createInterface } from 'node:readline/promises';

import * as zeroruntime from '@zeroruntime/js-sdk';
import {
  Agent,
  Participant,
  Pipeline,
  Room,
  RoomMessage,
  Session,
  function_tool,
  get_logger,
} from '@zeroruntime/js-sdk';
import { GoogleLLM } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('chat_agent');

const TOPIC = 'CHAT';

const send_chat_message = function_tool({
  name: 'send_chat_message',
  description:
    'Send a message to everyone in the room. Use when the caller asks you to ' +
    'post, announce, or share something with the room.',
  parameters: {
    message: { type: 'string', description: 'The text to post.' },
  },
  execute: async ({ message }) => {
    await zeroruntime.current_session().publish(TOPIC, message);
    return { status: 'sent', topic: TOPIC };
  },
});

class ChatAgent extends Agent {
  constructor() {
    super({
      instructions:
        "You are a helpful assistant in a room's text chat. You can post " +
        'messages to the room\'s chat when asked. Keep replies short.',
      agent_id: process.env.AGENT_ID ?? 'chat-agent',
      pipeline: Pipeline({ llm: GoogleLLM({ model: 'gemini-2.5-flash' }) }),
      tools: [send_chat_message],
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say('Hi! Say something, or type in the room chat.');
  }

  /**
   * One frame on a subscribed topic.
   *
   * `backlog` is checked first and it matters: subscribing replays whatever was
   * already in the topic, so without this the agent answers every message sent
   * before it joined, one after another, the moment the call connects.
   */
  async on_message(message: RoomMessage): Promise<void> {
    if (message.backlog) {
      logger.info(`[history] ${message.topic}: ${message.text}`);
      return;
    }

    logger.info(`[chat] ${message.topic}: ${message.text}`);

    await this.session!.process_text(message.text);
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
  await zeroruntime.invoke(process.env.AGENT_ID ?? 'chat-agent', {
    room: Room({ name: 'Chat Agent', playground: true, subscribe: [TOPIC] }),
  });
}

await zeroruntime.serve(ChatAgent, { on_ready });
