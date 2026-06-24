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

test("tree re-renders when provider.onChange fires (new path appears)", async () => {
  const provider = makeProviderStub([]);

  const { queryByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );

  // No leaf yet
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeNull();

  // Simulate new delta arriving
  await act(async () => {
    provider.pushPaths([
      { path: "navigation.speedOverGround", value: 5.0, updatedAt: Date.now() },
    ]);
  });

  // Leaf should now be rendered
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeTruthy();
});

test("search clears filter and shows all leaves again after clearing", () => {
  const provider = makeProviderStub([
    { path: "navigation.speedOverGround", value: 3.5, updatedAt: Date.now() },
    { path: "environment.wind.speedApparent", value: 6.2, updatedAt: Date.now() },
  ]);

  const { getByTestId, queryByTestId } = render(
    <DataTree provider={provider} selectedElementId={null} onBindPath={vi.fn()} />,
  );

  const search = getByTestId("data-search");
  fireEvent.change(search, { target: { value: "heading" } });

  // Both leaves filtered out
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeNull();
  expect(queryByTestId("data-leaf-environment-wind-speedApparent")).toBeNull();

  // Clear the filter
  fireEvent.change(search, { target: { value: "" } });

  // Both leaves now visible
  expect(queryByTestId("data-leaf-navigation-speedOverGround")).toBeTruthy();
  expect(queryByTestId("data-leaf-environment-wind-speedApparent")).toBeTruthy();
});
