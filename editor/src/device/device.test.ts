// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { Manifest } from "@yey-boats/midl";
import { RevisionConflict, StoreError } from "../adapters";
import { parseMidl, serializeMidl } from "../midl-io";
import { DeviceApi, DeviceApiError } from "./device-api";
import { createRecordStore, extractScreenDoc, spliceScreenDoc, validateRecordDoc } from "./record-store";
import { collectLiveKeys, DeviceLiveProvider } from "./live-provider";
import { displayOrder, moveRecord, newRecordDoc, setDefaultScreen, toggleHidden } from "./index-ops";
import { FakeDevice } from "./fake-device.testutil";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const builtinDir = join(repo, "library", "builtin");
const loadJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const builtinFiles = readdirSync(builtinDir).filter((f) => f.endsWith(".midl.json")).sort();
const builtin = (id: string) => loadJson(join(builtinDir, `${id}.midl.json`));
const manifestFor = (cls: string): Manifest => loadJson(join(repo, "schemas", "gen", `yb-midl-capabilities.${cls}.json`));
const SQUARE = manifestFor("square-480");

function setup(ids = ["dashboard", "wind", "status"]) {
  const dev = new FakeDevice(ids.map(builtin), SQUARE);
  const api = new DeviceApi({ fetch: dev.fetch });
  const store = (recordId: string, extra: Partial<Parameters<typeof createRecordStore>[0]> = {}) =>
    createRecordStore({ api, manifest: SQUARE, className: "square-480", recordId, ...extra });
  return { dev, api, store };
}

/** Simulate an editor round trip: load -> edit -> serialize like MidlEditor's Save. */
async function editAndSave(s: ReturnType<ReturnType<typeof setup>["store"]>, id: string, edit: (m: ReturnType<typeof parseMidl>) => void) {
  const got = await s.get(id);
  const model = parseMidl(got.doc);
  edit(model);
  return s.save({ id, source: serializeMidl(model, "yaml"), name: model.title, targetClass: "square-480", expectedRevision: got.metadata.revision });
}

describe("DeviceApi", () => {
  it("lists records with a normalized index", async () => {
    const { api } = setup();
    const l = await api.listRecords();
    expect(l.records.map((r) => r.id)).toEqual(["dashboard", "wind", "status"]);
    expect(l.records[0]).toMatchObject({ source: "embedded", screens: [{ id: "dashboard" }] });
    expect(l.index).toEqual({ order: [], defaultScreen: undefined, hidden: [] });
  });

  it("opens a record", async () => {
    const { api } = setup();
    const r = await api.getRecord("wind");
    expect(r.id).toBe("wind");
    expect((r.doc.screens as unknown[]).length).toBe(1);
  });

  it("PUT carries activate and screen in the query", async () => {
    const { api, dev } = setup();
    await api.putRecord("mine", { title: "Mine", doc: newRecordDoc("mine", "Mine", SQUARE, "square-480") }, { activate: true, screen: "mine" });
    const put = dev.calls.at(-1)!;
    expect(put.method).toBe("PUT");
    expect(put.url).toBe("/api/midl/records/mine?activate=1&screen=mine");
    expect(put.body).toMatchObject({ title: "Mine", doc: { screens: [{ id: "mine" }] } });
    expect(dev.active).toBe("mine");
  });

  it("maps 401 to code auth whatever the body", async () => {
    const { api, dev } = setup();
    dev.failNext.push({ status: 401, body: { ok: false, error: "bad_manager_token" } });
    await expect(api.listRecords()).rejects.toMatchObject({ status: 401, code: "auth" });
  });

  it("maps a network failure to code network", async () => {
    const api = new DeviceApi({ fetch: async () => { throw new TypeError("Failed to fetch"); } });
    await expect(api.getManifest()).rejects.toMatchObject({ status: 0, code: "network" });
  });

  it("DELETE of a bare built-in is 404 embedded_record", async () => {
    const { api } = setup();
    const e = await api.deleteRecord("wind").catch((x) => x);
    expect(e).toBeInstanceOf(DeviceApiError);
    expect(e).toMatchObject({ status: 404, code: "embedded_record" });
  });

  it("factory reset POSTs ?to=factory", async () => {
    const { api, dev, store } = setup();
    await editAndSave(store("wind"), "wind", (m) => { m.title = "My wind"; });
    await api.resetFactory();
    expect(dev.calls.at(-1)).toMatchObject({ method: "POST", url: "/api/midl/reset?to=factory" });
    expect(dev.stored.size).toBe(0);
  });

  it("showScreen POSTs /api/screen/<id>", async () => {
    const { api, dev } = setup();
    await api.showScreen("wind");
    expect(dev.calls.at(-1)).toMatchObject({ method: "POST", url: "/api/screen/wind" });
  });
});

describe("record store (editor adapter)", () => {
  it("opens a built-in as a one-screen doc with the hash as revision", async () => {
    const { store, dev } = setup();
    const got = await store("dashboard").get("dashboard");
    expect(got.metadata.revision).toBe(dev.embedded.get("dashboard")!.hash);
    expect(parseMidl(got.doc).screenId).toBe("dashboard");
  });

  it("saving an edited built-in creates an override with the same id; reset restores it", async () => {
    const { store, api, dev } = setup();
    const s = store("dashboard");
    const res = await editAndSave(s, "dashboard", (m) => { m.title = "My dash"; });
    expect(res.ref.id).toBe("dashboard");
    expect(res.revision).toBe(dev.stored.get("dashboard")!.hash);
    const put = dev.calls.find((c) => c.method === "PUT")!;
    expect(put.url).toBe("/api/midl/records/dashboard");
    expect(put.body).toMatchObject({ title: "My dash" });

    let l = await api.listRecords();
    expect(l.records.find((r) => r.id === "dashboard")).toMatchObject({ source: "local", overridesEmbedded: true });

    await api.deleteRecord("dashboard"); // "reset to built-in"
    l = await api.listRecords();
    expect(l.records.find((r) => r.id === "dashboard")).toMatchObject({ source: "embedded" });
  });

  it("surfaces 422 invalid_doc with the device's message and path", async () => {
    const { store, dev } = setup();
    const e = await editAndSave(store("wind"), "wind", (m) => { m.docMeta = { ...(m.docMeta ?? {}), title: dev.rejectTitle }; }).catch((x) => x);
    expect(e).toBeInstanceOf(StoreError);
    expect(e.code).toBe("invalid_doc");
    expect(e.message).toContain("element type not supported");
    expect(e.message).toContain("/screens/0/elements/x/type");
  });

  it("surfaces 409 screen_id_conflict naming the owner", async () => {
    const { store } = setup();
    const seed = newRecordDoc("extra", "Extra", SQUARE, "square-480");
    (seed.screens as Array<{ id: string }>)[0].id = "wind"; // collides with the built-in
    const s = store("extra", { seed });
    const e = await editAndSave(s, "extra", () => {}).catch((x) => x);
    expect(e).toBeInstanceOf(StoreError);
    expect(e.code).toBe("screen_id_conflict");
    expect(e.message).toContain('"wind"');
    expect(e.message).toContain("record \"wind\"");
  });

  it("surfaces 413 too_large", async () => {
    const { store, dev } = setup();
    const s = store("wind");
    await s.get("wind");
    // saveDoc re-reads the record (200), then the PUT answers 413
    dev.failNext.push({ status: 200, body: dev.embedded.get("wind") }, { status: 413, body: { ok: false, error: "too_large", message: "doc over 48 KB" } });
    const e = await s.saveDoc(builtin("wind"), "Wind").catch((x) => x);
    expect(e).toBeInstanceOf(StoreError);
    expect(e.code).toBe("too_large");
  });

  it("validates against the device manifest before PUT", async () => {
    const { store, dev } = setup();
    const s = store("wind");
    await s.get("wind");
    const bad = builtin("wind");
    bad.screens[0].elements = { x: { type: "not-an-element", bindings: {} } };
    bad.screens[0].layout = { element: "x" };
    delete bad.screens[0].variants;
    const n = dev.calls.length;
    const e = await s.saveDoc(bad, "Wind").catch((x) => x);
    expect(e).toBeInstanceOf(StoreError);
    expect(e.code).toBe("invalid_doc");
    expect(dev.calls.slice(n).some((c) => c.method === "PUT")).toBe(false);
  });

  it("raises RevisionConflict when the record changed on the display; Overwrite forces", async () => {
    const { store, dev } = setup();
    const s = store("wind");
    const got = await s.get("wind");
    dev.stored.set("wind", { ...dev.embedded.get("wind")!, source: "manager", hash: "sha256:other" });
    const model = parseMidl(got.doc);
    const input = { id: "wind", source: serializeMidl(model, "yaml"), name: "Wind", targetClass: "square-480" };
    await expect(s.save({ ...input, expectedRevision: got.metadata.revision })).rejects.toBeInstanceOf(RevisionConflict);
    const res = await s.save({ ...input, expectedRevision: undefined });
    expect(res.revision).toBe(dev.stored.get("wind")!.hash);
  });

  it("new record: opens the seed, then the first save creates it", async () => {
    const { store, dev } = setup();
    const s = store("mine", { seed: newRecordDoc("mine", "Mine", SQUARE, "square-480"), title: "Mine" });
    const got = await s.get("mine");
    expect(got.metadata.revision).toBe("");
    await editAndSave(s, "mine", () => {});
    expect(dev.stored.get("mine")).toMatchObject({ title: "Mine", source: "local" });
  });

  it("Show on display: saveDoc with activate sends the edited screen id", async () => {
    const { store, dev } = setup();
    const s = store("wind");
    const got = await s.get("wind");
    await s.saveDoc(got.doc, "Wind", { activate: true });
    expect(dev.calls.find((c) => c.method === "PUT")!.url).toBe("/api/midl/records/wind?activate=1&screen=wind");
    expect(dev.screen).toBe("wind");
  });

  it("edits one screen of a multi-screen record and keeps the others", async () => {
    const { dev, store } = setup([]);
    const a = builtin("wind").screens[0];
    const b = builtin("depth").screens[0];
    const multi = { midl: "1.0.0", meta: { title: "Pair" }, screens: [a, b] };
    dev.stored.set("pair", { id: "pair", title: "Pair", source: "local", hash: "sha256:p1", doc: multi });
    const s = store("pair", { screenId: "depth" });
    const got = await s.get("pair");
    expect(parseMidl(got.doc).screenId).toBe("depth");
    await editAndSave(s, "pair", (m) => { m.title = "Depth 2"; });
    const put = dev.calls.find((c) => c.method === "PUT")!;
    const doc = put.body as { title: string; doc: { screens: Array<{ id: string; title?: string; meta?: { title?: string } }> } };
    expect(doc.title).toBe("Pair"); // record title kept for multi-screen records
    expect(doc.doc.screens.map((x) => x.id)).toEqual(["wind", "depth"]);
    const t = doc.doc.screens[1].title ?? doc.doc.screens[1].meta?.title;
    expect(t).toBe("Depth 2");
  });

  it("lifts the display-class variant into the base layout and writes it back on save", async () => {
    const { store, dev } = setup();
    const s = store("dashboard");
    const got = await s.get("dashboard");
    const model = parseMidl(got.doc);
    expect(model.variants.map((v) => v.class)).toEqual(["landscape-800x480", "landscape-1024x600"]);
    expect(model.layout).toEqual(builtin("dashboard").screens[0].variants[0].layout);
    model.layout = { rows: 1, cols: 1, cells: [{ element: "sog" }] };
    await s.save({ id: "dashboard", source: serializeMidl(model, "yaml"), name: model.title, targetClass: "square-480", expectedRevision: got.metadata.revision });
    const put = dev.calls.find((c) => c.method === "PUT")!;
    const scr = (put.body as { doc: { screens: Array<{ layout: unknown; variants: Array<{ class: string; layout: unknown }> }> } }).doc.screens[0];
    expect(scr.variants.map((v) => v.class)).toEqual(["square-480", "landscape-800x480", "landscape-1024x600"]);
    expect(scr.variants[0].layout).toEqual({ rows: 1, cols: 1, cells: [{ element: "sog" }] });
    expect(scr.layout).toEqual({ rows: 1, cols: 1, cells: [{ element: "sog" }] });
  });

  it("extract/splice are inverse for every screen", () => {
    const full = { midl: "1.0.0", screens: [{ id: "a" }, { id: "b" }, { id: "c" }] };
    const { doc, index } = extractScreenDoc(full, "b");
    expect(index).toBe(1);
    expect(doc.screens).toEqual([{ id: "b" }]);
    expect(spliceScreenDoc(full, { midl: "1.0.0", screens: [{ id: "b", title: "B" }] }, 1).screens)
      .toEqual([{ id: "a" }, { id: "b", title: "B" }, { id: "c" }]);
  });
});

describe("built-in records", () => {
  for (const f of builtinFiles) {
    it(`${f} validates for its class and round-trips through the editor`, () => {
      const doc = loadJson(join(builtinDir, f));
      const cls = doc.screens[0].variants?.[0]?.class ?? "square-480";
      expect(validateRecordDoc(doc, manifestFor(cls), cls).issues.filter((i) => i.severity !== "warning")).toEqual([]);
      const one = extractScreenDoc(doc).doc;
      const model = parseMidl(JSON.stringify(one));
      expect(model.screenId).toBe(doc.screens[0].id);
    });
  }
});

describe("index ops", () => {
  it("orders by index.order then the device order; move/hide/default produce a full index", async () => {
    const { api, dev } = setup();
    dev.index = { order: ["status"], hidden: [], defaultScreen: undefined };
    const l = await api.listRecords();
    expect(displayOrder(l).map((r) => r.id)).toEqual(["status", "dashboard", "wind"]);
    expect(moveRecord(l, "wind", -1)).toEqual({ order: ["status", "wind", "dashboard"], hidden: [], defaultScreen: undefined });
    expect(moveRecord(l, "status", -1).order).toEqual(["status", "dashboard", "wind"]);
    expect(toggleHidden(l, "wind").hidden).toEqual(["wind"]);
    expect(setDefaultScreen(l, "wind").defaultScreen).toBe("wind");

    await api.putIndex(toggleHidden(l, "wind"));
    expect(dev.calls.at(-1)).toMatchObject({ method: "PUT", url: "/api/midl/index", body: { order: ["status", "dashboard", "wind"], hidden: ["wind"] } });
    expect(dev.index.hidden).toEqual(["wind"]);
  });

  it("drops hidden ids of records that no longer exist", async () => {
    const { api, dev } = setup();
    dev.index = { order: [], hidden: ["gone"] };
    const l = await api.listRecords();
    expect(toggleHidden(l, "wind").hidden).toEqual(["wind"]);
  });
});

describe("collectLiveKeys", () => {
  it("collects every SignalK path and local id of a doc", () => {
    const k = collectLiveKeys(builtin("dashboard"));
    expect(k.paths).toContain("environment.wind.speedApparent");
    expect(k.paths).toContain("environment.wind.angleApparent");
    expect(k.paths).toContain("navigation.speedOverGround");
    expect(k.locals).toEqual([]);
    expect(k.paths).toEqual([...new Set(k.paths)].sort());
  });

  it("collects local ids (status record)", () => {
    const k = collectLiveKeys(builtin("status"));
    expect(k.locals).toContain("net.ip");
    expect(k.locals.length).toBeGreaterThan(3);
  });

  it("finds nested sources (markers, variants) and ignores const/computed", () => {
    const doc = {
      screens: [{
        id: "s",
        elements: {
          a: { type: "compass", bindings: { value: { kind: "signalk", path: "navigation.headingTrue" }, c: { kind: "const", value: 1 } },
            markers: [{ dir: { kind: "signalk", path: "navigation.courseOverGroundTrue" } }] },
          b: { type: "text", bindings: { value: { kind: "local", id: "sys.uptime" }, x: { kind: "computed", expr: "1+1" } } },
        },
      }],
    };
    expect(collectLiveKeys(doc)).toEqual({
      paths: ["navigation.courseOverGroundTrue", "navigation.headingTrue"],
      locals: ["sys.uptime"],
    });
  });
});

describe("DeviceLiveProvider", () => {
  let visible = true;
  let visCb: (() => void) | null = null;
  beforeEach(() => {
    vi.useFakeTimers();
    visible = true;
    visCb = null;
  });
  afterEach(() => { vi.useRealTimers(); });

  function mk(dev: FakeDevice) {
    return new DeviceLiveProvider({
      api: new DeviceApi({ fetch: dev.fetch }),
      intervalMs: 1000,
      maxBackoffMs: 8000,
      isVisible: () => visible,
      onVisibilityChange: (cb) => { visCb = cb; return () => { visCb = null; }; },
    });
  }
  const liveCalls = (dev: FakeDevice) => dev.calls.filter((c) => c.url.startsWith("/api/midl/live"));

  it("polls the doc's paths and locals ~1 Hz and feeds getValue", async () => {
    const { dev } = setup();
    dev.liveLocals = { "net.ip": "192.168.1.7" };
    const p = mk(dev);
    p.setDoc({ screens: [{ id: "s", elements: {
      a: { type: "single-value", bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } } },
      b: { type: "text", bindings: { value: { kind: "local", id: "net.ip" } } },
    } }] });
    const changed = vi.fn();
    p.onChange(changed);
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(liveCalls(dev)).toHaveLength(1);
    expect(liveCalls(dev)[0].url).toBe("/api/midl/live?paths=navigation.speedOverGround&locals=net.ip");
    // first answer: SOG still null on the device
    expect(p.getValue({ kind: "signalk", path: "navigation.speedOverGround" }).present).toBe(false);
    expect(p.getValue({ kind: "local", id: "net.ip" })).toMatchObject({ value: "192.168.1.7", present: true });
    expect(p.getValue({ kind: "local", id: "net.ip" }).sourceUnit).toBeUndefined();

    dev.liveValues["navigation.speedOverGround"] = 3.2;
    await vi.advanceTimersByTimeAsync(1000);
    expect(liveCalls(dev)).toHaveLength(2);
    // raw SI, no sourceUnit: the renderer infers m/s from the path
    expect(p.getValue({ kind: "signalk", path: "navigation.speedOverGround" })).toMatchObject({ value: 3.2, present: true, stale: false });
    expect(changed).toHaveBeenCalled();
    expect(p.getStatus()).toMatchObject({ state: "ok", failures: 0, deviceT: 12345 });
    p.stop();
  });

  it("adds bindings the renderer asks for to the next poll", async () => {
    const { dev } = setup();
    const p = mk(dev);
    p.want(["navigation.speedOverGround"], []);
    p.getValue({ kind: "signalk", path: "environment.depth.belowTransducer" });
    p.getValue({ kind: "local", id: "sys.heap" });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(liveCalls(dev)[0].url).toBe("/api/midl/live?paths=environment.depth.belowTransducer,navigation.speedOverGround&locals=sys.heap");
    p.stop();
  });

  it("does not poll with nothing to ask for", async () => {
    const { dev } = setup();
    const p = mk(dev);
    p.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(liveCalls(dev)).toHaveLength(0);
    p.stop();
  });

  it("backs off exponentially on errors (capped) and recovers to 1 Hz", async () => {
    const { dev } = setup();
    const p = mk(dev);
    p.want(["navigation.speedOverGround"], []);
    for (let i = 0; i < 5; i++) dev.failNext.push({ status: 500, body: { ok: false, error: "boom", message: "boom" } });
    p.start();
    await vi.advanceTimersByTimeAsync(0); // fail 1 -> next in 2 s
    expect(p.getStatus()).toMatchObject({ state: "error", failures: 1, nextInMs: 2000 });
    await vi.advanceTimersByTimeAsync(1999);
    expect(liveCalls(dev)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); // fail 2 -> 4 s
    expect(p.getStatus().nextInMs).toBe(4000);
    await vi.advanceTimersByTimeAsync(4000); // fail 3 -> 8 s
    expect(p.getStatus().nextInMs).toBe(8000);
    await vi.advanceTimersByTimeAsync(8000); // fail 4 -> capped 8 s
    expect(p.getStatus()).toMatchObject({ failures: 4, nextInMs: 8000 });
    await vi.advanceTimersByTimeAsync(8000); // fail 5
    await vi.advanceTimersByTimeAsync(8000); // ok
    expect(p.getStatus()).toMatchObject({ state: "ok", failures: 0, nextInMs: 1000 });
    const n = liveCalls(dev).length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(liveCalls(dev)).toHaveLength(n + 1);
    p.stop();
  });

  it("reports 401 as auth and keeps backing off", async () => {
    const { dev } = setup();
    const p = mk(dev);
    p.want(["navigation.speedOverGround"], []);
    dev.failNext.push({ status: 401 });
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(p.getStatus()).toMatchObject({ state: "auth", failures: 1, nextInMs: 2000 });
    p.stop();
  });

  it("pauses while the page is hidden and resumes on visibilitychange", async () => {
    const { dev } = setup();
    const p = mk(dev);
    p.want(["navigation.speedOverGround"], []);
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(liveCalls(dev)).toHaveLength(1);
    visible = false;
    visCb!();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(liveCalls(dev)).toHaveLength(1);
    expect(p.getStatus().state).toBe("paused");
    visible = true;
    visCb!();
    await vi.advanceTimersByTimeAsync(0);
    expect(liveCalls(dev)).toHaveLength(2);
    p.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(liveCalls(dev)).toHaveLength(2);
  });

  it("a null answer clears a previous value", async () => {
    const { dev } = setup();
    const p = mk(dev);
    p.want(["environment.depth.belowTransducer"], []);
    dev.liveValues["environment.depth.belowTransducer"] = 4.5;
    p.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(p.getValue({ kind: "signalk", path: "environment.depth.belowTransducer" }).value).toBe(4.5);
    delete dev.liveValues["environment.depth.belowTransducer"];
    await vi.advanceTimersByTimeAsync(1000);
    expect(p.getValue({ kind: "signalk", path: "environment.depth.belowTransducer" }).present).toBe(false);
    p.stop();
  });
});
