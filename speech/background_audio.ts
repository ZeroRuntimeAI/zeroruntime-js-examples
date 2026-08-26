// Two sounds under the call, both on the room's mixing track.
//
//   thinking audio    plays while the LLM is generating, automatically, every turn
//   background audio  plays when you ask for it, and keeps playing until you stop
//
// Both need Room({ background_audio: true }). That flag is the track itself, not
// the sound: without it the runtime has nowhere to put audio that is not speech,
// and both calls below are declined. Neither plays by itself -- the Room opens
// the track, these two put something on it.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, function_tool } from '@zeroruntime/js-sdk';
import { GoogleLLM, SarvamAITTS, TurnDetector } from '@zeroruntime/js-sdk/inference';
import { DeepgramSTT, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const AGENT_ID = process.env.AGENT_ID ?? 'background-audio-agent';

/**
 * Any file libav can decode -- wav, mp3, ogg, flac, m4a -- fetched by the
 * runtime, so a URL it can reach rather than a path on this machine. Leave
 * either unset to take the runtime's own default sound.
 */
const MUSIC = process.env.BACKGROUND_MUSIC ?? '';
const THINKING = process.env.THINKING_AUDIO ?? '';

class VoiceAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a helpful voice assistant that can answer questions and help ' +
        "with tasks. If the user asks to play music, use the " +
        "control_background_music tool with action 'play'. To stop, use the " +
        "action 'stop'.",
      agent_id: AGENT_ID,
      pipeline: Pipeline({
        stt: DeepgramSTT(),
        llm: GoogleLLM(),
        tts: SarvamAITTS(),
        vad: SileroVAD(),
        turn_detector: TurnDetector(),
      }),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.set_thinking_audio(THINKING || null, { volume: 0.3 });
    await this.session!.say('Hello, how can I help you today?');
  }

  async on_exit(): Promise<void> {
    await this.session!.say('Goodbye!');
  }

  control_background_music = function_tool({
    name: 'control_background_music',
    description: 'Control the background music.',
    parameters: {
      action: { type: 'string', description: "'play' to start the music, 'stop' to end it." },
    },
    execute: async function (this: VoiceAgent, { action }) {
      if (action.toLowerCase() === 'play') {
        await this.session!.play_background_audio(MUSIC || null, {
          volume: 0.8,
          looping: true,
          // false makes the music exclusive: the thinking sound is held back
          // while it plays, rather than the two layering. true lets them
          // overlap.
          override_thinking: false,
        });
        return 'Background music started.';
      }

      if (action.toLowerCase() === 'stop') {
        await this.session!.stop_background_audio();
        return 'Background music stopped.';
      }

      return "Invalid action. Please use 'play' or 'stop'.";
    },
  });
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Background Audio', playground: true }),
  });
}

await zeroruntime.serve(VoiceAgent, { on_ready, room: Room({ background_audio: true }) });
