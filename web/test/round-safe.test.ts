// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// #36: on round classes no tile content (captions, values, dials, bars) is
// drawn under the bezel. The panel backgrounds may still reach the corners.
import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { renderDashboardSvg, prepareDashboard, MockDataProvider } from "../src/index";
import { safeRect, fitCircle, viewportDisc, rectInDisc } from "../src/svg/round-safe";

const ROOT = new URL("../../", import.meta.url);
const man = JSON.parse(readFileSync(new URL("schemas/gen/yb-midl-capabilities.round-360.json", ROOT), "utf8"));
const VP = { x: 0, y: 0, w: 360, h: 360 };
const C = 180, R = 180;

function value(path: string): unknown {
  const p = path.toLowerCase();
  if (/position$/.test(p)) return { latitude: 59.9, longitude: 10.7 };
  if (/state|mode$/.test(p)) return "auto";
  if (/angle|heading|course|bearing/.test(p)) return 4.2;
  if (/depth/.test(p)) return 12.4;
  return 3.3;
}

const est = (s: string) => [...s].reduce((a, c) => a + (c === "." || c === " " ? 0.3 : c === "°" ? 0.42 : 0.66), 0);
const out = (x: number, y: number) => Math.hypot(x - C, y - C) > R + 0.5;

/** Every content primitive that pokes outside the round panel. */
function clipped(svg: string): string[] {
  const bad: string[] = [];
  for (const t of svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*font-size="([\d.]+)"[^>]*?(?:text-anchor="(\w+)")?[^>]*>([^<]*)<\/text>/g)) {
    const [x, y, fs] = [+t[1], +t[2], +t[3]];
    const anchor = /text-anchor="(\w+)"/.exec(t[0])?.[1] ?? "start";
    const w = est(t[5]) * fs;
    const x0 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
    const top = y - 0.72 * fs;
    if (out(x0, top) || out(x0 + w, top) || out(x0, y) || out(x0 + w, y)) bad.push(`text "${t[5]}"`);
  }
  for (const c of svg.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="([\d.]+)"/g)) {
    if (Math.hypot(+c[1] - C, +c[2] - C) + +c[3] > R + 0.5) bad.push(`circle ${c[0]}`);
  }
  for (const l of svg.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g)) {
    if (out(+l[1], +l[2]) || out(+l[3], +l[4])) bad.push(`line ${l[0]}`);
  }
  // non-frame rects (bars, pills): frames use rx="8"
  for (const r of svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)" rx="(\d+)"/g)) {
    if (r[5] === "8") continue;
    const [x, y, w, h] = [+r[1], +r[2], +r[3], +r[4]];
    if (out(x, y) || out(x + w, y) || out(x, y + h) || out(x + w, y + h)) bad.push(`rect ${r[0]}`);
  }
  return bad;
}

describe("#36 round-360 library dashboards keep content inside the bezel", () => {
  const lib = new URL("library/", ROOT);
  const files = readdirSync(lib).filter((n) => n.endsWith(".midl.yaml"));
  let rendered = 0;
  for (const f of files) {
    test(f, () => {
      const text = readFileSync(new URL(f, lib), "utf8");
      const prep = prepareDashboard(text, man, "round-360", VP);
      expect(prep.ok, `${f} must be offered on round-360`).toBe(true);
      const vals = Object.fromEntries(prep.paths.map((p) => [p, { value: value(p) }]));
      for (const th of ["night", "day"]) {
        for (const provider of [new MockDataProvider(vals), new MockDataProvider({})]) {
          const r = renderDashboardSvg(text, man, "round-360", VP, provider, { theme: th });
          expect(r.ok).toBe(true);
          expect(clipped(r.svg)).toEqual([]);
        }
      }
      rendered++;
    });
  }
  test("all library documents were rendered", () => expect(rendered).toBe(files.length));

  const one = (body: string) => `
midl: "1.0.0"
screens:
  - id: s
    elements:
      d: ${body}
    layout: { rows: 1, cols: 1, cells: [ { element: d } ] }
`;
  test("full-screen compass HUD and band compass stay inside", () => {
    const vals = new MockDataProvider({ hdg: { value: 4.2, sourceUnit: "rad" } });
    for (const body of [
      "{ type: compass, name: HDG, bindings: { value: { kind: signalk, path: hdg } } }",
      "{ type: compass, name: HDG, style: { shape: band }, bindings: { value: { kind: signalk, path: hdg } } }",
      "{ type: windrose, name: AWA, bindings: { value: { kind: signalk, path: hdg } } }",
    ]) {
      const r = renderDashboardSvg(one(body), man, "round-360", VP, vals);
      expect(r.ok).toBe(true);
      expect(clipped(r.svg)).toEqual([]);
    }
  });
});

describe("round-safe degenerate cells", () => {
  test("a cell entirely under the bezel draws only its panel, never negative sizes", async () => {
    const { paintScreenSvg } = await import("../src/svg/render-svg");
    const { theme } = await import("../src/theme");
    const disc = viewportDisc(VP);
    const els = {
      b: { type: "button", name: "TACK", action: { kind: "command", target: "x" } },
      c: { type: "compass", name: "HDG", bindings: { value: { kind: "signalk", path: "hdg" } } },
      v: { type: "single-value", name: "SOG", bindings: { value: { kind: "signalk", path: "sog" } } },
    } as never;
    for (const id of ["b", "c", "v"]) {
      for (const rect of [{ x: 0, y: 0, w: 40, h: 40 }, { x: 0, y: 0, w: 60, h: 60 }]) {
        const svg = paintScreenSvg([{ elementId: id, rect }], els, new MockDataProvider({ hdg: { value: 1 }, sog: { value: 3 } }), theme("night"), undefined, disc);
        expect(svg).not.toMatch(/(width|height|r|font-size)="-|font-size="0"/);
        expect(svg).not.toContain("<text");
      }
    }
  });
  test("viewportDisc never has a negative radius", () => {
    expect(viewportDisc({ x: 0, y: 0, w: 4, h: 4 }).r).toBe(0);
  });
});

describe("round-safe geometry", () => {
  const d = viewportDisc(VP, 0);
  test("a cell already inside the disc is unchanged", () => {
    const t = { x: 100, y: 100, w: 160, h: 160 };
    expect(safeRect(t, d)).toEqual(t);
  });
  test("a corner quadrant shrinks to a rect fully inside the disc", () => {
    const s = safeRect({ x: 180, y: 180, w: 180, h: 180 }, d);
    expect(rectInDisc(s, d)).toBe(true);
    expect(s.w * s.h).toBeGreaterThan(0.45 * 180 * 180); // r²/2 is the optimum
  });
  test("a full-screen cell keeps a full-size dial circle", () => {
    const c = fitCircle({ x: 0, y: 0, w: 360, h: 360 }, d);
    expect(c.w).toBeGreaterThan(355);
  });
  test("fitCircle avoids the caption box", () => {
    const box = { x: 60, y: 60, w: 60, h: 30 };
    const c = fitCircle({ x: 0, y: 0, w: 360, h: 180 }, d, box);
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2, r = c.w / 2;
    const dx = Math.max(box.x - cx, 0, cx - box.x - box.w), dy = Math.max(box.y - cy, 0, cy - box.y - box.h);
    expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(r - 0.01);
  });
});
