// Five personas swapped live from the room's chat. A pubsub message naming one
// rebuilds the running pipeline -- different STT, LLM, TTS and turn detector, or
// a hop to a realtime model and back -- keeping everything already said.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import {
  Agent,
  EOUConfig,
  InterruptConfig,
  Pipeline,
  PipelineOptions,
  PubSubSubscribeConfig,
  Room,
  get_logger,
} from '@zeroruntime/js-sdk';
import {
  AssemblyAISTT,
  CartesiaTTS,
  DeepgramSTT,
  DeepgramTTS,
  GeminiRealtime,
  GoogleLLM,
  GoogleSTT,
  GoogleTTS,
  SarvamAISTT,
  SarvamAITTS,
  TurnDetector,
} from '@zeroruntime/js-sdk/inference';
import { GenerationConfig, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('persona_switch');

const TOPIC = 'CHAT';
const AGENT_ID = process.env.AGENT_ID ?? 'persona-switch';

const _VOICE =
  'You are a general-purpose voice AI assistant powered by ZeroRuntime. You ' +
  'can answer any question, help with tasks, provide information, have casual ' +
  'conversations, and assist with anything the user needs. You are friendly, ' +
  'knowledgeable, concise, and natural in conversation. Keep responses short ' +
  'and conversational -- you are a voice agent, not a chatbot. Avoid long ' +
  'lists or overly structured answers. Speak naturally.';

const _TUNING = (): PipelineOptions => ({
  vad: SileroVAD(),
  turn_detector: TurnDetector(),
  eou_config: EOUConfig({ mode: 'ADAPTIVE', min_max_speech_wait_timeout: [0.1, 0.5] }),
  interrupt_config: InterruptConfig({
    mode: 'HYBRID',
    interrupt_min_duration: 0.2,
    interrupt_min_words: 2,
    false_interrupt_pause_duration: 2.0,
    resume_on_false_interrupt: true,
  }),
});

interface Persona {
  name: string;
  instructions: string;
  pipeline: Pipeline;
}

function _persona(name: string, components: PipelineOptions): Persona {
  return {
    name,
    instructions: `Your name is ${name}. ${_VOICE}`,
    pipeline: Pipeline(components),
  };
}

const PERSONAS: Record<string, Persona> = {
  deepgram: _persona('Alex', {
    stt: DeepgramSTT({ model: 'nova-2' }),
    llm: GoogleLLM({ model: 'gemini-3-flash-preview' }),
    // sonic-3 is what makes generation_config take effect: Cartesia only reads
    // it on sonic-3+ and ignores it on earlier voices.
    tts: CartesiaTTS({
      model: 'sonic-3',
      generation_config: GenerationConfig({ speed: 1.1, emotion: 'positivity' }),
    }),
    ..._TUNING(),
  }),
  assembly: _persona('Maya', {
    stt: AssemblyAISTT(),
    llm: GoogleLLM({ model: 'gemini-3-flash-preview' }),
    tts: DeepgramTTS({ model: 'aura-2' }),
    ..._TUNING(),
  }),
  google: _persona('Sophia', {
    stt: GoogleSTT({ model: 'chirp_3' }),
    llm: GoogleLLM({ model: 'gemini-3-flash-preview' }),
    tts: GoogleTTS(),
    ..._TUNING(),
  }),
  sarvam: _persona('Emma', {
    stt: SarvamAISTT({ model: 'saaras:v3', language: 'en-IN' }),
    llm: GoogleLLM({ model: 'gemini-3-flash-preview' }),
    tts: SarvamAITTS({ model: 'bulbul:v3', speaker: 'suhani', language: 'en-IN' }),
    ..._TUNING(),
  }),
  realtime: _persona('Ryan', {
    realtime: GeminiRealtime({ model: 'gemini-3.1-flash-live-preview' }),
  }),
};

const FIRST = 'deepgram';

const room = Room({ name: 'Persona Switch', playground: true });

/**
 * One long-lived agent that wears different personas.
 *
 * A switch rebuilds the pipeline on the *same* session, so the conversation is
 * preserved across every hop -- cascade to cascade, cascade to realtime, and
 * back. That is the whole point: a handoff would start a new agent and lose it.
 */
class PersonaAgent extends Agent {
  private _current = FIRST;

  constructor() {
    const start = PERSONAS[FIRST];
    super({
      instructions: start.instructions,
      agent_id: AGENT_ID,
      pipeline: start.pipeline,
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.subscribe_to_pubsub(
      PubSubSubscribeConfig({ topic: TOPIC, cb: this.on_chat.bind(this) }),
    );
    await this.session!.say(
      `Hey! ${PERSONAS[this._current].name} here -- what can I help with?`,
    );
  }

  /** A persona name in the room chat switches the pipeline. */
  async on_chat(frame: Record<string, any>, backlog: boolean): Promise<void> {
    if (backlog) return;
    const key = String(frame?.message ?? '').trim().toLowerCase();
    if (!(key in PERSONAS)) {
      logger.info(`ignoring unknown persona: '${key}'`);
      return;
    }
    await this.switch_persona(key);
  }

  async switch_persona(key: string): Promise<void> {
    if (key === this._current) return;
    const outgoing = PERSONAS[this._current].name;
    const incoming = PERSONAS[key].name;
    logger.info(`switching persona: ${outgoing} -> ${incoming}`);

    let mode: string;
    try {
      mode = await this.session!.change_pipeline(PERSONAS[key].pipeline, {
        instructions: PERSONAS[key].instructions,
      });
    } catch (error) {
      logger.exception(`persona switch to ${key} failed; staying on ${outgoing}`, error);
      await this.session!.say(
        `Sorry, I could not switch to ${incoming}. Still ${outgoing} here.`,
      );
      return;
    }

    this._current = key;
    logger.info(`now running ${incoming} (mode=${mode})`);
    await this.session!.say(`${incoming} here, taking it from ${outgoing}. What's next?`);
  }

  async on_exit(): Promise<void> {
    logger.info(`session finished on persona ${PERSONAS[this._current].name}`);
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, { room });
}

await zeroruntime.serve(PersonaAgent, { on_ready });
