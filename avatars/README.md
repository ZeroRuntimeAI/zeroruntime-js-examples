# Avatars

The avatar plugin renders a talking head from the TTS output and publishes it
into the room as the agent's video. Both examples are cascade pipelines and
differ only in the vendor filling the `avatar` slot.

No extra install — the vendor key is read in the runtime, not sent from here.

Each example needs two things: the account key, and the id of a specific face
or avatar from that vendor's dashboard. Both default to a placeholder and log a
warning, so a run with an unset id connects and then renders nothing.

## avatar_simli_cascade.ts

```bash
SIMLI_API_KEY=...
SIMLI_FACE_ID=...
```

`SIMLI_FACE_ID` identifies one generated face in your [Simli](https://simli.com)
account.

## avatar_anam_cascade.ts

```bash
ANAM_API_KEY=...
ANAM_AVATAR_ID=...
```

`ANAM_AVATAR_ID` identifies a persona in your [Anam](https://anam.ai) account.

Keep replies short in either one. Long monologues look wrong on a talking head,
which is why both agents are instructed that way.
