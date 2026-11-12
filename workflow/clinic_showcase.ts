// Sunrise Clinic's appointment line: a main agent, then two subagents with workflows.
//
//   Clinic       greets on its pipeline, and hands the caller to intake
//   Intake       name -> reason -> referral (specialists only) -> insurance (optional)
//   Scheduling   slot -> confirm
//
// Each step's answer is a class. A tool checks what the caller said and calls
// this.complete(new Answer(...)); the runtime then moves to the next step. Nothing moves
// the call between subagents on its own: on_exit hands it on with transfer_to(new Scheduling()).
//
// The call starts on the agent you serve, Clinic, and switches to each subagent's own
// pipeline as it takes the call.
//
//   npx tsx workflow/clinic_showcase.ts

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, Step, SubAgent, function_tool, get_logger, on_workflow } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import {
  CartesiaTTS,
  DeepgramSTT,
  ElevenLabsTTS,
  GoogleLLM,
  SarvamAITTS,
  SileroVAD,
} from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('clinic_showcase');

const VISITS = ['checkup', 'illness', 'specialist'];
const SPECIALTIES = ['cardiology', 'dermatology', 'orthopaedics'];
const SLOTS: Record<string, string> = { S1: 'Monday 10:00', S2: 'Tuesday 14:30', S3: 'Thursday 09:15' };

// Answers: one class per step

class Patient {
  constructor(public full_name: string) {}
}

class Visit {
  constructor(public kind: string, public details: string) {}
}

class Referral {
  constructor(public specialty: string, public doctor: string) {}
}

class Insurance {
  constructor(public provider: string, public member_id: string) {}
}

class Booking {
  constructor(public slot_id: string, public when: string, public doctor: string) {}
}

class Confirmation {
  constructor(public reference: string) {}
}

// Intake: who's calling and why

class Intake extends SubAgent {
  name = 'intake';
  instructions = "You're the clinic's front desk. Ask one thing at a time, and keep it short and kind.";
  pipeline = Pipeline({
    stt: DeepgramSTT(),
    llm: GoogleLLM(),
    tts: SarvamAITTS(),
    vad: SileroVAD(),
    turn_detector: TurnDetector(),
  });
  steps = [
    Step({
      id: 'name',
      description: 'who is calling',
      instructions: "Get the patient's full name, then call record_name.",
      opening: "Ask for the patient's full name.",
      result: Patient,
    }),
    Step({
      id: 'reason',
      description: "why they're coming in",
      instructions:
        "Find out if it's a checkup, an illness or a specialist visit, and a few words " +
        'about it, then call record_reason.',
      opening: "Ask what they'd like to come in for.",
      result: Visit,
      max_attempts: 2, // two wrong answers, and on_step_failed runs
    }),
    Step({
      id: 'referral',
      description: 'referral',
      instructions: "Get the specialty and the referring doctor's name, then call record_referral.",
      opening: 'Ask which specialist they need, and who referred them.',
      result: Referral,
      condition: { field: 'reason.kind', in: ['specialist'] }, // only for a specialist visit
    }),
    Step({
      id: 'insurance',
      description: 'insurance',
      instructions: 'Ask for their insurer and member id, then call record_insurance.',
      opening: "Ask if they'll be using insurance.",
      result: Insurance,
      optional: true, // if they decline, the model calls the built-in skip_step
    }),
  ];

  async on_enter(reason?: string): Promise<string | null> {
    if (reason === 'caller changed the visit') {
      // sent back from scheduling by change_visit
      return "Say of course. If they've already said what they'd like instead, record it; otherwise ask.";
    }
    return null;
  }

  // A parameter not marked optional is asked for until the caller gives it.

  record_name = function_tool({
    name: 'record_name',
    description: "Record the patient's name.",
    parameters: {
      full_name: { type: 'string', description: "The patient's full name." },
    },
    execute: async function (this: Intake, { full_name }) {
      return this.complete(new Patient(full_name.trim()));
    },
  });

  record_reason = function_tool({
    name: 'record_reason',
    description: "Record why they're coming in.",
    parameters: {
      kind: { type: 'string', description: 'checkup, illness or specialist.' },
      details: { type: 'string', description: 'A few words about it.' },
    },
    execute: async function (this: Intake, { kind, details }) {
      if (!VISITS.includes(kind.toLowerCase())) {
        return { error: `kind is one of ${VISITS.join(', ')}.` }; // the model asks again
      }
      return this.complete(new Visit(kind.toLowerCase(), details));
    },
  });

  record_referral = function_tool({
    name: 'record_referral',
    description: 'Record the specialist they need and the referring doctor.',
    parameters: {
      specialty: { type: 'string', description: 'cardiology, dermatology or orthopaedics.' },
      doctor: { type: 'string', description: "The referring doctor's name." },
    },
    execute: async function (this: Intake, { specialty, doctor }) {
      if (!SPECIALTIES.includes(specialty.toLowerCase())) {
        return { error: `We see ${SPECIALTIES.join(', ')}.` };
      }
      return this.complete(new Referral(specialty.toLowerCase(), doctor));
    },
  });

  record_insurance = function_tool({
    name: 'record_insurance',
    description: 'Record their insurance.',
    parameters: {
      provider: { type: 'string', description: 'The insurer.' },
      member_id: { type: 'string', description: 'Their member id.' },
    },
    execute: async function (this: Intake, { provider, member_id }) {
      return this.complete(new Insurance(provider, member_id));
    },
  });

  fix_answer = function_tool({
    name: 'fix_answer',
    description: 'Go back to change one earlier answer; the others are kept.',
    parameters: {
      step_id: { type: 'string', description: 'name, reason, referral or insurance.' },
    },
    execute: async function (this: Intake, { step_id }) {
      return this.go_to_step(step_id, { reason: 'caller correction' });
    },
  });

  async on_exit(): Promise<unknown> {
    // Its steps are done: on to scheduling. Without this, the call stays here.
    return this.transfer_to(new Scheduling(), { reason: 'intake complete' });
  }

  async on_step_failed(step_id: string, reason: string): Promise<unknown> {
    // max_attempts reached: book a general checkup instead.
    void step_id;
    void reason;
    return this.transfer_to(new Scheduling(), { reason: 'general checkup' });
  }

  end_call = function_tool({
    name: 'end_call',
    description: 'End the call when the caller wants to stop.',
    execute: async function (this: Intake) {
      void this.hangup('caller done');
      return { status: 'ending_call' };
    },
  });
}

// Scheduling: pick a time and confirm it

class Scheduling extends SubAgent {
  name = 'scheduling';
  instructions =
    'You book the appointment. Offer the slots find_slots returns, never others. ' +
    'Once the caller has nothing else, call end_call.';
  pipeline = Pipeline({
    stt: DeepgramSTT(),
    llm: GoogleLLM(),
    tts: ElevenLabsTTS(),
    vad: SileroVAD(),
    turn_detector: TurnDetector(),
  });
  steps = [
    Step({
      id: 'slot',
      description: 'pick a time',
      instructions: 'Find slots, offer them, then call book_slot with their choice.',
      opening: "Say you'll look at the diary, then call find_slots.",
      result: Booking,
    }),
    Step({
      id: 'confirm',
      description: 'confirm',
      instructions: 'Read the booking back and get a clear yes, then call confirm_booking.',
      opening: "Read the booking back and ask if that's right.",
      result: Confirmation,
    }),
  ];

  doctor(): string {
    const referral: Referral | undefined = this.workflow.intake.referral;
    return referral ? referral.specialty : 'GP';
  }

  async on_enter(reason?: string): Promise<string> {
    if (reason === 'general checkup') {
      return "Say you'll book a general checkup, since you couldn't take all the details.";
    }
    const patient: Patient = this.workflow.intake.name;
    return `Thank ${patient.full_name}, and say you'll find a time.`;
  }

  find_slots = function_tool({
    name: 'find_slots',
    description: 'Look up open slots for their visit. Takes a moment.',
    execute: async function (this: Scheduling) {
      await this.session!.say('One moment while I check the diary.', { add_to_chat_context: false });
      return { doctor: this.doctor(), slots: SLOTS };
    },
  });

  book_slot = function_tool({
    name: 'book_slot',
    description: 'Hold the slot they chose.',
    parameters: {
      slot_id: { type: 'string', description: 'S1, S2 or S3.' },
    },
    execute: async function (this: Scheduling, { slot_id }) {
      if (!(slot_id in SLOTS)) return { error: `slot_id is one of ${Object.keys(SLOTS).join(', ')}.` };
      return this.complete(new Booking(slot_id, SLOTS[slot_id]!, this.doctor()));
    },
  });

  confirm_booking = function_tool({
    name: 'confirm_booking',
    description: "The caller's answer to the booking read back.",
    parameters: {
      confirmed: { type: 'boolean', description: 'True if they said yes.' },
    },
    execute: async function (this: Scheduling, { confirmed }) {
      if (!confirmed) return this.go_to_step('slot', { reason: 'caller wants another time' });
      const booking: Booking = this.workflow.slot;
      return this.complete(new Confirmation(`SUN-${booking.slot_id}`));
    },
  });

  change_visit = function_tool({
    name: 'change_visit',
    description: "The caller wants to change why they're coming in.",
    execute: async function (this: Scheduling) {
      // A step in another subagent: the caller is handed back to intake for it.
      return this.go_to_step('intake.reason', { reason: 'caller changed the visit' });
    },
  });

  track = on_workflow('step_end', (data: Record<string, any>) => {
    logger.info(`${data.agent}.${data.step} done; to do: ${JSON.stringify(data.progress?.to_do)}`);
  });

  async on_exit(): Promise<string> {
    // Its steps are done and it moves the call nowhere, so it stays here. As the call
    // ends, this line is the goodbye.
    return 'Thanks for calling Sunrise Clinic. See you soon.';
  }

  end_call = function_tool({
    name: 'end_call',
    description: 'End the call when the caller says goodbye or has nothing else.',
    execute: async function (this: Scheduling) {
      void this.hangup('caller done');
      return { status: 'ending_call' };
    },
  });
}

// The main agent, the one you serve: the call starts here

class Clinic extends Agent {
  constructor() {
    super({
      instructions: 'You answer the phone at Sunrise Clinic. Greet the caller, then call to_intake.',
      pipeline: Pipeline({
        stt: DeepgramSTT(),
        llm: GoogleLLM(),
        tts: CartesiaTTS(),
        vad: SileroVAD(),
        turn_detector: TurnDetector(),
      }),
    });
    for (const event of ['agent_handoff', 'step_start', 'step_end', 'step_back', 'step_failed'] as const) {
      this.on(event, console.log);
    }
  }

  async on_enter(): Promise<string> {
    logger.info(`call started for ${this.userdata.caller_name ?? 'a caller'}`);
    await this.session!.say("Hello, welcome to Sunrise Clinic! I'll get you booked in today.");
    return 'Call to_intake now, without saying anything.';
  }

  async on_exit(): Promise<void> {
    // The call is ending.
    logger.info('call over');
  }

  to_intake = function_tool({
    name: 'to_intake',
    description: 'Hand the caller to intake to take their details.',
    execute: async function (this: Clinic) {
      return this.transfer_to(new Intake(), { reason: 'new caller' });
    },
  });
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke({
    room: Room({ name: 'Sunrise Clinic', playground: true }),
    metadata: { caller_name: 'Ravi' },
  });
}

await zeroruntime.serve(Clinic, { on_ready });
