// Redaction travels on the Room, next to traces and metrics. `rules` names what
// counts as sensitive here and what each kind reads as once it is gone; `target`
// says where it is removed from.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import {
  Agent,
  Observability,
  PIIRedaction,
  PIIType,
  Pipeline,
  RedactionTarget,
  Room,
} from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const AGENT_ID = process.env.AGENT_ID ?? 'pii-redaction-agent';

const pipeline = Pipeline({
  stt: DeepgramSTT(),
  llm: GoogleLLM(),
  tts: CartesiaTTS(),
  vad: SileroVAD(),
  turn_detector: TurnDetector(),
});

class PaymentAgent extends Agent {
  constructor() {
    super({
      instructions:
        "You take card payments over the phone. Ask for the caller's date of " +
        'birth, then a contact number, then an email for the receipt, then the ' +
        'card number. Ask for one at a time, and never repeat a value back -- ' +
        'acknowledge it and move on to the next question. Keep every question short.',
      agent_id: AGENT_ID,
      pipeline,
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say('Hello, I can take your payment. May I start with your date of birth?');
  }

  async on_exit(): Promise<void> {
    await this.session!.say('Thank you, goodbye!');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({
      name: 'PII Redaction',
      playground: true,
      recording: true,
      observability: Observability({
        pii_redaction: PIIRedaction({
          target: [RedactionTarget.RECORDING, RedactionTarget.TRANSCRIPT],
          rules: {
            [PIIType.CREDIT_CARD]: 'CARD',
            [PIIType.PHONE_NUMBER]: 'NUMBER',
            [PIIType.EMAIL]: 'MAIL',
            'Date Of Birth': 'DOB',
          },
        }),
      }),
    }),
  });
}

await zeroruntime.serve(PaymentAgent, { on_ready });
