// Showing a speech-to-speech model what the camera sees -- the realtime
// counterpart to vision_cascade.ts, with identical mechanics.
// Room({ vision: true }) subscribes the agent to the track; only the frame
// count crosses the wire.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, RoomMessage, get_logger } from '@zeroruntime/js-sdk';
import { GeminiRealtime } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('vision_realtime');

const AGENT_ID = process.env.AGENT_ID ?? 'vision-realtime-agent';
const TOPIC = 'vision';

class VisionRealtimeAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a helpful voice assistant that can see. Describe what you are ' +
        'shown briefly and naturally.',
      agent_id: AGENT_ID,
      pipeline: Pipeline({
        realtime: GeminiRealtime({
          model: 'gemini-3.1-flash-live-preview',
          config: { voice: 'Leda', response_modalities: ['AUDIO'] },
        }),
      }),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say("Hello! Show me something and I'll tell you what I see.");
  }

  async on_message(message: RoomMessage): Promise<void> {
    if (message.backlog || message.topic !== TOPIC) return;
    if (message.text !== 'capture_frames') return;

    logger.info('capturing frames');
    await this.session!.reply(
      'Please analyze this frame and describe what you see in detail, within one line.',
      { frames: 2 },
    );
  }

  async on_exit(): Promise<void> {
    logger.info('call finished');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({
      name: 'Vision Realtime',
      playground: true,
      vision: true,
      subscribe: [TOPIC],
    }),
  });
  logger.info(`publish 'capture_frames' on the '${TOPIC}' topic to trigger a look`);
}

await zeroruntime.serve(VisionRealtimeAgent, { on_ready });
