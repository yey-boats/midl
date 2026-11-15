// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Same-origin client for the display's MIDL records HTTP API (firmware
// yey-boats/instruments docs/midl/midl-only.md). The device editor page is
// served by the display itself, so every call is a relative `/api/midl/...`
// URL. Auth is the display's web Basic auth, handled by the browser: a 401 is
// surfaced as DeviceApiError code "auth" and no credential is stored in JS.

import type { Manifest } from "@yey-boats/midl";

export type RecordSource = "embedded" | "manager" | "local";

export interface RecordScreen {
  id: string;
  title?: string;
}

export interface RecordSummary {
  id: string;
  title: string;
  source: RecordSource;
  hash: string;
  /** True when this manager/local record shadows a built-in with the same id. */
  overridesEmbedded?: boolean;
  screens: RecordScreen[];
}

export interface MidlIndex {
  order: string[];
  defaultScreen?: string;
  hidden: string[];
}

export interface RecordList {
  active?: string;
  screen?: string;
  index: MidlIndex;
  records: RecordSummary[];
}

export interface DeviceRecord {
  id: string;
  title: string;
  source: RecordSource;
  hash: string;
  doc: Record<string, unknown>;
}

export interface PutResult {
  ok: boolean;
  id: string;
  hash: string;
  source?: RecordSource;
  screens?: string[];
}

export interface LiveSnapshot {
  t?: number;
  values: Record<string, number | string | null>;
  locals: Record<string, number | string | null>;
}

/** Device error: HTTP status + the firmware's stable `error` code. */
export class DeviceApiError extends Error {
  status: number;
  code: string;
  /** JSON pointer for 422 invalid_doc. */
  path?: string;
  /** 409 screen_id_conflict: the record that already owns `screen`. */
  conflictWith?: string;
  screen?: string;
  record?: string;
  constructor(status: number, code: string, message: string, extra: Partial<DeviceApiError> = {}) {
    super(message);
    this.name = "DeviceApiError";
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const RECORD_ID_RE = /^[a-z0-9_-]{1,32}$/;

/** Human sentence for a device error (what the editor shows in its error bar). */
export function describeDeviceError(e: DeviceApiError): string {
  switch (e.code) {
    case "auth":
      return "The display refused the request (401). Sign in on the display's web page, then retry.";
    case "invalid_doc":
      return `The display rejected the screen: ${e.message}${e.path ? ` (at ${e.path})` : ""}`;
    case "screen_id_conflict":
      return `Screen id "${e.screen ?? "?"}" is already used by record "${e.conflictWith ?? "?"}". Screen ids must be unique on the display.`;
    case "too_large":
      return "The screen is too large for the display (48 KB document limit).";
    case "store_full":
      return "The display's record store is full. Delete a record first.";
    case "embedded_record":
      return "This is a built-in screen; there is nothing to delete.";
    case "network":
      return `The display did not answer: ${e.message}`;
    default:
      return e.message || `HTTP ${e.status}`;
  }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const DEFAULT_CODES: Record<number, string> = {
  400: "bad_request",
  401: "auth",
  404: "not_found",
  409: "conflict",
  413: "too_large",
  422: "invalid_doc",
  507: "store_full",
};

export class DeviceApi {
  private fetchImpl: FetchLike;
  private base: string;

  constructor(opts: { fetch?: FetchLike; base?: string } = {}) {
    this.fetchImpl = opts.fetch ?? ((i, init) => fetch(i, init));
    this.base = opts.base ?? "";
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };
    let res: Response;
    try {
      res = await this.fetchImpl(this.base + path, init);
    } catch (err) {
      throw new DeviceApiError(0, "network", err instanceof Error ? err.message : String(err));
    }
    const data = await readJson(res);
    if (!res.ok) {
      const o = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
      // 401 is always "auth" whatever the body says (bad_manager_token etc.).
      const code = res.status === 401
        ? "auth"
        : typeof o.error === "string" ? o.error : DEFAULT_CODES[res.status] ?? "http_error";
      const message = typeof o.message === "string"
        ? o.message
        : typeof data === "string" && data ? data : `HTTP ${res.status}`;
      throw new DeviceApiError(res.status, code, message, {
        path: typeof o.path === "string" ? o.path : undefined,
        conflictWith: typeof o.conflictWith === "string" ? o.conflictWith : undefined,
        screen: typeof o.screen === "string" ? o.screen : undefined,
        record: typeof o.record === "string" ? o.record : undefined,
      });
    }
    return data as T;
  }

  getManifest(): Promise<Manifest> {
    return this.request<Manifest>("GET", "/api/midl/manifest");
  }

  async listRecords(): Promise<RecordList> {
    const r = await this.request<RecordList>("GET", "/api/midl/records");
    return {
      ...r,
      index: {
        order: r.index?.order ?? [],
        defaultScreen: r.index?.defaultScreen,
        hidden: r.index?.hidden ?? [],
      },
      records: r.records ?? [],
    };
  }

  getRecord(id: string): Promise<DeviceRecord> {
    return this.request<DeviceRecord>("GET", `/api/midl/records/${encodeURIComponent(id)}`);
  }

  putRecord(
    id: string,
    input: { title?: string; doc: unknown },
    opts: { activate?: boolean; screen?: string } = {},
  ): Promise<PutResult> {
    const q: string[] = [];
    if (opts.activate) q.push("activate=1");
    if (opts.activate && opts.screen) q.push(`screen=${encodeURIComponent(opts.screen)}`);
    const qs = q.length ? `?${q.join("&")}` : "";
    return this.request<PutResult>("PUT", `/api/midl/records/${encodeURIComponent(id)}${qs}`, {
      title: input.title,
      doc: input.doc,
    });
  }

  deleteRecord(id: string): Promise<{ ok: boolean; id: string }> {
    return this.request("DELETE", `/api/midl/records/${encodeURIComponent(id)}`);
  }

  putIndex(index: MidlIndex): Promise<{ ok: boolean; indexHash?: string }> {
    const body: Record<string, unknown> = { order: index.order, hidden: index.hidden };
    if (index.defaultScreen) body.defaultScreen = index.defaultScreen;
    return this.request("PUT", "/api/midl/index", body);
  }

  resetFactory(): Promise<{ ok: boolean }> {
    return this.request("POST", "/api/midl/reset?to=factory");
  }

  /** Show a screen without writing anything (the firmware's ShowScreen funnel
   *  loads the owning record). Used by "Show on display" when nothing changed. */
  showScreen(screenId: string): Promise<unknown> {
    return this.request("POST", `/api/screen/${encodeURIComponent(screenId)}`);
  }

  live(paths: string[], locals: string[]): Promise<LiveSnapshot> {
    const q: string[] = [];
    if (paths.length) q.push(`paths=${paths.map(encodeURIComponent).join(",")}`);
    if (locals.length) q.push(`locals=${locals.map(encodeURIComponent).join(",")}`);
    return this.request<LiveSnapshot>("GET", `/api/midl/live${q.length ? `?${q.join("&")}` : ""}`);
  }
}
