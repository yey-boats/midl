// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { test, expect, describe } from "vitest";
import { glyphPath, GLYPH_NAMES } from "../src/svg/glyphs";
import { polar, arc, esc } from "../src/svg/geometry";
import { dialSvg } from "../src/svg/dial";
import { renderDashboardSvg } from "../src/svg/render-svg";
import { MockDataProvider } from "../src/data";
import { theme } from "../src/theme";
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
  test("Fill role yields font-size >= 40% of cell height (short value)", () => {
    const fs = heroFontSize({ w: 480, h: 480 }, "6.0", "Fill");
    expect(fs).toBeGreaterThan(0.4 * 480); // >= 40% of cell height
    expect(fs).toBeLessThanOrEqual(0.65 * 480); // sane upper bound
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
    // single char: maxByWidth >> maxByHeight, so autoFit = maxByHeight = 0.60*480 = 288
    expect(fs).toBeCloseTo(0.60 * 480, 0);
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
    // maxByHeight = 120 * 0.6 = 72; maxByWidth for "6.0" (3 chars) = (480*0.88)/(3*0.55) ≈ 256
    // So height wins: autoFit ≈ 72 (Fill role = 72)
    const fs = heroFontSize({ w: 480, h: 120 }, "6.0", "Fill");
    expect(fs).toBeLessThanOrEqual(0.6 * 120 + 1); // height-bounded
  });

  test("tall-narrow cell (120×480): width limits font more than height", () => {
    // maxByHeight = 480 * 0.6 = 288; maxByWidth for "6.0" = (120*0.88)/(3*0.55) ≈ 64
    // So width wins: autoFit ≈ 64
    const fs = heroFontSize({ w: 120, h: 480 }, "6.0", "Fill");
    expect(fs).toBeLessThanOrEqual(0.6 * 480); // not height-bounded
    expect(fs).toBeLessThan(100); // width-bounded to a smaller value
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
  test("Fill role renders a font-size >= 40% of cell height in the SVG", () => {
    const svg = singleValueSvg(RECT_480, makeOkModel("6.0"), TH2, { size: "Fill" });
    const fs = extractFontSize(svg);
    expect(fs).toBeGreaterThanOrEqual(0.40 * 480);
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
