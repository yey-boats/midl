// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import React from "react";
import type { Manifest } from "@yey-boats/midl";
import { MockDataProvider } from "@yey-boats/midl-web";
import { PathPicker } from "./PathPicker";

afterEach(() => cleanup());

const MANIFEST: Manifest = {
  midl: "1.0.0",
  board: "test",
  classes: [{ id: "square-480", maxTiles: 4, maxDepth: 3 }],
  elements: [{ type: "single-value", bindings: ["value"] }],
  sources: ["navigation.speedOverGround"],
};

test("PathPicker renders the controlled input with data-testid path-picker", () => {
  const { getByTestId } = render(
    <PathPicker value="navigation.speedOverGround" manifest={MANIFEST} provider={new MockDataProvider({})} onChange={vi.fn()} />,
  );
  const input = getByTestId("path-picker") as HTMLInputElement;
  expect(input.value).toBe("navigation.speedOverGround");
});

test("typing in PathPicker calls onChange with the typed value", () => {
  const onChange = vi.fn();
  const { getByTestId } = render(
    <PathPicker value="" manifest={MANIFEST} provider={new MockDataProvider({})} onChange={onChange} />,
  );
  fireEvent.change(getByTestId("path-picker"), { target: { value: "navigation.heading" } });
  expect(onChange).toHaveBeenCalledWith("navigation.heading");
});

test("PathPicker shows dropdown with catalog entries when input is focused", async () => {
  const { getByTestId, queryByTestId } = render(
    <PathPicker value="" manifest={MANIFEST} provider={new MockDataProvider({})} onChange={vi.fn()} />,
  );
  const input = getByTestId("path-picker");
  await act(async () => { fireEvent.focus(input); });
  // Dropdown should be visible
  expect(queryByTestId("path-picker-dropdown")).toBeTruthy();
});

test("PathPicker dropdown lists catalog paths (speedOverGround is present)", async () => {
  const { getByTestId, queryAllByTestId } = render(
    <PathPicker value="" manifest={MANIFEST} provider={new MockDataProvider({})} onChange={vi.fn()} />,
  );
  await act(async () => { fireEvent.focus(getByTestId("path-picker")); });
  const items = queryAllByTestId(/path-picker-option-/);
  const paths = items.map((el) => el.getAttribute("data-path"));
  expect(paths).toContain("navigation.speedOverGround");
});

test("typing filters dropdown to matching paths only", async () => {
  const onChange = vi.fn();
  const { getByTestId, queryAllByTestId } = render(
    <PathPicker value="heading" manifest={MANIFEST} provider={new MockDataProvider({})} onChange={onChange} />,
  );
  await act(async () => { fireEvent.focus(getByTestId("path-picker")); });
  const items = queryAllByTestId(/path-picker-option-/);
  const paths = items.map((el) => el.getAttribute("data-path") ?? "");
  // All displayed options must contain "heading"
  expect(paths.every((p) => p.includes("heading"))).toBe(true);
  // speedOverGround does NOT contain "heading"
  expect(paths).not.toContain("navigation.speedOverGround");
});

test("clicking a dropdown option calls onChange with the full path", async () => {
  const onChange = vi.fn();
  const { getByTestId } = render(
    <PathPicker value="" manifest={MANIFEST} provider={new MockDataProvider({})} onChange={onChange} />,
  );
  await act(async () => { fireEvent.focus(getByTestId("path-picker")); });
  // Click the first option for SOG
  const sogOption = getByTestId("path-picker-option-navigation-speedOverGround");
  await act(async () => { fireEvent.mouseDown(sogOption); });
  expect(onChange).toHaveBeenCalledWith("navigation.speedOverGround");
});

test("Browse data button calls onBrowse when clicked", async () => {
  const onBrowse = vi.fn();
  const { getByTestId } = render(
    <PathPicker value="" manifest={MANIFEST} provider={new MockDataProvider({})} onChange={vi.fn()} onBrowse={onBrowse} />,
  );
  fireEvent.click(getByTestId("path-picker-browse"));
  expect(onBrowse).toHaveBeenCalledOnce();
});

test("Browse data button is not rendered when onBrowse is not provided", () => {
  const { queryByTestId } = render(
    <PathPicker value="" manifest={MANIFEST} provider={new MockDataProvider({})} onChange={vi.fn()} />,
  );
  expect(queryByTestId("path-picker-browse")).toBeNull();
});
