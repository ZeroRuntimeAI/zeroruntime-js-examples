// An Anam avatar on a cascade pipeline -- avatar_simli_cascade.ts with a
// different vendor in the same slot. An avatar is orthogonal to the pipeline's
// mode, so the swap touches nothing but the avatar line. The Anam key is read in
// the runtime and never sent from here.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, function_tool, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import {
  AnamAvatar,
  CartesiaTTS,
  DeepgramSTT,
  GoogleLLM,
  SileroVAD,
} from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('avatar_anam_cascade');

const AGENT_ID = process.env.AGENT_ID ?? 'anam-avatar-agent';
const AVATAR_ID = process.env.ANAM_AVATAR_ID ?? 'your-anam-avatar-id';

const get_weather = function_tool({
  name: 'get_weather',
  description:
    'Called when the user asks about the weather. Estimate the latitude and ' +
    'longitude of the location yourself rather than asking for them.',
  parameters: {
    latitude: { type: 'string', description: 'The latitude of the location.' },
    longitude: { type: 'string', description: 'The longitude of the location.' },
  },
  execute: async ({ latitude, longitude }) => {
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${latitude}&longitude=${longitude}&current=temperature_2m`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`weather lookup failed: HTTP ${response.status}`);
    const data = (await response.json()) as { current: { temperature_2m: number } };

    return {
      temperature: data.current.temperature_2m,
      temperature_unit: 'Celsius',
    };
  },
});

class AvatarVoiceAgent extends Agent {
  constructor() {
    if (AVATAR_ID === 'your-anam-avatar-id') {
      logger.warning('set ANAM_AVATAR_ID -- the placeholder will not render');
    }

    super({
      instructions:
        'You are a helpful virtual assistant with a visual avatar that can ' +
        'answer questions about weather and help with other tasks. Keep replies ' +
        'short and conversational -- long monologues look wrong on a talking head.',
      agent_id: AGENT_ID,
      tools: [get_weather],
      pipeline: Pipeline({
        stt: DeepgramSTT({ model: 'nova-2' }),
        llm: GoogleLLM({ model: 'gemini-2.5-flash' }),
        tts: CartesiaTTS(),
        vad: SileroVAD(),
        turn_detector: TurnDetector(),
        avatar: AnamAvatar({ avatar_id: AVATAR_ID }),
      }),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say(
      "Hello! I'm your AI avatar assistant. How can I help you today?",
    );
  }

  async on_exit(): Promise<void> {
    logger.info('call finished');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Anam Avatar', playground: true }),
  });
}

await zeroruntime.serve(AvatarVoiceAgent, { on_ready });
