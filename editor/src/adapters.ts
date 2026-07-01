// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import type { Manifest } from "@yey-boats/midl";

// ── Contract types ─────────────────────────────────────────────────────────────

// A structured reference to a dashboard in the store.
// The store generates the id server-side; it is opaque to clients.
// Mirrors the `DashboardRef` shape from the midl-kdcube API contract.
export interface DashboardRef {
  id: string;
  /** The tenant/project/user-scoped storage path prefix (server-derived; read-only). */
  source?: string;
}

// Mirrors dashboards_list item from the contract.
export interface DashboardSummary {
  id: string;
  title: string;
  description?: string;
  tags: string[];
  targetClass: string;
  revision: string;
  updatedAt: string;
}

// The metadata block returned by dashboard_get.
export interface Meta {
  title?: string;
  description?: string;
  tags?: string[];
  targetClass?: string;
  revision?: string;
  updatedAt?: string;
  createdAt?: string;
  validatorVersion?: string;
  [k: string]: unknown;
}

// ── Validation types ───────────────────────────────────────────────────────────

export interface Issue {
  path: string;
  message: string;
  severity?: "error" | "warning";
}

export interface Validation {
  ok: boolean;
  issues: Issue[];
}

// ── Adapter interfaces ─────────────────────────────────────────────────────────

export interface DashboardStoreAdapter {
  /** List dashboards, optionally filtered by targetClass. */
  list(opts?: { targetClass?: string }): Promise<DashboardSummary[]>;
  /** Fetch a single dashboard by id. */
  get(id: string): Promise<{ ref: DashboardRef; doc: string; metadata: Meta }>;
  /** Save (create or update) a dashboard. */
  save(input: {
    id?: string;
    source: string;
    name: string;
    targetClass: string;
    expectedRevision?: string;
  }): Promise<{ ref: DashboardRef; validation: Validation }>;
  /** Delete a dashboard. Requires expectedRevision for conflict detection. */
  remove(input: { id: string; expectedRevision: string }): Promise<{ id: string }>;
  /** Clone a catalogue or user dashboard under a new name. */
  clone(input: { from: DashboardRef; name: string }): Promise<{ ref: DashboardRef }>;
  /** "full" supports all mutations; "single" is read-only or restricted (e.g. embedded). */
  readonly capabilities: "full" | "single";
}

export interface ManifestSource {
  get(targetClass: string): Promise<Manifest>;
}

export interface EditorAuth {
  whoami(): Promise<{ userKey?: string } | null>;
}

// ── Live data re-exports ───────────────────────────────────────────────────────

export type { DataProvider, ResolvedValue } from "@yey-boats/midl-web";
// Convenience alias matching the task spec naming convention.
import type { DataProvider } from "@yey-boats/midl-web";
export type LiveDataProvider = DataProvider;

// ── Live path source — feature-detected on providers ──────────────────────────

/** Single entry in the live path catalogue. */
export interface PathInfo {
  path: string;
  value: unknown;
  sourceUnit?: string;
  updatedAt: number;
  /** True when the value was set by inject() rather than received from live deltas. */
  injected?: boolean;
}

/**
 * Optional capability that a DataProvider may expose.
 * createSignalKProvider satisfies this interface.
 * Feature-detected at runtime — cast to this type if the provider has these methods.
 */
export interface LivePathSource {
  /** All paths seen so far (live deltas + injected), sorted by path. */
  knownPaths(): PathInfo[];
  /**
   * Overlay a session value for a path.
   * Injected values are ephemeral (never persisted).
   * getValue() returns the injected value when present.
   */
  inject(path: string, value: unknown, sourceUnit?: string): void;
  /**
   * Subscribe to path catalogue changes (new paths, value updates).
   * Returns an unsubscribe function.
   */
  onChange(cb: () => void): () => void;
}

// ── Typed errors ───────────────────────────────────────────────────────────────

/** Thrown by adapter implementations when an optimistic-concurrency revision check fails.
 *  Maps to the contract's `code:"revision_conflict"` error (retryable: true). */
export class RevisionConflict extends Error {
  constructor(message = "Revision conflict — retry with the latest revision") {
    super(message);
    this.name = "RevisionConflict";
  }
}

/** Thrown by adapter implementations for all other store errors.
 *  `code` mirrors the contract's stable error codes. */
export class StoreError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "StoreError";
    this.code = code;
  }
}
