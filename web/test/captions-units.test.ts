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
      cog: { type: compass, name: COG, style: { shape: band }, bindings: { value: { kind: signalk, path: hdg } } }
    layout: { rows: 2, cols: 2, cells: [ { element: wind }, { element: hdg }, { element: sog }, { element: cog } ] }
`;
const vals = new MockDataProvider({ aws: { value: 8, sourceUnit: "m/s" }, hdg: { value: 4.2, sourceUnit: "rad" }, sog: { value: 3.3, sourceUnit: "m/s" } });

function caption(svg: string, name: string) {
  const m = new RegExp(`<text [^>]*font-size="([\\d.]+)" font-weight="500" letter-spacing[^>]*>${name}</text>`).exec(svg);
  return m ? +m[1] : undefined;
}

describe("#37 captions", () => {
  test("grid-tile compass and windrose carry the WIND / HDG chrome caption", () => {
    const r = renderDashboardSvg(doc, man, "square-480", { x: 0, y: 0, w: 480, h: 480 }, vals);
    expect(r.ok).toBe(true);
    expect(caption(r.svg, "WIND")).toBeDefined();
    expect(caption(r.svg, "HDG")).toBeDefined();
  });
  test("caption is the firmware 20px on a 240px tile, scaling to a 12px floor", () => {
    const r = renderDashboardSvg(doc, man, "square-480", { x: 0, y: 0, w: 480, h: 480 }, vals);
    expect(caption(r.svg, "SOG")).toBe(20);
    expect(caption(r.svg, "WIND")).toBe(20);
    expect(caption(r.svg, "COG")).toBe(20); // band dial keeps the caption too
    const s160 = renderDashboardSvg(doc, man, "square-480", { x: 0, y: 0, w: 320, h: 320 }, vals);
    expect(caption(s160.svg, "SOG")).toBeCloseTo(160 / 9, 2);
    const s120 = renderDashboardSvg(doc, man, "square-480", { x: 0, y: 0, w: 200, h: 200 }, vals);
    expect(caption(s120.svg, "SOG")).toBe(12);
  });
  test("a long caption shrinks to the tile width (12px floor)", async () => {
    const { captionFontSize } = await import("../src/svg/frame");
    const fs = captionFontSize({ x: 0, y: 0, w: 240, h: 240 }, "BATTERY TEMPERATURE");
    expect(19 * 0.68 * fs).toBeLessThanOrEqual(240 - 24 + 0.01);
  });
  test("the dial ring stays below the caption band", () => {
    const r = renderDashboardSvg(doc, man, "square-480", { x: 0, y: 0, w: 480, h: 480 }, vals);
    // WIND tile (top-left, 240x240): its stroked ring
    const ring = [...r.svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="none"/g)].find((c) => +c[1] < 240 && +c[2] < 240)!;
    expect(+ring[2] - +ring[3]).toBeGreaterThan(2 + 4 + 20 * 0.9);
  });
  const one = (type: string, extra = "") => `
midl: "1.0.0"
screens:
  - id: s
    elements:
      d: { type: ${type}, name: DIAL, ${extra} bindings: { value: { kind: signalk, path: hdg } } }
    layout: { rows: 1, cols: 1, cells: [ { element: d } ] }
`;
  test("a full-screen windrose HUD owns its centre caption (no chrome caption)", () => {
    const r = renderDashboardSvg(one("windrose"), man, "square-480", { x: 0, y: 0, w: 480, h: 480 }, vals);
    expect(caption(r.svg, "DIAL")).toBeUndefined();
  });
  test("a full-screen compass keeps the chrome caption, like firmware build_tile", () => {
    const r = renderDashboardSvg(one("compass"), man, "square-480", { x: 0, y: 0, w: 480, h: 480 }, vals);
    expect(caption(r.svg, "DIAL")).toBe(20);
  });
  test("style.title on a tile dial is the chrome caption, never repeated in the centre", () => {
    const r = renderDashboardSvg(one("compass", "style: { title: Heading },"), man, "square-480", { x: 0, y: 0, w: 240, h: 240 }, vals);
    expect((r.svg.match(/>HEADING<\/text>/g) ?? []).length).toBe(1);
  });
  test("a no-data tile dial shows the caption once with a dashed frame", () => {
    const r = renderDashboardSvg(one("compass"), man, "square-480", { x: 0, y: 0, w: 240, h: 240 }, new MockDataProvider({}));
    expect((r.svg.match(/>DIAL<\/text>/g) ?? []).length).toBe(1);
    expect(r.svg).toContain('stroke-dasharray="4 4"');
  });
  test("buttons stay captionless", () => {
    const r = renderDashboardSvg(`
midl: "1.0.0"
screens:
  - id: s
    elements:
      b: { type: button, name: TACK, action: { kind: command, target: ap.tack } }
    layout: { rows: 1, cols: 1, cells: [ { element: b } ] }
`, man, "square-480", { x: 0, y: 0, w: 240, h: 240 }, vals);
    expect(caption(r.svg, "TACK")).toBeUndefined();
  });
  test("Canvas caption uses the same size", async () => {
    const { paintScreen } = await import("../src/paint");
    const { theme } = await import("../src/theme");
    const fonts: string[] = [];
    const ctx = new Proxy({}, { get: () => () => {}, set: (_t, p, v) => { if (p === "font") fonts.push(v); return true; } }) as unknown as CanvasRenderingContext2D;
    paintScreen(ctx, [{ elementId: "t", rect: { x: 0, y: 0, w: 240, h: 240 } }], { t: { type: "single-value", name: "SOG", bindings: { value: { kind: "signalk", path: "sog" } } } as never }, vals, theme("night"));
    expect(fonts[0]).toBe("20px system-ui");
  });
});

describe("#37 unit spacing matches firmware", () => {
  test("° and % glue, word units are spaced", () => {
    expect(formatValue(4.2, { unit: "deg", decimals: 0 }, "rad").text).toBe("241°");
    expect(formatValue(0.82, { unit: "%", decimals: 0 }, "ratio").text).toBe("82%");
    expect(formatValue(294.15, { unit: "degC", decimals: 0 }, "K").text).toBe("21°C");
    expect(formatValue(3.2, { unit: "kn", decimals: 1 }).text).toBe("3.2 kn");
    expect(formatValue(294.15, { unit: "˚C", decimals: 0 }, "K").text).toBe("21˚C");
  });
});

describe("#37 bar hero clears the larger caption", () => {
  test("an explicit numeric style.size is honoured on the bar", async () => {
    const { barSvg } = await import("../src/svg/tiles");
    const { theme } = await import("../src/theme");
    const svg = barSvg({ x: 0, y: 0, w: 200, h: 120 }, { state: "ok", text: "82%", numeric: 82, fraction: 0.82 }, theme("night"), { size: 83 });
    expect(svg).toContain('font-size="83"');
  });
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
