// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { test, expect, vi, afterEach } from "vitest";
import { render, cleanup, waitFor, fireEvent, screen } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { DeviceApp } from "./DeviceApp";
import { DeviceApi } from "./device-api";
import { FakeDevice } from "./fake-device.testutil";

globalThis.requestAnimationFrame ??= ((cb: FrameRequestCallback) =>
  setTimeout(() => cb(performance.now()), 0)) as never;
globalThis.cancelAnimationFrame ??= ((id: number) => clearTimeout(id)) as never;

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const loadJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const builtin = (id: string) => loadJson(join(repo, "library", "builtin", `${id}.midl.json`));
const SQUARE = loadJson(join(repo, "schemas", "gen", "yb-midl-capabilities.square-480.json"));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mk() {
  const dev = new FakeDevice(["dashboard", "wind"].map(builtin), SQUARE);
  dev.stored.set("wind", { id: "wind", title: "My wind", source: "local", hash: "sha256:w2", doc: builtin("wind") });
  const api = new DeviceApi({ fetch: dev.fetch });
  return { dev, api };
}

test("lists records with built-in / override badges", async () => {
  const { api } = mk();
  render(<DeviceApp api={api} />);
  await screen.findByText("Dashboard");
  expect(screen.getByText("built-in")).toBeTruthy();
  expect(screen.getByText("edited built-in")).toBeTruthy();
  expect(screen.getByText("Reset to built-in")).toBeTruthy();
  expect(screen.queryByText("Delete")).toBeNull(); // bare built-ins cannot be deleted
});

test("opens a record in the editor and Show on display without edits just switches screen", async () => {
  const { api, dev } = mk();
  render(<DeviceApp api={api} />);
  fireEvent.click(await screen.findByText("Dashboard"));
  await waitFor(() => expect(document.querySelector('[data-component="midl-editor"]')).toBeTruthy());
  await waitFor(() => expect(dev.calls.some((c) => c.url === "/api/midl/records/dashboard")).toBe(true));
  // the editor loaded the record's screen
  await waitFor(() => expect((screen.getByTestId("name-input") as HTMLInputElement).value).toBe("Dashboard"));
  // MIDL-only display: no v2 "won't reach device" lint, no "variant layout" notice
  expect(screen.queryByTestId("device-lint-toggle")).toBeNull();
  expect(screen.queryByTestId("layout-notice")).toBeNull();
  fireEvent.click(screen.getByText("Show on display"));
  await waitFor(() => expect(dev.calls.some((c) => c.method === "POST" && c.url === "/api/screen/dashboard")).toBe(true));
  expect(dev.calls.some((c) => c.method === "PUT")).toBe(false);
});

test("Save on an edited built-in PUTs an override with the same id", async () => {
  const { api, dev } = mk();
  render(<DeviceApp api={api} />);
  fireEvent.click(await screen.findByText("Dashboard"));
  const name = await screen.findByTestId("name-input");
  await waitFor(() => expect((name as HTMLInputElement).value).toBe("Dashboard"));
  fireEvent.change(name, { target: { value: "Home" } });
  fireEvent.click(screen.getByTestId("save-button"));
  await waitFor(() => expect(dev.stored.get("dashboard")?.title).toBe("Home"));
  await screen.findByText("Saved on the display.");
});

test("Reset to built-in DELETEs the override", async () => {
  const { api, dev } = mk();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<DeviceApp api={api} />);
  fireEvent.click(await screen.findByText("Reset to built-in"));
  await waitFor(() => expect(dev.calls.some((c) => c.method === "DELETE" && c.url === "/api/midl/records/wind")).toBe(true));
  await waitFor(() => expect(screen.queryByText("edited built-in")).toBeNull());
});

test("carousel toggle and reorder PUT the index", async () => {
  const { api, dev } = mk();
  render(<DeviceApp api={api} />);
  await screen.findByText("Dashboard");
  fireEvent.click(screen.getAllByLabelText("Move down")[0]);
  await waitFor(() => expect(dev.index.order).toEqual(["wind", "dashboard"]));
  const boxes = await screen.findAllByRole("checkbox");
  fireEvent.click(boxes[0]);
  await waitFor(() => expect(dev.index.hidden).toEqual(["wind"]));
});

test("401 on load asks to sign in on the display", async () => {
  const { api, dev } = mk();
  dev.failNext.push({ status: 401 });
  render(<DeviceApp api={api} />);
  await screen.findByText(/needs you to sign in/);
  fireEvent.click(screen.getByText("Retry"));
  await screen.findByText("Dashboard");
});
