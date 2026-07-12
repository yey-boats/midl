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
import type { MidlEditorHandle } from "./MidlEditor";
import { parseMidl } from "./midl-io";
import { EditorError } from "./model";

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

// ── MIDL-7: revision tracking via save() return value ──────────────────────────

test("MIDL-7: save() returning a revision is used directly without a follow-up get()", async () => {
  // A store that returns the committed revision from save() and whose get()
  // throws if called after init — proving the success path does not depend on get().
  const savedCalls: Array<{ expectedRevision?: string }> = [];
  let initDone = false;
  let getRevision = "rev-1";
  const store: DashboardStoreAdapter = {
    capabilities: "full",
    async list() { return []; },
    async get(id: string) {
      if (initDone) throw new Error("get() must not be called on the save success path");
      return { ref: { id }, doc: FIXTURE_DOC, metadata: { revision: getRevision, targetClass: "square-480" } };
    },
    async save(input) {
      savedCalls.push({ expectedRevision: input.expectedRevision });
      // Simulate the server incrementing the revision on each save.
      getRevision = getRevision === "rev-1" ? "rev-2" : "rev-3";
      return { ref: { id: input.id ?? "new-id" }, validation: { ok: true, issues: [] }, revision: getRevision };
    },
    async remove() { return { id: "x" }; },
    async clone() { return { ref: { id: "cloned-id" } }; },
  };

  const { getByTestId, queryByTestId } = render(
    <MidlEditor store={store} provider={new MockDataProvider({})} manifest={makeFakeManifestSource()} initialId="dashboard-1" />,
  );
  await waitFor(() => { expect(getByTestId("save-button")).toBeTruthy(); });
  initDone = true; // any get() from here on is a bug

  // First save → returns rev-2; second save must carry expectedRevision "rev-2".
  await act(async () => { fireEvent.click(getByTestId("save-button")); });
  await waitFor(() => { expect(savedCalls.length).toBe(1); });
  await act(async () => { fireEvent.click(getByTestId("save-button")); });
  await waitFor(() => { expect(savedCalls.length).toBe(2); });

  expect(savedCalls[1].expectedRevision).toBe("rev-2");
  // No warning banner on the happy path.
  expect(queryByTestId("save-warning-banner")).toBeNull();
});

test("MIDL-7: save-then-get-fails-then-save does not spuriously conflict (soft warning shown)", async () => {
  // Legacy adapter: save() returns no revision, so the editor falls back to get().
  // Injecting a get() failure after save must NOT crash and must NOT drop the
  // known revision to a value that spuriously conflicts on the next save.
  const savedCalls: Array<{ expectedRevision?: string }> = [];
  let getShouldFail = false;
  const store: DashboardStoreAdapter = {
    capabilities: "full",
    async list() { return []; },
    async get(id: string) {
      if (getShouldFail) throw new Error("simulated get() failure");
      return { ref: { id }, doc: FIXTURE_DOC, metadata: { revision: "rev-1", targetClass: "square-480" } };
    },
    async save(input) {
      savedCalls.push({ expectedRevision: input.expectedRevision });
      // No revision in the result → forces the get() fallback.
      return { ref: { id: input.id ?? "new-id" }, validation: { ok: true, issues: [] } };
    },
    async remove() { return { id: "x" }; },
    async clone() { return { ref: { id: "cloned-id" } }; },
  };

  const { getByTestId, queryByTestId } = render(
    <MidlEditor store={store} provider={new MockDataProvider({})} manifest={makeFakeManifestSource()} initialId="dashboard-1" />,
  );
  await waitFor(() => { expect(getByTestId("save-button")).toBeTruthy(); });

  // Make the post-save get() fail, then save.
  getShouldFail = true;
  await act(async () => { fireEvent.click(getByTestId("save-button")); });
  await waitFor(() => { expect(savedCalls.length).toBe(1); });

  // Soft warning surfaced; no error banner or crash.
  await waitFor(() => { expect(getByTestId("save-warning-banner")).toBeTruthy(); });
  expect(queryByTestId("save-error-banner")).toBeNull();

  // Second save still works and reuses the last-known revision ("rev-1" from init)
  // rather than sending undefined and forcing an overwrite/conflict.
  await act(async () => { fireEvent.click(getByTestId("save-button")); });
  await waitFor(() => { expect(savedCalls.length).toBe(2); });
  expect(savedCalls[1].expectedRevision).toBe("rev-1");
  expect(queryByTestId("conflict-banner")).toBeNull();
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

test("save-state label shows 'saved' after load and 'unsaved changes' after an edit", async () => {
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

  // After loading a clean model, the label is "saved" (no fake "autosaved").
  await waitFor(() => {
    expect(getByTestId("save-state").textContent).toMatch(/saved/i);
    expect(getByTestId("save-state").textContent).not.toMatch(/autosaved/i);
  }, { timeout: 3000 });

  // Edit the name → model changes → dirty → "unsaved changes".
  await act(async () => {
    fireEvent.change(getByTestId("name-input"), { target: { value: "Renamed SOG" } });
  });
  await waitFor(() => {
    expect(getByTestId("save-state").textContent).toMatch(/unsaved/i);
  });

  // Push → save → baseline reset → back to "saved".
  await act(async () => {
    fireEvent.click(getByTestId("save-button"));
  });
  await waitFor(() => {
    expect(getByTestId("save-state").textContent).toMatch(/^saved$/i);
  });
});

test("#3 header rename persists into the serialized document title (round-trips to meta.title)", async () => {
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
    expect(getByTestId("name-input")).toBeTruthy();
  });

  // Rename via the header input
  await act(async () => {
    fireEvent.change(getByTestId("name-input"), { target: { value: "My New Title" } });
  });

  // Save and assert the serialized source carries the new title (not the old one).
  await act(async () => {
    fireEvent.click(getByTestId("save-button"));
  });

  await waitFor(() => {
    expect(store.savedCalls.length).toBeGreaterThan(0);
  });
  const saved = store.savedCalls[store.savedCalls.length - 1];
  expect(saved.source).toContain("My New Title");
  expect(saved.source).not.toContain("Test Dashboard");
  // The name field still goes along for the store API.
  expect(saved.name).toBe("My New Title");
});

test("#2 selecting an unsupported class shows an honest 'preview unavailable' status, not '✓ Valid'", async () => {
  const store = makeFakeStore();
  const provider = new MockDataProvider({});
  const manifestSource = makeFakeManifestSource();

  const { getByTestId, queryByTestId } = render(
    <MidlEditor
      store={store}
      provider={provider}
      manifest={manifestSource}
      initialId="dashboard-1"
      targetClass="square-480"
    />,
  );

  // Supported class → "Valid".
  await waitFor(() => {
    expect(getByTestId("status-bar").textContent?.toLowerCase()).toMatch(/valid/i);
  }, { timeout: 3000 });

  // Switch to a class NOT in the manifest (manifest only declares square-480).
  await act(async () => {
    fireEvent.change(getByTestId("class-switch"), { target: { value: "landscape-800x480" } });
  });

  // Status must no longer claim validity — it must say preview is unavailable.
  await waitFor(() => {
    expect(queryByTestId("status-unsupported")).toBeTruthy();
    expect(getByTestId("status-bar").textContent || "").not.toMatch(/✓ Valid/);
    expect(getByTestId("status-bar").textContent?.toLowerCase()).toMatch(/preview unavailable/i);
  }, { timeout: 3000 });
});

test("#5 shrinking a grid with placed widgets confirms, keeps orphans, and surfaces them in the unplaced tray", async () => {
  const store = makeFakeStore();
  const provider = new MockDataProvider({});
  const manifestSource = makeFakeManifestSource();
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

  const { getByTestId, queryByTestId } = render(
    <MidlEditor
      store={store}
      provider={provider}
      manifest={manifestSource}
      initialId="dashboard-1"
      targetClass="square-480"
    />,
  );

  await waitFor(() => {
    expect(getByTestId("tab-layout")).toBeTruthy();
  }, { timeout: 3000 });

  // Grow to 2x2 so we have room for a second widget (fixture starts 1x1 with 1 elem).
  await act(async () => { fireEvent.click(getByTestId("tab-layout")); });
  await act(async () => { fireEvent.click(getByTestId("layout-preset-2x2")); });

  // Add a second element via the palette into an empty cell.
  await act(async () => { fireEvent.click(getByTestId("tab-elements")); });
  await waitFor(() => { expect(getByTestId("palette-single-value")).toBeTruthy(); }, { timeout: 3000 });
  // Select an empty cell first so the new element lands somewhere placed.
  await act(async () => { fireEvent.click(getByTestId("cell-1")); });
  await act(async () => { fireEvent.click(getByTestId("palette-single-value")); });

  // Shrink back to 1x1 — this orphans one of the two placed widgets.
  await act(async () => { fireEvent.click(getByTestId("tab-layout")); });
  await act(async () => { fireEvent.click(getByTestId("layout-preset-1x1")); });

  // The confirm guard fired (naming the unplaced count).
  expect(confirmSpy).toHaveBeenCalled();

  // The orphan is preserved and visible in the unplaced tray.
  await waitFor(() => {
    expect(getByTestId("unplaced-tray")).toBeTruthy();
  }, { timeout: 3000 });

  // The tray chip can re-place the orphan once a cell frees up (no silent loss).
  expect(queryByTestId("unplaced-tray")).toBeTruthy();

  confirmSpy.mockRestore();
});

test("#5 cancelling the shrink confirm leaves the grid unchanged", async () => {
  const store = makeFakeStore();
  const provider = new MockDataProvider({});
  const manifestSource = makeFakeManifestSource();
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

  const { getByTestId } = render(
    <MidlEditor
      store={store}
      provider={provider}
      manifest={manifestSource}
      initialId="dashboard-1"
      targetClass="square-480"
    />,
  );

  await waitFor(() => { expect(getByTestId("tab-layout")).toBeTruthy(); }, { timeout: 3000 });
  await act(async () => { fireEvent.click(getByTestId("tab-layout")); });
  // Grow to 2x1 (2 cells) — fixture has 1 placed element, still fits, no confirm.
  await act(async () => { fireEvent.click(getByTestId("layout-preset-2x1")); });
  await waitFor(() => { expect(getByTestId("layout-rows").textContent).toBe("2"); });

  // Add a second element so both cells are placed.
  await act(async () => { fireEvent.click(getByTestId("tab-elements")); });
  await waitFor(() => { expect(getByTestId("palette-single-value")).toBeTruthy(); }, { timeout: 3000 });
  await act(async () => { fireEvent.click(getByTestId("cell-1")); });
  await act(async () => { fireEvent.click(getByTestId("palette-single-value")); });

  await act(async () => { fireEvent.click(getByTestId("tab-layout")); });
  // Attempt to shrink to 1x1 — confirm returns false → must NOT change the grid.
  await act(async () => { fireEvent.click(getByTestId("layout-preset-1x1")); });

  expect(confirmSpy).toHaveBeenCalled();
  expect(getByTestId("layout-rows").textContent).toBe("2");
  expect(getByTestId("layout-cols").textContent).toBe("1");

  confirmSpy.mockRestore();
});

test("F1: a preset/flow layout shows the source-only layout notice", async () => {
  const FLOW_DOC = `midl: 1.0.0
screens:
  - id: dash
    elements:
      sog:
        type: single-value
        bindings:
          value: { kind: signalk, path: navigation.speedOverGround }
      hdg:
        type: single-value
        bindings:
          value: { kind: signalk, path: navigation.headingTrue }
    layout: { flow: row, children: [{ element: sog }, { element: hdg }] }
`;
  const store = makeFakeStore();
  store.get = async (_id: string) => ({
    ref: { id: _id }, doc: FLOW_DOC, metadata: { revision: "rev-1", targetClass: "square-480" },
  });
  const provider = new MockDataProvider({});
  const manifestSource = makeFakeManifestSource();

  const { getByTestId } = render(
    <MidlEditor store={store} provider={provider} manifest={manifestSource} initialId="dashboard-1" targetClass="square-480" />,
  );

  await waitFor(() => {
    const notice = getByTestId("layout-notice");
    expect(notice.textContent).toMatch(/preset\/flow layout/i);
    expect(getByTestId("layout-notice-source")).toBeTruthy();
  }, { timeout: 3000 });
});

// ── Zoom controls ─────────────────────────────────────────────────────────────

test("zoom-in increases scale beyond fit, zoom-fit resets to Fit", async () => {
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
    expect(getByTestId("zoom-level")).toBeTruthy();
    expect(getByTestId("zoom-fit")).toBeTruthy();
    expect(getByTestId("zoom-in")).toBeTruthy();
    expect(getByTestId("zoom-out")).toBeTruthy();
  });

  // Initial state is "Fit"
  expect(getByTestId("zoom-level").textContent).toBe("Fit");

  // Click zoom-in → should show a percentage
  await act(async () => {
    fireEvent.click(getByTestId("zoom-in"));
  });

  // After zoom-in, zoom-level should not say "Fit" anymore
  const afterZoomIn = getByTestId("zoom-level").textContent;
  expect(afterZoomIn).not.toBe("Fit");

  // Click zoom-fit → should reset to "Fit"
  await act(async () => {
    fireEvent.click(getByTestId("zoom-fit"));
  });

  expect(getByTestId("zoom-level").textContent).toBe("Fit");
});

test("zoom-out clamps at minimum (10%)", async () => {
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
    expect(getByTestId("zoom-out")).toBeTruthy();
  });

  // Click zoom-out many times to hit the clamp
  for (let i = 0; i < 30; i++) {
    await act(async () => {
      fireEvent.click(getByTestId("zoom-out"));
    });
  }

  const levelText = getByTestId("zoom-level").textContent;
  // Should show 10% (clamped)
  expect(levelText).toBe("10%");
});

// ── Mobile sheet ──────────────────────────────────────────────────────────────

test("mobile-tabbar renders and clicking a tab shows mobile-sheet", async () => {
  const store = makeFakeStore();
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
    // mobile-tabbar renders in DOM (hidden via CSS on desktop, but DOM-present)
    expect(getByTestId("mobile-tabbar")).toBeTruthy();
  });

  // Initially no sheet open
  expect(queryByTestId("mobile-sheet")).toBeNull();

  // Click the Elements tab button (first button in the tabbar)
  const tabBar = getByTestId("mobile-tabbar");
  const firstTab = tabBar.querySelector("button");
  expect(firstTab).toBeTruthy();

  await act(async () => {
    fireEvent.click(firstTab!);
  });

  // Sheet should appear
  await waitFor(() => {
    expect(getByTestId("mobile-sheet")).toBeTruthy();
  });

  // Close the sheet
  const sheet = getByTestId("mobile-sheet");
  const closeBtn = sheet.querySelector(".sheet-close");
  expect(closeBtn).toBeTruthy();

  await act(async () => {
    fireEvent.click(closeBtn!);
  });

  // Sheet should be gone
  await waitFor(() => {
    expect(queryByTestId("mobile-sheet")).toBeNull();
  });
});

test("topbar-overflow button renders in DOM", async () => {
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
    expect(getByTestId("topbar-overflow")).toBeTruthy();
  });
});

// ── MidlEditorHandle (imperative ref API for the editor-chat surface) ─────────

const PROPOSAL_DOC = `midl: 1.0.0
screens:
  - id: dash
    meta:
      title: Agent Proposal
    elements:
      sog:
        type: single-value
        name: SOG
        bindings:
          value: { kind: signalk, path: navigation.speedOverGround }
      hdg:
        type: single-value
        name: HDG
        bindings:
          value: { kind: signalk, path: navigation.headingTrue }
    layout: { rows: 2, cols: 1, cells: [{ element: sog }, { element: hdg }] }
`;

// parseMidl requires exactly 1 screen (midl-io.ts:169-175) — this doc throws EditorError.
const TWO_SCREEN_DOC = `midl: 1.0.0
screens:
  - id: a
    elements: {}
    layout: { rows: 1, cols: 1, cells: [{}] }
  - id: b
    elements: {}
    layout: { rows: 1, cols: 1, cells: [{}] }
`;

test("handle.getDoc serializes the current model (yaml + json) and getModel round-trips", async () => {
  const ref = React.createRef<MidlEditorHandle>();
  const { getByTestId } = render(
    <MidlEditor
      ref={ref}
      store={makeFakeStore()}
      provider={new MockDataProvider({})}
      manifest={makeFakeManifestSource()}
      initialId="dashboard-1"
      targetClass="square-480"
    />,
  );
  // Wait for async init: the fixture doc is loaded and the name mirror is set.
  await waitFor(() => {
    expect((getByTestId("name-input") as HTMLInputElement).value).toBe("Test Dashboard");
  }, { timeout: 3000 });

  expect(ref.current).toBeTruthy();
  const yamlDoc = ref.current!.getDoc();
  expect(yamlDoc).toContain("Test Dashboard");
  // Round-trip: the serialized doc parses back to the same title.
  expect(parseMidl(yamlDoc).title).toBe("Test Dashboard");
  // Default format equals explicit "yaml".
  expect(ref.current!.getDoc("yaml")).toBe(yamlDoc);
  // JSON format is valid canonical JSON.
  const jsonDoc = ref.current!.getDoc("json");
  expect(JSON.parse(jsonDoc).midl).toBe("1.0.0");
  // getModel exposes the live model snapshot.
  expect(ref.current!.getModel().title).toBe("Test Dashboard");
  expect(Object.keys(ref.current!.getModel().elements)).toContain("sog");
});

test("handle.setDoc replaces the doc, syncs the name mirror, and marks the editor dirty", async () => {
  const ref = React.createRef<MidlEditorHandle>();
  const { getByTestId } = render(
    <MidlEditor
      ref={ref}
      store={makeFakeStore()}
      provider={new MockDataProvider({})}
      manifest={makeFakeManifestSource()}
      initialId="dashboard-1"
      targetClass="square-480"
    />,
  );
  // Clean baseline after load.
  await waitFor(() => {
    expect(getByTestId("save-state").textContent).toMatch(/^saved$/i);
  }, { timeout: 3000 });

  await act(async () => {
    ref.current!.setDoc(PROPOSAL_DOC);
  });

  // Name mirror synced from parsed.title; model replaced.
  expect((getByTestId("name-input") as HTMLInputElement).value).toBe("Agent Proposal");
  expect(ref.current!.getModel().title).toBe("Agent Proposal");
  expect(Object.keys(ref.current!.getModel().elements).sort()).toEqual(["hdg", "sog"]);
  // savedSourceRef untouched → the dirty effect flags unsaved changes.
  await waitFor(() => {
    expect(getByTestId("save-state").textContent).toMatch(/unsaved/i);
  });
});

test("handle.setDoc throws EditorError on invalid source and leaves editor state intact", async () => {
  const ref = React.createRef<MidlEditorHandle>();
  const { getByTestId } = render(
    <MidlEditor
      ref={ref}
      store={makeFakeStore()}
      provider={new MockDataProvider({})}
      manifest={makeFakeManifestSource()}
      initialId="dashboard-1"
      targetClass="square-480"
    />,
  );
  await waitFor(() => {
    expect((getByTestId("name-input") as HTMLInputElement).value).toBe("Test Dashboard");
  }, { timeout: 3000 });

  const before = ref.current!.getDoc();
  // No silent fallback (unlike the init effect): the parse error propagates.
  expect(() => ref.current!.setDoc(TWO_SCREEN_DOC)).toThrow(EditorError);
  // State untouched by the failed setDoc.
  expect((getByTestId("name-input") as HTMLInputElement).value).toBe("Test Dashboard");
  expect(ref.current!.getDoc()).toBe(before);
});

test("save after handle.setDoc persists the new body through the normal save path", async () => {
  const ref = React.createRef<MidlEditorHandle>();
  const store = makeFakeStore();
  const { getByTestId } = render(
    <MidlEditor
      ref={ref}
      store={store}
      provider={new MockDataProvider({})}
      manifest={makeFakeManifestSource()}
      initialId="dashboard-1"
      targetClass="square-480"
    />,
  );
  await waitFor(() => {
    expect((getByTestId("name-input") as HTMLInputElement).value).toBe("Test Dashboard");
  }, { timeout: 3000 });

  await act(async () => {
    ref.current!.setDoc(PROPOSAL_DOC);
  });
  await act(async () => {
    fireEvent.click(getByTestId("save-button"));
  });
  await waitFor(() => {
    expect(store.savedCalls.length).toBeGreaterThan(0);
  });

  const saved = store.savedCalls[store.savedCalls.length - 1];
  expect(saved.source).toContain("Agent Proposal");
  expect(saved.source).toContain("hdg");
  expect(saved.name).toBe("Agent Proposal");
  // Same dashboard identity + optimistic concurrency preserved:
  // idRef/revisionRef were NOT touched by setDoc.
  expect(saved.id).toBe("dashboard-1");
  expect(saved.expectedRevision).toBe("rev-1");
});

test("handle.isDirty reflects setDoc and clears after a successful save", async () => {
  const ref = React.createRef<MidlEditorHandle>();
  const store = makeFakeStore();
  const { getByTestId } = render(
    <MidlEditor
      ref={ref}
      store={store}
      provider={new MockDataProvider({})}
      manifest={makeFakeManifestSource()}
      initialId="dashboard-1"
      targetClass="square-480"
    />,
  );
  await waitFor(() => {
    expect(getByTestId("save-state").textContent).toMatch(/^saved$/i);
  }, { timeout: 3000 });

  // Clean baseline after load: not dirty.
  expect(ref.current!.isDirty()).toBe(false);

  await act(async () => {
    ref.current!.setDoc(PROPOSAL_DOC);
  });

  // setDoc leaves savedSourceRef untouched -> the dirty effect flags it, and
  // isDirty() reflects that live state (not a snapshot from before the edit).
  await waitFor(() => {
    expect(ref.current!.isDirty()).toBe(true);
  });

  await act(async () => {
    fireEvent.click(getByTestId("save-button"));
  });
  await waitFor(() => {
    expect(store.savedCalls.length).toBeGreaterThan(0);
  });

  // A successful save re-baselines savedSourceRef -> isDirty() goes false again.
  await waitFor(() => {
    expect(ref.current!.isDirty()).toBe(false);
  });
});

// ── validateModel receives the live className (WS1-T2) ───────────────────────

test("status bar validates against the SELECTED class, not manifest.classes[0]", async () => {
  // classes[0] is RESTRICTED (no single-value); the second class supports it.
  // FIXTURE_DOC uses a single-value element, so it is only valid for the
  // second class — the status bar must agree with the class it names.
  const TWO_CLASS_MANIFEST: Manifest = {
    ...SQUARE_480_MANIFEST,
    classes: [
      { id: "square-480", maxTiles: 4, maxDepth: 3, elements: ["text"] },
      { id: "landscape-800x480", maxTiles: 6, maxDepth: 3, elements: ["single-value"] },
    ],
    elements: [
      { type: "text", bindings: ["value"] },
      { type: "single-value", bindings: ["value"] },
    ],
  };
  const store = makeFakeStore();
  const provider = new MockDataProvider({});
  const manifestSource: ManifestSource = {
    async get(_targetClass: string) { return TWO_CLASS_MANIFEST; },
  };

  const { getByTestId } = render(
    <MidlEditor
      store={store}
      provider={provider}
      manifest={manifestSource}
      initialId="dashboard-1"
      targetClass="landscape-800x480"
    />,
  );

  // The model is valid FOR THE SELECTED CLASS → "✓ Valid for landscape-800x480".
  await waitFor(() => {
    expect(getByTestId("status-bar").textContent).toContain("✓ Valid for landscape-800x480");
  }, { timeout: 3000 });

  // Switching to the restricted first class must flip the status to errors.
  await act(async () => {
    fireEvent.change(getByTestId("class-switch"), { target: { value: "square-480" } });
  });
  await waitFor(() => {
    const text = getByTestId("status-bar").textContent || "";
    expect(text).not.toContain("✓ Valid");
    expect(text).toMatch(/error/i);
  }, { timeout: 3000 });
});
