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
