# zeroruntime examples

Runnable examples for the [zeroruntime](https://zeroruntime.ai) JS SDK.

Every file here is standalone. One file is one idea — a pipeline shape, a tool
pattern, a piece of call control — and each opens with a comment explaining
what it demonstrates and which detail is the point. Read the top of a file
before running it; that comment is the documentation.

## Layout

```
getting_started/   start here — the two pipeline modes, and tuning one
pipelines/         which slots you fill, and what that makes the agent
inference/         the same providers through the ZeroRuntime gateway
tools/             function tools, MCP servers, humans in the loop      *
context/           what the agent remembers, and handing it to another  *
speech/            what the agent says and when it stops saying it
telephony/         phone-call control
observability/     hooks, events, tracing, recording                    *
vision/            showing the model what the camera sees
avatars/           giving the agent a face                              *
```

`*` — some examples in these folders need an account, an extra package or a
running service. Those folders carry their own README with the steps;
everything else runs on the setup below.

## Setup

```bash
git clone https://github.com/ZeroRuntimeAI/zeroruntime-js-examples
cd zeroruntime-js-examples
npm install
```

That installs the SDK and `tsx`, which runs a TypeScript file directly. One
install serves every example in this repo.

Requires Node 20.11 or newer.

## Credentials

Every example loads `dotenv`, which reads a `.env` from the working directory,
so one `.env` at the repo root serves all of them:

```bash
ZERORUNTIME_AUTH_TOKEN=...
```

Then add a key per vendor the example's pipeline names. The full set across
this repo, though no single example needs all of them:

```bash
DEEPGRAM_API_KEY=...      # DeepgramSTT
CARTESIA_API_KEY=...      # CartesiaTTS
ELEVENLABS_API_KEY=...    # ElevenLabsTTS
GOOGLE_API_KEY=...        # GoogleLLM, GoogleTTS, GeminiRealtime
OPENAI_API_KEY=...        # OpenAILLM, OpenAITTS
ANTHROPIC_API_KEY=...     # AnthropicLLM
SARVAMAI_API_KEY=...      # SarvamAISTT, SarvamAITTS
SIMLI_API_KEY=...         # SimliAvatar
ANAM_API_KEY=...          # AnamAvatar
```

Providers imported from `@zeroruntime/js-sdk/inference` reach the gateway instead of
the vendor, so they need `ZERORUNTIME_AUTH_TOKEN` and no vendor key at all —
see `inference/zeroruntime_cascade.ts`. `SileroVAD` runs locally and needs
nothing.

## Running

```bash
npx tsx getting_started/cascade_basic.ts
```

The agent serves, joins a room, and prints a playground URL once on stdout.
Open it and talk to the agent. Ctrl-C to stop.

## The examples

### Start here

| File | What it shows |
| --- | --- |
| `getting_started/cascade_basic.ts` | The smallest complete agent: STT, LLM, TTS, VAD, turn detector |
| `getting_started/realtime_basic.ts` | The same call with one speech-to-speech model doing all of it |
| `getting_started/realtime_with_vad.ts` | The same realtime call with VAD and denoise in front of the model |
| `getting_started/cascade_advanced.ts` | Tuning end-of-utterance and barge-in on a cascade pipeline |
| `getting_started/chat_agent.ts` | Typing at the agent — room chat in, chat back out |

### Pipeline shapes

| File | What it shows |
| --- | --- |
| `pipelines/composable/agent_multimodal.ts` | Voice in, voice out — the map for the other three |
| `pipelines/composable/agent_llm.ts` | Text in, text out |
| `pipelines/composable/agent_text_to_voice.ts` | Text in, voice out |
| `pipelines/composable/agent_voice_to_text.ts` | Voice in, text out |
| `pipelines/hybrid/hybrid_custom_stt_realtime.ts` | Your transcriber in front of a realtime model |
| `pipelines/hybrid/hybrid_realtime_custom_tts.ts` | A realtime model with your voice on the output |
| `pipelines/fallback_recovery.ts` | A pipeline slot as a list — head serves, tail stands by |

### ZeroRuntime inference

| File | What it shows |
| --- | --- |
| `inference/zeroruntime_cascade.ts` | The same cascade through the gateway, one credential |
| `inference/zeroruntime_realtime.ts` | A realtime model through the gateway, no vendor key |

### Tools

| File | What it shows |
| --- | --- |
| `tools/cascade_tool_chaining.ts` | Three tools called in sequence, each fed by the last |
| `tools/mcp_example.ts` | Tools from an MCP server, connected in your process |
| `tools/mcp_servers/current_time.ts` | A small stdio MCP server for the above to talk to |
| `tools/n8n_workflow/appointment_telephony.ts` | An n8n workflow as the toolset, over HTTP |
| `tools/human_in_the_loop/customer_agent.ts` | A tool that waits on a person before answering |
| `tools/human_in_the_loop/discord_mcp_server.ts` | The Discord server that blocks behind it |

### Conversation and context

| File | What it shows |
| --- | --- |
| `context/agent_context_window.ts` | Bounding a long call — summarise or truncate older turns |
| `context/agent_memory.ts` | Long-term memory across calls, searched and written per turn |
| `context/handoffs/agent_sequential_handoff.ts` | A tool that returns an Agent is the handoff |
| `context/handoffs/cascade_to_realtime_handoff.ts` | Swapping a live call onto a realtime model |
| `context/handoffs/realtime_to_cascade_handoff.ts` | And back again |
| `context/multi_agent_switch.ts` | One caller, three agents, handoff in either direction |
| `context/persona_switch.ts` | Five personas rebuilt live from a chat message |
| `context/translator_agent.ts` | Detect the caller's language mid-call and follow it |
| `context/demo_multilang.ts` | One agent in four languages, picked at startup |

### Speech control

| File | What it shows |
| --- | --- |
| `speech/utterance_handle_agent.ts` | Waiting on an utterance, and tools that notice interruption |
| `speech/reply_interrupt_agent.ts` | say, reply and process_text — three different things |
| `speech/enhanced_pronounciation.ts` | Substitution rules applied between LLM and TTS |
| `speech/cached_tts.ts` | Fixed phrases synthesised once and replayed as PCM |
| `speech/background_audio.ts` | Ambience under the call, from the start or mid-call |
| `speech/wakeup_call.ts` | Nudging a caller who has gone quiet |

### Telephony

| File | What it shows |
| --- | --- |
| `telephony/call_transfer.ts` | Moving the caller to another number |
| `telephony/warm_transfer.ts` | Briefing a supervisor on hold, then bridging them in — needs a live SIP leg |
| `telephony/dtmf_voicemail.ts` | Keypad input and answering-machine detection |
| `telephony/agent_hangup.ts` | The agent ending the call itself |

### Room and observability

| File | What it shows |
| --- | --- |
| `observability/pipeline_events.ts` | Component errors, recording state, latency metrics |
| `observability/voice_pipeline_hooks.ts` | The turn lifecycle of a cascade pipeline |
| `observability/realtime_pipeline_hooks.ts` | The same lifecycle on a realtime call |
| `observability/observability_hooks.ts` | OpenTelemetry, recording, and history on exit |

### Vision

| File | What it shows |
| --- | --- |
| `vision/vision_cascade.ts` | Showing the model what the camera sees |
| `vision/vision_realtime.ts` | The same, on a speech-to-speech pipeline |

### Avatars

| File | What it shows |
| --- | --- |
| `avatars/avatar_simli_cascade.ts` | Giving a cascade agent a face, with Simli |
| `avatars/avatar_anam_cascade.ts` | The same slot, with Anam and a function tool |
