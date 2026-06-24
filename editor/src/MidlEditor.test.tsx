// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import type { Manifest } from "@yey-boats/midl";
import { MockDataProvider } from "@yey-boats/midl-web";
import type { DashboardStoreAdapter, ManifestSource } from "./adapters";
import { RevisionConflict } from "./adapters";
import { MidlEditor } from "./MidlEditor";

// ── rAF shims ─────────────────────────────────────────────────────────────────
globalThis.requestAnimationFrame ??= ((cb: FrameRequestCallback) =>
  setTimeout(() => cb(0), 0)) as never;
globalThis.cancelAnimationFrame ??= ((id: number) => clearTimeout(id)) as never;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SQUARE_480_MANIFEST: Manifest = {
  midl: "1.0.0",
  board: "esp32-4848s040",
  classes: [
    {
      id: "square-480",
      maxTiles: 4,
      maxDepth: 3,
      elements: ["single-value"],
    },
  ],
  elements: [{ type: "single-value", bindings: ["value"] }],
  sources: ["signalk"],
};

const FIXTURE_DOC = `midl: 1.0.0
screens:
  - id: dash
    meta:
      title: Test Dashboard
    elements:
      sog:
        type: single-value
        name: SOG
        bindings:
          value: { kind: signalk, path: navigation.speedOverGround }
    layout: { rows: 1, cols: 1, cells: [{ element: sog }] }
`;

// ── Fake store ────────────────────────────────────────────────────────────────

function makeFakeStore(opts: {
  failSaveWithConflict?: boolean;
} = {}): DashboardStoreAdapter & {
  savedCalls: Array<{ id?: string; source: string; name: string; targetClass: string; expectedRevision?: string }>;
  conflictOnNext: boolean;
} {
  const savedCalls: typeof store.savedCalls = [];
  let conflictOnNext = opts.failSaveWithConflict ?? false;

  const store = {
    savedCalls,
    conflictOnNext,
    capabilities: "full" as const,
    async list() { return []; },
    async get(_id: string) {
      return {
        ref: { id: _id },
        doc: FIXTURE_DOC,
        metadata: { revision: "rev-1", targetClass: "square-480" },
      };
    },
    async save(input: {
      id?: string; source: string; name: string; targetClass: string; expectedRevision?: string;
    }) {
      savedCalls.push({ ...input });
      if (store.conflictOnNext) {
        store.conflictOnNext = false;
        throw new RevisionConflict();
      }
      return {
        ref: { id: input.id ?? "new-id" },
        validation: { ok: true, issues: [] },
      };
    },
    async remove() { return { id: "x" }; },
    async clone() { return { ref: { id: "cloned-id" } }; },
  };

  return store as ReturnType<typeof makeFakeStore>;
}

function makeFakeManifestSource(): ManifestSource {
  return {
    async get(_targetClass: string) {
      return SQUARE_480_MANIFEST;
    },
  };
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

test("mounts with initialId and shows non-empty sanitized SVG in preview-host", async () => {
  const store = makeFakeStore();
  const provider = new MockDataProvider({ "navigation.speedOverGround": { value: 3 } });
  const manifestSource = makeFakeManifestSource();

  const { getByTestId } = render(
    <MidlEditor
      store={store}
      provider={provider}
      manifest={manifestSource}
      initialId="dashboard-1"
      targetClass="square-480"
    />,
  );

  // Wait for async init (store.get + manifest.get) and RAF preview
  await waitFor(() => {
    const host = getByTestId("preview-host");
    expect(host.innerHTML).toBeTruthy();
    expect(host.innerHTML).toContain("<svg");
  }, { timeout: 3000 });
});

test("mode toggle updates mode-body text but model persists", async () => {
  const store = makeFakeStore();
  const provider = new MockDataProvider({});
  const manifestSource = makeFakeManifestSource();

  const { getByTestId } = render(
    <MidlEditor
      store={store}
      provider={provider}
      manifest={manifestSource}
      initialId="dashboard-1"
    />,
  );

  await waitFor(() => {
    expect(getByTestId("mode-body")).toBeTruthy();
  });

  const modeBody = getByTestId("mode-body");
  const initialText = modeBody.textContent;
  expect(initialText).toContain("visual");

  // Toggle mode
  await act(async () => {
    fireEvent.click(getByTestId("mode-toggle"));
  });

  const afterToggleText = modeBody.textContent;
  expect(afterToggleText).toContain("source");

  // The name input should still be present (model persisted)
  expect(getByTestId("name-input")).toBeTruthy();
});

test("switching class re-renders preview-host", async () => {
  const store = makeFakeStore();
  const provider = new MockDataProvider({ "navigation.speedOverGround": { value: 3 } });
  const manifestSource = makeFakeManifestSource();

  const { getByTestId } = render(
    <MidlEditor
      store={store}
      provider={provider}
      manifest={manifestSource}
      initialId="dashboard-1"
      targetClass="square-480"
    />,
  );

  // Wait for initial SVG render
  await waitFor(() => {
    const host = getByTestId("preview-host");
    expect(host.innerHTML).toContain("<svg");
  }, { timeout: 3000 });

  const initialHtml = getByTestId("preview-host").innerHTML;

  // Switch class to a different one
  await act(async () => {
    const select = getByTestId("class-switch");
    fireEvent.change(select, { target: { value: "landscape-800x480" } });
  });

  // After class change, preview-host should have different or re-rendered content
  await waitFor(() => {
    const host = getByTestId("preview-host");
    // It should still be an SVG (re-rendered with new viewport)
    expect(host.innerHTML).toContain("<svg");
  }, { timeout: 3000 });
});

test("clicking Save calls store.save with serialized source + name", async () => {
  const store = makeFakeStore();
  const provider = new MockDataProvider({});
  const manifestSource = makeFakeManifestSource();
  const onSaved = vi.fn();

  const { getByTestId } = render(
    <MidlEditor
      store={store}
      provider={provider}
      manifest={manifestSource}
      initialId="dashboard-1"
      onSaved={onSaved}
    />,
  );

  await waitFor(() => {
    expect(getByTestId("name-input")).toBeTruthy();
  });

  await act(async () => {
    fireEvent.click(getByTestId("save-button"));
  });

  await waitFor(() => {
    expect(store.savedCalls.length).toBeGreaterThan(0);
  });

  const savedCall = store.savedCalls[0];
  expect(typeof savedCall.source).toBe("string");
  expect(savedCall.source.length).toBeGreaterThan(0);
  expect(typeof savedCall.name).toBe("string");
  expect(typeof savedCall.targetClass).toBe("string");
  expect(onSaved).toHaveBeenCalled();
});

test("second consecutive save sends expectedRevision from the revision refreshed after first save", async () => {
  // I6: after a successful save the component re-fetches the dashboard to get the new
  // revision (the fake store returns "rev-1" for every get). The second save must include
  // expectedRevision so optimistic concurrency is maintained.
  const store = makeFakeStore();
  const provider = new MockDataProvider({});
  const manifestSource = makeFakeManifestSource();

  const { getByTestId } = render(
    <MidlEditor
      store={store}
      provider={provider}
      manifest={manifestSource}
      initialId="dashboard-1"
    />,
  );

  // Wait for init (loads dashboard, sets revisionRef to "rev-1")
  await waitFor(() => {
    expect(getByTestId("save-button")).toBeTruthy();
  });

  // First save
  await act(async () => {
    fireEvent.click(getByTestId("save-button"));
  });

  await waitFor(() => {
    expect(store.savedCalls.length).toBe(1);
  });

  // After the first save the component calls store.get, which returns revision "rev-1".
  // So the second save must carry expectedRevision: "rev-1".

  // Second save
  await act(async () => {
    fireEvent.click(getByTestId("save-button"));
  });

  await waitFor(() => {
    expect(store.savedCalls.length).toBe(2);
  });

  const secondCall = store.savedCalls[1];
  expect(secondCall.expectedRevision).toBe("rev-1");
});

test("save that throws RevisionConflict shows conflict-banner and Overwrite retries", async () => {
  const store = makeFakeStore();
  store.conflictOnNext = true;
  const provider = new MockDataProvider({});
  const manifestSource = makeFakeManifestSource();

  const { getByTestId, queryByTestId } = render(
    <MidlEditor
      store={store}
      provider={provider}
      manifest={manifestSource}
      initialId="dashboard-1"
    />,
  );

  await waitFor(() => {
    expect(getByTestId("save-button")).toBeTruthy();
  });

  // First save — should trigger conflict
  await act(async () => {
    fireEvent.click(getByTestId("save-button"));
  });

  await waitFor(() => {
    expect(getByTestId("conflict-banner")).toBeTruthy();
  });

  // Overwrite button should retry save without expectedRevision
  const prevCallCount = store.savedCalls.length;

  await act(async () => {
    const overwriteBtn = getByTestId("conflict-banner").querySelector("button[data-action='overwrite']");
    expect(overwriteBtn).toBeTruthy();
    fireEvent.click(overwriteBtn!);
  });

  await waitFor(() => {
    expect(store.savedCalls.length).toBeGreaterThan(prevCallCount);
    // Overwrite call should NOT have expectedRevision
    const overwriteCall = store.savedCalls[store.savedCalls.length - 1];
    expect(overwriteCall.expectedRevision).toBeUndefined();
    // conflict banner should be gone
    expect(queryByTestId("conflict-banner")).toBeNull();
  });
});

// ── New: status-bar + top-push ─────────────────────────────────────────────

test("status-bar shows valid state when model validates", async () => {
  const store = makeFakeStore();
  const provider = new MockDataProvider({});
  const manifestSource = makeFakeManifestSource();

  const { getByTestId } = render(
    <MidlEditor
      store={store}
      provider={provider}
      manifest={manifestSource}
      initialId="dashboard-1"
      targetClass="square-480"
    />,
  );

  await waitFor(() => {
    const statusBar = getByTestId("status-bar");
    expect(statusBar).toBeTruthy();
    // After loading a valid model, status bar should contain "valid" text
    expect(statusBar.textContent?.toLowerCase()).toMatch(/valid/i);
  }, { timeout: 3000 });
});

test("top-push button triggers store.save", async () => {
  const store = makeFakeStore();
  const provider = new MockDataProvider({});
  const manifestSource = makeFakeManifestSource();

  const { getByTestId } = render(
    <MidlEditor
      store={store}
      provider={provider}
      manifest={manifestSource}
      initialId="dashboard-1"
    />,
  );

  await waitFor(() => {
    expect(getByTestId("top-push")).toBeTruthy();
  });

  const prevCount = store.savedCalls.length;

  await act(async () => {
    fireEvent.click(getByTestId("top-push"));
  });

  await waitFor(() => {
    expect(store.savedCalls.length).toBeGreaterThan(prevCount);
  });
});
