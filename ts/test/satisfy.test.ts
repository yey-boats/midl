// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { satisfies } from "../src/satisfy";
import type { ConfigDoc, Manifest } from "../src/types";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const square480: Manifest = JSON.parse(
  readFileSync(join(repo, "schemas", "gen", "yb-midl-capabilities.square-480.json"), "utf8"),
);

const manifest: Manifest = {
  midl: "1.0.0",
  board: "sunton-4848s040",
  classes: [{ id: "sunton-480", maxTiles: 4, maxDepth: 3, elements: ["single-value", "compass"] }],
  elements: [
    { type: "single-value", bindings: ["value"] },
    { type: "compass", bindings: ["value"] },
  ],
  sources: ["signalk"],
  actionKinds: ["put", "nav"],
};

test("a config within limits is admissible", () => {
  const cfg: ConfigDoc = {
    midl: "1.0.0",
    screens: [{ id: "d", elements: { a: { type: "single-value" } }, layout: { element: "a" } }],
  };
  expect(satisfies(cfg, manifest, "sunton-480")).toEqual([]);
});

test("unknown element type is rejected", () => {
  const cfg: ConfigDoc = {
    midl: "1.0.0",
    screens: [{ id: "d", elements: { a: { type: "windrose" } }, layout: { element: "a" } }],
  };
  const issues = satisfies(cfg, manifest, "sunton-480");
  expect(issues.some((i) => /not supported/.test(i.message))).toBe(true);
});

test("too many tiles for the class is rejected", () => {
  const cfg: ConfigDoc = {
    midl: "1.0.0",
    screens: [{
      id: "d",
      elements: { a: { type: "single-value" }, b: { type: "single-value" }, c: { type: "single-value" }, d: { type: "single-value" }, e: { type: "single-value" } },
      layout: { flow: "col", children: [{ element: "a" }, { element: "b" }, { element: "c" }, { element: "d" }, { element: "e" }] },
    }],
  };
  expect(satisfies(cfg, manifest, "sunton-480").some((i) => /too many tiles/.test(i.message))).toBe(true);
});

test("unsupported source kind is rejected", () => {
  const cfg: ConfigDoc = {
    midl: "1.0.0",
    screens: [{ id: "d", elements: { a: { type: "single-value", bindings: { value: { kind: "local", id: "gpio4" } } } }, layout: { element: "a" } }],
  };
  expect(satisfies(cfg, manifest, "sunton-480").some((i) => /source kind/.test(i.message))).toBe(true);
});

test("square-480 manifest now admits the `local` source kind", () => {
  const cfg: ConfigDoc = {
    midl: "1.0.0",
    screens: [{ id: "d", elements: { a: { type: "text", bindings: { value: { kind: "local", id: "net.ip" } } } }, layout: { element: "a" } }],
  };
  expect(satisfies(cfg, square480, "square-480")).toEqual([]);
});

test("square-480 admits dial sectors/hull/shape, bar center, and marker color/dir (attrs tolerated)", () => {
  const cfg: ConfigDoc = {
    midl: "1.0.0",
    screens: [{
      id: "d",
      elements: {
        c: {
          type: "compass",
          bindings: { value: { kind: "signalk", path: "navigation.headingTrue" } },
          style: { shape: "round", hull: true, sectors: [{ from: 30, to: 60, color: "starboard" }] },
          markers: [{ glyph: "chevron_out", color: "accent", dir: { kind: "signalk", path: "navigation.courseOverGroundTrue" } }],
        },
        x: { type: "bar", bindings: { value: { kind: "signalk", path: "navigation.xte" } }, style: { center: 0 } },
      },
      layout: { flow: "row", children: [{ element: "c" }, { element: "x" }] },
    }],
  };
  expect(satisfies(cfg, square480, "square-480")).toEqual([]);
});

test("unknown class is rejected", () => {
  const cfg: ConfigDoc = { midl: "1.0.0", screens: [] };
  expect(satisfies(cfg, manifest, "watch-240").some((i) => /class not supported/.test(i.message))).toBe(true);
});

test("variant layout is used for its class", () => {
  const cfg: ConfigDoc = {
    midl: "1.0.0",
    screens: [{
      id: "d",
      elements: { a: { type: "single-value" }, b: { type: "compass" } },
      layout: { element: "a" },
      variants: [{ class: "sunton-480", layout: { element: "b" } }],
    }],
  };
  expect(satisfies(cfg, manifest, "sunton-480")).toEqual([]);
});
