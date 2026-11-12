import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, KnowledgeBase, Pipeline, Room, function_tool, get_logger } from '@zeroruntime/js-sdk';
import { GeminiLiveConfig, GeminiRealtime } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('knowledge_base_tool');

const kb = KnowledgeBase({ knowledge_ids: ['9eslt'], top_k: 5 });

const search_docs = function_tool({
  name: 'search_docs',
  description: 'Search the product documentation and support policies.',
  parameters: {
    query: { type: 'string' },
  },
  execute: async ({ query }) =>
    kb.retrieve(query, { top_k: 5, context_prefix: 'Product documentation and support policies:\n\n' }),
});

const pipeline = Pipeline({
  realtime: GeminiRealtime({
    model: 'gemini-3.1-flash-live-preview',
    config: GeminiLiveConfig({ voice: 'Leda', response_modalities: ['AUDIO'] }),
  }),
});

pipeline.metrics.on('knowledge_base', (data: Record<string, any>) => {
  logger.info(`knowledge_base ${JSON.stringify(data)}`);
});

class SupportAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a support agent. For any question about our products or ' +
        'policies, call search_docs and answer only from what it returns. ' +
        'When it does not cover the question, say so.',
      pipeline,
      tools: [search_docs],
    });
  }

  get_weather = function_tool({
    name: 'get_weather',
    description: 'Fetch the current weather for a location.',
    parameters: {
      latitude: { type: 'string', description: 'Latitude of the location. Estimate it; do not ask.' },
      longitude: { type: 'string', description: 'Longitude of the location. Estimate it; do not ask.' },
    },
    execute: async ({ latitude, longitude }) => ({ latitude, longitude, temperature_c: 28 }),
  });

  async on_enter(): Promise<void> {
    await this.session!.say('Hi! Ask me anything about our documentation.');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke({
    room: Room({ name: 'Knowledge Base Tool', playground: true }),
  });
}

await zeroruntime.serve(SupportAgent, { on_ready });
