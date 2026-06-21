# `conformance/` — MIDL validation parity corpus (S0)

The executable cross-language parity contract for MIDL validation. [`cases.yaml`](cases.yaml) holds
documents + their `targetClass`; [`expected.json`](expected.json) holds each case's frozen verdict
`{ ok, issues: [sorted unique issue paths] }`.

- The **TypeScript** validator runs it in [`../ts/test/conformance.test.ts`](../ts/test/conformance.test.ts).
- The **Python** validator runs the same `cases.yaml`/`expected.json` and must produce identical
  verdicts; a divergence is a parity failure.

Severities/messages are advisory — only `ok` + the issue-path set are contractual (see
[`../docs/validation-conformance.md`](../docs/validation-conformance.md)).

Re-bless after an intentional validator change:

```bash
npm --prefix ts run build && node conformance/gen-expected.mjs   # rewrites expected.json
```

Hand-review the `expected.json` diff before committing — a changed verdict is a contract change.
