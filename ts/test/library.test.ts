// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateDocument, parseDoc, layoutSummary } from "../src";
import type { Manifest, ConfigDoc } from "../src";

const here = dirname(fileURLToPath(import.meta.url));
const LIB = join(here, "..", "..", "library");
const GEN = join(here, "..", "..", "schemas", "gen");
const files = existsSync(LIB) ? readdirSync(LIB).filter((f) => f.endsWith(".midl.yaml")) : [];
const manifest = (cls: string): Manifest => JSON.parse(readFileSync(join(GEN, `yb-midl-capabilities.${cls}.json`), "utf8"));

describe("standard layout library", () => {
  it("has at least 6 layouts", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  // midl#25: library × device-class conformance — every layout must validate on
  // every class the repo generates a manifest for (round-360 included), so a
  // layout that only fits square-480 can't ship again.
  const classes = readdirSync(GEN)
    .map((f) => /^yb-midl-capabilities\.(.+)\.json$/.exec(f)?.[1])
    .filter((c): c is string => !!c)
    .sort();

  it("checks every generated device class", () => {
    expect(classes).toEqual(["landscape-1024x600", "landscape-800x480", "round-360", "square-480"]);
  });

  for (const f of files) {
    for (const cls of classes) {
      it(`${f} validates against ${cls}`, () => {
        const res = validateDocument(readFileSync(join(LIB, f), "utf8"), manifest(cls), cls);
        expect(res.issues).toEqual([]);
        expect(res.ok).toBe(true);
      });
    }
  }

  it("collectively exercises all 9 element types", () => {
    const seen = new Set<string>();
    for (const f of files) {
      const doc = parseDoc(readFileSync(join(LIB, f), "utf8")) as ConfigDoc;
      for (const t of layoutSummary(doc).elements) seen.add(t);
    }
    expect([...seen].sort()).toEqual(
      ["autopilot", "bar", "button", "compass", "gauge", "single-value", "text", "trend", "windrose"],
    );
  });

  it("has a generated catalog matching the library files", () => {
    const idx = join(LIB, "index.json");
    expect(existsSync(idx)).toBe(true);
    const catalog = JSON.parse(readFileSync(idx, "utf8")) as Array<{ id: string }>;
    expect(catalog.map((c) => c.id).sort()).toEqual(files.map((f) => f.replace(/\.midl\.yaml$/, "")).sort());
  });
});
