// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { Manifest } from "@yey-boats/midl";
import type { DataProvider, ResolvedValue } from "@yey-boats/midl-web";
import { usePreview } from "./usePreview";
import type { EditorModel } from "./model";

// ── rAF shims ─────────────────────────────────────────────────────────────────
globalThis.requestAnimationFrame ??= ((cb: FrameRequestCallback) =>
  setTimeout(() => cb(0), 0)) as never;
globalThis.cancelAnimationFrame ??= ((id: number) => clearTimeout(id)) as never;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MANIFEST: Manifest = {
  midl: "1.0.0",
  board: "esp32-4848s040",
  classes: [{ id: "square-480", maxTiles: 4, maxDepth: 3, elements: ["single-value"] }],
  elements: [{ type: "single-value", bindings: ["value"] }],
  sources: ["signalk"],
};

const MODEL_WITH_BINDING: EditorModel = {
  midl: "1.0.0",
  screenId: "dash",
  title: "Test",
  elements: {
    sog: {
      id: "sog",
      type: "single-value",
      bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } },
    },
  },
  layout: { rows: 1, cols: 1, cells: [{ element: "sog" }] },
  variants: [],
};

// ── Fake provider factory ──────────────────────────────────────────────────────

function makeFakeProvider(initialValue = 0) {
  let value = initialValue;
  const subscribers: Map<number, { paths: Set<string>; cb: () => void }> = new Map();
  const unsubMocks: ReturnType<typeof vi.fn>[] = [];
  let subIdCounter = 0;

  const provider: DataProvider & { onChange: (cb: () => void) => () => void } = {
    now: () => Date.now(),
    getValue: (binding): ResolvedValue => {
      if (binding.kind !== "signalk") return { value: undefined, stale: false, present: false };
      return { value, stale: false, present: true, updatedAt: Date.now() };
    },
    subscribe: vi.fn((paths: string[], cb: () => void) => {
      const id = subIdCounter++;
      subscribers.set(id, { paths: new Set(paths), cb });
      const unsub = vi.fn(() => {
        subscribers.delete(id);
      });
      unsubMocks.push(unsub);
      return unsub;
    }),
    onChange: vi.fn((cb: () => void) => {
      // For simplicity, not simulating onChange separately in these tests.
      return vi.fn();
    }),
  };

  function tick(newValue: number) {
    value = newValue;
    for (const { cb } of subscribers.values()) {
      cb();
    }
  }

  return { provider, tick, unsubMocks };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  const noop2d = new Proxy({}, { get: () => () => {}, set: () => true }) as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(noop2d as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("usePreview — live data subscription", () => {
  it("re-renders SVG when provider tick fires for a bound path (no model change)", async () => {
    const { provider, tick } = makeFakeProvider(4.5);
    const opts = { theme: "night", className: "square-480" };

    const { result } = renderHook(() =>
      usePreview(MODEL_WITH_BINDING, provider, MANIFEST, opts)
    );

    // Wait for initial render
    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    const svgBefore = result.current.svg;
    expect(svgBefore).toContain("<svg");

    // Tick with a new value — this should trigger re-render WITHOUT a model change
    await act(async () => {
      tick(99.9);
      await new Promise(r => setTimeout(r, 50));
    });

    const svgAfter = result.current.svg;
    // The SVG should have changed because renderDashboardSvg is called with the new value
    expect(svgAfter).toContain("<svg");
    expect(svgAfter).not.toBe(svgBefore);  // re-render produced a new string after tick
    // provider.subscribe was called with the bound path
    expect(provider.subscribe).toHaveBeenCalledWith(
      expect.arrayContaining(["navigation.speedOverGround"]),
      expect.any(Function),
    );
  });

  it("calls unsubscribe when component unmounts", async () => {
    const { provider, unsubMocks } = makeFakeProvider(4.5);
    const opts = { theme: "night", className: "square-480" };

    const { unmount } = renderHook(() =>
      usePreview(MODEL_WITH_BINDING, provider, MANIFEST, opts)
    );

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    expect(unsubMocks.length).toBeGreaterThan(0);
    const firstUnsub = unsubMocks[0];
    expect(firstUnsub).not.toHaveBeenCalled();

    unmount();

    expect(firstUnsub).toHaveBeenCalled();
  });

  it("re-subscribes with new bound paths when model changes", async () => {
    const { provider } = makeFakeProvider(4.5);
    const opts = { theme: "night", className: "square-480" };

    let currentModel = MODEL_WITH_BINDING;
    const { rerender } = renderHook(() =>
      usePreview(currentModel, provider, MANIFEST, opts)
    );

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    const initialCallCount = (provider.subscribe as ReturnType<typeof vi.fn>).mock.calls.length;

    // Change model to a different binding
    currentModel = {
      ...MODEL_WITH_BINDING,
      elements: {
        sog: {
          ...MODEL_WITH_BINDING.elements["sog"]!,
          bindings: { value: { kind: "signalk", path: "environment.wind.speedApparent" } },
        },
      },
    };

    rerender();

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    // subscribe should have been called again (re-subscribed with new path)
    const newCallCount = (provider.subscribe as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(newCallCount).toBeGreaterThan(initialCallCount);

    // The latest subscribe call should include the new path
    const lastCall = (provider.subscribe as ReturnType<typeof vi.fn>).mock.calls[newCallCount - 1];
    expect(lastCall[0]).toContain("environment.wind.speedApparent");
  });
});
