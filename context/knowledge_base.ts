// Answering from your own documents rather than the model's own knowledge:
// KnowledgeBase names the knowledge documents uploaded in the dashboard, and
// every user turn searches all of them and puts the best sections in front of
// the model. The search runs in the runtime, so nothing here calls an API.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, KnowledgeBase, Pipeline, Room } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const AGENT_ID = process.env.AGENT_ID ?? 'knowledge-base';

// One id per document, from the dashboard's knowledge page. The placeholders
// keep the call running, but every lookup comes back empty -- see context/README.md.
const KNOWLEDGE_IDS = (process.env.KNOWLEDGE_IDS ?? 'kb_id_1,kb_id_2')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const pipeline = Pipeline({
  stt: DeepgramSTT({ model: 'nova-2' }),
  llm: GoogleLLM({ model: 'gemini-2.5-flash' }),
  tts: CartesiaTTS(),
  vad: SileroVAD(),
  turn_detector: TurnDetector(),
  knowledge_base: KnowledgeBase({
    knowledge_ids: KNOWLEDGE_IDS,
    top_k: 5,
    // A question the documents cannot answer is filed in the dashboard's open
    // questions; answering it there is what the next re-index picks up.
    report_unanswered: true,
  }),
});

class SupportAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a support agent. Answer from the context you are given and ' +
        'nothing else. When it does not cover the question, say so and offer to ' +
        'pass the question on.',
      agent_id: AGENT_ID,
      pipeline,
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say('Hi! Ask me anything about our documentation.');
  }

  async on_exit(): Promise<void> {
    await this.session!.say('Goodbye!');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Knowledge Base', playground: true }),
  });
}

await zeroruntime.serve(SupportAgent, { on_ready });
