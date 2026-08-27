// Fixed phrases synthesised once and replayed: say(text, { audio_data: pcm })
// plays the bytes and skips the TTS round trip. The audio must be PCM in the
// room's format, and the text still travels because it goes into the chat
// context.

import 'dotenv/config';

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, InterruptConfig, Pipeline, Room, function_tool, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('cached_tts');

const AGENT_ID = process.env.AGENT_ID ?? 'cached-tts-agent';

const GREETING = "Hi, you've reached support. How can I help?";
const HOLD = 'Let me check that for you, one moment.';
const GOODBYE = 'Thanks for calling. Goodbye.';

const CACHE_DIR = process.env.TTS_CACHE_DIR ?? 'tts_cache';

/**
 * Raw PCM per phrase, read once at startup.
 *
 * Deliberately dumb: a map and some files. The point of the example is
 * `audio_data`, not the cache -- swap this for your own TTS vendor's SDK, or
 * for a CDN fetch, and nothing else changes.
 */
class PhraseCache {
  private readonly _directory: string;
  private readonly _audio = new Map<string, Buffer>();

  constructor(directory: string) {
    this._directory = directory;
  }

  preload(phrases: string[]): void {
    for (const phrase of phrases) {
      const key = createHash('sha256').update(phrase).digest('hex').slice(0, 16);
      const path = join(this._directory, `${key}.pcm`);
      if (existsSync(path)) {
        const bytes = readFileSync(path);
        this._audio.set(phrase, bytes);
        logger.info(`cached ${bytes.length} bytes for '${phrase.slice(0, 32)}'`);
      } else {
        logger.info(`no cache for '${phrase.slice(0, 32)}' -- it will be synthesised`);
      }
    }
  }

  /** The bytes, or undefined to let the runtime synthesise it as usual. */
  fetch(phrase: string): Buffer | undefined {
    return this._audio.get(phrase);
  }
}

const cache = new PhraseCache(CACHE_DIR);
cache.preload([GREETING, HOLD, GOODBYE]);

class SupportAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a support agent. Answer questions about orders. Use ' +
        'check_order_status rather than guessing.',
      agent_id: AGENT_ID,
      pipeline: Pipeline({
        stt: DeepgramSTT(),
        llm: GoogleLLM(),
        tts: CartesiaTTS(),
        vad: SileroVAD(),
        turn_detector: TurnDetector(),
        interrupt_config: InterruptConfig({ mode: 'HYBRID', interrupt_min_words: 2 }),
      }),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say(GREETING, { audio_data: cache.fetch(GREETING) });
  }

  async on_exit(): Promise<void> {
    await this.session!.say(GOODBYE, { audio_data: cache.fetch(GOODBYE) });
  }

  check_order_status = function_tool({
    name: 'check_order_status',
    description: 'Look up an order.',
    parameters: {
      order_id: { type: 'string', description: 'The order number the caller gives you.' },
    },
    execute: async function (this: SupportAgent, { order_id }) {
      await this.session!.say(HOLD, { audio_data: cache.fetch(HOLD) });

      return { order_id, status: 'shipped', eta: 'Tuesday' };
    },
  });
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Cached TTS', playground: true }),
  });
}

await zeroruntime.serve(SupportAgent, { on_ready });
