// midl/web/test/preview.test.ts
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { previewConfig } from "../src/preview";
import type { Manifest } from "@yey-boats/midl";

const here = dirname(fileURLToPath(import.meta.url));
const sample = readFileSync(join(here, "fixtures", "sample.config.yaml"), "utf8");

const manifest: Manifest = {
  midl: "1.0.0",
  board: "sunton-4848s040",
  classes: [{ id: "square-480", maxTiles: 4, maxDepth: 3, elements: ["windrose", "single-value"] }],
  elements: [
    { type: "windrose", bindings: ["value"] },
    { type: "single-value", bindings: ["value"] },
  ],
  sources: ["signalk"],
};
const vp = { x: 0, y: 0, w: 480, h: 480 };

test("a valid config previews with placed elements", () => {
  const r = previewConfig(sample, manifest, "square-480", vp);
  expect(r.ok).toBe(true);
  expect(r.screens).toHaveLength(1);
  const ids = r.screens[0].placements.map((p) => p.elementId).sort();
  expect(ids).toEqual(["depth", "sog", "wind"]);
  // every placement is within the viewport
  for (const p of r.screens[0].placements) {
    expect(p.rect.x).toBeGreaterThanOrEqual(0);
    expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(480.0001);
  }
});

test("element defs are exposed for painting", () => {
  const r = previewConfig(sample, manifest, "square-480", vp);
  expect(r.elements["dash"]["wind"].type).toBe("windrose");
});

test("an unsatisfiable config returns issues, not placements", () => {
  const bad = manifest.classes[0].elements = ["single-value"]; // windrose no longer supported
  void bad;
  const r = previewConfig(sample, manifest, "square-480", vp);
  expect(r.ok).toBe(false);
  expect(r.issues.some((i) => /not supported/.test(i.message))).toBe(true);
  expect(r.screens).toEqual([]);
});
