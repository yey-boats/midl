// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { test, expect, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MidlDashboard } from "../src/MidlDashboard";
import { MockDataProvider } from "../src/data";
import type { Manifest } from "@yey-boats/midl";

globalThis.requestAnimationFrame ??= ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 0)) as never;
globalThis.cancelAnimationFrame ??= ((id: number) => clearTimeout(id)) as never;

beforeEach(() => {
  const noop2d = new Proxy({}, { get: () => () => {}, set: () => true }) as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(noop2d as never);
});

const manifest: Manifest = {
  midl: "1.0.0", board: "preview",
  classes: [{ id: "square-480", width: 480, height: 480, maxTiles: 4, maxDepth: 3, elements: ["single-value"] }],
  elements: [{ type: "single-value", bindings: ["value"] }],
  sources: ["signalk"],
};
const doc = `midl: 1.0.0
screens:
  - id: dash
    elements: { sog: { type: single-value, name: SOG, bindings: { value: { kind: signalk, path: navigation.speedOverGround } } } }
    layout: { rows: 1, cols: 1, cells: [{ element: sog }] }
`;

test("mounts a canvas and renders without throwing", () => {
  const provider = new MockDataProvider({ "navigation.speedOverGround": { value: 3 } });
  const { container } = render(
    <MidlDashboard text={doc} manifest={manifest} className="square-480" viewport={{ x: 0, y: 0, w: 480, h: 480 }} provider={provider} />,
  );
  expect(container.querySelector("canvas")).toBeTruthy();
  cleanup();
});

test("subscribes to bound paths and unsubscribes on unmount", () => {
  const provider = new MockDataProvider({ "navigation.speedOverGround": { value: 3 } });
  const off = vi.fn();
  const sub = vi.spyOn(provider, "subscribe").mockReturnValue(off);
  const { unmount } = render(
    <MidlDashboard text={doc} manifest={manifest} className="square-480" viewport={{ x: 0, y: 0, w: 480, h: 480 }} provider={provider} />,
  );
  expect(sub).toHaveBeenCalledWith(["navigation.speedOverGround"], expect.any(Function));
  unmount();
  expect(off).toHaveBeenCalled();
});
