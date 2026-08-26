// Three function tools called in sequence, each fed by the previous result. The
// model does the chaining from the instructions and the tool schemas alone;
// every tool body runs in this process.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, function_tool, get_logger } from '@zeroruntime/js-sdk';
import { TurnDetector } from '@zeroruntime/js-sdk/inference';
import { CartesiaTTS, DeepgramSTT, GoogleLLM, SileroVAD } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('cascade_tool_chaining');

const AGENT_ID = process.env.AGENT_ID ?? 'tool-chaining-agent';

const get_weather = function_tool({
  name: 'get_weather',
  description: 'Get the current temperature for a city. Call this first.',
  parameters: {
    city: { type: 'string', description: 'The city to look up, e.g. "Paris" or "Mumbai".' },
  },
  execute: async ({ city }) => {
    const geo_url = `https://geocoding-api.open-meteo.com/v1/search?name=${city}&count=1`;
    const geo = (await (await fetch(geo_url)).json()) as { results?: any[] };
    if (!geo.results?.length) return { error: `I could not find ${city}.` };

    const place = geo.results[0];
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${place.latitude}&longitude=${place.longitude}` +
      '&current=temperature_2m';
    const data = (await (await fetch(url)).json()) as { current: { temperature_2m: number } };

    const temperature = data.current.temperature_2m;
    logger.info(`${city} is ${temperature} C`);
    return { city: place.name, temperature, unit: 'Celsius' };
  },
});

const get_clothing_advice = function_tool({
  name: 'get_clothing_advice',
  description: 'Suggest what to wear for a temperature. Call this after get_weather.',
  parameters: {
    temperature: {
      type: 'number',
      description: 'The temperature in Celsius, from get_weather.',
    },
  },
  execute: async ({ temperature }) => {
    let clothing: string;
    if (temperature < 5) clothing = 'a heavy coat, hat and gloves';
    else if (temperature < 15) clothing = 'a warm jacket';
    else if (temperature < 25) clothing = 'a light jacket or long sleeves';
    else clothing = 'light clothing and sunscreen';

    logger.info(`${temperature} C -> ${clothing}`);
    return { clothing };
  },
});

const get_activity_suggestion = function_tool({
  name: 'get_activity_suggestion',
  description: 'Suggest an activity. Call this last, using both earlier results.',
  parameters: {
    temperature: {
      type: 'number',
      description: 'The temperature in Celsius, from get_weather.',
    },
    clothing: { type: 'string', description: 'The advice from get_clothing_advice.' },
  },
  execute: async ({ temperature, clothing }) => {
    let activity: string;
    if (temperature < 5) activity = 'a museum or a long lunch indoors';
    else if (temperature < 15) activity = 'a walk through the old town';
    else if (temperature < 25) activity = 'a park, a market, or anything outdoors';
    else activity = 'somewhere shaded, or a swim';

    logger.info(`suggesting ${activity}`);
    return { activity, wearing: clothing };
  },
});

class ToolChainingAgent extends Agent {
  constructor() {
    super({
      instructions:
        'You are a helpful travel assistant. When a user asks what to do in a city:\n' +
        '1. FIRST call get_weather to get the temperature\n' +
        '2. THEN call get_clothing_advice with that temperature\n' +
        '3. THEN call get_activity_suggestion with the temperature AND clothing advice\n' +
        '4. Finally, combine all three results into a natural spoken response.\n\n' +
        'You MUST call all three tools in sequence -- do NOT skip any step. Keep ' +
        'your final response concise and conversational (2-3 sentences max).',
      agent_id: AGENT_ID,
      tools: [get_weather, get_clothing_advice, get_activity_suggestion],
      pipeline: Pipeline({
        stt: DeepgramSTT(),
        llm: GoogleLLM(),
        tts: CartesiaTTS(),
        vad: SileroVAD(),
        turn_detector: TurnDetector(),
      }),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say(
      "Hi! I'm your travel assistant. Ask me what to do in any city and I'll " +
        'check the weather, suggest what to wear, and recommend an activity.',
    );
  }

  async on_exit(): Promise<void> {
    logger.info('call finished');
  }
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Tool Chaining', playground: true }),
  });
}

await zeroruntime.serve(ToolChainingAgent, { on_ready });
