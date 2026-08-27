// Subscribing to what the agent process sees and this one otherwise cannot:
// component errors, recording state changes, and per-component latency metrics
// as they are measured. You receive only the events you register for.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('pipeline_events');

const AGENT_ID = process.env.AGENT_ID ?? 'pipeline-events';

const pipeline = Pipeline({
  stt: DeepgramSTT({ model: 'nova-2' }),
  llm: GoogleLLM({ model: 'gemini-2.5-flash' }),
  tts: CartesiaTTS(),
  vad: SileroVAD(),
  turn_detector: TurnDetector(),
});

/**
 * A component failed.
 *
 * `source` is one of STT, LLM, TTS, VAD, TURN-D, REALTIME or room. This is also
 * where a *fallback* announces itself: the fallback wrappers emit an error as
 * they switch, so a provider quietly failing over shows up here rather than only
 * in the metrics after the call.
 *
 * Worth wiring on any real deployment. A 404 from a TTS voice looks exactly like
 * a silent agent from the caller's side, and this is the difference between
 * knowing that within a second and reading it in the logs tomorrow.
 */
pipeline.on('error', (data: Record<string, any>) => {
  logger.error(`[${data?.source ?? '?'}] ${data?.error ?? ''}`);
});

pipeline.on('recording_started', (data: Record<string, any>) => {
  logger.info(`recording started (${data?.kind ?? data?.type ?? ''})`);
});

pipeline.on('recording_stopped', () => {
  logger.info('recording stopped');
});

/**
 * Only after the SDK has retried and given up.
 *
 * Not a blip: this fires once retries over a few seconds are exhausted, so it
 * means the call genuinely is not being recorded. If that matters for
 * compliance, this is the hook that has to page somebody.
 */
pipeline.on('recording_failed', (data: Record<string, any>) => {
  logger.error(`recording FAILED: ${data?.error ?? ''}`);
});

pipeline.metrics.on('stt', (data: Record<string, unknown>) => {
  logger.info(`stt metric collector  ${JSON.stringify(data)}`);
  logger.info(`stt ${JSON.stringify(data)}`);
});

/**
 * Time-to-first-token, per turn, while the call is still running.
 *
 * `session.get_metrics()` returns the same numbers, but only once you ask --
 * and if the session ends before you do, they are gone. Subscribe when you want
 * to react to slowness rather than report on it.
 */
pipeline.metrics.on('llm', (data: Record<string, unknown>) => {
  logger.info(`llm metric collector ${JSON.stringify(data)}`);
  logger.info(`llm ${JSON.stringify(data)}`);
});

class WatchedAgent extends Agent {
  constructor() {
    super({
      instructions: 'You are a helpful assistant. Keep answers short.',
      agent_id: AGENT_ID,
      pipeline,
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say('Hello! I am being watched closely today.');
  }

  async on_exit(): Promise<void> {
    logger.info('session finished');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Pipeline Events', playground: true, recording: true }),
  });
}

await zeroruntime.serve(WatchedAgent, { on_ready });
