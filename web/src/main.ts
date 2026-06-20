// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { previewConfig } from "./preview";
import { paintScreen, type ValueFn } from "./paint";
import type { Manifest } from "@yey-boats/midl";

const SAMPLE = `midl: 1.0.0
screens:
  - id: dash
    elements:
      wind: { type: windrose, name: WIND, bindings: { value: { kind: signalk, path: environment.wind.speedApparent } } }
      sog: { type: single-value, name: SOG, bindings: { value: { kind: signalk, path: navigation.speedOverGround } } }
      depth: { type: single-value, name: DEPTH, bindings: { value: { kind: signalk, path: environment.depth.belowTransducer } } }
      batt: { type: bar, name: BATT, bindings: { value: { kind: signalk, path: electrical.batteries.house.stateOfCharge } } }
    layout:
      rows: 2
      cols: 2
      cells: [{ element: wind }, { element: sog }, { element: depth }, { element: batt }]
`;

const MANIFEST: Manifest = {
  midl: "1.0.0",
  board: "preview",
  classes: [
    { id: "square-480", width: 480, height: 480, maxTiles: 4, maxDepth: 3, elements: ["windrose", "single-value", "bar"] },
    { id: "landscape-800x480", width: 800, height: 480, maxTiles: 6, maxDepth: 3, elements: ["windrose", "single-value", "bar"] },
    { id: "landscape-1024x600", width: 1024, height: 600, maxTiles: 6, maxDepth: 4, elements: ["windrose", "single-value", "bar"] },
  ],
  elements: [
    { type: "windrose", bindings: ["value"] },
    { type: "single-value", bindings: ["value"] },
    { type: "bar", bindings: ["value"] },
  ],
  sources: ["signalk"],
};

const SAMPLE_VALUES: Record<string, string> = {
  windrose: "12.4", "single-value": "6.1", bar: "78%",
};
const valueFn: ValueFn = (el) => SAMPLE_VALUES[el.type] ?? "--";

function render(className: string): void {
  const cls = MANIFEST.classes.find((c) => c.id === className)!;
  const canvas = document.getElementById("cv") as HTMLCanvasElement;
  canvas.width = cls.width!;
  canvas.height = cls.height!;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const res = previewConfig(SAMPLE, MANIFEST, className, { x: 0, y: 0, w: canvas.width, h: canvas.height });
  const issues = document.getElementById("issues")!;
  if (!res.ok) { issues.textContent = res.issues.map((i) => `${i.path}: ${i.message}`).join("\n"); return; }
  issues.textContent = "";
  for (const sp of res.screens) paintScreen(ctx, sp.placements, res.elements[sp.screenId], valueFn);
}

const sel = document.getElementById("cls") as HTMLSelectElement;
sel.addEventListener("change", () => render(sel.value));
render(sel.value);
