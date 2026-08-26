// One caller, three agents: the front agent can hand off in either of two
// directions and each specialist inherits the conversation. Each agent gets its
// own pipeline instance, since a pipeline carries the hooks registered on it.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, function_tool, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('multi_agent_switch');

const AGENT_ID = process.env.AGENT_ID ?? 'travel';

function build_pipeline(): Pipeline {
  return Pipeline({
    stt: DeepgramSTT(),
    llm: GoogleLLM(),
    tts: CartesiaTTS(),
    vad: SileroVAD(),
    turn_detector: TurnDetector(),
  });
}

class BookingAgent extends Agent {
  constructor({ inherit_context = false }: { inherit_context?: boolean } = {}) {
    super({
      instructions:
        'You are the booking specialist. Help the caller choose and book ' +
        'flights and hotels.',
      agent_id: 'booking',
      pipeline: build_pipeline(),
      inherit_context,
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say('I can help with your booking. What did you have in mind?');
  }

  async on_exit(): Promise<void> {
    logger.info('booking finished');
  }
}

class TravelSupportAgent extends Agent {
  constructor({ inherit_context = false }: { inherit_context?: boolean } = {}) {
    super({
      instructions:
        'You are travel support. Handle cancellations, delays, changes and ' +
        'anything that has gone wrong with an existing trip.',
      agent_id: 'travel-support',
      pipeline: build_pipeline(),
      inherit_context,
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say("I'm travel support. Tell me what has gone wrong.");
  }

  async on_exit(): Promise<void> {
    logger.info('support finished');
  }
}

class TravelAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a travel assistant. Work out what the caller needs. For ' +
        'booking a new trip, call transfer_to_booking. For a problem with an ' +
        'existing trip, call transfer_to_travel_support.',
      agent_id: AGENT_ID,
      pipeline: build_pipeline(),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say('Hello! Are you booking a trip, or is something wrong with one?');
  }

  async on_exit(): Promise<void> {
    logger.info('travel agent finished');
  }

  transfer_to_booking = function_tool({
    name: 'transfer_to_booking',
    description: 'Transfer the caller to the booking specialist.',
    execute: async function (this: TravelAgent): Promise<Agent> {
      logger.info('-> booking');
      await this.session!.add_handoff('booking', { from_agent: this.id });
      return new BookingAgent({ inherit_context: true });
    },
  });

  transfer_to_travel_support = function_tool({
    name: 'transfer_to_travel_support',
    description: 'Transfer the caller to travel support.',
    execute: async function (this: TravelAgent): Promise<Agent> {
      logger.info('-> travel support');
      await this.session!.add_handoff('travel-support', { from_agent: this.id });
      return new TravelSupportAgent({ inherit_context: true });
    },
  });
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Multi Agent Switch', playground: true }),
  });
}

await zeroruntime.serve(TravelAgent, { on_ready });
