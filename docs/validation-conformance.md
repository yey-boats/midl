# MIDL validation conformance (rules)

The single specification both validators implement: the TypeScript `validateDocument`
(`@yey-boats/midl`) and the Python validator. The executable contract is
[`conformance/cases.yaml`](../conformance/cases.yaml) + `conformance/expected.json`; this doc states
the rules those cases pin. Both validators consume the **same** artifacts — the hand-authored
`schemas/yb-midl-config.schema.json` and the generated `schemas/gen/yb-midl-capabilities.<class>.json`
— so only the execution language differs.

## Pipeline (ordered; first failing stage returns)

1. **Manifest structure** — the device manifest is well-formed (else issues under `/manifest…`).
2. **Structural** — the document validates against `yb-midl-config.schema.json` (JSON Schema
   2020-12). Issue paths are JSON Pointers (`/screens/0/elements/sog/bindings/value`).
3. **Semantic** — meaning checks. `error` severity halts; `warning` severity does not (a warnings-only
   document is admissible). Rules:
   - every layout `element` ref resolves to a key in the enclosing screen's `elements`;
   - screen ids are unique across the document;
   - `flow` `weights` length equals `children` length; grid `cells` length equals `rows*cols`;
   - per-type required bindings are present (`single-value/text/gauge/bar/trend/autopilot` → `value`;
     `compass/windrose` → `value`+`dir`; `button` → none);
   - an unknown element `type` is a **warning** (capability satisfaction decides admissibility).
4. **Version compatibility** — `compatible(doc, manifest)` = same major AND `doc.minor <= manifest.minor`
   (old config on a newer device is allowed; newer config on an older device is not). Failure → `/midl`.
5. **Capability satisfaction** — against the target class: element `type` ∈ class `elements`; source
   `kind` ∈ manifest `sources`; tile count ≤ `maxTiles`; nesting depth ≤ `maxDepth`. Per-class layout
   uses the matching `variants[].layout` when present, else the base `layout`.

## Verdict contract

A verdict is `{ ok: boolean, paths: <ordered distinct issue paths, first-occurrence order> }`. The
issue **order is contractual**; per-pointer multiplicity is normalized out (consecutive/repeat errors
at the *same* JSON Pointer collapse to one — a JSON-Schema-engine artifact, e.g. AJV splitting one
`if/then/required` into two). **Severities and messages stay advisory** — only `ok` and the ordered
distinct path list must match across languages. Both validators emit issues in document order
(structural before semantic before capability; within a stage, in source order), so the lists align.

## Versioning

The active language and manifests are **MIDL 1.0.0**. `meta` is additive at 1.0.0. A future 1.1.0 bump
requires upgraded device manifests (or an explicit, tested downgrade transform); matching majors alone
is not compatibility (see rule 4).

## Changing behavior

Re-bless after an intentional validator change:
`npm --prefix ts run build && node conformance/gen-expected.mjs`, hand-review the `expected.json` diff,
update this doc if a rule changed, and keep the Python validator's verdicts identical.
