// Observing and rewriting a cascade pipeline at every stage.
//
// Three kinds of hook appear here, and they are not interchangeable:
//
//   stt          an async generator. Runs once per utterance, and what it yields
//                is what the turn sees. Yield nothing and the utterance is
//                dropped, which is how a noisy transcript gets filtered.
//   llm          an async generator rewrites chunks on their way to TTS; a plain
//                async function observes the finished response. Registering both
//                is fine -- they are separate hooks.
//   turn/state   plain async functions. Nothing waits on them, so they cost the
//                turn nothing.
//
// The TTS stage is `pronunciations`, not a hook. See build_pipeline.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, get_logger, run_stt } from '@zeroruntime/js-sdk';
import { SarvamAITTS, TurnDetector } from '@zeroruntime/js-sdk/inference';
import { DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('voice_pipeline_hooks');

const AGENT_ID = 'voice-pipeline-hooks-agent';

const FILLERS = /\b(?:uh|um|like)\b/g;

const SYNONYMS: Record<string, string> = {
  'working hours': 'office hours',
  timing: 'office hours',
};

// One alternation rather than a chain of replace calls: replacing "# " before
// "## " turns a second-level heading into a stray "#" instead of removing it.
const MARKDOWN = /\*\*|__|#{1,6} |[-*] /g;

function build_pipeline(): Pipeline {
  const pipeline = Pipeline({
    stt: DeepgramSTT(),
    llm: GoogleLLM(),
    tts: SarvamAITTS(),
    vad: SileroVAD(),
    turn_detector: TurnDetector(),
  });

  pipeline.on('stt', async function* (audio_stream) {
    // Normalise the transcript before the LLM sees it.
    //
    // `run_stt` yields this utterance's event; rewriting `event.data.text`
    // rewrites what the turn receives. The audio phase is a passthrough --
    // STT runs in the agent process and only its transcript crosses, so
    // iterating `audio_stream` yields nothing and transforming audio is not
    // possible from here.
    for await (const event of run_stt(audio_stream)) {
      let text = event.data.text.toLowerCase().replace(FILLERS, '');
      for (const [src, dst] of Object.entries(SYNONYMS)) {
        text = text.replace(new RegExp(`\\b${src}\\b`, 'g'), dst);
      }
      text = text.split(/\s+/).filter(Boolean).join(' ');
  
      if (!text) {
        logger.info('[STT] dropped (nothing left after filtering)');
        continue;
      }
  
      event.data.text = text;
      logger.info(`[STT] ${text} (final=${event.data.final})`);
      yield event;
    }
  });

  pipeline.on('llm', async function* (text_stream: AsyncIterable<string>) {
    // Rewrite the response as it streams, before TTS speaks it.
    //
    // Strips markdown so the voice does not read asterisks and hashes aloud.
    // A generator, so one chunk in may yield none (buffer), one (rewrite) or
    // several (split); code after the loop still runs, which is where a
    // buffering hook would flush its tail.
    for await (const chunk of text_stream) {
      yield chunk.replace(MARKDOWN, '');
    }
  });

  pipeline.on('llm', async (data: Record<string, any>) => {
    // Observe the finished response -- logging, analytics, memory.
    //
    // Its return value is discarded, so this cannot change what is spoken.
    // Use the generator above for that.
    const text = data?.text ?? '';
    logger.info(`[LLM] generated ${text.slice(0, 100)}...`);
  });

  pipeline.on('user_turn_start', async (transcript: string) => {
    logger.info(`[USER TURN START] ${transcript}`);
  });

  pipeline.on('user_turn_end', async () => {
    logger.info('[USER TURN END]');
  });

  pipeline.on('agent_turn_start', async () => {
    logger.info('[AGENT TURN START]');
  });

  pipeline.on('agent_turn_end', async () => {
    logger.info('[AGENT TURN END]');
  });

  pipeline.on('turn_state', async (data: Record<string, unknown>) => {
    logger.info(`[TURN STATE] ${JSON.stringify(data)}`);
  });

  return pipeline;
}

class VoicePipelineHooks extends Agent {
  constructor() {
    super({
      agent_id: AGENT_ID,
      instructions: 'You are a helpful voice assistant.',
      pipeline: build_pipeline(),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say('Hello! How can I help you today?');
  }

  async on_exit(): Promise<void> {
    await this.session!.say('Goodbye!');
  }
}

async function invoke_agent(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Voice Pipeline Hooks', playground: true, room_id: '8ci6-jzbc-e049' }),
  });
}

await zeroruntime.serve(VoicePipelineHooks, { on_ready: invoke_agent });
