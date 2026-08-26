// One loan-advisor agent in English, Hindi, Gujarati or Marathi. A language is
// picked at startup and the caller can change it mid-call: three things move per
// language -- STT, TTS and instructions -- and all three have to agree, which is
// what change_component does in one call. Sarvam speaks all four; Deepgram and
// Cartesia have no Gujarati or Marathi to offer.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, function_tool, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { GoogleLLM, SarvamAISTT, SarvamAITTS, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('demo_multilang');

const AGENT_ID = process.env.AGENT_ID ?? 'multilang-loan-advisor';

const base_prompt = (currency: string, label: string): string =>
  'You are a business loan advisor. Help the caller understand loan products, ' +
  'check eligibility, and work out an EMI. Use the tools rather than ' +
  `estimating. Keep answers short -- they are spoken aloud. Amounts are in ` +
  `${currency}. Reply only in ${label}. If the caller asks for another language, ` +
  'or answers you in one, call switch_language and carry on in that language.';

interface LanguageConfig {
  label: string;
  code: string;
  currency: string;
  greeting: string;
}

// Sarvam takes one language code for both ends of the call, so a language is a
// code and the words that go with it.
const LANGUAGES: Record<string, LanguageConfig> = {
  en: {
    label: 'English',
    code: 'en-IN',
    currency: '₹ (rupees)',
    greeting:
      "Hi! I'm your business loan advisor. Want to hear about our loan " +
      'products, check eligibility, or work out an EMI?',
  },
  hi: {
    label: 'Hindi',
    code: 'hi-IN',
    currency: '₹ (rupees)',
    greeting:
      'नमस्ते! मैं आपकी business loan advisor हूँ। आप loan products, ' +
      'eligibility, या EMI के बारे में पूछ सकते हैं।',
  },
  gu: {
    label: 'Gujarati',
    code: 'gu-IN',
    currency: '₹ (rupees)',
    greeting: 'નમસ્તે! હું તમારી business loan advisor છું.',
  },
  mr: {
    label: 'Marathi',
    code: 'mr-IN',
    currency: '₹ (rupees)',
    greeting: 'नमस्कार! मी तुमची business loan advisor आहे.',
  },
};

const LANG = (process.argv[2] ?? process.env.LANG_CODE ?? 'hi').toLowerCase();
if (!(LANG in LANGUAGES)) {
  throw new Error(
    `unknown language '${LANG}'; pick one of ${JSON.stringify(Object.keys(LANGUAGES).sort())}`,
  );
}
const CFG = LANGUAGES[LANG];

const instructions_for = (cfg: LanguageConfig): string =>
  base_prompt(cfg.currency, cfg.label);

const get_loan_products = function_tool({
  name: 'get_loan_products',
  description: 'List the loan products of a given type.',
  parameters: {
    loan_type: { type: 'string', description: '"term", "working_capital" or "equipment".' },
  },
  execute: async ({ loan_type }) => {
    const products: Record<string, Record<string, number>> = {
      term: { min: 500_000, max: 50_000_000, rate: 14.5, tenure_months: 60 },
      working_capital: { min: 200_000, max: 20_000_000, rate: 16.0, tenure_months: 24 },
      equipment: { min: 300_000, max: 30_000_000, rate: 13.0, tenure_months: 84 },
    };
    return products[loan_type] ?? { error: `no product called ${loan_type}` };
  },
});

const calculate_emi = function_tool({
  name: 'calculate_emi',
  description: 'Work out the monthly instalment for a loan.',
  parameters: {
    principal: { type: 'number', description: 'The amount borrowed.' },
    annual_rate_percent: {
      type: 'number',
      description: 'The annual interest rate, as a percentage.',
    },
    tenure_months: { type: 'integer', description: 'How many months the loan runs for.' },
  },
  execute: async ({ principal, annual_rate_percent, tenure_months }) => {
    const monthly_rate = annual_rate_percent / 12 / 100;
    let emi: number;
    if (monthly_rate === 0) {
      emi = principal / tenure_months;
    } else {
      const factor = (1 + monthly_rate) ** tenure_months;
      emi = (principal * monthly_rate * factor) / (factor - 1);
    }
    return {
      emi: Math.round(emi * 100) / 100,
      total_paid: Math.round(emi * tenure_months * 100) / 100,
    };
  },
});

const check_eligibility = function_tool({
  name: 'check_eligibility',
  description: 'Check whether the caller qualifies.',
  parameters: {
    cibil_score: { type: 'integer', description: 'Their credit score.' },
    business_age_years: { type: 'number', description: 'How long the business has traded.' },
    monthly_turnover: { type: 'number', description: 'Average monthly turnover.' },
  },
  execute: async ({ cibil_score, business_age_years, monthly_turnover }) => {
    const reasons: string[] = [];
    if (cibil_score < 700) reasons.push('credit score below 700');
    if (business_age_years < 2) reasons.push('business younger than two years');
    if (monthly_turnover < 100_000) reasons.push('monthly turnover below the minimum');
    return { eligible: reasons.length === 0, reasons };
  },
});

class MultilangLoanAgent extends Agent {
  lang = LANG;

  constructor() {
    super({
      instructions: instructions_for(CFG),
      agent_id: AGENT_ID,
      tools: [get_loan_products, calculate_emi, check_eligibility],
      pipeline: Pipeline({
        stt: SarvamAISTT({ model: 'saaras:v3', language: CFG.code }),
        llm: GoogleLLM({ model: 'gemini-2.5-flash' }),
        tts: SarvamAITTS({ model: 'bulbul:v3', language: CFG.code }),
        vad: SileroVAD(),
        turn_detector: TurnDetector(),
      }),
    });
  }

  switch_language = function_tool({
    name: 'switch_language',
    description: 'Continue the call in another language.',
    parameters: {
      language: { type: 'string', description: '"en", "hi", "gu" or "mr".' },
    },
    execute: async function (this: MultilangLoanAgent, { language }) {
      const cfg = LANGUAGES[language];
      if (cfg === undefined) {
        return {
          error: `no language called ${language}`,
          available: Object.keys(LANGUAGES).sort(),
        };
      }
      if (language === this.lang) return { already_speaking: cfg.label };

      // The LLM, VAD and turn detector are the same in every language, so they
      // are not named here and the swap leaves them running.
      await this.session!.change_component({
        stt: SarvamAISTT({ model: 'saaras:v3', language: cfg.code }),
        tts: SarvamAITTS({ model: 'bulbul:v3', language: cfg.code }),
        instructions: instructions_for(cfg),
      });
      logger.info(`language switched ${LANGUAGES[this.lang].label} -> ${cfg.label}`);
      this.lang = language;
      return { switched_to: cfg.label };
    },
  });

  async on_enter(): Promise<void> {
    await this.session!.say(CFG.greeting);
  }

  async on_exit(): Promise<void> {
    logger.info(`call finished in ${LANGUAGES[this.lang].label}`);
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: `Loan Advisor (${CFG.label})`, playground: true }),
  });
}

logger.info(`running in ${CFG.label}`);
await zeroruntime.serve(MultilangLoanAgent, { on_ready });
