// Restaurant booking on GPT-Live: a caller books a table at Saffron House.
//
// GPT-Live talks to the caller and hands booking requests to a backend OpenAI
// model, which calls the tools below. Your code steers the call through the
// session: when a full slot the caller wanted opens up, the caller hears about it.
//
// Saturday at 8 PM starts full and opens up SLOT_OPENS_AFTER_S into the call.

import 'dotenv/config';

import * as zeroruntime from '@zeroruntime/js-sdk';
import { Agent, Pipeline, Room, function_tool, get_logger } from '@zeroruntime/js-sdk';
import { OpenAIBackendConfig, OpenAILive } from '@zeroruntime/js-sdk/plugins';

const logger = get_logger('openai_live_restaurant_booking');

const AGENT_ID = process.env.AGENT_ID ?? 'openai-live-restaurant-booking';

// the full Saturday 8 PM slot opens up this many seconds into the call
const SLOT_OPENS_AFTER_S = Number(process.env.SLOT_OPENS_AFTER_S ?? '45');

const DAYS = ['today', 'tomorrow', 'saturday', 'sunday'];
const TIMES = ['7 PM', '7:30 PM', '8 PM', '8:30 PM', '9 PM'];
const MAX_PARTY = 8;

interface Booking {
  name: string;
  day: string;
  time: string;
  party_size: number;
}

const BOOKINGS = new Map<string, Booking>();
let next_booking_id = 101;

/** A (day, time) pair as one string, so a Set can hold it. */
const key = (day: string, time: string): string => `${day}|${time}`;

const FULL = new Set([key('saturday', '8 PM'), key('saturday', '8:30 PM')]);

/** "Saturday", "8:00 pm" -> ["saturday", "8 PM"]. */
function slot(day: string, time: string): [string, string] {
  const spoken = time
    .toUpperCase()
    .replaceAll(':00', '')
    .replaceAll('PM', ' PM')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
  return [day.trim().toLowerCase(), spoken];
}

const DAY = { type: 'string', description: 'today, tomorrow, Saturday or Sunday.' } as const;
const TIME = { type: 'string', description: '7 PM, 7:30 PM, 8 PM, 8:30 PM or 9 PM.' } as const;
const PARTY_SIZE = { type: 'integer', description: 'Number of people.' } as const;

class HostAgent extends Agent {
  /** The full slot the caller asked for, if any. */
  wanted: string | null = null;
  private _slot_timer: NodeJS.Timeout | null = null;

  constructor() {
    super({
      instructions:
        'You are the friendly host at Saffron House, an Indian restaurant in ' +
        'Bengaluru. Keep replies short. We are open 7 PM to 11 PM and serve North ' +
        'and South Indian food, with plenty of vegetarian dishes. To book, you ' +
        'need the day, time, number of people and a name.\n' +
        'Delegation policy:\n' +
        'Backend tools:\n' +
        '- Check if a table is free\n' +
        '- Book a table\n' +
        '- Cancel a booking\n' +
        'Delegate to the backend when:\n' +
        '- The caller asks for a table, gives booking details, or wants to cancel.\n' +
        'Do not delegate to the backend when:\n' +
        '- The caller asks about the menu or opening hours, or is just chatting.\n' +
        'Never confirm a booking before the backend confirms it.',
      agent_id: AGENT_ID,
      pipeline: Pipeline({
        llm: OpenAILive({
          model: 'gpt-live-1',
          voice: 'marin',
          // the backend OpenAI model that calls the tools
          config: OpenAIBackendConfig({
            model: 'gpt-5.6-terra',
            instructions:
              'Check availability before booking. If the time is full, offer the ' +
              'other times. Read the details back and book only after the customer ' +
              'says yes. Reply in one or two short sentences.',
            tool_choice: 'auto',
            parallel_tool_calls: false,
            reasoning_effort: 'low',
          }),
        }),
      }),
    });
  }

  async on_enter(): Promise<void> {
    await this.session!.say(
      'Hello, thank you for calling Saffron House. How can I help you today?',
    );
    this._slot_timer = setTimeout(() => {
      this._open_slot().catch((error) => logger.exception('could not open the slot', error));
    }, SLOT_OPENS_AFTER_S * 1000);
  }

  async on_exit(): Promise<void> {
    if (this._slot_timer !== null) clearTimeout(this._slot_timer);
  }

  /** Stands in for another guest cancelling during the call. */
  private async _open_slot(): Promise<void> {
    FULL.delete(key('saturday', '8 PM'));
    console.log('[RESTAURANT] a Saturday 8 PM table just opened up');
    if (this.wanted === key('saturday', '8 PM')) {
      // said aloud at the next natural pause, in the model's own words
      await this.session!.append_commentary(
        'A table for Saturday at 8 PM just opened up. Offer it to the caller.',
      );
    }
  }

  check_availability = function_tool({
    name: 'check_availability',
    description: 'Check if a table is free.',
    parameters: { day: DAY, time: TIME, party_size: PARTY_SIZE },
    execute: async function (this: HostAgent, { day, time, party_size }) {
      console.log(`[TOOLCALL] check_availability(${day}, ${time}, ${party_size})`);
      [day, time] = slot(day, time);
      if (!DAYS.includes(day) || !TIMES.includes(time)) {
        return { available: false, reason: 'we take bookings from today to Sunday, 7 PM to 9 PM' };
      }
      if (party_size > MAX_PARTY) {
        return {
          available: false,
          reason: `we book up to ${MAX_PARTY} people; bigger groups call the manager`,
        };
      }
      if (FULL.has(key(day, time))) {
        this.wanted = key(day, time);
        return { available: false, other_times: TIMES.filter((t) => !FULL.has(key(day, t))) };
      }
      return { available: true };
    },
  });

  book_table = function_tool({
    name: 'book_table',
    description:
      'Book a table, only after reading the details back and the customer saying yes.',
    parameters: {
      name: { type: 'string', description: 'The name for the booking.' },
      day: DAY,
      time: TIME,
      party_size: PARTY_SIZE,
      customer_said_yes: {
        type: 'boolean',
        description: 'True only if the customer confirmed these details.',
      },
    },
    execute: async function (this: HostAgent, { name, day, time, party_size, customer_said_yes }) {
      console.log(
        `[TOOLCALL] book_table(${name}, ${day}, ${time}, ${party_size}, yes=${customer_said_yes})`,
      );
      [day, time] = slot(day, time);
      if (
        !DAYS.includes(day) ||
        !TIMES.includes(time) ||
        FULL.has(key(day, time)) ||
        party_size > MAX_PARTY
      ) {
        return { booked: false, reason: 'that table is not free; check availability first' };
      }
      if (!customer_said_yes) {
        return { booked: false, reason: 'read the details back and ask the customer to confirm' };
      }
      const booking_id = String(next_booking_id++);
      BOOKINGS.set(booking_id, { name, day, time, party_size });
      this.wanted = null;
      // quiet context, so the model can answer questions about it later
      await this.session!.append_thinking(
        `Booking ${booking_id} is confirmed: ${name}, ${party_size} people, ${day} at ${time}.`,
      );
      return { booked: true, booking_id };
    },
  });

  cancel_booking = function_tool({
    name: 'cancel_booking',
    description: 'Cancel a booking by its booking number.',
    parameters: {
      booking_id: { type: 'string', description: 'The booking number, such as 101.' },
    },
    execute: async ({ booking_id }) => {
      console.log(`[TOOLCALL] cancel_booking(${booking_id})`);
      if (!BOOKINGS.delete(booking_id.trim())) {
        return { cancelled: false, reason: 'no booking with that number' };
      }
      return { cancelled: true };
    },
  });
}

async function on_ready(): Promise<void> {
  await zeroruntime.invoke(AGENT_ID, {
    room: Room({ name: 'Saffron House Bookings', playground: true }),
  });
}

await zeroruntime.serve(HostAgent, { on_ready });
