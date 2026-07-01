// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import React from "react";
import type { PathInfo } from "../adapters";
import { DataTree } from "./DataTree";

afterEach(() => cleanup());

// ── Provider stub ──────────────────────────────────────────────────────────────

function makeProviderStub(paths: PathInfo[] = []) {
  const listeners = new Set<() => void>();
  let currentPaths = [...paths];

  return {
    knownPaths: () => [...currentPaths],
    inject: vi.fn((p: string, v: unknown, u?: string) => {
      currentPaths.push({ path: p, value: v, sourceUnit: u, updatedAt: Date.now(), injected: true });
      listeners.forEach((cb) => cb());
    }),
    onChange: (cb: () => void) => {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    /** Test helper: simulate new paths arriving */
    pushPaths(newPaths: PathInfo[]) {
      currentPaths = [...currentPaths, ...newPaths];
      listeners.forEach((cb) => cb());
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test("renders data-tree root element", () => {
  const provider = makeProviderStub();
  const { getByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );
  expect(getByTestId("data-tree")).toBeTruthy();
});

test("renders leaves for known paths grouped by first segment", () => {
  const provider = makeProviderStub([
    { path: "navigation.speedOverGround", value: 3.5, sourceUnit: "m/s", updatedAt: Date.now() },
    { path: "navigation.headingTrue", value: 1.57, updatedAt: Date.now() },
    { path: "environment.wind.speedApparent", value: 6.2, updatedAt: Date.now() },
  ]);

  const { getByText, getByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );

  // Group headers
  expect(getByText(/navigation/i)).toBeTruthy();
  expect(getByText(/environment/i)).toBeTruthy();

  // data-tree rendered
  expect(getByTestId("data-tree")).toBeTruthy();
});

test("shows live value in a leaf row", () => {
  const provider = makeProviderStub([
    { path: "navigation.speedOverGround", value: 3.5, sourceUnit: "m/s", updatedAt: Date.now() },
  ]);

  const { getByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );

  // Should have a leaf element for the path
  const leaf = getByTestId("data-leaf-navigation-speedOverGround");
  expect(leaf.textContent).toContain("3.5");
});

test("search input filters leaves by path substring", () => {
  const provider = makeProviderStub([
    { path: "navigation.speedOverGround", value: 3.5, updatedAt: Date.now() },
    { path: "navigation.headingTrue", value: 1.57, updatedAt: Date.now() },
    { path: "environment.wind.speedApparent", value: 6.2, updatedAt: Date.now() },
  ]);

  const { getByTestId, queryByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );

  const search = getByTestId("data-search");
  fireEvent.change(search, { target: { value: "heading" } });

  // Only heading should be visible
  expect(queryByTestId("data-leaf-navigation-headingTrue")).toBeTruthy();
  // speedOverGround should be hidden
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeNull();
  // environment leaf should be hidden
  expect(queryByTestId("data-leaf-environment-wind-speedApparent")).toBeNull();
});

test("clicking a leaf calls onBindPath with the full path", () => {
  const provider = makeProviderStub([
    { path: "navigation.speedOverGround", value: 3.5, updatedAt: Date.now() },
  ]);
  const onBindPath = vi.fn();

  const { getByTestId } = render(
    <DataTree provider={provider} selectedElementId="some-element" onBindPath={onBindPath} />,
  );

  const leaf = getByTestId("data-leaf-navigation-speedOverGround");
  fireEvent.click(leaf);

  expect(onBindPath).toHaveBeenCalledOnce();
  expect(onBindPath).toHaveBeenCalledWith("navigation.speedOverGround");
});

test("shows hint when no element is selected", () => {
  const provider = makeProviderStub([
    { path: "navigation.speedOverGround", value: 3.5, updatedAt: Date.now() },
  ]);

  const { getByText } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );

  expect(getByText(/select a tile first/i)).toBeTruthy();
});

test("inject form toggle shows the inject form", () => {
  const provider = makeProviderStub();

  const { getByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );

  const toggle = getByTestId("data-inject-toggle");
  fireEvent.click(toggle);

  // After clicking, the submit button should be visible
  expect(getByTestId("data-inject-submit")).toBeTruthy();
});

test("inject form calls provider.inject on submit", () => {
  const provider = makeProviderStub();

  const { getByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );

  // Open inject form
  fireEvent.click(getByTestId("data-inject-toggle"));

  // Fill path and value fields
  const pathInput = getByTestId("data-inject-path");
  const valueInput = getByTestId("data-inject-value");
  fireEvent.change(pathInput, { target: { value: "my.custom.path" } });
  fireEvent.change(valueInput, { target: { value: "99" } });

  // Submit
  fireEvent.click(getByTestId("data-inject-submit"));

  expect(provider.inject).toHaveBeenCalledWith("my.custom.path", "99", undefined);
});

test("injected paths are displayed distinctly (injected flag on leaf)", () => {
  const provider = makeProviderStub([
    { path: "navigation.speedOverGround", value: 3.5, updatedAt: Date.now(), injected: true },
  ]);

  const { getByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );

  const leaf = getByTestId("data-leaf-navigation-speedOverGround");
  // injected leaves should have a data-injected attribute or class
  expect(leaf.getAttribute("data-injected")).toBe("true");
});

test("tree re-renders when provider.onChange fires (new live-only path appears)", async () => {
  const provider = makeProviderStub([]);

  const { queryByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );

  // This custom path is NOT in the catalog — so no leaf yet
  expect(queryByTestId("data-leaf-custom-live-only-sensor")).toBeNull();

  // Simulate new delta arriving
  await act(async () => {
    provider.pushPaths([
      { path: "custom.live.only.sensor", value: 5.0, updatedAt: Date.now() },
    ]);
  });

  // Leaf should now be rendered (appended as live-only)
  expect(queryByTestId("data-leaf-custom-live-only-sensor")).toBeTruthy();
});

test("search clears filter and shows all leaves again after clearing", () => {
  const provider = makeProviderStub([]);
  // SOG and wind are in the catalog — visible without live data

  const { getByTestId, queryByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );

  const search = getByTestId("data-search");
  fireEvent.change(search, { target: { value: "heading" } });

  // SOG should be filtered out — "heading" not in its path
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeNull();
  // headingTrue should be visible
  expect(queryByTestId("data-leaf-navigation-headingTrue")).toBeTruthy();

  // Clear the filter
  fireEvent.change(search, { target: { value: "" } });

  // Both now visible
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeTruthy();
  expect(queryByTestId("data-leaf-navigation-headingTrue")).toBeTruthy();
});

// ── Catalog-integration tests (Fix 1) ────────────────────────────────────────

import { SIGNALK_CATALOG } from "../signalk-catalog";

test("DataTree renders catalog entries even with zero live paths", () => {
  // Provider with NO live data
  const provider = makeProviderStub([]);
  const { getByText } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );
  // Catalog groups should be visible
  expect(getByText(/navigation/i)).toBeTruthy();
  expect(getByText(/environment/i)).toBeTruthy();
  expect(getByText(/electrical/i)).toBeTruthy();
});

test("DataTree renders catalog leaf for navigation.speedOverGround even with zero live data", () => {
  const provider = makeProviderStub([]);
  const { getByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );
  // The leaf for SOG must be present from the catalog
  expect(getByTestId("data-leaf-navigation-speedOverGround")).toBeTruthy();
});

test("clicking a catalog leaf with no live data calls onBindPath", () => {
  const provider = makeProviderStub([]);
  const onBindPath = vi.fn();
  const { getByTestId } = render(
    <DataTree provider={provider} selectedElementId="some-element" onBindPath={onBindPath} />,
  );
  fireEvent.click(getByTestId("data-leaf-navigation-speedOverGround"));
  expect(onBindPath).toHaveBeenCalledWith("navigation.speedOverGround");
});

test("DataTree overlays live value onto catalog entry when provider streams it", async () => {
  const provider = makeProviderStub([
    { path: "navigation.speedOverGround", value: 5.5, sourceUnit: "m/s", updatedAt: Date.now() },
  ]);
  const { getByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );
  const leaf = getByTestId("data-leaf-navigation-speedOverGround");
  // The leaf should show the live value
  expect(leaf.textContent).toContain("5.5");
  // The leaf should have data-live attribute
  expect(leaf.getAttribute("data-live")).toBe("true");
});

test("DataTree appends live-only path not in catalog after merging", async () => {
  const provider = makeProviderStub([
    { path: "custom.exotic.sensor", value: 42, updatedAt: Date.now() },
  ]);
  const { getByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );
  // Must appear even though "custom.exotic.sensor" is not in SIGNALK_CATALOG
  expect(getByTestId("data-leaf-custom-exotic-sensor")).toBeTruthy();
});

// ── Part 2: Collapsible groups ────────────────────────────────────────────────

test("group headers have data-group-<name> testid", () => {
  const provider = makeProviderStub([]);
  const { getByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );
  // navigation group from catalog
  expect(getByTestId("data-group-navigation")).toBeTruthy();
});

test("clicking a group header collapses the group (hides leaves)", () => {
  const provider = makeProviderStub([]);
  // navigation group has catalog entries including speedOverGround
  const { getByTestId, queryByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );
  // Leaf should be visible before collapse
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeTruthy();

  // Click the group header to collapse
  fireEvent.click(getByTestId("data-group-navigation"));

  // Leaf should now be hidden
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeNull();
});

test("clicking a collapsed group header expands the group again", () => {
  const provider = makeProviderStub([]);
  const { getByTestId, queryByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );

  // Collapse
  fireEvent.click(getByTestId("data-group-navigation"));
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeNull();

  // Expand again
  fireEvent.click(getByTestId("data-group-navigation"));
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeTruthy();
});

test("groups start expanded by default", () => {
  const provider = makeProviderStub([]);
  const { queryByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );
  // Both groups visible without any interaction
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeTruthy();
  expect(queryByTestId("data-leaf-environment-wind-speedApparent")).toBeTruthy();
});

test("collapsing one group does not collapse others", () => {
  const provider = makeProviderStub([]);
  const { getByTestId, queryByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );

  fireEvent.click(getByTestId("data-group-navigation"));

  // navigation collapsed
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeNull();
  // environment still visible
  expect(queryByTestId("data-leaf-environment-wind-speedApparent")).toBeTruthy();
});
