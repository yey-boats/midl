// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// #37: tile captions and unit spacing follow the firmware grid tile
// (ui_layouts.cpp build_tile: caption = element name in montserrat_20 on
// every tile, dials included; "%"/"°" units glued, word units spaced).
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderDashboardSvg } from "../src/svg/render-svg";
import { MockDataProvider } from "../src/data";
import { formatValue } from "../src/format";

const man = JSON.parse(readFileSync(new URL("../../schemas/gen/yb-midl-capabilities.square-480.json", import.meta.url), "utf8"));
const doc = `
midl: "1.0.0"
screens:
  - id: s
    elements:
      wind: { type: windrose, name: WIND, format: { unit: kn, decimals: 1 }, bindings: { value: { kind: signalk, path: aws } } }
      hdg: { type: compass, name: HDG, bindings: { value: { kind: signalk, path: hdg } } }
      sog: { type: single-value, name: SOG, format: { unit: kn, decimals: 1 }, bindings: { value: { kind: signalk, path: sog } } }
      big: { type: compass, name: BIG, bindings: { value: { kind: signalk, path: hdg } } }
    layout: { rows: 2, cols: 2, cells: [ { element: wind }, { element: hdg }, { element: sog }, { element: big } ] }
`;
const vals = new MockDataProvider({ aws: { value: 8, sourceUnit: "m/s" }, hdg: { value: 4.2, sourceUnit: "rad" }, sog: { value: 3.3, sourceUnit: "m/s" } });

function caption(svg: string, name: string) {
  const m = new RegExp(`<text [^>]*font-size="([\\d.]+)"[^>]*>${name}</text>`).exec(svg);
  return m ? +m[1] : undefined;
}

describe("#37 captions", () => {
  test("grid-tile compass and windrose carry the WIND / HDG chrome caption", () => {
    const r = renderDashboardSvg(doc, man, "square-480", { x: 0, y: 0, w: 480, h: 480 }, vals);
    expect(r.ok).toBe(true);
    expect(caption(r.svg, "WIND")).toBeDefined();
    expect(caption(r.svg, "HDG")).toBeDefined();
  });
  test("caption is the firmware 20px on a 240px tile, never below 12px", () => {
    const r = renderDashboardSvg(doc, man, "square-480", { x: 0, y: 0, w: 480, h: 480 }, vals);
    expect(caption(r.svg, "SOG")).toBe(20);
    expect(caption(r.svg, "WIND")).toBe(20);
    const small = renderDashboardSvg(doc, man, "square-480", { x: 0, y: 0, w: 160, h: 160 }, vals);
    expect(caption(small.svg, "SOG")).toBeGreaterThanOrEqual(12);
  });
  test("the dial ring stays below the caption band", () => {
    const r = renderDashboardSvg(doc, man, "square-480", { x: 0, y: 0, w: 480, h: 480 }, vals);
    // first tile (WIND) ring: the stroked circle
    const ring = /<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="none"/.exec(r.svg)!;
    expect(+ring[2] - +ring[3]).toBeGreaterThan(2 + 4 + 20 * 0.9);
  });
  test("a full-screen HUD dial keeps its centre-only caption (no chrome caption)", () => {
    const one = `
midl: "1.0.0"
screens:
  - id: s
    elements:
      hdg: { type: compass, name: HDG, bindings: { value: { kind: signalk, path: hdg } } }
    layout: { rows: 1, cols: 1, cells: [ { element: hdg } ] }
`;
    const r = renderDashboardSvg(one, man, "square-480", { x: 0, y: 0, w: 480, h: 480 }, vals);
    expect(caption(r.svg, "HDG")).toBeUndefined();
  });
});

describe("#37 unit spacing matches firmware", () => {
  test("° and % glue, word units are spaced", () => {
    expect(formatValue(4.2, { unit: "deg", decimals: 0 }, "rad").text).toBe("241°");
    expect(formatValue(0.82, { unit: "%", decimals: 0 }, "ratio").text).toBe("82%");
    expect(formatValue(294.15, { unit: "degC", decimals: 0 }, "K").text).toBe("21°C");
    expect(formatValue(3.2, { unit: "kn", decimals: 1 }).text).toBe("3.2 kn");
  });
});

describe("#37 bar hero clears the larger caption", () => {
  test("120px bar tile: hero cap top stays below the caption band", async () => {
    const { barSvg } = await import("../src/svg/tiles");
    const { captionBand } = await import("../src/svg/frame");
    const { theme } = await import("../src/theme");
    const rect = { x: 0, y: 0, w: 200, h: 120 };
    const svg = barSvg(rect, { state: "ok", text: "82%", numeric: 82, fraction: 0.82 }, theme("night"), {});
    const t = /<text x="[\d.]+" y="([\d.]+)"[^>]*font-size="([\d.]+)"/.exec(svg)!;
    expect(+t[1] - 0.72 * +t[2]).toBeGreaterThanOrEqual(captionBand(rect) - 0.01);
  });
});
