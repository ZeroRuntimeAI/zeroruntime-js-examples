# Conversation and context

Most examples here need nothing beyond the root setup. Three want something
extra.

## agent_memory.ts

Long-term memory backed by [mem0](https://mem0.ai). The store is reached from
this process with your own key, over plain HTTP — there is no mem0 SDK to
install.

```bash
MEM0_API_KEY=...
MEM0_USER_ID=demo-user     # optional, this is the default
```

Without `MEM0_API_KEY` the example still runs: it logs a warning and behaves
like an agent with no memory, which makes it a poor demo but a working call.

## translator_agent.ts

Language detection runs here rather than in the runtime, against SarvamAI's
text-language-id endpoint over plain HTTP — no extra package to install.

```bash
SARVAMAI_API_KEY=...
```

The call is inside the detection path, so a missing key surfaces mid-conversation
rather than at startup.

## demo_multilang.ts

Pick the language at startup — pass it as the first argument or set `LANG_CODE`
(`en`, `hi`, `gu`, `mr`; defaults to `hi`). Each language changes STT, TTS and
instructions together, so you need the keys for whichever providers that
language's config names.

```bash
npx tsx context/demo_multilang.ts gu
```
