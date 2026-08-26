// Giving a cascade agent a face. The avatar plugin renders a talking head from
// the TTS output and publishes it into the room as the agent's video. Nested
// vendor config objects cross as plain objects and are rebuilt in the runtime.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import {
  CartesiaTTS,
  DeepgramSTT,
  GoogleLLM,
  SileroVAD,
  SimliAvatar,
} from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('avatar_simli_cascade');

const AGENT_ID = process.env.AGENT_ID ?? 'simli-avatar-agent';
const FACE_ID = process.env.SIMLI_FACE_ID ?? 'your-simli-face-id';

class AvatarAgent extends Agent {
  constructor() {
    if (FACE_ID === 'your-simli-face-id') {
      logger.warning('set SIMLI_FACE_ID -- the placeholder will not render');
    }

    super({
      instructions:
        'You are a friendly assistant with a face. Keep replies short and ' +
        'conversational -- long monologues look wrong on a talking head.',
      agent_id: AGENT_ID,
      pipeline: Pipeline({
        stt: DeepgramSTT({ model: 'nova-2' }),
        llm: GoogleLLM({ model: 'gemini-2.5-flash' }),
        tts: CartesiaTTS(),
        vad: SileroVAD(),
        turn_detector: TurnDetector(),
        avatar: SimliAvatar({
          config: {
            faceId: FACE_ID,
            handleSilence: true,
            maxSessionLength: 3600,
            maxIdleTime: 300,
          },
        }),
      }),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say('Hello! You can see me as well as hear me now.');
  }

  async on_exit(): Promise<void> {
    logger.info('call finished');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Simli Avatar', playground: true }),
  });
}

await zeroruntime.serve(AvatarAgent, { on_ready });
