// Showing the model what the camera sees: a room message triggers a reply that
// captures the newest N frames. Room({ vision: true }) subscribes the agent
// to the video track, and the pixels stay there -- only the count travels.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, RoomMessage, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('vision_cascade');

const AGENT_ID = process.env.AGENT_ID ?? 'vision-agent';
const TOPIC = 'CHAT';

class VisionAgent extends Agent {
  constructor() {
    super({
      instructions:
        'YOU CAN ONLY SPEAK IN ENGLISH. You are a helpful voice assistant that ' +
        'can answer questions and help with tasks.',
      agent_id: AGENT_ID,
      pipeline: Pipeline({
        stt: DeepgramSTT(),
        llm: GoogleLLM(),
        tts: CartesiaTTS(),
        vad: SileroVAD(),
        turn_detector: TurnDetector(),
      }),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say('Hello, how can I help you today?');
  }

  async on_message(message: RoomMessage): Promise<void> {
    if (message.backlog) return;
    if (message.topic !== TOPIC || message.text !== 'capture_frames') return;

    logger.info(`capturing frames on '${message.topic}'`);
    await this.session!.reply(
      'Please analyze this frame and describe what you see in details, within one line.',
      { frames: 2 },
    );
  }

  async on_exit(): Promise<void> {
    await this.session!.say('Goodbye!');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({
      name: 'Vision Cascade',
      playground: true,
      vision: true,
      subscribe: [TOPIC],
    }),
  });
  logger.info(`publish 'capture_frames' on the '${TOPIC}' topic to trigger a look`);
}

await zeroruntime.serve(VisionAgent, { on_ready });
