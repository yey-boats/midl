// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { test, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import type { Manifest } from "@yey-boats/midl";
import { Palette } from "./Palette";

afterEach(() => cleanup());

const MANIFEST: Manifest = {
  midl: "1.0.0",
  board: "test",
  classes: [{ id: "square-480", maxTiles: 4, maxDepth: 3 }],
  elements: [
    { type: "single-value", bindings: ["value"] },
    { type: "gauge", bindings: ["value"] },
    { type: "bar", bindings: ["value"] },
    { type: "compass", bindings: ["value"] },
    { type: "windrose", bindings: ["value"] },
    { type: "trend", bindings: ["value"] },
    { type: "autopilot", bindings: ["value"] },
    { type: "button", bindings: ["value"] },
    { type: "text", bindings: ["value"] },
  ],
  sources: ["signalk"],
};

test("renders palette items for each manifest element type", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-single-value")).toBeTruthy();
  expect(getByTestId("palette-gauge")).toBeTruthy();
  expect(getByTestId("palette-bar")).toBeTruthy();
});

test("single-value item shows 'Large numeric readout' description", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-single-value").textContent).toContain("Large numeric readout");
});

test("gauge item shows 'Radial gauge' in description", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-gauge").textContent).toMatch(/radial gauge/i);
});

test("bar item shows 'Bar' in description", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-bar").textContent).toMatch(/bar/i);
});

test("compass item shows 'Heading' or 'bearing' in description", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-compass").textContent).toMatch(/heading|bearing/i);
});

test("windrose item shows 'Wind' in description", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-windrose").textContent).toMatch(/wind/i);
});

test("trend item shows 'line' or 'series' in description", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-trend").textContent).toMatch(/line|series/i);
});

test("autopilot item shows 'Autopilot' in description", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-autopilot").textContent).toMatch(/autopilot/i);
});

test("button item shows 'Action' or 'button' in description", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-button").textContent).toMatch(/action|button/i);
});

test("text item shows 'Label' or 'text' in description", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-text").textContent).toMatch(/label|text/i);
});

test("clicking a palette item calls onAdd with the type", () => {
  const onAdd = vi.fn();
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={onAdd} />,
  );
  fireEvent.click(getByTestId("palette-gauge"));
  expect(onAdd).toHaveBeenCalledWith("gauge");
});

test("each palette item renders an svg icon", () => {
  const { getByTestId } = render(
    <Palette manifest={MANIFEST} onAdd={vi.fn()} />,
  );
  // single-value button should contain an svg element
  const btn = getByTestId("palette-single-value");
  expect(btn.querySelector("svg")).toBeTruthy();
});

test("unknown type falls back gracefully (renders without crashing)", () => {
  const manifest: Manifest = {
    ...MANIFEST,
    elements: [{ type: "custom-unknown-widget", bindings: ["value"] }],
  };
  const { getByTestId } = render(
    <Palette manifest={manifest} onAdd={vi.fn()} />,
  );
  expect(getByTestId("palette-custom-unknown-widget")).toBeTruthy();
});
