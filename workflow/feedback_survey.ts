// A feedback call that follows a workflow, with no subagents: the agent's own
// steps, and its own tools to finish them.
//
//   rating -> reason (low ratings only) -> follow_up (optional) -> thanks
//
// The runtime keeps the order: each step is asked once its turn comes, and only
// a tool's this.complete(new Answer(...)) finishes it.
//
//   npx tsx workflow/feedback_survey.ts

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, Step, function_tool, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('feedback_survey');

// Answers: one class per step

class Rating {
  constructor(public score: number) {}
}

class Reason {
  constructor(public what_went_wrong: string) {}
}

class FollowUp {
  constructor(public email: string) {}
}

class Thanks {
  constructor(public said: boolean) {}
}

const SURVEY = [
  Step({
    id: 'rating',
    description: 'their rating',
    instructions: 'Ask them to rate the delivery from 1 to 5, then call record_rating.',
    opening: "Ask how they'd rate their delivery, from 1 to 5.",
    result: Rating,
    max_attempts: 3,
  }),
  Step({
    id: 'reason',
    description: 'what went wrong',
    instructions: 'Ask what went wrong, listen, say sorry, then call record_reason.',
    opening: "Say you're sorry to hear that, and ask what went wrong.",
    result: Reason,
    condition: { field: 'rating.score', in: [1, 2, 3] }, // only for a low rating
  }),
  Step({
    id: 'follow_up',
    description: 'a follow-up',
    instructions: 'Offer to have someone email them about it, then call record_follow_up with their email.',
    opening: "Ask if they'd like someone to follow up by email.",
    result: FollowUp,
    optional: true, // if they decline, the model calls the built-in skip_step
  }),
  Step({
    id: 'thanks',
    description: 'thank them',
    instructions: 'Thank them for their time, then call finish_survey.',
    opening: 'Thank them for their time.',
    result: Thanks,
  }),
];

class Feedback extends Agent {
  constructor() {
    super({
      name: 'survey',
      instructions:
        'You call QuickShip customers for feedback about a recent delivery: short and friendly, ' +
        "under two minutes. This is a phone call: a sentence or two at a time. If they don't " +
        'have time, thank them and call end_call. Once the survey is done, call end_call.',
      pipeline: Pipeline({
        stt: DeepgramSTT(),
        llm: GoogleLLM(),
        tts: CartesiaTTS(),
        vad: SileroVAD(),
        turn_detector: TurnDetector(),
      }),
      workflow: SURVEY, // the agent's own steps
    });
    for (const event of ['step_start', 'step_end'] as const) this.on(event, console.log);
  }

  async on_enter(): Promise<void> {
    // The call starts: say() speaks these exact words; the first step's opening follows them.
    const name = this.userdata.caller_name ?? 'there'; // from invoke({ metadata })
    await this.session!.say(`Hi ${name}, this is QuickShip, calling for two minutes of feedback on your delivery.`);
  }

  async on_exit(): Promise<string> {
    // Run once every step is done (it's the only agent, so the call stays here), and as the call
    // ends: this line is the goodbye.
    return 'Thanks again, and have a lovely day.';
  }

  record_rating = function_tool({
    name: 'record_rating',
    description: 'Record their rating.',
    parameters: {
      score: { type: 'integer', description: '1 to 5.' },
    },
    execute: async function (this: Feedback, { score }) {
      if (!(score >= 1 && score <= 5)) return { error: 'The rating is 1 to 5. Ask again.' };
      return this.complete(new Rating(score));
    },
  });

  record_reason = function_tool({
    name: 'record_reason',
    description: 'Record what went wrong.',
    parameters: {
      what_went_wrong: { type: 'string', description: 'In their words, briefly.' },
    },
    execute: async function (this: Feedback, { what_went_wrong }) {
      return this.complete(new Reason(what_went_wrong));
    },
  });

  record_follow_up = function_tool({
    name: 'record_follow_up',
    description: 'Record the email for a follow-up.',
    parameters: {
      email: { type: 'string', description: 'Read it back to confirm before calling.' },
    },
    execute: async function (this: Feedback, { email }) {
      if (!email.includes('@')) return { error: "That isn't an email address. Ask them to spell it out." };
      return this.complete(new FollowUp(email.trim()));
    },
  });

  finish_survey = function_tool({
    name: 'finish_survey',
    description: "They've been thanked; the survey is done.",
    execute: async function (this: Feedback) {
      const rating: Rating = this.workflow.rating;
      const reason: Reason | undefined = this.workflow.reason;
      logger.info(`survey: ${rating.score}/5${reason ? `, ${reason.what_went_wrong}` : ''}`);
      return this.complete(new Thanks(true));
    },
  });

  end_call = function_tool({
    name: 'end_call',
    description: 'End the call.',
    execute: async function (this: Feedback) {
      void this.hangup('caller done'); // on_exit gives the goodbye
      return { status: 'ending_call' };
    },
  });
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke({
    room: Room({ name: 'QuickShip feedback', playground: true }),
    metadata: { caller_name: 'Arjun' },
  });
}

await zeroruntime.serve(Feedback, { on_ready });
