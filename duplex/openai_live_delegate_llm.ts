// Client delegation answered by a model you choose: GPT-Live runs the
// conversation, and every delegation goes to Gemini, which runs the agent's own
// function tools. The ZeroRuntime builds the Gemini model next to GPT-Live --
// credentials, route and billing like any llm slot -- so there is no delegation
// handler to write, and the tool bodies below run in this process as usual.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, function_tool, get_logger } from '@zeroruntime/js-sdk';
import { GoogleLLM } from '@zeroruntime/js-sdk/inference';
import { OpenAIDelegateLLMConfig, OpenAILive } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('openai_live_delegate_llm');

const AGENT_ID = process.env.AGENT_ID ?? 'openai-live-delegate-llm';

const ORDERS: Record<string, string> = {
  B1102: 'shipped and arriving Thursday',
  A2133: 'still being packed',
};

const normalise = (order_id: string): string => order_id.toUpperCase().replaceAll(' ', '');

const check_order_status = function_tool({
  name: 'check_order_status',
  description: 'Check the delivery status of an order.',
  parameters: {
    order_id: { type: 'string', description: 'The order reference, such as B1102.' },
  },
  execute: async ({ order_id }) => {
    console.log(`[TOOLCALL] check_order_status tool called with order_id: ${order_id}`);
    const status = ORDERS[normalise(order_id)];
    logger.info(`order ${order_id} -> ${status}`);
    return { order_id, status: status ?? 'no such order' };
  },
});

const schedule_delivery = function_tool({
  name: 'schedule_delivery',
  description: 'Book a delivery day for an order that has shipped.',
  parameters: {
    order_id: { type: 'string', description: 'The order reference, such as A1042.' },
    day: { type: 'string', description: 'The requested delivery day, such as Tuesday.' },
  },
  execute: async ({ order_id, day }) => {
    console.log(`[TOOLCALL] schedule_delivery tool called with order_id: ${order_id}, day: ${day}`);
    if (!(normalise(order_id) in ORDERS)) return { booked: false, reason: `no order ${order_id}` };
    logger.info(`booked ${order_id} for ${day}`);
    return { booked: true, order_id, day };
  },
});

class DelegateLLMAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a voice assistant for an online furniture store. Keep spoken ' +
        'replies brief. Delegation policy: delegate order status questions and ' +
        'delivery bookings to the backend. Do not guess a result or confirm a ' +
        'booking before the backend reports it.',
      agent_id: AGENT_ID,
      // run by Gemini while it answers a delegation, like cascade tools
      tools: [check_order_status, schedule_delivery],
      pipeline: Pipeline({
        llm: OpenAILive({
          model: 'gpt-live-1',
          voice: 'marin',
          config: OpenAIDelegateLLMConfig({
            llm: GoogleLLM({ model: 'gemini-3-flash-preview', temperature: 0.2 }),
            instructions:
              'You are the order desk for an online furniture store. Use your ' +
              'tools for order facts. Only book a delivery for an order that ' +
              'exists, on the day the caller confirmed.',
          }),
        }),
      }),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say('Hello, how can I help you with your order today?');
  }

  async on_exit(): Promise<void> {
    logger.info('call finished');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'OpenAI Live + Gemini Delegate', playground: true }),
  });
}

await zeroruntime.serve(DelegateLLMAgent, { on_ready });
