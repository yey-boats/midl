// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Tests for the Data tab in MidlEditor visual mode.

import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import type { Manifest } from "@yey-boats/midl";
import type { DataProvider, ResolvedValue } from "@yey-boats/midl-web";
import type { DashboardStoreAdapter, ManifestSource, PathInfo, LivePathSource } from "./adapters";
import { RevisionConflict } from "./adapters";
import { MidlEditor } from "./MidlEditor";

// ── rAF shims ─────────────────────────────────────────────────────────────────
globalThis.requestAnimationFrame ??= ((cb: FrameRequestCallback) =>
  setTimeout(() => cb(0), 0)) as never;
globalThis.cancelAnimationFrame ??= ((id: number) => clearTimeout(id)) as never;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MANIFEST: Manifest = {
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

function makeFakeStore(): DashboardStoreAdapter {
  return {
    capabilities: "full" as const,
    async list() { return []; },
    async get(_id: string) {
      return {
        ref: { id: _id },
        doc: FIXTURE_DOC,
        metadata: { revision: "rev-1", targetClass: "square-480" },
      };
    },
    async save(input) {
      return {
        ref: { id: input.id ?? "new-id" },
        validation: { ok: true, issues: [] },
      };
    },
    async remove() { return { id: "x" }; },
    async clone() { return { ref: { id: "cloned-id" } }; },
  };
}

function makeFakeManifestSource(): ManifestSource {
  return {
    async get(_targetClass: string) {
      return MANIFEST;
    },
  };
}

// ── Live provider stub (DataProvider + LivePathSource) ─────────────────────────

type LiveProvider = DataProvider & LivePathSource;

function makeLiveProvider(initialPaths: PathInfo[] = []): LiveProvider & {
  pushPaths(paths: PathInfo[]): void;
  injectSpy: ReturnType<typeof vi.fn>;
} {
  let currentPaths = [...initialPaths];
  const listeners = new Set<() => void>();
  const injectSpy = vi.fn();

  const provider: LiveProvider & { pushPaths(paths: PathInfo[]): void; injectSpy: typeof injectSpy } = {
    getValue(binding): ResolvedValue {
      if (binding.kind === "signalk") {
        const entry = currentPaths.find((p) => p.path === (binding as { path: string }).path);
        if (entry) {
          return {
            value: entry.value,
            sourceUnit: entry.sourceUnit,
            updatedAt: entry.updatedAt,
            present: true,
            stale: false,
          };
        }
      }
      return { value: undefined, stale: false, present: false };
    },
    subscribe(_paths: string[], cb: () => void) {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    knownPaths: () => [...currentPaths],
    inject: injectSpy,
    onChange: (cb: () => void) => {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    injectSpy,
    pushPaths(paths: PathInfo[]) {
      currentPaths = [...currentPaths, ...paths];
      listeners.forEach((cb) => cb());
    },
  };

  return provider;
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

test("visual mode body shows Elements and Data tab buttons", async () => {
  const store = makeFakeStore();
  const provider = makeLiveProvider();
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

  // Wait for manifest/store to load
  await waitFor(() => {
    expect(getByTestId("tab-elements")).toBeTruthy();
  }, { timeout: 3000 });

  expect(getByTestId("tab-data")).toBeTruthy();
});

test("Elements tab is active by default and shows Palette", async () => {
  const store = makeFakeStore();
  const provider = makeLiveProvider();
  const manifestSource = makeFakeManifestSource();

  const { getByTestId, queryByAttribute } = render(
    <MidlEditor
      store={store}
      provider={provider}
      manifest={manifestSource}
      initialId="dashboard-1"
      targetClass="square-480"
    />,
  );

  await waitFor(() => {
    expect(getByTestId("tab-elements")).toBeTruthy();
  }, { timeout: 3000 });

  // Palette should be visible (contains palette-single-value button)
  await waitFor(() => {
    expect(getByTestId("palette-single-value")).toBeTruthy();
  }, { timeout: 3000 });
});

test("clicking Data tab shows the DataTree component", async () => {
  const store = makeFakeStore();
  const provider = makeLiveProvider([
    { path: "navigation.speedOverGround", value: 3.5, updatedAt: Date.now() },
  ]);
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

  // Wait for tabs to appear
  await waitFor(() => {
    expect(getByTestId("tab-data")).toBeTruthy();
  }, { timeout: 3000 });

  // data-tree not yet visible (Elements tab is active)
  expect(queryByTestId("data-tree")).toBeNull();

  // Click Data tab
  await act(async () => {
    fireEvent.click(getByTestId("tab-data"));
  });

  // DataTree should now be visible
  await waitFor(() => {
    expect(getByTestId("data-tree")).toBeTruthy();
  }, { timeout: 3000 });
});

test("clicking Elements tab after Data tab shows Palette again", async () => {
  const store = makeFakeStore();
  const provider = makeLiveProvider();
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

  await waitFor(() => {
    expect(getByTestId("tab-data")).toBeTruthy();
  }, { timeout: 3000 });

  // Switch to Data tab
  await act(async () => {
    fireEvent.click(getByTestId("tab-data"));
  });

  await waitFor(() => {
    expect(getByTestId("data-tree")).toBeTruthy();
  }, { timeout: 3000 });

  // Switch back to Elements tab
  await act(async () => {
    fireEvent.click(getByTestId("tab-elements"));
  });

  await waitFor(() => {
    expect(getByTestId("palette-single-value")).toBeTruthy();
  }, { timeout: 3000 });

  // data-tree should be gone
  expect(queryByTestId("data-tree")).toBeNull();
});

test("binding a path from DataTree while a cell with element is selected updates the element's value binding", async () => {
  const store = makeFakeStore();
  const provider = makeLiveProvider([
    { path: "navigation.headingTrue", value: 1.57, updatedAt: Date.now() },
  ]);
  const manifestSource = makeFakeManifestSource();

  const onSaved = vi.fn();

  const { getByTestId } = render(
    <MidlEditor
      store={store}
      provider={provider}
      manifest={manifestSource}
      initialId="dashboard-1"
      targetClass="square-480"
      onSaved={onSaved}
    />,
  );

  // Wait for the editor to load the fixture doc (1x1 grid with sog element in cell 0)
  await waitFor(() => {
    expect(getByTestId("tab-data")).toBeTruthy();
  }, { timeout: 3000 });

  // Select cell 0 (click it on the GridCanvas)
  await act(async () => {
    fireEvent.click(getByTestId("cell-0"));
  });

  // Switch to Data tab
  await act(async () => {
    fireEvent.click(getByTestId("tab-data"));
  });

  await waitFor(() => {
    expect(getByTestId("data-tree")).toBeTruthy();
  }, { timeout: 3000 });

  // Click the leaf for navigation.headingTrue
  await act(async () => {
    fireEvent.click(getByTestId("data-leaf-navigation-headingTrue"));
  });

  // Save to capture the model
  await act(async () => {
    fireEvent.click(getByTestId("save-button"));
  });

  await waitFor(() => {
    expect(onSaved).toHaveBeenCalled();
  }, { timeout: 3000 });
});

// ── Part 1 integration: Layout tab in MidlEditor ──────────────────────────────

test("visual mode body shows Layout tab button", async () => {
  const store = makeFakeStore();
  const provider = makeLiveProvider();
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
    expect(getByTestId("tab-layout")).toBeTruthy();
  }, { timeout: 3000 });
});

test("clicking Layout tab shows elements-list with placed elements", async () => {
  const store = makeFakeStore();
  const provider = makeLiveProvider([
    { path: "navigation.speedOverGround", value: 3.5, updatedAt: Date.now() },
  ]);
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

  await waitFor(() => {
    expect(getByTestId("tab-layout")).toBeTruthy();
  }, { timeout: 3000 });

  // Click Layout tab
  await act(async () => {
    fireEvent.click(getByTestId("tab-layout"));
  });

  // elements-list should appear
  await waitFor(() => {
    expect(getByTestId("elements-list")).toBeTruthy();
  }, { timeout: 3000 });
});

test("clicking a row in elements-list selects the cell (inspector shows element)", async () => {
  const store = makeFakeStore();
  const provider = makeLiveProvider();
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
    expect(getByTestId("tab-layout")).toBeTruthy();
  }, { timeout: 3000 });

  // Click Layout tab
  await act(async () => {
    fireEvent.click(getByTestId("tab-layout"));
  });

  await waitFor(() => {
    expect(getByTestId("elements-list")).toBeTruthy();
  }, { timeout: 3000 });

  // The fixture doc has a 1x1 grid with sog in cell 0
  // Click element-row-0
  await act(async () => {
    fireEvent.click(getByTestId("element-row-0"));
  });

  // Inspector should show the element (type-badge becomes visible)
  await waitFor(() => {
    expect(getByTestId("type-badge")).toBeTruthy();
  }, { timeout: 3000 });
});

test("clicking 'Browse data' in Inspector's PathPicker switches left rail to Data tab", async () => {
  const store = makeFakeStore();
  const provider = makeLiveProvider([
    { path: "navigation.speedOverGround", value: 3.5, updatedAt: Date.now() },
  ]);
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

  // Wait for editor to load
  await waitFor(() => {
    expect(getByTestId("tab-elements")).toBeTruthy();
  }, { timeout: 3000 });

  // Select cell 0 (which has the sog element with a path binding)
  await act(async () => {
    fireEvent.click(getByTestId("cell-0"));
  });

  // The Browse data button should now be visible in the inspector's PathPicker
  await waitFor(() => {
    expect(getByTestId("path-picker-browse")).toBeTruthy();
  }, { timeout: 3000 });

  // Click Browse data
  await act(async () => {
    fireEvent.click(getByTestId("path-picker-browse"));
  });

  // The left rail should now show the DataTree (Data tab active)
  await waitFor(() => {
    expect(queryByTestId("data-tree")).toBeTruthy();
  }, { timeout: 3000 });
});
