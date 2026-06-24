// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Tests for the extended createSignalKProvider: knownPaths / inject / onChange.

import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { createSignalKProvider } from "./signalk-provider";

// ── Fake WebSocket ─────────────────────────────────────────────────────────────

type WsHandler = (evt: { data: string }) => void;
type WsVoidHandler = () => void;

interface FakeWs {
  readyState: number;
  sentMessages: string[];
  onopen: WsVoidHandler | null;
  onmessage: WsHandler | null;
  onclose: WsVoidHandler | null;
  onerror: WsVoidHandler | null;
  send(data: string): void;
  close(): void;
  /** Test helper: simulate a received message */
  receive(data: object): void;
  /** Test helper: trigger open */
  triggerOpen(): void;
  /** Test helper: trigger close */
  triggerClose(): void;
}

let lastFakeWs: FakeWs | null = null;

function makeFakeWebSocket(): FakeWs {
  const ws: FakeWs = {
    readyState: 0, // CONNECTING
    sentMessages: [],
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send(data: string) { this.sentMessages.push(data); },
    close() { this.readyState = 3; /* CLOSED */ },
    receive(data: object) {
      this.onmessage?.({ data: JSON.stringify(data) });
    },
    triggerOpen() {
      this.readyState = 1; // OPEN
      this.onopen?.();
    },
    triggerClose() {
      this.readyState = 3; // CLOSED
      this.onclose?.();
    },
  };
  return ws;
}

// ── Test helpers ──────────────────────────────────────────────────────────────

/** Build a minimal SignalK delta message for one path/value pair. */
function makeDelta(path: string, value: unknown, sourceUnit?: string): object {
  return {
    updates: [
      {
        values: [{ path, value, ...(sourceUnit ? { sourceUnit } : {}) }],
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  lastFakeWs = null;
  vi.stubGlobal("WebSocket", function FakeWebSocketConstructor() {
    lastFakeWs = makeFakeWebSocket();
    return lastFakeWs;
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ── knownPaths tests ──────────────────────────────────────────────────────────

test("knownPaths() returns empty array before any delta arrives", () => {
  const provider = createSignalKProvider({ url: "ws://test/signalk/v1/stream" });
  expect(provider.knownPaths()).toEqual([]);
  provider.close();
});

test("knownPaths() lists a path after a delta is ingested, with value and updatedAt", () => {
  const provider = createSignalKProvider({ url: "ws://test/signalk/v1/stream" });

  // Open the socket and feed a delta
  lastFakeWs!.triggerOpen();
  lastFakeWs!.receive(makeDelta("navigation.speedOverGround", 3.5, "m/s"));

  const known = provider.knownPaths();
  expect(known.length).toBe(1);
  expect(known[0].path).toBe("navigation.speedOverGround");
  expect(known[0].value).toBe(3.5);
  expect(known[0].sourceUnit).toBe("m/s");
  expect(known[0].updatedAt).toBeGreaterThan(0);
  expect(known[0].injected).toBeFalsy();

  provider.close();
});

test("knownPaths() lists multiple paths sorted alphabetically", () => {
  const provider = createSignalKProvider({ url: "ws://test/signalk/v1/stream" });

  lastFakeWs!.triggerOpen();
  lastFakeWs!.receive(makeDelta("navigation.speedOverGround", 3.5));
  lastFakeWs!.receive(makeDelta("electrical.batteries.house.voltage", 12.7));
  lastFakeWs!.receive(makeDelta("environment.wind.speedApparent", 6.2));

  const known = provider.knownPaths();
  expect(known.length).toBe(3);
  expect(known[0].path).toBe("electrical.batteries.house.voltage");
  expect(known[1].path).toBe("environment.wind.speedApparent");
  expect(known[2].path).toBe("navigation.speedOverGround");

  provider.close();
});

// ── inject tests ──────────────────────────────────────────────────────────────

test("inject() adds a path to knownPaths flagged as injected", () => {
  const provider = createSignalKProvider({ url: "ws://test/signalk/v1/stream" });

  provider.inject("my.custom.path", 42, "units");

  const known = provider.knownPaths();
  expect(known.length).toBe(1);
  expect(known[0].path).toBe("my.custom.path");
  expect(known[0].value).toBe(42);
  expect(known[0].sourceUnit).toBe("units");
  expect(known[0].injected).toBe(true);

  provider.close();
});

test("inject() overlays live data — getValue returns the injected value", () => {
  const provider = createSignalKProvider({ url: "ws://test/signalk/v1/stream" });

  // First, feed a live delta
  lastFakeWs!.triggerOpen();
  lastFakeWs!.receive(makeDelta("navigation.speedOverGround", 3.5, "m/s"));

  // Verify live value
  expect(provider.getValue({ kind: "signalk", path: "navigation.speedOverGround" }).value).toBe(3.5);

  // Now inject an override
  provider.inject("navigation.speedOverGround", 99, "m/s");

  // getValue should return the injected value
  const resolved = provider.getValue({ kind: "signalk", path: "navigation.speedOverGround" });
  expect(resolved.value).toBe(99);

  provider.close();
});

test("inject() path appears in knownPaths with injected flag even if no live delta", () => {
  const provider = createSignalKProvider({ url: "ws://test/signalk/v1/stream" });

  provider.inject("tanks.fuel.0.currentLevel", 0.75);

  const known = provider.knownPaths();
  const entry = known.find((p) => p.path === "tanks.fuel.0.currentLevel");
  expect(entry).toBeDefined();
  expect(entry!.injected).toBe(true);
  expect(entry!.value).toBe(0.75);

  provider.close();
});

test("live delta after inject keeps injected overlay in getValue but shows live in knownPaths only once", () => {
  const provider = createSignalKProvider({ url: "ws://test/signalk/v1/stream" });

  provider.inject("navigation.headingTrue", 1.0);

  lastFakeWs!.triggerOpen();
  lastFakeWs!.receive(makeDelta("navigation.headingTrue", 2.0, "rad"));

  // getValue should still return injected value (overlay takes precedence)
  expect(provider.getValue({ kind: "signalk", path: "navigation.headingTrue" }).value).toBe(1.0);

  // knownPaths should have only one entry for this path
  const known = provider.knownPaths().filter((p) => p.path === "navigation.headingTrue");
  expect(known.length).toBe(1);

  provider.close();
});

// ── onChange tests ────────────────────────────────────────────────────────────

test("onChange fires when a new live delta arrives", () => {
  const provider = createSignalKProvider({ url: "ws://test/signalk/v1/stream" });

  const cb = vi.fn();
  const unsub = provider.onChange(cb);

  lastFakeWs!.triggerOpen();
  lastFakeWs!.receive(makeDelta("navigation.speedOverGround", 3.5));

  // onChange is throttled by 16ms — advance just past that
  vi.advanceTimersByTime(50);
  expect(cb).toHaveBeenCalled();

  unsub();
  provider.close();
});

test("onChange returns an unsubscribe function that stops future callbacks", () => {
  const provider = createSignalKProvider({ url: "ws://test/signalk/v1/stream" });

  const cb = vi.fn();
  const unsub = provider.onChange(cb);

  lastFakeWs!.triggerOpen();
  lastFakeWs!.receive(makeDelta("navigation.speedOverGround", 1));
  vi.advanceTimersByTime(50);

  const callCountAfterFirst = cb.mock.calls.length;
  expect(callCountAfterFirst).toBeGreaterThan(0);

  // Unsubscribe — subsequent deltas should NOT trigger the callback
  unsub();
  lastFakeWs!.receive(makeDelta("navigation.speedOverGround", 2));
  vi.advanceTimersByTime(50);

  // Call count must not have grown
  expect(cb.mock.calls.length).toBe(callCountAfterFirst);

  provider.close();
});

test("onChange fires when inject() is called", () => {
  const provider = createSignalKProvider({ url: "ws://test/signalk/v1/stream" });

  const cb = vi.fn();
  const unsub = provider.onChange(cb);

  provider.inject("my.path", 100);
  vi.advanceTimersByTime(50);

  expect(cb).toHaveBeenCalled();

  unsub();
  provider.close();
});
