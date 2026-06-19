# MIDL — Marine Instrument Definition Language

Single source of truth for YB-MIDL across all Yey Boats projects.

- `cpp/` — the element catalog (`include/yb_midl_catalog.h`, the source of truth) + host generator/checker.
- `schemas/` — JSON Schemas (config + capabilities) and generated per-class manifests (`gen/`).
- `ts/` — `@yey-boats/midl` language core: validator, preset expansion, version compat.
- `web/` — web renderer (vanilla TS + Canvas/SVG). _(planned)_
- `bindings/` — additional language bindings. _(planned)_

Consumed by espdisp (firmware), the manager, and the simulator as a git submodule.

## Build/test
- `make gen-manifest` / `make check-catalog`
- `cd ts && npx vitest run`
