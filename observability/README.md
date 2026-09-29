# Room and observability

`pipeline_events.ts`, `voice_pipeline_hooks.ts` and
`realtime_pipeline_hooks.ts` need nothing beyond the root setup — they log to
your terminal.

## observability_hooks.ts

This one exports to OpenTelemetry, and wants a collector to export to:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

Any OTLP/HTTP receiver works — a local collector, Jaeger, Grafana, your
existing vendor.

Leaving it unset is fine and is what the example does by default: traces and
metrics stay enabled and go to the platform's own backend, and logs switch off.
Logs are the noisy one, so they turn on only when you have named somewhere to
put them.

The same example also turns on platform recording and fetches the conversation
history in `on_exit`. Neither needs configuration here.

## pii_redaction.ts

Needs nothing beyond the root setup. The agent asks for a date of birth, a phone
number, an email and a card number, and every turn carrying one of those is
removed before anything is published: its audio becomes a tone in the recording,
its text becomes its label in the transcript.

`rules` is the whole of the configuration — a kind left out of it is not
redacted anywhere — and `target` says which artefacts it applies to. Drop
`RedactionTarget.RECORDING` from `target` to leave the audio as recorded, or
drop `TRANSCRIPT` to leave the transcript as spoken.

Recording is on because `RedactionTarget.RECORDING` requires it; a session that
targets the recording without one is refused at startup.
