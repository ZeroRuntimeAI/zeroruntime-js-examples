// Keeping the call up when a provider degrades: the head serves and the tail
// stands by. Every credential, standbys included, is checked when the session
// starts rather than at failover.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, FallbackLLM, FallbackSTT, FallbackTTS, Pipeline, Room } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import {
  CartesiaTTS,
  DeepgramSTT,
  GoogleLLM,
  OpenAILLM,
  OpenAISTT,
  OpenAITTS,
  SileroVAD,
} from '@zeroruntime/js-sdk/plugins';

const AGENT_ID = 'fallback-recovery-agent';

class ResilientAgent extends Agent {
  constructor() {
    super({
      agent_id: AGENT_ID,
      instructions:
        'You are a helpful voice assistant that can answer questions and help with tasks.',
      pipeline: Pipeline({
        // latency_threshold_ms is what turns on demotion for a provider that is
        // merely slow: without it a standby is only reached once the head
        // actually errors, and a provider that answers in four seconds never
        // errors. The budgets differ per slot because the components do not
        // degrade on the same timescale.
        stt: FallbackSTT([OpenAISTT(), DeepgramSTT()], {
          temporary_disable_sec: 30.0,
          permanent_disable_after_attempts: 3,
          latency_threshold_ms: 350,
          consecutive_latency_hits: 3,
        }),
        llm: FallbackLLM([OpenAILLM({ model: 'gpt-4o-mini' }), GoogleLLM({ model: 'gemini-2.5-flash' })], {
          temporary_disable_sec: 30.0,
          permanent_disable_after_attempts: 3,
          latency_threshold_ms: 800,
          consecutive_latency_hits: 3,
        }),
        tts: FallbackTTS([OpenAITTS({ voice: 'alloy' }), CartesiaTTS()], {
          temporary_disable_sec: 30.0,
          permanent_disable_after_attempts: 3,
          latency_threshold_ms: 250,
          consecutive_latency_hits: 3,
        }),
        vad: SileroVAD(),
        turn_detector: TurnDetector(),
      }),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say(
      "Hello Buddy, Welcome to ZeroRuntime's Voice AI Agent Framework.",
    );
  }

  async on_exit(): Promise<void> {
    await this.session!.say('Goodbye!');
  }
}

async function invoke_agent(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Fallback Recovery', playground: true }),
  });
}

await zeroruntime.serve(ResilientAgent, { on_ready: invoke_agent });
