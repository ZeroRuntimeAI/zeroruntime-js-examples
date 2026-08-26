// Long-term memory with mem0. Each user turn searches the store for what they
// just said and injects the hits as a system message; the exchange is written
// back afterwards. The store is reached from this process, with your own key.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, Session, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('agent_memory');

const AGENT_ID = process.env.AGENT_ID ?? 'agent-memory';
const USER_ID = process.env.MEM0_USER_ID ?? 'demo-user';

/** Thin mem0 client. Swap it for a vector index or your CRM -- it runs here. */
class Mem0Memory {
  static readonly STORE_KEYWORDS = [
    'remember',
    'my name',
    'i like',
    'i dislike',
    'favorite',
    'i prefer',
    'i love',
    'i hate',
    "i'm",
    'i am',
    'i work',
  ];

  private readonly api_key: string;
  readonly user_id: string;

  constructor(api_key: string, user_id: string) {
    this.api_key = api_key;
    this.user_id = user_id;
  }

  private async post(path: string, body: unknown): Promise<any> {
    const response = await fetch(`https://api.mem0.ai${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${this.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }

  async search(query: string, top_k = 5): Promise<string[]> {
    try {
      const body = await this.post('/v1/memories/search/', {
        query,
        user_id: this.user_id,
        top_k,
      });
      const results: any[] = Array.isArray(body) ? body : (body?.results ?? []);
      return results
        .filter((entry) => entry && typeof entry === 'object' && String(entry.memory ?? '').trim())
        .map((entry) => String(entry.memory));
    } catch (error) {
      logger.warning('memory search failed', error);
      return [];
    }
  }

  async store(user_msg: string, assistant_msg?: string): Promise<void> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'user', content: user_msg },
    ];
    if (assistant_msg) messages.push({ role: 'assistant', content: assistant_msg });
    try {
      await this.post('/v1/memories/', { messages, user_id: this.user_id });
    } catch (error) {
      logger.warning('memory store failed', error);
    }
  }
}

const mem0_key = process.env.MEM0_API_KEY;
const memory = mem0_key ? new Mem0Memory(mem0_key, USER_ID) : null;
if (memory === null) logger.warning('MEM0_API_KEY not set -- running without memory');

const pipeline = Pipeline({
  stt: DeepgramSTT(),
  llm: GoogleLLM(),
  tts: CartesiaTTS(),
  vad: SileroVAD(),
  turn_detector: TurnDetector(),
});

let session: Session | null = null;
let pending_msg: string | null = null;

/** Runs the moment the caller stops talking, before the LLM generates. */
pipeline.on('user_turn_start', async (transcript: string) => {
  pending_msg = transcript;
  if (memory === null || session === null) return;

  const relevant = await memory.search(transcript);
  if (relevant.length === 0) return;

  const facts = relevant.map((m) => `- ${m}`).join('\n');
  await session.add_message(
    'system',
    `Relevant memories about this user:\n${facts}\n\nUse these to answer personally.`,
  );
  logger.info(`injected ${relevant.length} memories`);
});

/** The agent's reply, paired with what prompted it. */
pipeline.on('llm', async (data: Record<string, any>) => {
  if (memory === null || !pending_msg) {
    pending_msg = null;
    return;
  }
  await memory.store(pending_msg, data?.text ?? '');
  pending_msg = null;
});

class PersonalAssistant extends Agent {
  constructor() {
    super({
      instructions:
        'You are a friendly personal assistant. You remember things users tell ' +
        'you like their name, preferences, and interests. Use what you know to ' +
        'make conversations feel personal. Keep responses short and conversational.',
      agent_id: AGENT_ID,
      pipeline,
    });
  }

  async on_enter(): Promise<void> {
    session = this.session;
    await this.session!.say('Hey! Welcome back. How can I help you today?');
  }

  async on_exit(): Promise<void> {
    await this.session!.say("Bye! I'll remember everything for next time.");
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Personal Assistant', playground: true }),
  });
}

await zeroruntime.serve(PersonalAssistant, { on_ready });
