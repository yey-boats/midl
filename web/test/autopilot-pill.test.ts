// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// #38: the autopilot label must fit inside its pill with padding on both sides.
import { describe, test, expect } from "vitest";
import { autopilotSvg } from "../src/svg/tiles";
import { theme } from "../src/theme";

const TH = theme("night");
// Mirrors AP_EM (0.78) in tiles.ts autopilotSvg, minus a small margin.
// Bold uppercase advance (Montserrat/Arial 700) incl. the 0.04em tracking.
// Widest common letters (W, M, O) run ~0.8-0.95em; the average for the
// autopilot states is ~0.76em. Use 0.76 and require >= 0.3em air per side.
const EM = 0.76;

describe("#38 autopilot pill fits its label", () => {
  const rects = [
    { x: 0, y: 0, w: 240, h: 240 }, // square-480 quarter tile (racing-vmg)
    { x: 0, y: 0, w: 180, h: 180 }, // round-360 quarter tile
    { x: 0, y: 0, w: 480, h: 200 },
    { x: 0, y: 0, w: 120, h: 120 },
  ];
  for (const r of rects) {
    for (const label of ["AUTO", "STANDBY", "TRACK", "WIND", "STBY"]) {
      test(`${label} in ${r.w}x${r.h}`, () => {
        const svg = autopilotSvg(r, { state: "ok", text: label }, TH, {});
        const pw = +/<rect x="[\d.-]+" y="[\d.-]+" width="([\d.]+)"/.exec(svg)![1];
        const fs = +/<text [^>]*font-size="([\d.]+)"/.exec(svg)![1];
        expect(pw).toBeLessThanOrEqual(r.w - 24 + 0.01);
        expect(label.length * EM * fs + 2 * 0.3 * fs).toBeLessThanOrEqual(pw);
      });
    }
  }

  const pill = (svg: string) => ({
    pw: +/<rect x="[^"]+" y="[^"]+" width="([\d.-]+)"/.exec(svg)![1],
    fs: +/<text [^>]*font-size="([\d.-]+)"/.exec(svg)![1],
    label: />([^<]*)<\/text>/.exec(svg)![1],
  });
  test("capped pill (w-24 < 70) fills the tile and shrinks the font", () => {
    const r = { x: 0, y: 0, w: 80, h: 80 };
    const p = pill(autopilotSvg(r, { state: "ok", text: "STANDBY" }, TH, {}));
    expect(p.pw).toBeCloseTo(56, 5);
    expect(p.fs).toBeLessThan(80 * 0.3 * 0.6);
    expect(p.fs).toBeGreaterThanOrEqual(8);
  });
  test("numeric style.size is honoured up to the fit", () => {
    const r = { x: 0, y: 0, w: 240, h: 240 };
    const small = pill(autopilotSvg(r, { state: "ok", text: "AUTO" }, TH, { size: 20 }));
    expect(small.fs).toBe(20);
    const big = pill(autopilotSvg(r, { state: "ok", text: "AUTO" }, TH, { size: 60 }));
    expect(4 * EM * big.fs + 0.6 * big.fs).toBeLessThanOrEqual(big.pw);
  });
  test("no-data, empty and '--' render STBY", () => {
    const r = { x: 0, y: 0, w: 240, h: 240 };
    for (const m of [{ state: "no-data" as const, text: "" }, { state: "ok" as const, text: "" }, { state: "ok" as const, text: "--" }]) {
      expect(pill(autopilotSvg(r, m, TH, {})).label).toBe("STBY");
    }
  });
  test("degenerate tiles never emit a non-positive font size or pill width", () => {
    for (const w of [10, 20, 24, 30]) {
      const p = pill(autopilotSvg({ x: 0, y: 0, w, h: w }, { state: "ok", text: "STANDBY" }, TH, {}));
      expect(p.fs).toBeGreaterThan(0);
      expect(p.pw).toBeGreaterThanOrEqual(0);
    }
  });
});
