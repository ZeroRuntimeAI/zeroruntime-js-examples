// Passing the caller from one agent to the next: a tool that returns an Agent is
// the handoff. inherit_context carries the conversation across, and add_handoff
// records who moved them and why -- before the return, so it is inherited too.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, function_tool, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('agent_sequential_handoff');

const AGENT_ID = process.env.AGENT_ID ?? 'intake';

/**
 * A fresh pipeline per agent.
 *
 * Not one shared instance: the pipeline carries the hooks registered on it, and
 * two agents sharing one would each receive the other's events.
 */
function build_pipeline(): Pipeline {
  return Pipeline({
    stt: DeepgramSTT(),
    llm: GoogleLLM(),
    tts: CartesiaTTS(),
    vad: SileroVAD(),
    turn_detector: TurnDetector(),
  });
}

/** The specialist. Greets the caller already knowing why they were moved. */
class BillingAgent extends Agent {
  private readonly _reason: string;

  constructor({
    inherit_context = false,
    reason = '',
  }: { inherit_context?: boolean; reason?: string } = {}) {
    super({
      instructions:
        'You are the billing specialist. Resolve charge disputes, payment ' +
        'questions, and refunds.',
      agent_id: 'billing',
      pipeline: build_pipeline(),
      inherit_context,
    });
    this._reason = reason;
  }

  async on_enter(): Promise<void> {
    if (this._reason) {
      await this.session!.say(
        `I'm the billing specialist -- I see you're here about ${this._reason}. ` +
          "Let's get that sorted.",
      );
    } else {
      await this.session!.say("I'm the billing specialist. What can I help you with?");
    }

    await this.session!.add_message('assistant', '[billing agent engaged]', {
      agent_id: this.id,
    });
  }

  async on_exit(): Promise<void> {
    logger.info('billing finished');
  }
}

/** First line. Decides who the caller actually needs. */
class IntakeAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are the first line of support. Find out what the caller needs. If ' +
        'it is about a charge, a payment or a refund, call transfer_to_billing ' +
        'with a short reason.',
      agent_id: AGENT_ID,
      pipeline: build_pipeline(),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say("Hi, you've reached support. How can I help?");
  }

  async on_exit(): Promise<void> {
    logger.info('intake finished');
  }

  transfer_to_billing = function_tool({
    name: 'transfer_to_billing',
    description: 'Transfer the caller to the billing specialist.',
    parameters: {
      reason: {
        type: 'string',
        description: 'Short reason for the transfer, e.g. "disputed charge".',
      },
    },
    execute: async function (this: IntakeAgent, { reason }): Promise<Agent> {
      logger.info(`transferring to billing: ${reason}`);

      await this.session!.add_handoff('billing', { from_agent: this.id, reason });

      return new BillingAgent({ inherit_context: true, reason });
    },
  });
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Sequential Handoff', playground: true }),
  });
}

await zeroruntime.serve(IntakeAgent, { on_ready });
