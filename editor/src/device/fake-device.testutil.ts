// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Test double of the display's MIDL records HTTP API (firmware
// docs/midl/midl-only.md), as a fetch function. Test-only (excluded from the
// build and the bundle).

type Doc = { screens?: Array<{ id: string; title?: string }>; meta?: { title?: string } } & Record<string, unknown>;

interface Rec {
  id: string;
  title: string;
  source: "embedded" | "manager" | "local";
  hash: string;
  doc: Doc;
}

export interface FakeCall {
  method: string;
  url: string;
  body?: unknown;
}

let hashSeq = 0;
const mkHash = () => `sha256:${(++hashSeq).toString(16).padStart(8, "0")}`;

export class FakeDevice {
  embedded = new Map<string, Rec>();
  stored = new Map<string, Rec>();
  index: { order: string[]; defaultScreen?: string; hidden: string[] } = { order: [], hidden: [] };
  active = "";
  screen = "";
  calls: FakeCall[] = [];
  manifest: unknown;
  /** live values served by /api/midl/live (missing -> null). */
  liveValues: Record<string, number | string> = {};
  liveLocals: Record<string, number | string> = {};
  /** Force the next N responses of any request to this status. */
  failNext: Array<{ status: number; body?: unknown }> = [];
  /** Reject a PUT whose doc meta.title equals this, as the device validator would. */
  rejectTitle = "device-rejects-me";

  constructor(builtins: Doc[], manifest: unknown) {
    this.manifest = manifest;
    for (const doc of builtins) {
      const id = doc.screens![0].id;
      this.embedded.set(id, { id, title: doc.meta?.title ?? id, source: "embedded", hash: mkHash(), doc });
    }
    const first = [...this.embedded.keys()][0] ?? "";
    this.active = first;
    this.screen = first;
  }

  effective(id: string): Rec | undefined {
    return this.stored.get(id) ?? this.embedded.get(id);
  }

  allIds(): string[] {
    const ids = [...this.embedded.keys()];
    for (const id of [...this.stored.keys()].sort()) if (!ids.includes(id)) ids.push(id);
    return ids;
  }

  private json(status: number, body: unknown): Response {
    return new Response(body === undefined ? "" : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    this.calls.push({ method, url: input, body });
    const f = this.failNext.shift();
    if (f) return this.json(f.status, f.body);

    const u = new URL(input, "http://display.local");
    const p = u.pathname;
    if (p === "/api/midl/manifest" && method === "GET") return this.json(200, this.manifest);
    if (p === "/api/midl/records" && method === "GET") {
      return this.json(200, {
        active: this.active,
        screen: this.screen,
        index: this.index,
        records: this.allIds().map((id) => {
          const r = this.effective(id)!;
          return {
            id, title: r.title, source: r.source, hash: r.hash,
            overridesEmbedded: r.source !== "embedded" && this.embedded.has(id),
            screens: (r.doc.screens ?? []).map((s) => ({ id: s.id, title: s.title ?? s.id })),
          };
        }),
      });
    }
    if (p.startsWith("/api/midl/records/")) {
      const id = decodeURIComponent(p.slice("/api/midl/records/".length));
      if (method === "GET") {
        const r = this.effective(id);
        return r ? this.json(200, r) : this.json(404, { ok: false, error: "not_found", message: "no such record" });
      }
      if (method === "DELETE") {
        if (this.stored.delete(id)) return this.json(200, { ok: true, id });
        if (this.embedded.has(id)) return this.json(404, { ok: false, error: "embedded_record", message: "built-in record", record: id });
        return this.json(404, { ok: false, error: "not_found", message: "no such record" });
      }
      if (method === "PUT") {
        const doc = body?.doc as Doc;
        if (!doc || !Array.isArray(doc.screens)) return this.json(400, { ok: false, error: "bad_doc", message: "doc missing" });
        if (JSON.stringify(doc).length > 48 * 1024) return this.json(413, { ok: false, error: "too_large", message: "doc over 48 KB", record: id });
        if (doc.meta?.title === this.rejectTitle) {
          return this.json(422, { ok: false, error: "invalid_doc", message: "element type not supported", record: id, path: "/screens/0/elements/x/type" });
        }
        for (const s of doc.screens) {
          for (const oid of this.allIds()) {
            if (oid === id) continue;
            if ((this.effective(oid)!.doc.screens ?? []).some((os) => os.id === s.id)) {
              return this.json(409, { ok: false, error: "screen_id_conflict", message: "screen id in use", record: id, conflictWith: oid, screen: s.id });
            }
          }
        }
        const rec: Rec = { id, title: body.title ?? id, source: "local", hash: mkHash(), doc };
        this.stored.set(id, rec);
        if (u.searchParams.get("activate") === "1") {
          this.active = id;
          this.screen = u.searchParams.get("screen") ?? doc.screens[0].id;
        }
        return this.json(200, { ok: true, id, hash: rec.hash, source: rec.source, screens: doc.screens.map((s) => s.id) });
      }
    }
    if (p === "/api/midl/index" && method === "PUT") {
      this.index = { order: body.order ?? [], defaultScreen: body.defaultScreen, hidden: body.hidden ?? [] };
      return this.json(200, { ok: true, indexHash: mkHash() });
    }
    if (p === "/api/midl/reset" && method === "POST") {
      this.stored.clear();
      this.index = { order: [], hidden: [] };
      return this.json(200, { ok: true, reset: "factory" });
    }
    if (p.startsWith("/api/screen/") && method === "POST") {
      const sid = decodeURIComponent(p.slice("/api/screen/".length));
      this.screen = sid;
      return this.json(200, { ok: true });
    }
    if (p === "/api/midl/live" && method === "GET") {
      const paths = (u.searchParams.get("paths") ?? "").split(",").filter(Boolean);
      const locals = (u.searchParams.get("locals") ?? "").split(",").filter(Boolean);
      const values: Record<string, unknown> = {};
      const lv: Record<string, unknown> = {};
      for (const k of paths) values[k] = this.liveValues[k] ?? null;
      for (const k of locals) lv[k] = this.liveLocals[k] ?? null;
      return this.json(200, { t: 12345, values, locals: lv });
    }
    return this.json(404, { ok: false, error: "not_found", message: `no route ${method} ${p}` });
  };
}
