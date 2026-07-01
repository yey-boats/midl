// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { test, expect, describe } from "vitest";
import { glyphPath, GLYPH_NAMES } from "../src/svg/glyphs";
import { polar, arc, esc } from "../src/svg/geometry";
import { dialSvg } from "../src/svg/dial";
import { renderDashboardSvg } from "../src/svg/render-svg";
import { MockDataProvider } from "../src/data";
import { theme } from "../src/theme";
import { convert, formatValue } from "../src/format";
import type { ElementModel } from "../src/model";
import type { Manifest } from "@yey-boats/midl";

const TH = theme("night");

// A self-contained square-480 manifest (full shape the validator requires). Not
// a design/midl fixture — owned by this test.
const MANIFEST: Manifest = {
  midl: "1.0.0",
  board: "esp32-4848s040",
  maxMarkersPerDial: 12,
  classes: [{ id: "square-480", width: 480, height: 480, maxTiles: 4, maxDepth: 3, presets: ["full", "hero-split"], elements: ["single-value", "text", "gauge", "bar", "compass", "windrose", "trend", "autopilot", "button"] }],
  elements: [
    { type: "single-value", bindings: ["value"], attrs: ["title", "format", "size", "unit", "color"] },
    { type: "text", bindings: ["value"], attrs: ["title", "size", "color"] },
    { type: "gauge", bindings: ["value"], attrs: ["title", "size", "unit", "color", "range", "zones"] },
    { type: "bar", bindings: ["value"], attrs: ["title", "size", "unit", "color", "range", "zones"] },
    { type: "compass", bindings: ["value", "dir"], attrs: ["title", "size", "color"], glyphs: ["triangle", "diamond", "circle", "bar", "cross", "chevron_in", "chevron_out", "chevron_left", "chevron_right", "chevron_double"] },
    { type: "windrose", bindings: ["value", "dir"], attrs: ["title", "format", "size", "unit", "color"], glyphs: ["triangle", "diamond", "circle", "bar", "cross", "chevron_in", "chevron_out", "chevron_left", "chevron_right", "chevron_double"] },
    { type: "trend", bindings: ["value"], attrs: ["title", "size", "unit", "color"] },
    { type: "autopilot", bindings: ["value"], attrs: ["title", "size", "color"] },
    { type: "button", bindings: [], attrs: ["title", "size", "color"] },
  ],
  sources: ["signalk"],
  actionKinds: ["nav", "command"],
  presets: ["full", "hero-split"],
  glyphs: ["triangle", "diamond", "circle", "bar", "cross", "chevron_in", "chevron_out", "chevron_left", "chevron_right", "chevron_double"],
  themes: ["day", "night", "high-contrast"],
  fonts: [14, 20, 28, 48],
} as unknown as Manifest;

describe("geometry", () => {
  test("polar with -90=up returns the top point", () => {
    const [x, y] = polar(100, 100, 0, 50);
    expect(x).toBeCloseTo(100, 5);
    expect(y).toBeCloseTo(50, 5);
  });
  test("arc emits an SVG path", () => {
    expect(arc(100, 100, 0, 90, 50)).toMatch(/^M .* A 50 50 0 [01] 1 /);
  });
  test("esc escapes XML metacharacters", () => {
    expect(esc('<a>&"')).toBe("&lt;a&gt;&amp;&quot;");
  });
});

describe("glyphs", () => {
  test("all 10 glyphs produce SVG and a color reference", () => {
    expect(GLYPH_NAMES).toHaveLength(10);
    for (const g of GLYPH_NAMES) {
      const svg = glyphPath(g, 50, 50, 20, "#ff0000");
      expect(svg).toMatch(/<(path|circle|rect|line)/);
      expect(svg).toContain("#ff0000");
    }
  });
  test("unknown glyph falls back to a circle", () => {
    expect(glyphPath("nope", 10, 10, 8, "#fff")).toContain("<circle");
  });
});

describe("dialSvg", () => {
  // A small grid-tile rect (min < 300) → MINIMAL rendering.
  const tileRect = { x: 0, y: 0, w: 200, h: 200 };
  // A large rect (min >= 300) → ROUND HUD rendering.
  const hudRect = { x: 0, y: 0, w: 360, h: 360 };
  const model: ElementModel = {
    state: "ok",
    text: "090",
    angleDeg: 90,
    markers: [{ glyph: "triangle", color: "warn", angleDeg: 45, kind: "rim" }],
    sectors: [{ from: -30, to: 0, color: "port" }],
  };

  test("minimal tile: bezel, 4 static cardinals (white N, dim E/S/W), hero, no red N", () => {
    const svg = dialSvg(tileRect, model, TH.accent, TH, { title: "HDG", size: 38 });
    expect(svg).toContain("<circle");          // bezel ring + wash
    expect(svg).toContain(">N<");              // north cardinal
    expect(svg).toContain(">E<");
    expect(svg).toContain(">090<");            // centre hero
    expect(svg).toContain("HDG");              // caption
    expect(svg).toContain(TH.fg);              // white N on tiles
    expect(svg).not.toContain("#ff5252");      // minimal tile has NO red N
  });

  test("round HUD: white band, red N, tick ring, sectors", () => {
    const svg = dialSvg(hudRect, model, TH.warn, TH, { title: "AWS", size: 38 });
    expect(svg).toContain("#f2f6fb");          // HUD white band
    expect(svg).toContain("#ff5252");          // red N
    expect(svg).toContain("#5a6b78");          // DIAL_TICK ring
    expect(svg).toContain(">090<");            // centre hero
    expect(svg).toContain("<path");            // ticks/sector/marker paths
  });

  test("band shape draws the rolling heading band", () => {
    const svg = dialSvg(tileRect, model, TH.accent, TH, { shape: "band" });
    expect(svg).toContain("A ");               // arc-based band
    expect(svg).toContain(">090<");
    expect(svg).toContain("#ff5252");          // red lubber triangle / N
  });

  test("hull option adds a silhouette path (round HUD)", () => {
    const a = dialSvg(hudRect, { state: "ok", text: "0" }, TH.warn, TH, {});
    const b = dialSvg(hudRect, { state: "ok", text: "0" }, TH.warn, TH, { hull: true });
    expect(b.length).toBeGreaterThan(a.length);
  });
});

describe("renderDashboardSvg", () => {
  const doc = `
midl: "1.0.0"
screens:
  - id: main
    elements:
      hdg:
        type: compass
        name: Heading
        bindings: { value: { kind: signalk, path: navigation.headingTrue } }
        markers:
          - { glyph: triangle, color: warn, dir: { kind: signalk, path: environment.wind.directionTrue } }
      sog:
        type: single-value
        name: SOG
        format: { unit: kn, decimals: 1 }
        bindings: { value: { kind: signalk, path: navigation.speedOverGround } }
      fuel:
        type: bar
        name: Fuel
        style: { range: [0, 1], zones: [{ lt: 0.25, color: bad }, { lt: 0.5, color: warn }] }
        bindings: { value: { kind: signalk, path: tanks.fuel.0.currentLevel } }
      wind:
        type: windrose
        name: AWA
        bindings: { value: { kind: signalk, path: environment.wind.angleApparent } }
        markers:
          - { glyph: diamond, color: accent2, dir: { kind: signalk, path: environment.wind.angleApparent } }
    layout:
      rows: 2
      cols: 2
      cells:
        - { element: hdg }
        - { element: sog }
        - { element: fuel }
        - { element: wind }
`;

  const provider = new MockDataProvider({
    "navigation.headingTrue": { value: Math.PI / 2, sourceUnit: "rad" },
    "navigation.speedOverGround": { value: 3.086, sourceUnit: "m/s" },
    "tanks.fuel.0.currentLevel": { value: 0.2 },
    "environment.wind.angleApparent": { value: 0.6, sourceUnit: "rad" },
    "environment.wind.directionTrue": { value: Math.PI, sourceUnit: "rad" },
  });

  test("renders a valid <svg> with all four widgets", () => {
    const r = renderDashboardSvg(doc, MANIFEST, "square-480", { x: 0, y: 0, w: 480, h: 480 }, provider, { theme: "night" });
    expect(r.ok).toBe(true);
    expect(r.svg.startsWith("<svg")).toBe(true);
    expect(r.svg).toContain('viewBox="0 0 480 480"');
    expect(r.svg).toContain("xmlns=");
    expect(r.svg.trimEnd().endsWith("</svg>")).toBe(true);
    // background
    expect(r.svg).toContain(TH.bg);
    // compass cardinal + windrose ring + bar fill (bad zone) + sog value
    expect(r.svg).toContain(">N<");
    // value and unit are drawn as separate elements (hero number + dim unit)
    expect(r.svg).toContain(">6.0<");
    expect(r.svg).toContain(">kn<");
    expect(r.svg).toContain(TH.bad);   // fuel below 0.25 -> bad zone fill
    expect(r.svg).toContain(TH.warn);  // windrose accent ring
    // markers resolved from dir bindings present as glyph paths
    expect(r.svg).toContain("data-screen=\"main\"");
  });

  test("invalid document returns ok:false with an error svg", () => {
    const r = renderDashboardSvg("not: valid: midl", MANIFEST, "square-480", { x: 0, y: 0, w: 480, h: 480 }, provider);
    expect(r.ok).toBe(false);
    expect(r.svg).toContain("<svg");
    expect(r.svg).toContain("</svg>");
  });
});

// ── heroFontSize / single-value auto-fit tests ────────────────────────────────

import { singleValueSvg, heroFontSize } from "../src/svg/tiles";
import type { Rect } from "@yey-boats/midl";

const RECT_480: Rect = { x: 0, y: 0, w: 480, h: 480 };
const TH2 = theme("night");

function makeOkModel(text: string): ElementModel {
  return { state: "ok", text };
}

/** Extract font-size from first <text> element in the SVG snippet. */
function extractFontSize(svg: string): number {
  const m = /font-size="([\d.]+)"/.exec(svg);
  if (!m) throw new Error(`No font-size in: ${svg}`);
  return parseFloat(m[1]);
}

describe("heroFontSize", () => {
  test("Fill role yields font-size >= 70% of cell height (single-digit value)", () => {
    // Use a single character so width-constraint doesn't limit the result
    const fs = heroFontSize({ w: 480, h: 480 }, "6", "Fill");
    expect(fs).toBeGreaterThan(0.7 * 480); // >= 70% of cell height
    expect(fs).toBeLessThanOrEqual(0.92 * 480); // sane upper bound
  });

  test("Fill yields larger font-size than S in a 480x480 cell", () => {
    const fillFs = heroFontSize({ w: 480, h: 480 }, "6.0", "Fill");
    const sFs = heroFontSize({ w: 480, h: 480 }, "6.0", "S");
    expect(fillFs).toBeGreaterThan(sFs);
  });

  test("S role font-size is roughly 45% of Fill", () => {
    const fillFs = heroFontSize({ w: 480, h: 480 }, "6.0", "Fill");
    const sFs = heroFontSize({ w: 480, h: 480 }, "6.0", "S");
    expect(sFs / fillFs).toBeCloseTo(0.45, 1);
  });

  test("a long number shrinks to fit the cell width", () => {
    const longVal = "12345.678";
    const fs = heroFontSize({ w: 480, h: 480 }, longVal, "Fill");
    const approxWidth = longVal.replace(/\s/g, "").length * 0.55 * fs;
    expect(approxWidth).toBeLessThanOrEqual(480 * 0.88 + 1);
  });

  test("short value in Fill mode is height-limited, not width-limited", () => {
    const fs = heroFontSize({ w: 480, h: 480 }, "0", "Fill");
    // single char: maxByWidth >> maxByHeight, so autoFit = maxByHeight = 0.90*480 = 432
    expect(fs).toBeCloseTo(0.90 * 480, 0);
  });

  test("legacy numeric size is returned as-is (backward-compat)", () => {
    expect(heroFontSize({ w: 480, h: 480 }, "6.0", 38)).toBe(38);
    expect(heroFontSize({ w: 200, h: 200 }, "6.0", 14)).toBe(14);
  });

  test("undefined size defaults to L role", () => {
    const defaultFs = heroFontSize({ w: 480, h: 480 }, "6.0", undefined);
    const lFs = heroFontSize({ w: 480, h: 480 }, "6.0", "L");
    expect(defaultFs).toBeCloseTo(lFs, 5);
  });
});

// ── RC2: gauge zone colour follows zoneColor ──────────────────────────────────

import { gaugeSvg, barSvg, textSvg, buttonSvg, autopilotSvg } from "../src/svg/tiles";

describe("gaugeSvg zone colour", () => {
  const gaugeRect: Rect = { x: 0, y: 0, w: 240, h: 240 };
  const baseModel: ElementModel = { state: "ok", text: "20", numeric: 20, fraction: 0.2 };

  test("arc and centre text use GAUGE_CYAN when no zoneColor", () => {
    const svg = gaugeSvg(gaugeRect, baseModel, TH2, {});
    expect(svg).toContain("#57c7d8"); // GAUGE_CYAN
  });

  test("arc uses zone bad colour when zoneColor is 'bad'", () => {
    const m: ElementModel = { ...baseModel, zoneColor: "bad" };
    const svg = gaugeSvg(gaugeRect, m, TH2, {});
    expect(svg).toContain(TH2.bad); // zone colour applied to arc and text
    expect(svg).not.toContain("#57c7d8"); // GAUGE_CYAN not used when zone applies
  });

  test("arc uses zone warn colour when zoneColor is 'warn'", () => {
    const m: ElementModel = { ...baseModel, zoneColor: "warn" };
    const svg = gaugeSvg(gaugeRect, m, TH2, {});
    expect(svg).toContain(TH2.warn);
  });

  test("stale state overrides zone colour with stale colour", () => {
    const m: ElementModel = { ...baseModel, state: "stale", zoneColor: "bad" };
    const svg = gaugeSvg(gaugeRect, m, TH2, {});
    expect(svg).toContain(TH2.stale);
  });
});

// ── RC3: dial needle ──────────────────────────────────────────────────────────

describe("dialSvg needle", () => {
  const tileRect = { x: 0, y: 0, w: 200, h: 200 };
  const hudRect = { x: 0, y: 0, w: 360, h: 360 };

  test("minimal tile: heading 0° and 90° produce different needle SVG", () => {
    const m0: ElementModel = { state: "ok", text: "0", angleDeg: 0 };
    const m90: ElementModel = { state: "ok", text: "090", angleDeg: 90 };
    const svg0 = dialSvg(tileRect, m0, TH.accent, TH, { size: 38 });
    const svg90 = dialSvg(tileRect, m90, TH.accent, TH, { size: 38 });
    // The needle line coordinates differ for different headings
    expect(svg0).not.toBe(svg90);
    // Both contain a needle <line>
    expect(svg0).toContain("<line");
    expect(svg90).toContain("<line");
  });

  test("minimal tile: no needle when angleDeg is absent", () => {
    const m: ElementModel = { state: "ok", text: "---" };
    const svg = dialSvg(tileRect, m, TH.accent, TH, { size: 38 });
    // Without angleDeg, the only lines would be from tick marks (which minimal doesn't have)
    // The minimal dial has no lines at all when no needle and no markers
    const lineCount = (svg.match(/<line/g) ?? []).length;
    expect(lineCount).toBe(0);
  });

  test("round HUD: heading needle present", () => {
    const m: ElementModel = { state: "ok", text: "090", angleDeg: 90 };
    const svg = dialSvg(hudRect, m, TH.accent, TH, { size: 38 });
    // HUD tick lines + needle line: at least one stroke-linecap="round" line
    expect(svg).toContain(`stroke-linecap="round"`);
  });

  test("wind-direction pointer (dirDeg) draws dashed line in warn colour", () => {
    const m: ElementModel = { state: "ok", text: "090", angleDeg: 90, dirDeg: 45 };
    const svg = dialSvg(tileRect, m, TH.accent, TH, { size: 38 });
    expect(svg).toContain("stroke-dasharray");
    expect(svg).toContain(TH.warn);
  });
});

// ── RC5: textSvg uses heroFontSize ────────────────────────────────────────────

describe("textSvg font-size", () => {
  const smallRect: Rect = { x: 0, y: 0, w: 120, h: 60 };
  const bigRect: Rect = { x: 0, y: 0, w: 480, h: 480 };

  test("textSvg font-size scales with cell size (bigger cell → bigger font)", () => {
    const mSmall = { state: "ok" as const, text: "Hello" };
    const mBig = { state: "ok" as const, text: "Hello" };
    const svgSmall = textSvg(smallRect, mSmall, TH2, {});
    const svgBig = textSvg(bigRect, mBig, TH2, {});
    const fsSmall = extractFontSize(svgSmall);
    const fsBig = extractFontSize(svgBig);
    expect(fsBig).toBeGreaterThan(fsSmall);
  });

  test("textSvg with M size role produces smaller font than Fill", () => {
    const m = { state: "ok" as const, text: "Hello" };
    const svgM = textSvg(bigRect, m, TH2, { size: "M" });
    const svgFill = textSvg(bigRect, m, TH2, { size: "Fill" });
    expect(extractFontSize(svgFill)).toBeGreaterThan(extractFontSize(svgM));
  });
});

// ── RC6: heroFontSize height-bound in wide-short cells ────────────────────────

describe("heroFontSize height-bound in wide-short cells (RC6)", () => {
  test("wide-short cell (480×120): height limits font more than width", () => {
    // maxByHeight = 120 * 0.9 = 108; maxByWidth for "6.0" (3 chars) = (480*0.88)/(3*0.55) ≈ 256
    // So height wins: autoFit ≈ 108 (Fill role = 108)
    const fs = heroFontSize({ w: 480, h: 120 }, "6.0", "Fill");
    expect(fs).toBeLessThanOrEqual(0.9 * 120 + 1); // height-bounded
  });

  test("tall-narrow cell (120×480): width limits font more than height", () => {
    // maxByHeight = 480 * 0.9 = 432; maxByWidth for "6.0" = (120*0.88)/(3*0.55) ≈ 64
    // So width wins: autoFit ≈ 64
    const fs = heroFontSize({ w: 120, h: 480 }, "6.0", "Fill");
    expect(fs).toBeLessThanOrEqual(0.9 * 480); // not height-bounded
    expect(fs).toBeLessThan(100); // width-bounded to a smaller value
  });

  // RC6: Fill in a 240px cell yields substantially larger font than old 128px
  // Use a single character so width-constraint is not the limiting factor.
  test("Fill in a 240px cell yields font-size >= 150px (RC6 regression guard)", () => {
    const fs = heroFontSize({ w: 240, h: 240 }, "6", "Fill");
    expect(fs).toBeGreaterThanOrEqual(150); // clearly larger than the old ~128px
    // Also check it doesn't blow past the height
    expect(fs).toBeLessThanOrEqual(240);
  });

  // RC6: Fill in a 480px cell is not regressed
  test("Fill in a 480px cell yields font-size >= 300px (RC6 480 non-regression)", () => {
    const fs = heroFontSize({ w: 480, h: 480 }, "6", "Fill");
    expect(fs).toBeGreaterThanOrEqual(300); // 0.90 * 480 * 1.0 = 432 for single char
  });
});

// ── RC7: buttonSvg and autopilotSvg label sizing ─────────────────────────────

describe("buttonSvg shrink-to-fit", () => {
  const bRect: Rect = { x: 0, y: 0, w: 80, h: 40 };

  test("short label in a wide button uses the default 16px font", () => {
    const svg = buttonSvg(bRect, "OK", TH2, {});
    const fs = extractFontSize(svg);
    expect(fs).toBeLessThanOrEqual(16);
  });

  test("a very long label shrinks to fit the button width", () => {
    const narrowRect: Rect = { x: 0, y: 0, w: 60, h: 40 };
    const svgLong = buttonSvg(narrowRect, "LONG LABEL TEXT", TH2, {});
    const svgShort = buttonSvg(narrowRect, "OK", TH2, {});
    expect(extractFontSize(svgLong)).toBeLessThan(extractFontSize(svgShort));
  });
});

describe("autopilotSvg pill sizing", () => {
  // Use a tall cell so the font size scales up and the pill width difference is measurable.
  const apRect: Rect = { x: 0, y: 0, w: 480, h: 200 };

  function pillWidth(svg: string): number {
    // The pill <rect> is the first rect in the autopilot SVG output.
    const m = /width="([\d.]+)"/.exec(svg);
    if (!m) throw new Error("No width attr in SVG rect: " + svg);
    return parseFloat(m[1]);
  }

  test("STANDBY label produces a wider pill than OK label in a large cell", () => {
    const svgStandby = autopilotSvg(apRect, { state: "ok", text: "STANDBY" }, TH2, {});
    const svgOk = autopilotSvg(apRect, { state: "ok", text: "OK" }, TH2, {});
    // The pill <rect> width should be larger for longer labels
    expect(pillWidth(svgStandby)).toBeGreaterThan(pillWidth(svgOk));
  });
});

// ── RC8: noDataSvg uses ASCII "--" ────────────────────────────────────────────

describe("noDataSvg (via renderDashboardSvg)", () => {
  const noDataDoc = `
midl: "1.0.0"
screens:
  - id: main
    elements:
      missing:
        type: single-value
        name: Missing
        bindings: { value: { kind: signalk, path: no.data.here } }
    layout:
      rows: 1
      cols: 1
      cells:
        - { element: missing }
`;

  test("no-data placeholder uses ASCII -- not an em-dash entity", () => {
    const r = renderDashboardSvg(noDataDoc, MANIFEST, "square-480", { x: 0, y: 0, w: 480, h: 480 },
      new MockDataProvider({}), { theme: "night" });
    expect(r.ok).toBe(true);
    // ASCII "--" present in the SVG text content
    expect(r.svg).toContain(">--<");
    // em-dash HTML entity should NOT be present
    expect(r.svg).not.toContain("&mdash;");
    expect(r.svg).not.toContain("—");
  });
});

describe("singleValueSvg font-size", () => {
  test("Fill role renders a font-size >= 70% of cell height in the SVG (single-digit value)", () => {
    // Single character: width-constraint doesn't limit, height wins
    const svg = singleValueSvg(RECT_480, makeOkModel("6"), TH2, { size: "Fill" });
    const fs = extractFontSize(svg);
    expect(fs).toBeGreaterThanOrEqual(0.70 * 480);
  });

  test("S role renders a smaller font-size than Fill", () => {
    const svgFill = singleValueSvg(RECT_480, makeOkModel("6.0"), TH2, { size: "Fill" });
    const svgS = singleValueSvg(RECT_480, makeOkModel("6.0"), TH2, { size: "S" });
    expect(extractFontSize(svgFill)).toBeGreaterThan(extractFontSize(svgS));
  });

  test("legacy numeric style.size 38 renders as font-size 38", () => {
    const svg = singleValueSvg(RECT_480, makeOkModel("6.0"), TH2, { size: 38 });
    expect(extractFontSize(svg)).toBe(38);
  });

  test("long number shrinks to fit — width-constrained font is smaller than height-limited font", () => {
    const svgShort = singleValueSvg(RECT_480, makeOkModel("0"), TH2, { size: "Fill" });
    const svgLong = singleValueSvg(RECT_480, makeOkModel("123456.789"), TH2, { size: "Fill" });
    expect(extractFontSize(svgShort)).toBeGreaterThan(extractFontSize(svgLong));
  });
});

// ── RC8: no-data "--" is bounded to a small size in singleValueSvg/trendSvg ────

import { trendSvg } from "../src/svg/tiles";

describe("RC8: no-data -- placeholder bounded font-size", () => {
  const RECT_240: Rect = { x: 0, y: 0, w: 240, h: 240 };

  test("singleValueSvg with '--' renders at a small bounded font-size (<=40px), not hero size", () => {
    const noDataModel: ElementModel = { state: "no-data", text: "--" };
    const svg = singleValueSvg(RECT_240, noDataModel, TH2, { size: "Fill" });
    const fs = extractFontSize(svg);
    // Hero Fill in a 240-cell would be ~216px; placeholder must stay small
    expect(fs).toBeLessThanOrEqual(40);
  });

  test("singleValueSvg '--' is much smaller than a real value in Fill role", () => {
    const noDataModel: ElementModel = { state: "no-data", text: "--" };
    const okModel: ElementModel = { state: "ok", text: "6.0" };
    const svgNoData = singleValueSvg(RECT_240, noDataModel, TH2, { size: "Fill" });
    const svgOk = singleValueSvg(RECT_240, okModel, TH2, { size: "Fill" });
    expect(extractFontSize(svgOk)).toBeGreaterThan(extractFontSize(svgNoData) * 3);
  });

  test("trendSvg with '--' renders at a small bounded font-size (<=40px), not hero size", () => {
    const noDataModel: ElementModel = { state: "no-data", text: "--" };
    const svg = trendSvg(RECT_240, noDataModel, [], TH2, { size: "Fill" });
    const fs = extractFontSize(svg);
    expect(fs).toBeLessThanOrEqual(40);
  });
});

// ── RC1: K→°C/°F degree-symbol key normalization ─────────────────────────────

describe("RC1: K→°C/°F degree-symbol normalization", () => {
  test("convert 293.15 K with unit '°C' gives 20.0°C", () => {
    const n = convert(293.15, "K", "°C");
    expect(n).toBeCloseTo(20, 4);
  });

  test("convert 293.15 K with unit '°F' gives 68.0°F", () => {
    const n = convert(293.15, "K", "°F");
    expect(n).toBeCloseTo(68, 4);
  });

  test("formatValue 293.15 K with unit '°C' decimals 1 gives '20.0 °C'", () => {
    const r = formatValue(293.15, { unit: "°C", decimals: 1 }, "K");
    expect(r.text).toBe("20.0 °C");
    expect(r.numeric).toBeCloseTo(20, 4);
  });

  test("formatValue 293.15 K with unit '°F' decimals 1 gives '68.0 °F'", () => {
    const r = formatValue(293.15, { unit: "°F", decimals: 1 }, "K");
    expect(r.text).toBe("68.0 °F");
    expect(r.numeric).toBeCloseTo(68, 4);
  });

  test("K passthrough unaffected (no degree unit)", () => {
    const r = formatValue(293.15, { unit: "K", decimals: 2 }, "K");
    expect(r.text).toBe("293.15 K");
  });
});

// ── B1: style.color token / #hex resolves correctly ──────────────────────────

import { barSvg, trendSvg } from "../src/svg/tiles";

describe("B1: style.color token and #hex color resolution", () => {
  const rect: Rect = { x: 0, y: 0, w: 240, h: 240 };
  const okModel: ElementModel = { state: "ok", text: "6.0", numeric: 6 };
  const th = theme("night");

  test("singleValueSvg: style.color 'warn' renders the theme warn color (not accent)", () => {
    const svg = singleValueSvg(rect, okModel, th, { colorRole: "warn" });
    expect(svg).toContain(th.warn);
    expect(svg).not.toContain(th.accent);
  });

  test("singleValueSvg: style.color '#ff0000' renders red", () => {
    const svg = singleValueSvg(rect, okModel, th, { colorRole: "#ff0000" });
    expect(svg).toContain("#ff0000");
  });

  test("singleValueSvg: zone color still overrides style.color", () => {
    const modelWithZone: ElementModel = { ...okModel, zoneColor: "bad" };
    const svg = singleValueSvg(rect, modelWithZone, th, { colorRole: "warn" });
    // zone color (bad) takes precedence over style.color (warn)
    expect(svg).toContain(th.bad);
  });

  test("barSvg: style.color 'warn' renders the theme warn color for hero text", () => {
    const barModel: ElementModel = { state: "ok", text: "60%", numeric: 60, fraction: 0.6 };
    const svg = barSvg(rect, barModel, th, { colorRole: "warn" });
    expect(svg).toContain(th.warn);
  });

  test("trendSvg: style.color 'good' renders the theme good color for hero text", () => {
    const svg = trendSvg(rect, okModel, [1, 2, 3], th, { colorRole: "good" });
    expect(svg).toContain(th.good);
  });

  test("buttonSvg: style.color 'good' renders green fill (not accent)", () => {
    const svg = buttonSvg(rect, "GO", th, { colorRole: "good" });
    expect(svg).toContain(th.good);
    expect(svg).not.toContain(th.accent);
  });

  test("buttonSvg: style.color '#ff0000' renders red fill", () => {
    const svg = buttonSvg(rect, "STOP", th, { colorRole: "#ff0000" });
    expect(svg).toContain("#ff0000");
  });

  test("buttonSvg: no style.color defaults to accent fill", () => {
    const svg = buttonSvg(rect, "OK", th, {});
    expect(svg).toContain(th.accent);
  });
});

// ── C1: position multi-line and non-numeric unit suppression ──────────────────

describe("C1: position multi-line tspan rendering and unit suppression", () => {
  const rect: Rect = { x: 0, y: 0, w: 240, h: 240 };
  const th = theme("night");

  test("singleValueSvg: hero text with \\n renders as <tspan> elements (not a flat text node)", () => {
    const model: ElementModel = { state: "ok", text: "41°23.16'N\n2°10.43'E" };
    const svg = singleValueSvg(rect, model, th, {});
    // multi-line means <tspan> elements are present
    expect(svg).toContain("<tspan");
    // both lines appear (single-quote is XML-escaped to &#39; by esc())
    expect(svg).toContain("41°23.16");
    expect(svg).toContain("2°10.43");
    // exactly two tspan elements
    const tspanCount = (svg.match(/<tspan/g) ?? []).length;
    expect(tspanCount).toBe(2);
  });

  test("singleValueSvg: position value has no unit suffix", () => {
    const model: ElementModel = { state: "ok", text: "41°23.16'N\n2°10.43'E" };
    const svg = singleValueSvg(rect, model, th, { unit: "deg" });
    // unit should NOT be appended for multi-line (position) values
    expect(svg).not.toContain(">deg<");
  });

  test("singleValueSvg: string state value (autopilot/text) has no unit suffix", () => {
    // numeric is null → non-numeric state → suppress unit
    const model: ElementModel = { state: "ok", text: "AUTO" };
    const svg = singleValueSvg(rect, model, th, { unit: "kn" });
    expect(svg).not.toContain(">kn<");
    expect(svg).toContain(">AUTO<");
  });

  test("singleValueSvg: numeric value still shows unit suffix", () => {
    const model: ElementModel = { state: "ok", text: "6.0", numeric: 6 };
    const svg = singleValueSvg(rect, model, th, { unit: "kn" });
    expect(svg).toContain(">kn<");
  });
});

// ── F: unit suffix positioning and clamping ───────────────────────────────────

describe("F: unit suffix right-edge stays within cell", () => {
  const th = theme("night");

  test("unit right edge within cell for a narrow cell with a long value", () => {
    // Narrow cell where fixed offset would bleed
    const narrowRect: Rect = { x: 0, y: 0, w: 80, h: 80 };
    const model: ElementModel = { state: "ok", text: "999.9", numeric: 999.9 };
    const svg = singleValueSvg(narrowRect, model, th, { unit: "kn" });
    // unit must be present
    expect(svg).toContain(">kn<");
    // Extract x position of the unit text element (last <text> in the SVG)
    const unitMatch = /font-size="[\d.]+" fill="[^"]+" text-anchor="start">[^<]+<\/text>/.exec(svg);
    expect(unitMatch).not.toBeNull();
    // The x coordinate of the unit text must be <= cell right edge (80 - 4 = 76)
    const xMatch = /x="([\d.]+)"[^>]*text-anchor="start"/.exec(svg);
    if (xMatch) {
      expect(parseFloat(xMatch[1])).toBeLessThanOrEqual(80);
    }
  });

  test("unit font shrinks in a narrow cell to prevent overflow", () => {
    const narrowRect: Rect = { x: 0, y: 0, w: 60, h: 60 };
    const wideRect: Rect = { x: 0, y: 0, w: 480, h: 480 };
    const model: ElementModel = { state: "ok", text: "99.9", numeric: 99.9 };
    const svgNarrow = singleValueSvg(narrowRect, model, th, { unit: "kn" });
    const svgWide = singleValueSvg(wideRect, model, th, { unit: "kn" });
    // Extract font-size from the unit text (the start-anchored text)
    const fsSrc = (svg: string): number => {
      const m = /font-size="([\d.]+)"[^>]*text-anchor="start"/.exec(svg);
      return m ? parseFloat(m[1]) : 20;
    };
    expect(fsSrc(svgNarrow)).toBeLessThanOrEqual(fsSrc(svgWide));
  });
});

// ── E1: autopilot no-data renders its own STBY pill, not the generic "--" ─────

import { paintScreenSvg } from "../src/svg/render-svg";
import type { Element, Placement } from "@yey-boats/midl";

describe("E1: autopilot no-data renders STBY pill not generic --", () => {
  const th = theme("night");
  const apEl: Element = {
    type: "autopilot",
    name: "AP",
    bindings: { value: { kind: "signalk", path: "steering.autopilot.state" } },
  } as unknown as Element;
  const placement: Placement = { elementId: "ap", rect: { x: 0, y: 0, w: 240, h: 120 } } as unknown as Placement;

  test("autopilot with no data renders the STBY pill (not a bare -- placeholder)", () => {
    // No data for steering.autopilot.state → no-data state
    const provider = new MockDataProvider({});
    const svg = paintScreenSvg([placement], { ap: apEl }, provider, th);
    // Must contain STBY label in the pill
    expect(svg).toContain(">STBY<");
    // Must NOT contain the generic standalone "--" text node
    const genericDash = (svg.match(/>--</g) ?? []).length;
    expect(genericDash).toBe(0);
  });
});

// ── E2: autopilot engaged vs standby are visually distinct ────────────────────

describe("E2: autopilot engaged vs standby pill fill/stroke are different", () => {
  const rect: import("@yey-boats/midl").Rect = { x: 0, y: 0, w: 240, h: 120 };
  const th = theme("night");

  function pillFillStroke(svg: string): { fill: string; stroke: string } {
    // The pill <rect> has fill="..." stroke="..."
    const m = /fill="([^"]+)" stroke="([^"]+)"/.exec(svg);
    if (!m) throw new Error("No pill rect in: " + svg);
    return { fill: m[1], stroke: m[2] };
  }

  test("engaged state uses filled AP_PILL_BG background", () => {
    const engagedModel: ElementModel = { state: "ok", text: "AUTO" };
    const svg = autopilotSvg(rect, engagedModel, th, {});
    const { fill } = pillFillStroke(svg);
    // Engaged → filled pill (AP_PILL_BG = #143b2a)
    expect(fill).toBe("#143b2a");
  });

  test("standby state uses hollow/transparent fill", () => {
    const stbyModel: ElementModel = { state: "ok", text: "STBY" };
    const svg = autopilotSvg(rect, stbyModel, th, {});
    const { fill } = pillFillStroke(svg);
    // Standby → no fill (none)
    expect(fill).toBe("none");
  });

  test("engaged and standby produce different pill fill", () => {
    const engagedSvg = autopilotSvg(rect, { state: "ok", text: "AUTO" }, th, {});
    const stbySvg = autopilotSvg(rect, { state: "ok", text: "STBY" }, th, {});
    const { fill: engagedFill } = pillFillStroke(engagedSvg);
    const { fill: stbyFill } = pillFillStroke(stbySvg);
    expect(engagedFill).not.toBe(stbyFill);
  });

  test("engaged and standby produce different pill stroke", () => {
    const engagedSvg = autopilotSvg(rect, { state: "ok", text: "AUTO" }, th, {});
    const stbySvg = autopilotSvg(rect, { state: "ok", text: "STBY" }, th, {});
    const { stroke: engagedStroke } = pillFillStroke(engagedSvg);
    const { stroke: stbyStroke } = pillFillStroke(stbySvg);
    expect(engagedStroke).not.toBe(stbyStroke);
  });
});

// ── E3: windrose no-data shows tile label ─────────────────────────────────────

describe("E3: windrose no-data renders the tile label", () => {
  const th = theme("night");
  const windroseEl: Element = {
    type: "windrose",
    name: "AWA",
    style: { title: "AWA" },
    bindings: { value: { kind: "signalk", path: "environment.wind.angleApparent" } },
  } as unknown as Element;
  const placement: Placement = { elementId: "awa", rect: { x: 0, y: 0, w: 240, h: 240 } } as unknown as Placement;

  test("no-data windrose renders its label text (not anonymous)", () => {
    const provider = new MockDataProvider({});
    const svg = paintScreenSvg([placement], { awa: windroseEl }, provider, th);
    // Should contain the tile label "AWA" in the frame caption
    expect(svg.toUpperCase()).toContain("AWA");
    // And the generic -- placeholder
    expect(svg).toContain(">--<");
  });
});

// ── E4: stale dial dims ring/needle/arrow, not just value text ────────────────

describe("E4: stale dial dims ring, needle, and direction arrow", () => {
  const tileRect = { x: 0, y: 0, w: 200, h: 200 };
  const th = theme("night");

  test("stale minimal dial uses stale color for the ring", () => {
    const staleModel: ElementModel = { state: "stale", text: "090", angleDeg: 90, dirDeg: 45 };
    const okModel: ElementModel = { state: "ok", text: "090", angleDeg: 90, dirDeg: 45 };
    const staleSvg = dialSvg(tileRect, staleModel, th.warn, th, { size: 38 });
    const okSvg = dialSvg(tileRect, okModel, th.warn, th, { size: 38 });
    // Stale dial must contain the stale color (ring/needle/arrow)
    expect(staleSvg).toContain(th.stale);
    // OK dial must NOT use stale color for the ring (only for text would be wrong here)
    // The warn ring color must be present in the OK dial
    expect(okSvg).toContain(th.warn);
  });

  test("stale minimal dial: ring/needle use stale color instead of ringColor", () => {
    const staleModel: ElementModel = { state: "stale", text: "090", angleDeg: 90 };
    const staleSvg = dialSvg(tileRect, staleModel, th.accent, th, { size: 38 });
    // The stale color must appear in strokes (ring, needle)
    expect(staleSvg).toContain(`stroke="${th.stale}"`);
    // The accent color must NOT be used for geometry (only th.stale replaces it)
    // Note: th.accent may appear in the hero text via heroColor... but heroColor
    // maps stale→th.stale, so th.accent should not appear at all.
    expect(staleSvg).not.toContain(th.accent);
  });

  test("stale minimal dial: direction arrow uses stale color not warn", () => {
    const staleModel: ElementModel = { state: "stale", text: "090", angleDeg: 90, dirDeg: 180 };
    const staleSvg = dialSvg(tileRect, staleModel, th.accent, th, { size: 38 });
    // warn (amber) must not appear as the dashed arrow color when stale
    expect(staleSvg).not.toContain(`stroke="${th.warn}"`);
    // stale color must be used instead
    expect(staleSvg).toContain(th.stale);
  });
});

// ── E5: band target bug not shown when no active target angle ─────────────────

describe("E5: band dial target bug suppressed when no warn marker with angle", () => {
  const bandRect = { x: 0, y: 0, w: 200, h: 200 };
  const th = theme("night");

  test("band with a non-warn marker (HDG/accent) does NOT draw the amber bug", () => {
    // A marker with no color="warn" → should not produce the amber bug
    const modelWithAccentMarker: ElementModel = {
      state: "ok", text: "090", angleDeg: 90,
      markers: [{ glyph: "triangle", color: "accent", angleDeg: 45, kind: "rim" }],
    };
    const svg = dialSvg(bandRect, modelWithAccentMarker, th.accent, th, { shape: "band" });
    // amber bug color is #ffb84d — it must NOT appear since color != "warn"
    expect(svg).not.toContain("#ffb84d");
  });

  test("band with a warn marker WITH an angle draws the amber bug", () => {
    const modelWithWarnTarget: ElementModel = {
      state: "ok", text: "090", angleDeg: 90,
      markers: [{ glyph: "triangle", color: "warn", angleDeg: 60, kind: "rim" }],
    };
    const svg = dialSvg(bandRect, modelWithWarnTarget, th.accent, th, { shape: "band" });
    // warn marker with angle → amber bug is rendered
    expect(svg).toContain("#ffb84d");
  });

  test("band with a warn marker but NO angle does NOT draw the amber bug", () => {
    const modelWithWarnNoAngle: ElementModel = {
      state: "ok", text: "090", angleDeg: 90,
      markers: [{ glyph: "triangle", color: "warn", angleDeg: undefined, kind: "rim" }],
    };
    const svg = dialSvg(bandRect, modelWithWarnNoAngle, th.accent, th, { shape: "band" });
    // warn marker present but angleDeg=undefined (standby) → no bug
    expect(svg).not.toContain("#ffb84d");
  });

  // H19a/H19b: non-warn band markers must render (not be dropped), honouring glyph.
  test("band renders non-warn markers with their own glyph and colour", () => {
    const model: ElementModel = {
      state: "ok", text: "090", angleDeg: 90,
      markers: [
        { glyph: "diamond", color: "accent", angleDeg: 60, kind: "rim" }, // COG
        { glyph: "circle", color: "good", angleDeg: 120, kind: "rim" },   // CTS
      ],
    };
    const svg = dialSvg(bandRect, model, th.accent, th, { shape: "band" });
    // accent marker → true-wind cyan; good marker → th.good. Both must appear.
    expect(svg).toContain(th.widgets.windTrue);
    expect(svg).toContain(th.good);
    // glyph honoured: a circle glyph emits a <circle ...> (not a forced triangle)
    expect(svg).toContain("<circle");
  });

  // H16: the heading band must use the theme's band colour, so it stays legible
  // on the light day surface (the old hardcoded near-white was invisible there).
  test("band uses per-theme hudBand colour (day = dark band, not near-white)", () => {
    const model: ElementModel = { state: "ok", text: "090", angleDeg: 90 };
    const dayTheme = theme("day");
    const svg = dialSvg(bandRect, model, dayTheme.accent, dayTheme, { shape: "band" });
    expect(svg).toContain(dayTheme.widgets.hudBand); // #1c2b3a
    expect(svg).not.toContain("#f2f6fb");            // night near-white band
  });
});
