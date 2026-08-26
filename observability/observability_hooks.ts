// Three separate things: OpenTelemetry traces/metrics/logs configured on the
// Room, platform recording, and the conversation history fetched in on_exit.
// Traces and metrics default on; logs default off, because they are the noisy one.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Exporter, Observability, Pipeline, Room, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('observability_hooks');

const AGENT_ID = process.env.AGENT_ID ?? 'observability-agent';
const OTLP_URL = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? '';

const pipeline = Pipeline({
  stt: DeepgramSTT(),
  llm: GoogleLLM(),
  tts: CartesiaTTS(),
  vad: SileroVAD(),
  turn_detector: TurnDetector(),
});

pipeline.on('metrics.stt', (data: Record<string, unknown>) => {
  logger.info(`stt ${JSON.stringify(data)}`);
});

pipeline.on('metrics.llm', (data: Record<string, unknown>) => {
  logger.info(`llm ${JSON.stringify(data)}`);
});

pipeline.on('metrics.tts', (data: Record<string, unknown>) => {
  logger.info(`tts ${JSON.stringify(data)}`);
});

/**
 * Component failures. Worth watching even when everything else is quiet -- a
 * TTS that has stopped answering looks, from the room, like an agent that has
 * decided not to speak.
 */
pipeline.on('error', (data: Record<string, unknown>) => {
  logger.error(`component error: ${JSON.stringify(data)}`);
});

class MyVoiceAgent extends Agent {
  constructor() {
    super({
      instructions: 'You are a helpful voice assistant that can answer questions.',
      agent_id: AGENT_ID,
      pipeline,
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say('Hello, how can I help you today?');
  }

  async on_exit(): Promise<void> {
    const history = await this.session!.get_context_history();

    logger.info(`=== SESSION END: CONTEXT HISTORY (${history.length} items) ===`);
    for (const message of history) {
      const role = String(message?.role ?? 'unknown').toUpperCase();
      if (role === 'SYSTEM') continue;
      let content = message?.content ?? '';
      if (Array.isArray(content)) {
        content = content
          .map((part) => (typeof part === 'string' ? part : '[Image/Other]'))
          .join(' ');
      }
      logger.info(`${role}: ${content}`);
    }
    logger.info('===============================================');

    await this.session!.say('Goodbye!');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({
      name: 'Observability Hooks',
      playground: true,
      recording: true,
      observability: Observability({
        traces: Exporter({ enabled: true, export_url: OTLP_URL || null }),
        metrics: Exporter({ enabled: true, export_url: OTLP_URL || null }),
        logs: Exporter({ enabled: Boolean(OTLP_URL), export_url: OTLP_URL || null }),
        log_level: 'INFO',
      }),
    }),
  });
}

await zeroruntime.serve(MyVoiceAgent, { on_ready });
