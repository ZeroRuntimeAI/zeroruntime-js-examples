// Answering in whatever language the caller switched to: each turn detects the
// language here and, when it changes, rebuilds the pipeline with a TTS that
// speaks it. change_pipeline takes a complete pipeline, not a patch.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, Session, get_logger } from '@zeroruntime/js-sdk';
import {
  CartesiaTTS,
  OpenAILLM,
  SarvamAISTT,
  SarvamAITTS,
  SileroVAD,
} from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('translator_agent');

const AGENT_ID = process.env.AGENT_ID ?? 'translator-agent';

let current_language = 'en-IN';
let session: Session | null = null;

const pipeline = Pipeline({
  stt: SarvamAISTT(),
  llm: OpenAILLM(),
  tts: CartesiaTTS(),
  vad: SileroVAD(),
});

/** Whatever language service you have. Runs in this process, not the agent's. */
async function detect_language(transcript: string): Promise<string> {
  const api_key = process.env.SARVAMAI_API_KEY;
  if (!api_key) throw new Error('SARVAMAI_API_KEY is not set');

  const response = await fetch('https://api.sarvam.ai/text-lid', {
    method: 'POST',
    headers: { 'api-subscription-key': api_key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: transcript }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = (await response.json()) as { language_code: string };
  return body.language_code;
}

/** Runs the moment the caller stops talking, before the LLM generates. */
pipeline.on('user_turn_start', async (transcript: string) => {
  if (session === null) return;

  // A turn can arrive with nothing in it: the VAD heard speech, the STT
  // produced no transcript, and the turn was force-finalized anyway. The
  // transcript field is a protobuf string, so "no transcript" reaches us as "".
  // Sarvam rejects empty input with a 400, so asking would just be a guaranteed
  // failure logged once per silent turn.
  if (!transcript || !transcript.trim()) return;

  let detected: string;
  try {
    detected = await detect_language(transcript);
  } catch (error) {
    logger.warning(
      `language detection failed (${String(error)}); staying on ${current_language}`,
    );
    return;
  }

  if (!detected || detected === current_language) return;

  logger.info(`language changed ${current_language} -> ${detected}`);
  current_language = detected;

  await session.change_pipeline(
    Pipeline({
      stt: SarvamAISTT(),
      llm: OpenAILLM(),
      tts: SarvamAITTS({ language: current_language }),
      vad: SileroVAD(),
    }),
  );
});

class TranslatorAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a helpful translator assistant that can speak to the user in ' +
        'their language.',
      agent_id: AGENT_ID,
      pipeline,
    });
  }

  async on_enter(): Promise<void> {
    session = this.session;
  }

  async on_exit(): Promise<void> {
    logger.info(`call finished in ${current_language}`);
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Translator Agent', playground: true }),
  });
}

await zeroruntime.serve(TranslatorAgent, { on_ready });
