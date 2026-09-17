# Conversation and context

Most examples here need nothing beyond the root setup. Four want something
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

## knowledge_base.ts

Answers come from knowledge documents you upload in the dashboard, so the
example ships with placeholder ids and needs your own:

```bash
KNOWLEDGE_IDS=doc-id-1,doc-id-2
```

The ids are on the dashboard's knowledge page, one per document; the agent
searches every id it is given on every turn. Left as the placeholders the call
still runs, but each turn's lookup comes back `no knowledge doc found` and the
agent answers from the model alone — a working call and a useless demo. An
empty list is the one thing rejected outright, at startup.

`KnowledgeBase` also takes `context_prefix`, to replace the line placed above
the retrieved sections, and `api_base_url` for a non-production host.

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
