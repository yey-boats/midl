// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

// Built-in screen records (library/builtin/*.midl.json): the firmware embeds
// them and the Display Manager lists them as its built-in presets. Each file is
// one record whose id is the file name and whose single screen has that id, so
// existing `screen.set <id>` ids keep working on the device.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateDocument, parseDoc } from "../src";
import type { Manifest, ConfigDoc } from "../src";

const here = dirname(fileURLToPath(import.meta.url));
const BUILTIN = join(here, "..", "..", "library", "builtin");
const GEN = join(here, "..", "..", "schemas", "gen");
const manifest = (cls: string): Manifest =>
  JSON.parse(readFileSync(join(GEN, `yb-midl-capabilities.${cls}.json`), "utf8"));

const RECT_CLASSES = ["square-480", "landscape-800x480", "landscape-1024x600"];
const KNOB_CLASSES = ["round-360"];
const RECT_IDS = [
  "dashboard", "wind", "wind_classic", "wind_steer", "nav", "depth",
  "steering", "route", "autopilot", "trip", "status",
];
const KNOB_IDS = ["ap_hud", "knob_compass", "knob_wind", "knob_big"];
// Record id rule from the device contract.
const RECORD_ID = /^[a-z0-9_-]{1,32}$/;

const files = readdirSync(BUILTIN).filter((f) => f.endsWith(".midl.json")).sort();
const idOf = (f: string) => f.replace(/\.midl\.json$/, "");
const text = (f: string) => readFileSync(join(BUILTIN, f), "utf8");
const docOf = (f: string) => parseDoc(text(f)) as ConfigDoc;
// The classes a builtin declares = the classes of its screen's variants.
const declared = (f: string) => [...new Set(docOf(f).screens.flatMap((s) => (s.variants ?? []).map((v) => v.class)))];

describe("built-in screen records", () => {
  it("has exactly the required built-in ids", () => {
    expect(files.map(idOf).sort()).toEqual([...RECT_IDS, ...KNOB_IDS].sort());
  });

  it("screen ids are unique across all builtins", () => {
    const ids = files.flatMap((f) => docOf(f).screens.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const f of files) {
    const id = idOf(f);

    it(`${f}: record id is valid and is its single screen's id, with a title`, () => {
      expect(id).toMatch(RECORD_ID);
      const doc = docOf(f);
      expect(doc.screens).toHaveLength(1);
      expect(doc.screens[0].id).toBe(id);
      expect(typeof doc.screens[0].title).toBe("string");
      expect(doc.screens[0].title!.length).toBeGreaterThan(0);
    });

    it(`${f}: covers the classes the firmware ships for it`, () => {
      const need = RECT_IDS.includes(id) ? RECT_CLASSES : KNOB_CLASSES;
      expect(declared(f)).toEqual(expect.arrayContaining(need));
    });

    for (const cls of declared(f)) {
      it(`${f} validates against ${cls}`, () => {
        const res = validateDocument(text(f), manifest(cls), cls);
        expect(res.issues).toEqual([]);
        expect(res.ok).toBe(true);
      });
    }
  }
});
