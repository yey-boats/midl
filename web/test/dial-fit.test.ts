// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// #35: the grid-tile (minimal) dial must keep its hero value clear of the W/E
// cardinals and of the needle / dir pointer (firmware paint_compass_body:
// ring_hero_font fits between E/W, a panel vignette sits behind the number).
import { describe, test, expect } from "vitest";
import { dialSvg } from "../src/svg/dial";
import { theme } from "../src/theme";
import type { ElementModel } from "../src/model";

const TH = theme("night");
// Advance widths of Montserrat 700 (em): digits/letters ~0.62, "." 0.28,
// space 0.27, "°" 0.42.
const ems = (s: string) => [...s].reduce((a, c) => a + (c === "." ? 0.28 : c === " " ? 0.27 : c === "°" ? 0.42 : 0.62), 0);

function texts(svg: string) {
  return [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)]
    .map((t) => ({ x: +t[1], y: +t[2], fs: +t[3], s: t[4], at: t.index! }));
}

function check(rect: { x: number; y: number; w: number; h: number }, m: ElementModel, unit?: string) {
  const svg = dialSvg(rect, m, TH.warn, TH, { unit });
  const ts = texts(svg);
  const e = ts.find((t) => t.s === "E")!, w = ts.find((t) => t.s === "W")!;
  const hero = ts.reduce((a, b) => (b.fs > a.fs ? b : a));
  const heroW = ems(hero.s) * hero.fs;
  // hero box stays strictly between the W and E letters
  expect(hero.x - heroW / 2).toBeGreaterThan(w.x + w.fs * 0.4);
  expect(hero.x + heroW / 2).toBeLessThan(e.x - e.fs * 0.4);
  // a panel vignette is painted after every needle/pointer line and before the
  // hero, wide enough to cover the hero box
  const vig = [...svg.matchAll(/<circle cx="[\d.-]+" cy="[\d.-]+" r="([\d.]+)" fill="([^"]+)" fill-opacity="0.8"\/>/g)][0];
  expect(vig, "vignette disc").toBeTruthy();
  expect(vig[2]).toBe(TH.panel);
  const lastLine = svg.lastIndexOf("<line");
  expect(lastLine).toBeLessThan(vig.index!);
  expect(vig.index!).toBeLessThan(hero.at);
  expect(+vig[1]).toBeGreaterThanOrEqual(heroW / 2);
  return { svg, hero };
}

describe("#35 minimal dial hero fit", () => {
  test("round-360 hero tile: windrose '15.7 kn' with needle + dir", () => {
    const { svg, hero } = check({ x: 0, y: 0, w: 360, h: 180 }, { state: "ok", text: "15.7 kn", numeric: 15.7, angleDeg: 20, dirDeg: 45 }, "kn");
    // word unit drawn separately under the number (firmware windrose stand-in)
    expect(hero.s).toBe("15.7");
    expect(svg).toMatch(/>kn<\/text>/);
  });
  test("round-360 quarter tile: compass '241°'", () => {
    check({ x: 180, y: 180, w: 180, h: 180 }, { state: "ok", text: "241°", numeric: 241, angleDeg: 241, dirDeg: 241 });
  });
  test("square-480 quarter tile: windrose '8.1'", () => {
    check({ x: 0, y: 0, w: 240, h: 240 }, { state: "ok", text: "8.1", numeric: 8.1, angleDeg: 43, dirDeg: 43 });
  });
  test("small 120 px tile still fits", () => {
    check({ x: 0, y: 0, w: 120, h: 120 }, { state: "ok", text: "359°", numeric: 359, angleDeg: 359 });
  });
  test("needle reaches the rim so it stays visible past the vignette", () => {
    const rect = { x: 0, y: 0, w: 200, h: 200 };
    const svg = dialSvg(rect, { state: "ok", text: "090", angleDeg: 90 }, TH.accent, TH, {});
    const ln = svg.match(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/)!;
    const R = 200 * 0.42;
    expect(+ln[3] - 100).toBeGreaterThan(R * 0.8);
  });
});
