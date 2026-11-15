// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// DashboardStoreAdapter over ONE device record, so the existing MidlEditor can
// edit a display screen unchanged.
//
// The editor edits a single screen; a record may hold several. The adapter
// hands the editor a one-screen doc (the record's top-level keys + the chosen
// screen) and splices the edited screen back into the record on save. The
// record hash is the editor's "revision": before a write the adapter re-reads
// the record and raises RevisionConflict when it changed on the display (the
// editor then offers Reload / Overwrite).
//
// Saving a built-in ("embedded") record writes a record with the same id,
// which the display stores as an override. Deleting it restores the built-in.

import { parseDoc, validateDocument } from "@yey-boats/midl";
import type { Manifest } from "@yey-boats/midl";
import {
  RevisionConflict,
  StoreError,
  type DashboardRef,
  type DashboardStoreAdapter,
  type DashboardSummary,
  type Meta,
  type Validation,
} from "../adapters";
import { DeviceApi, DeviceApiError, describeDeviceError, type PutResult } from "./device-api";

type Doc = Record<string, unknown> & { screens?: Array<Record<string, unknown>> };

/** Build the one-screen doc the editor edits: every top-level key of the record
 *  doc, with `screens` reduced to the chosen screen. */
export function extractScreenDoc(doc: Doc, screenId?: string): { doc: Doc; index: number } {
  const screens = Array.isArray(doc.screens) ? doc.screens : [];
  let index = screenId ? screens.findIndex((s) => s && s.id === screenId) : 0;
  if (index < 0) index = 0;
  if (!screens[index]) throw new StoreError("bad_doc", "record has no screens");
  return { doc: { ...doc, screens: [screens[index]] }, index };
}

/** Put the edited one-screen doc back into the full record doc at `index`.
 *  Document-level keys (midl, meta, ...) come from the edited doc. */
export function spliceScreenDoc(full: Doc | null, edited: Doc, index: number): Doc {
  const editedScreen = (edited.screens ?? [])[0];
  if (!full || !Array.isArray(full.screens) || full.screens.length <= 1) return edited;
  const screens = full.screens.slice();
  screens[Math.min(index, screens.length - 1)] = editedScreen;
  const { screens: _drop, ...rest } = edited;
  return { ...full, ...rest, screens };
}

type Screen = Record<string, unknown> & { layout?: unknown; variants?: Array<{ class: string; layout: unknown }> };

/** The display renders its own class's variant layout. The editor's visual
 *  mode edits the BASE layout, so on open the device-class variant is lifted
 *  into the base layout (and removed); on save it is put back at the same
 *  position with the edited layout. Other classes' variants are untouched.
 *  Returns the variant's position, or -1 when the screen has none. */
export function liftClassVariant(screen: Screen, className: string): { screen: Screen; at: number } {
  const vs = Array.isArray(screen.variants) ? screen.variants : [];
  const at = vs.findIndex((v) => v && v.class === className);
  if (at < 0) return { screen, at };
  const rest = vs.filter((_, i) => i !== at);
  const out: Screen = { ...screen, layout: vs[at].layout };
  if (rest.length) out.variants = rest;
  else delete out.variants;
  return { screen: out, at };
}

export function restoreClassVariant(screen: Screen, className: string, at: number): Screen {
  if (at < 0) return screen;
  const vs = Array.isArray(screen.variants) ? screen.variants.slice() : [];
  if (vs.some((v) => v && v.class === className)) return screen; // edited in Source mode
  vs.splice(Math.min(at, vs.length), 0, { class: className, layout: screen.layout });
  return { ...screen, variants: vs };
}

/** Validate a whole record doc against the device manifest + class. */
export function validateRecordDoc(doc: unknown, manifest: Manifest, className: string): Validation {
  try {
    const r = validateDocument(JSON.stringify(doc), manifest, className);
    return {
      ok: r.ok,
      issues: r.issues.map((i) => ({ path: i.path, message: i.message, severity: i.severity })),
    };
  } catch (err) {
    return { ok: false, issues: [{ path: "", message: String(err) }] };
  }
}

export interface RecordStoreOpts {
  api: DeviceApi;
  manifest: Manifest;
  className: string;
  recordId: string;
  /** Screen of the record to edit (default: the first). */
  screenId?: string;
  /** Doc used when the record does not exist on the display yet (new record). */
  seed?: Doc;
  /** Record title for a new record (else the doc/screen title). */
  title?: string;
}

export interface SaveOpts {
  activate?: boolean;
  screen?: string;
  /** Skip the revision check (editor "Overwrite"). */
  force?: boolean;
  expectedRevision?: string;
}

export interface RecordStore extends DashboardStoreAdapter {
  /** Save a full one-screen doc (object or MIDL text) outside the editor's
   *  Save button, e.g. "Show on display" with unsaved edits. */
  saveDoc(source: string | Doc, title: string | undefined, opts?: SaveOpts): Promise<PutResult>;
  /** Screen id the editor is editing (after load). */
  screenId(): string | undefined;
  /** Hash of the record as last read or written ("" for a new record). */
  revision(): string | undefined;
}

function docTitle(doc: Doc): string | undefined {
  const meta = doc.meta as Record<string, unknown> | undefined;
  if (meta && typeof meta.title === "string") return meta.title;
  const s = doc.screens?.[0];
  if (s) {
    if (typeof s.title === "string") return s.title;
    const sm = s.meta as Record<string, unknown> | undefined;
    if (sm && typeof sm.title === "string") return sm.title;
  }
  return undefined;
}

function toStoreError(err: unknown): Error {
  if (err instanceof DeviceApiError) return new StoreError(err.code, describeDeviceError(err));
  return err instanceof Error ? err : new Error(String(err));
}

export function createRecordStore(opts: RecordStoreOpts): RecordStore {
  const { api, manifest, className, recordId } = opts;
  let screenIndex = 0;
  let editedScreenId: string | undefined = opts.screenId;
  let hash: string | undefined;
  let recordTitle: string | undefined = opts.title;
  let multiScreen = false;
  let liftedAt = -1;

  async function fetchRecord(): Promise<{ doc: Doc; hash: string; title?: string } | null> {
    try {
      const r = await api.getRecord(recordId);
      return { doc: r.doc as Doc, hash: r.hash, title: r.title };
    } catch (err) {
      if (err instanceof DeviceApiError && err.status === 404) return null;
      throw toStoreError(err);
    }
  }

  async function saveDoc(source: string | Doc, title: string | undefined, so: SaveOpts = {}): Promise<PutResult> {
    let edited: Doc;
    try {
      edited = (typeof source === "string" ? parseDoc(source) : source) as Doc;
    } catch (err) {
      throw new StoreError("bad_doc", `Not a MIDL document: ${err instanceof Error ? err.message : String(err)}`);
    }
    // Re-read: revision check + the other screens of a multi-screen record.
    const current = await fetchRecord();
    const expected = so.expectedRevision ?? hash;
    if (!so.force && current && expected && current.hash !== expected) {
      throw new RevisionConflict("The screen was changed on the display since you opened it.");
    }
    if (Array.isArray(edited.screens) && edited.screens[0]) {
      edited = { ...edited, screens: [restoreClassVariant(edited.screens[0] as Screen, className, liftedAt)] };
    }
    const full = spliceScreenDoc(current?.doc ?? null, edited, screenIndex);

    const v = validateRecordDoc(full, manifest, className);
    if (!v.ok) {
      const errs = v.issues.filter((i) => i.severity !== "warning");
      throw new StoreError(
        "invalid_doc",
        `Not valid for this display (${className}): ` +
          errs.slice(0, 3).map((i) => `${i.path || "/"} ${i.message}`).join("; "),
      );
    }

    // Single-screen records take the editor's name; multi-screen ones keep the
    // record title (the editor's name is the screen's title).
    const t = multiScreen ? (recordTitle ?? current?.title) : (title ?? recordTitle ?? current?.title ?? docTitle(full));
    try {
      const res = await api.putRecord(recordId, { title: t, doc: full }, {
        activate: so.activate,
        screen: so.screen ?? (so.activate ? editedScreenId : undefined),
      });
      hash = res.hash;
      recordTitle = t;
      return res;
    } catch (err) {
      throw toStoreError(err);
    }
  }

  const store: RecordStore = {
    capabilities: "single",

    async list(): Promise<DashboardSummary[]> {
      try {
        const l = await api.listRecords();
        return l.records.map((r) => ({
          id: r.id, title: r.title, tags: [r.source], targetClass: className, revision: r.hash, updatedAt: "",
        }));
      } catch (err) {
        throw toStoreError(err);
      }
    },

    async get(_id: string): Promise<{ ref: DashboardRef; doc: string; metadata: Meta }> {
      const rec = await fetchRecord();
      let full: Doc;
      if (rec) {
        full = rec.doc;
        hash = rec.hash;
        recordTitle = recordTitle ?? rec.title;
      } else if (opts.seed) {
        full = opts.seed;
        hash = "";
      } else {
        throw new StoreError("not_found", `No record "${recordId}" on the display.`);
      }
      multiScreen = Array.isArray(full.screens) && full.screens.length > 1;
      const { doc, index } = extractScreenDoc(full, editedScreenId);
      screenIndex = index;
      const lifted = liftClassVariant(doc.screens![0] as Screen, className);
      liftedAt = lifted.at;
      doc.screens = [lifted.screen];
      editedScreenId = (doc.screens?.[0]?.id as string | undefined) ?? editedScreenId;
      return {
        ref: { id: recordId, source: rec ? "device" : "new" },
        doc: JSON.stringify(doc),
        metadata: { title: recordTitle, revision: hash, targetClass: className },
      };
    },

    async save(input) {
      const res = await saveDoc(input.source, input.name, {
        expectedRevision: input.expectedRevision,
        // The editor's "Overwrite" saves without an expected revision.
        force: input.expectedRevision === undefined,
      });
      return {
        ref: { id: recordId, source: res.source },
        validation: { ok: true, issues: [] },
        revision: res.hash,
      };
    },

    async remove(): Promise<{ id: string }> {
      try {
        await api.deleteRecord(recordId);
        return { id: recordId };
      } catch (err) {
        throw toStoreError(err);
      }
    },

    async clone(): Promise<{ ref: DashboardRef }> {
      throw new StoreError("unsupported", "Use New record on the screen list.");
    },

    saveDoc,
    screenId: () => editedScreenId,
    revision: () => hash,
  };
  return store;
}
