// Voice in, text out -- Pipeline({ stt, llm, vad, turn_detector }) infers
// STT_LLM_ONLY. No TTS, so the agent listens and answers in text without ever
// speaking into the room.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, Session, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('agent_voice_to_text');

const AGENT_ID = process.env.AGENT_ID ?? 'voice-to-text-agent';
const OUT_TOPIC = 'AGENT_RESPONSE';

const pipeline = Pipeline({
  stt: DeepgramSTT(),
  llm: GoogleLLM(),
  vad: SileroVAD(),
  turn_detector: TurnDetector(),
});

let session: Session | null = null;

/** What the caller said, as soon as they stopped saying it. */
pipeline.on('user_turn_start', async (transcript: string) => {
  logger.info(`heard: ${transcript}`);
});

/**
 * The agent's answer. With no TTS this is the only output there is -- without
 * publishing it somewhere, this agent would think in silence.
 */
pipeline.on('llm', async (data: Record<string, any>) => {
  const text = data?.text ?? '';
  if (!text.trim() || session === null) return;
  logger.info(`answer: ${text}`);
  await session.publish(OUT_TOPIC, text);
});

class VoiceToTextAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a helpful assistant listening to a call. Answer concisely in text.',
      agent_id: AGENT_ID,
      pipeline,
    });
  }

  async on_enter(): Promise<void> {
    session = this.session;
    logger.info('listening');
  }

  async on_exit(): Promise<void> {
    logger.info('call finished');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Voice to Text', playground: true }),
  });
  logger.info(`speak in the room; answers arrive on '${OUT_TOPIC}'`);
}

await zeroruntime.serve(VoiceToTextAgent, { on_ready });
