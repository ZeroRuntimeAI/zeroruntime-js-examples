// Subagents with no workflow: the desk, the agent you serve, answers the call and
// hands the caller to billing or tech support, who can hand them on or back.
//
// A SubAgent is its own instructions and tools, talking until a tool moves the call
// with transfer_to(new Billing()). With no workflow on the call each transfer is a plain
// agent handoff, which any runtime runs. The call starts on the desk's pipeline and
// switches to each subagent's own as it takes the call, then the caller hears it speak.
//
//   npx tsx workflow/support_desk.ts

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, SubAgent, function_tool, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import {
  CartesiaTTS,
  DeepgramSTT,
  ElevenLabsTTS,
  GoogleLLM,
  SarvamAITTS,
  SileroVAD,
} from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('support_desk');

const INVOICES: Record<string, { amount: number; status: string }> = {
  'INV-1001': { amount: 1499, status: 'paid' },
  'INV-1002': { amount: 2999, status: 'due' },
};
const SERVICES: Record<string, string> = {
  internet: 'running',
  email: 'slow in your region; a fix is due within the hour',
  tv: 'running',
};

/** Shared by every agent here: each one can end the call. */
function end_call_tool() {
  return function_tool({
    name: 'end_call',
    description: 'End the call when the caller says goodbye or has nothing else.',
    execute: async function (this: Agent) {
      void this.hangup('caller done');
      return { status: 'ending_call' };
    },
  });
}

class Billing extends SubAgent {
  name = 'billing';
  instructions =
    'You handle invoices and payments. Only quote what look_up_invoice returned. ' +
    'If they have nothing else, call end_call.';
  pipeline = Pipeline({
    stt: DeepgramSTT(),
    llm: GoogleLLM(),
    tts: ElevenLabsTTS(),
    vad: SileroVAD(),
    turn_detector: TurnDetector(),
  });

  async on_enter(reason?: string): Promise<string> {
    // reason is what the desk passed on: the caller isn't asked to repeat it.
    return `Say you're in billing and can help with: ${reason}. Ask for their invoice number.`;
  }

  async on_exit(): Promise<void> {
    logger.info('call ended in billing');
  }

  look_up_invoice = function_tool({
    name: 'look_up_invoice',
    description: 'Find an invoice.',
    parameters: {
      invoice_id: { type: 'string', description: 'The invoice number, e.g. INV-1001.' },
    },
    execute: async ({ invoice_id }) => {
      const invoice = INVOICES[invoice_id.trim().toUpperCase()];
      if (invoice === undefined) {
        return { error: `No invoice ${invoice_id}. Ask them to read the number again.` };
      }
      return { invoice_id: invoice_id.toUpperCase(), ...invoice };
    },
  });

  back_to_desk = function_tool({
    name: 'back_to_desk',
    description: "The caller needs something billing doesn't handle.",
    execute: async function (this: Billing) {
      return this.transfer_to('desk', { reason: 'needs something else' });
    },
  });

  to_tech_support = function_tool({
    name: 'to_tech_support',
    description: "The caller's billing question is really a service problem.",
    parameters: {
      summary: { type: 'string', description: "What's wrong, in a few words." },
    },
    execute: async function (this: Billing, { summary }) {
      return this.transfer_to(new TechSupport(), { reason: summary });
    },
  });

  end_call = end_call_tool();
}

class TechSupport extends SubAgent {
  name = 'tech_support';
  instructions =
    "You fix service problems. Check the service's status before suggesting anything. " +
    'If they have nothing else, call end_call.';
  pipeline = Pipeline({
    stt: DeepgramSTT(),
    llm: GoogleLLM(),
    tts: SarvamAITTS(),
    vad: SileroVAD(),
    turn_detector: TurnDetector(),
  });

  async on_enter(reason?: string): Promise<string> {
    return `Say you're in tech support and can look into: ${reason}. Ask which service it is if they haven't said.`;
  }

  async on_exit(): Promise<void> {
    logger.info('call ended in tech support');
  }

  check_status = function_tool({
    name: 'check_status',
    description: "Check a service's status in the caller's area.",
    parameters: {
      service: { type: 'string', description: 'internet, email or tv.' },
    },
    execute: async function (this: TechSupport, { service }) {
      await this.session!.say('Let me check that for you.', { add_to_chat_context: false });
      const status = SERVICES[service.trim().toLowerCase()];
      if (status === undefined) {
        return { error: `We look after ${Object.keys(SERVICES).join(', ')}. Ask which one it is.` };
      }
      return { service: service.toLowerCase(), status };
    },
  });

  back_to_desk = function_tool({
    name: 'back_to_desk',
    description: "The caller needs something tech support doesn't handle.",
    execute: async function (this: TechSupport) {
      return this.transfer_to('desk', { reason: 'needs something else' });
    },
  });

  end_call = end_call_tool();
}

class Desk extends Agent {
  constructor() {
    super({
      instructions:
        "You're Nimbus Telecom's front desk. Find out, in a sentence or two, whether the caller " +
        "needs help with a bill or with a service that isn't working, then hand them over. " +
        'If they have nothing else, call end_call.',
      pipeline: Pipeline({
        stt: DeepgramSTT(),
        llm: GoogleLLM(),
        tts: CartesiaTTS(),
        vad: SileroVAD(),
        turn_detector: TurnDetector(),
      }),
    });
    this.on('agent_handoff', console.log);
  }

  async on_enter(reason?: string): Promise<string> {
    if (reason === 'call started') {
      const name = this.userdata.caller_name ?? 'the caller'; // from invoke({ metadata })
      return `Greet ${name} as Nimbus Telecom, and ask how you can help.`;
    }
    return 'Ask what else you can help with.';
  }

  async on_exit(): Promise<void> {
    logger.info('call ended at the desk');
  }

  to_billing = function_tool({
    name: 'to_billing',
    description: 'Hand the caller to billing: invoices, payments, refunds.',
    parameters: {
      summary: { type: 'string', description: 'What they need, in a few words.' },
    },
    execute: async function (this: Desk, { summary }) {
      return this.transfer_to(new Billing(), { reason: summary });
    },
  });

  to_tech_support = function_tool({
    name: 'to_tech_support',
    description: "Hand the caller to tech support: a service that's down, slow or misbehaving.",
    parameters: {
      summary: { type: 'string', description: "What's wrong, in a few words." },
    },
    execute: async function (this: Desk, { summary }) {
      return this.transfer_to(new TechSupport(), { reason: summary });
    },
  });

  end_call = end_call_tool();
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke({
    room: Room({ name: 'Nimbus Telecom', playground: true }),
    metadata: { caller_name: 'Meera' },
  });
}

await zeroruntime.serve(Desk, { on_ready });
