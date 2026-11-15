// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// The device-hosted editor page: the display's screen records on the left,
// the shared MidlEditor on the right, preview fed by the display's live values.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Manifest } from "@yey-boats/midl";
import { MidlEditor, type MidlEditorHandle } from "../MidlEditor";
import { RevisionConflict, type ManifestSource } from "../adapters";
import {
  DeviceApi,
  DeviceApiError,
  RECORD_ID_RE,
  describeDeviceError,
  type RecordList,
  type RecordSummary,
} from "./device-api";
import { DeviceLiveProvider, type LiveStatus } from "./live-provider";
import { createRecordStore, type RecordStore } from "./record-store";
import { displayOrder, moveRecord, newRecordDoc, setDefaultScreen, toggleHidden } from "./index-ops";

interface OpenRecord {
  recordId: string;
  screenId?: string;
  isNew: boolean;
  title?: string;
  key: number;
}

function errText(err: unknown): string {
  if (err instanceof DeviceApiError) return describeDeviceError(err);
  return err instanceof Error ? err.message : String(err);
}

function liveLabel(s: LiveStatus): { text: string; cls: string } {
  switch (s.state) {
    case "ok": return { text: "Live", cls: "ok" };
    case "auth": return { text: "Sign in needed", cls: "bad" };
    case "error": return { text: `No live data (retry ${Math.round(s.nextInMs / 1000)}s)`, cls: "warn" };
    case "paused": return { text: "Paused", cls: "" };
    default: return { text: "Waiting", cls: "" };
  }
}

function badge(r: RecordSummary): { text: string; cls: string } {
  if (r.source === "embedded") return { text: "built-in", cls: "builtin" };
  if (r.overridesEmbedded) return { text: "edited built-in", cls: "override" };
  return { text: r.source, cls: "custom" };
}

export function DeviceApp({ api }: { api: DeviceApi }): React.JSX.Element {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [list, setList] = useState<RecordList | null>(null);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<OpenRecord | null>(null);
  const [live, setLive] = useState<LiveStatus>({ state: "idle", failures: 0, nextInMs: 0 });
  const editorRef = useRef<MidlEditorHandle>(null);
  const keyRef = useRef(1);

  const provider = useMemo(() => new DeviceLiveProvider({ api }), [api]);
  useEffect(() => {
    provider.start();
    const un = provider.onStatus(setLive);
    return () => { un(); provider.stop(); };
  }, [provider]);

  const className = manifest?.classes[0]?.id ?? "square-480";
  const manifestSource = useMemo<ManifestSource>(() => ({
    get: async () => {
      if (!manifest) throw new Error("manifest not loaded");
      return manifest;
    },
  }), [manifest]);

  const fail = useCallback((err: unknown) => {
    if (err instanceof DeviceApiError && err.code === "auth") setAuthNeeded(true);
    setMessage({ text: errText(err), bad: true });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const l = await api.listRecords();
      setList(l);
      setAuthNeeded(false);
      return l;
    } catch (err) {
      fail(err);
      return null;
    }
  }, [api, fail]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const m = await api.getManifest();
      setManifest(m);
      setAuthNeeded(false);
      await refresh();
    } catch (err) {
      if (err instanceof DeviceApiError && err.code === "auth") setAuthNeeded(true);
      setLoadError(errText(err));
    }
  }, [api, refresh]);

  useEffect(() => { void load(); }, [load]);

  // One record store per opened record/screen; its get() also tells the live
  // provider which paths/locals the opened screen binds.
  const store: RecordStore | null = useMemo(() => {
    if (!open || !manifest) return null;
    const s = createRecordStore({
      api,
      manifest,
      className,
      recordId: open.recordId,
      screenId: open.screenId,
      title: open.title,
      seed: open.isNew ? newRecordDoc(open.recordId, open.title ?? open.recordId, manifest, className) : undefined,
    });
    const get = s.get.bind(s);
    s.get = async (id) => {
      const r = await get(id);
      try { provider.setDoc(JSON.parse(r.doc)); } catch { /* keep previous keys */ }
      provider.kick();
      return r;
    };
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.recordId, open?.screenId, open?.key, manifest, api, provider]);

  const confirmDiscard = useCallback((): boolean => {
    if (!editorRef.current?.isDirty()) return true;
    return window.confirm("Discard unsaved changes to this screen?");
  }, []);

  const openRecord = useCallback((recordId: string, screenId?: string) => {
    if (!confirmDiscard()) return;
    setMessage(null);
    setOpen({ recordId, screenId, isNew: false, key: keyRef.current++ });
  }, [confirmDiscard]);

  const closeRecord = useCallback(() => {
    if (!confirmDiscard()) return;
    setOpen(null);
    provider.want([], []);
  }, [confirmDiscard, provider]);

  const run = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) setMessage({ text: ok });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }, [fail]);

  const records = list ? displayOrder(list) : [];
  const allScreens = new Set(list?.records.flatMap((r) => r.screens.map((s) => s.id)) ?? []);

  const onNew = useCallback(() => {
    if (!list || !confirmDiscard()) return;
    const raw = window.prompt("New screen id (a-z, 0-9, _ or -, up to 32):", "");
    if (raw == null) return;
    const id = raw.trim().toLowerCase();
    if (!RECORD_ID_RE.test(id)) {
      setMessage({ text: `"${raw}" is not a valid id: use a-z, 0-9, _ or -, up to 32 characters.`, bad: true });
      return;
    }
    if (list.records.some((r) => r.id === id) || allScreens.has(id)) {
      setMessage({ text: `"${id}" is already used on this display.`, bad: true });
      return;
    }
    const title = window.prompt("Title:", id) ?? id;
    setMessage({ text: `New screen "${id}": edit it, then Save.` });
    setOpen({ recordId: id, screenId: id, isNew: true, title: title || id, key: keyRef.current++ });
  }, [list, confirmDiscard, allScreens]);

  const onSaved = useCallback(() => {
    setOpen((o) => (o && o.isNew ? { ...o, isNew: false } : o));
    setMessage({ text: "Saved on the display." });
    void refresh();
  }, [refresh]);

  const onShow = useCallback(async () => {
    const h = editorRef.current;
    if (!h || !store || !open) return;
    const sid = h.getModel().screenId;
    await run(async () => {
      if (h.isDirty() || open.isNew) {
        try {
          await store.saveDoc(h.getDoc("json"), h.getModel().title, { activate: true, screen: sid });
        } catch (err) {
          if (err instanceof RevisionConflict) throw new Error("The screen changed on the display since you opened it. Save (Reload / Overwrite) first.");
          throw err;
        }
        // Remount so the editor's clean baseline is the saved doc.
        setOpen({ ...open, screenId: sid, isNew: false, key: keyRef.current++ });
        await refresh();
      } else {
        await api.showScreen(sid);
      }
    }, `Showing "${sid}" on the display.`);
  }, [api, open, refresh, run, store]);

  const putIndex = useCallback((next: RecordList["index"]) => run(async () => {
    await api.putIndex(next);
    await refresh();
  }), [api, refresh, run]);

  const onDelete = useCallback((r: RecordSummary) => {
    const reset = r.overridesEmbedded;
    const q = reset
      ? `Reset "${r.title}" to the built-in screen? Your changes to it are deleted.`
      : `Delete "${r.title}" from the display?`;
    if (!window.confirm(q)) return;
    void run(async () => {
      await api.deleteRecord(r.id);
      if (open?.recordId === r.id) {
        if (reset) setOpen({ recordId: r.id, screenId: open.screenId, isNew: false, key: keyRef.current++ });
        else setOpen(null);
      }
      await refresh();
    }, reset ? `"${r.title}" is the built-in again.` : `Deleted "${r.title}".`);
  }, [api, open, refresh, run]);

  const onFactory = useCallback(() => {
    if (!window.confirm("Factory reset: delete every edited and added screen on the display and restore the built-ins?")) return;
    void run(async () => {
      await api.resetFactory();
      setOpen(null);
      await refresh();
    }, "Display reset to the built-in screens.");
  }, [api, refresh, run]);

  const ll = liveLabel(live);

  if (loadError && !manifest) {
    return (
      <div id="dev-app" className="dev-center">
        <h1>Display screens</h1>
        {authNeeded ? (
          <p>This display needs you to sign in. Open the <a href="/">display's web page</a>, sign in, then retry.</p>
        ) : (
          <p className="bad">Could not read the display: {loadError}</p>
        )}
        <button className="dev-btn primary" onClick={() => void load()}>Retry</button>
      </div>
    );
  }

  const idx = list?.index;
  // No explicit defaultScreen: the display uses the first screen of the first
  // visible record.
  const home = idx?.defaultScreen ?? records.find((r) => !idx?.hidden.includes(r.id))?.screens[0]?.id;
  return (
    <div id="dev-app" className={open ? "has-open" : ""}>
      <aside className="dev-side">
        <div className="dev-head">
          <h1>Display screens</h1>
          {live.state !== "idle" && <span className={`dev-pill ${ll.cls}`} title={live.lastError ?? ""}>{ll.text}</span>}
        </div>
        {authNeeded && (
          <div className="dev-msg bad">Sign in on the <a href="/">display's web page</a>, then <button className="dev-link" onClick={() => void load()}>retry</button>.</div>
        )}
        <ul className="dev-list">
          {records.map((r, i) => {
            const b = badge(r);
            const hidden = idx?.hidden.includes(r.id) ?? false;
            const isOpen = open?.recordId === r.id;
            return (
              <li key={r.id} className={`dev-rec${isOpen ? " open" : ""}${hidden ? " hidden" : ""}`}>
                <div className="dev-rec-main">
                  <button className="dev-rec-title" onClick={() => openRecord(r.id, r.screens[0]?.id)} title={`Edit ${r.id}`}>
                    {r.title || r.id}
                    {list?.active === r.id && <span className="dev-on" title="On the display now"> ●</span>}
                  </button>
                  <span className={`dev-badge ${b.cls}`}>{b.text}</span>
                </div>
                {r.screens.length > 1 && (
                  <div className="dev-screens">
                    {r.screens.map((s) => (
                      <button key={s.id} className={`dev-chip${isOpen && open?.screenId === s.id ? " on" : ""}`} onClick={() => openRecord(r.id, s.id)}>
                        {s.title || s.id}
                      </button>
                    ))}
                  </div>
                )}
                <div className="dev-rec-ops">
                  <button className="dev-icon" disabled={busy || i === 0} onClick={() => idx && void putIndex(moveRecord(list!, r.id, -1))} title="Move up" aria-label="Move up">↑</button>
                  <button className="dev-icon" disabled={busy || i === records.length - 1} onClick={() => idx && void putIndex(moveRecord(list!, r.id, 1))} title="Move down" aria-label="Move down">↓</button>
                  <label className="dev-check" title="Show this record in the swipe carousel">
                    <input type="checkbox" checked={!hidden} disabled={busy} onChange={() => idx && void putIndex(toggleHidden(list!, r.id))} /> in carousel
                  </label>
                  <label className="dev-check" title="Home screen (boot, swipe down, HOME)">
                    <input type="radio" name="home" checked={!!home && r.screens.some((s) => s.id === home)} disabled={busy}
                      onChange={() => idx && r.screens[0] && void putIndex(setDefaultScreen(list!, r.screens[0].id))} /> home
                  </label>
                  {r.source !== "embedded" && (
                    <button className="dev-link" disabled={busy} onClick={() => onDelete(r)}>
                      {r.overridesEmbedded ? "Reset to built-in" : "Delete"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          {open?.isNew && (
            <li className="dev-rec open"><div className="dev-rec-main"><span className="dev-rec-title">{open.title}</span><span className="dev-badge custom">new, not saved</span></div></li>
          )}
        </ul>
        <div className="dev-foot">
          <button className="dev-btn" disabled={busy || !list} onClick={onNew}>+ New screen</button>
          <button className="dev-btn danger" disabled={busy} onClick={onFactory}>Factory reset</button>
        </div>
        {message && <div className={`dev-msg${message.bad ? " bad" : ""}`} role="status">{message.text}</div>}
      </aside>
      <main className="dev-main">
        {open && store && manifest ? (
          <>
            <div className="dev-bar">
              <button className="dev-btn" onClick={closeRecord}>← Screens</button>
              <span className="dev-bar-title">{open.recordId}{open.screenId && open.screenId !== open.recordId ? ` / ${open.screenId}` : ""} · {className}</span>
              <button className="dev-btn primary" disabled={busy} onClick={() => void onShow()}>Show on display</button>
            </div>
            <div className="dev-editor">
              <MidlEditor
                key={`${open.recordId}:${open.screenId ?? ""}:${open.key}`}
                ref={editorRef}
                store={store}
                provider={provider}
                manifest={manifestSource}
                initialId={open.recordId}
                targetClass={className}
                onSaved={onSaved}
                deviceLint={false}
              />
            </div>
          </>
        ) : (
          <div className="dev-empty">
            <p>Pick a screen to edit. Saving a built-in screen keeps your version on the display; "Reset to built-in" brings the original back.</p>
            {manifest && <p className="dim">{manifest.board} · {className} · MIDL {manifest.midl}</p>}
          </div>
        )}
      </main>
    </div>
  );
}
