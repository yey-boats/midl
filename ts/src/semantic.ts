// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

// Semantic (meaning) validation — the SECOND validation pass.
//
// This is deliberately separate from the two other concerns:
//   - structural validation (validate.ts) checks the JSON *shape* against the
//     JSON Schema (right fields, right types, right enums);
//   - capability satisfaction (satisfy.ts) checks a document against a
//     specific *device* manifest (does this board, at this resolution, support
//     these element types / sources / tile counts?).
//
// The semantic pass sits in between: it checks that a document is internally
// *coherent* regardless of any device — element references resolve, ids are
// unique, layout weights/grids are arithmetically consistent, presets are
// known, sources carry the field their kind requires, and known element types
// declare the bindings they need. These are errors a config can have even when
// it is perfectly well-formed JSON and would fit on the largest device.
//
// Every check returns a path-addressed Issue that says what is wrong and how to
// fix it. Hard problems are `severity: "error"`; advisory problems (an
// unregistered element type, used for forward-compat extensibility) are
// `severity: "warning"` and do not make a document inadmissible.

import type { ConfigDoc, Element, Issue, Node, Screen, Source } from "./types";
import { PRESETS } from "./presets";

// Known element types and the bindings they require to render anything
// meaningful. Mirrors the C++ catalog's 9 element types. `button` is an action
// trigger and binds nothing; `compass`/`windrose` require `value` and accept an
// optional `dir` binding (a heading reference). Types absent from this registry
// are *allowed* (extensibility) but produce a warning, not an error.
const ELEMENT_REQUIRED_BINDINGS: Record<string, string[]> = {
  "single-value": ["value"],
  text: ["value"],
  gauge: ["value"],
  bar: ["value"],
  trend: ["value"],
  autopilot: ["value"],
  compass: ["value"],
  windrose: ["value"],
  button: [],
};

function err(path: string, message: string): Issue {
  return { path, message, severity: "error" };
}
function warn(path: string, message: string): Issue {
  return { path, message, severity: "warning" };
}

// Walk a layout node, validating its internal structure (weights vs children,
// grid cells vs rows*cols, preset references) and collecting every leaf
// element id it references so the caller can resolve them against a screen's
// `elements` map. `refs` is filled with { id, path } pairs.
function checkNode(
  n: Node,
  path: string,
  refs: Array<{ id: string; path: string }>,
  issues: Issue[],
): void {
  if (n == null || typeof n !== "object") {
    issues.push(err(path, "layout node must be an object"));
    return;
  }

  if ("element" in n) {
    refs.push({ id: n.element, path });
    return;
  }

  if ("preset" in n) {
    if (!(n.preset in PRESETS)) {
      const known = Object.keys(PRESETS).join(", ");
      issues.push(
        err(
          `${path}/preset`,
          `preset "${n.preset}" is not a known preset; expected one of: ${known}`,
        ),
      );
    }
    // Preset slots are element ids the preset will reference once expanded.
    (n.slots ?? []).forEach((id, i) => refs.push({ id, path: `${path}/slots/${i}` }));
    return;
  }

  if ("children" in n) {
    if (n.weights && n.weights.length !== n.children.length) {
      issues.push(
        err(
          `${path}/weights`,
          `weights length must match children length (${n.weights.length} weights vs ${n.children.length} children); give one weight per child or omit weights`,
        ),
      );
    }
    n.children.forEach((c, i) => checkNode(c, `${path}/children/${i}`, refs, issues));
    return;
  }

  if ("cells" in n) {
    const total = n.rows * n.cols;
    // When any cell carries colSpan/rowSpan, fewer cells can fill the full
    // grid. Compute the effective slot count from declared spans (clamped)
    // to check whether the cells cover the grid without overflow.
    const hasSpans = (n.cells as unknown[]).some(
      (c) =>
        typeof c === "object" && c !== null &&
        (("colSpan" in (c as object) && (c as Record<string, unknown>)["colSpan"] !== 1) ||
         ("rowSpan" in (c as object) && (c as Record<string, unknown>)["rowSpan"] !== 1)),
    );
    if (hasSpans) {
      // With spans: the cells must not overflow the grid (they may under-fill
      // if the user left trailing empty slots, but overflow is always an error).
      const occupied = new Array<boolean>(total).fill(false);
      let slot = 0;
      let overflow = false;
      for (let ci = 0; ci < n.cells.length; ci++) {
        while (slot < total && occupied[slot]) slot++;
        if (slot >= total) { overflow = true; break; }
        const r = Math.floor(slot / n.cols);
        const c = slot % n.cols;
        const raw = n.cells[ci] as Record<string, unknown>;
        const cs = Math.min(typeof raw["colSpan"] === "number" ? (raw["colSpan"] as number) : 1, n.cols - c);
        const rs = Math.min(typeof raw["rowSpan"] === "number" ? (raw["rowSpan"] as number) : 1, n.rows - r);
        for (let dr = 0; dr < rs; dr++)
          for (let dc = 0; dc < cs; dc++)
            occupied[(r + dr) * n.cols + (c + dc)] = true;
      }
      if (overflow) {
        issues.push(
          err(
            `${path}/cells`,
            `grid has more cells than can fit in ${n.rows} * ${n.cols} = ${total} slots after accounting for spans`,
          ),
        );
      }
    } else {
      // No spans: classic row-major check — cells.length must equal rows*cols.
      if (n.cells.length !== total) {
        issues.push(
          err(
            `${path}/cells`,
            `grid cells length must equal rows * cols (${n.rows} * ${n.cols} = ${total}); got ${n.cells.length} cells`,
          ),
        );
      }
    }
    n.cells.forEach((c, i) => checkNode(c, `${path}/cells/${i}`, refs, issues));
    return;
  }

  // Spacer cell: an empty object (or one with only colSpan/rowSpan) is a valid
  // unassigned grid slot. It carries no element reference, emits no issues.
  const keys = Object.keys(n as object);
  if (keys.every(k => k === "colSpan" || k === "rowSpan")) {
    return; // valid spacer
  }

  issues.push(err(path, "layout node is not a recognized kind (element, flow/children, rows/cols/cells, or preset)"));
}

// Validate that every leaf reference resolves to a key in the screen's
// `elements` map.
function checkRefs(
  refs: Array<{ id: string; path: string }>,
  elements: Record<string, Element>,
  issues: Issue[],
): void {
  for (const { id, path } of refs) {
    if (!(id in elements))
      issues.push(err(`${path}/element`, `layout.element "${id}" does not exist in screen.elements`));
  }
}

// Source sanity: a binding's kind must carry a non-empty value of the field its
// kind requires. (Structural schema already enforces presence via if/then; this
// re-checks for non-emptiness and runs even when the doc skipped the schema.)
function checkSource(src: Source | undefined, path: string, issues: Issue[]): void {
  if (!src || typeof src !== "object") return;
  const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
  switch (src.kind) {
    case "signalk":
      if (!nonEmpty(src.path))
        issues.push(err(`${path}/path`, `source.kind "signalk" requires a non-empty path`));
      break;
    case "local":
      if (!nonEmpty(src.id))
        issues.push(err(`${path}/id`, `source.kind "local" requires a non-empty id`));
      break;
    case "computed":
      if (!nonEmpty(src.expr))
        issues.push(err(`${path}/expr`, `source.kind "computed" requires a non-empty expr`));
      break;
    case "const":
      if (!("value" in src))
        issues.push(err(`${path}/value`, `source.kind "const" requires a value`));
      break;
  }
}

// Per-element checks: required bindings for known types, unknown-type warning,
// and source sanity for each declared binding.
function checkElement(id: string, el: Element, path: string, issues: Issue[]): void {
  const required = ELEMENT_REQUIRED_BINDINGS[el.type];
  const bindings = el.bindings ?? {};

  if (required === undefined) {
    issues.push(
      warn(`${path}/type`, `element "${id}" has unregistered type "${el.type}"; required bindings cannot be checked`),
    );
  } else {
    for (const field of required) {
      if (!(field in bindings))
        issues.push(
          err(`${path}/bindings/${field}`, `element "${id}" of type "${el.type}" requires a "${field}" binding`),
        );
    }
  }

  for (const [field, src] of Object.entries(bindings))
    checkSource(src, `${path}/bindings/${field}`, issues);

  checkLimits(id, el, path, issues);
}

// Validate style.range / style.zones arithmetic. `style` is free-form, so these
// only fire when the fields are present and well-shaped:
//   - range must be [lo, hi] with hi > lo (an inverted/zero-width range produces
//     a degenerate gauge/bar fill) — hard error.
//   - each zone threshold (`lt`) should fall within the range — advisory warning
//     (a zone outside the range is silently unreachable at runtime).
function checkLimits(id: string, el: Element, path: string, issues: Issue[]): void {
  const style = (el.style ?? {}) as Record<string, unknown>;
  const range = style.range;
  let lo: number | undefined;
  let hi: number | undefined;
  if (Array.isArray(range) && range.length === 2 && typeof range[0] === "number" && typeof range[1] === "number") {
    lo = range[0];
    hi = range[1];
    if (hi <= lo) {
      issues.push(
        err(`${path}/style/range`, `element "${id}" range [${lo}, ${hi}] is invalid: max must be greater than min`),
      );
    }
  }

  const zones = style.zones;
  if (Array.isArray(zones) && lo !== undefined && hi !== undefined && hi > lo) {
    // Zones select the first band whose `lt` exceeds the value. A threshold at or
    // below the range floor can never be selected (values start at `lo`), so it is
    // dead. A threshold at/above `hi` is the idiomatic top-bucket sentinel (e.g.
    // `lt: 101` for a 0..100 range) and is intentional — do not flag it.
    zones.forEach((z, i) => {
      const lt = (z as { lt?: unknown })?.lt;
      if (typeof lt === "number" && lt <= lo!) {
        issues.push(
          warn(
            `${path}/style/zones/${i}/lt`,
            `element "${id}" zone threshold ${lt} is at or below the range floor ${lo}; it will never apply`,
          ),
        );
      }
    });
  }
}

// Validate one screen's layout (or a class variant's layout): structural node
// checks plus reference resolution against that screen's elements.
function checkLayout(layout: Node, layoutPath: string, screen: Screen, issues: Issue[]): void {
  const refs: Array<{ id: string; path: string }> = [];
  checkNode(layout, layoutPath, refs, issues);
  checkRefs(refs, screen.elements ?? {}, issues);
}

// The semantic pass. Returns path-addressed issues (errors + warnings). A
// document is semantically admissible iff it produces no `error`-severity
// issue.
export function validateSemantics(doc: ConfigDoc): Issue[] {
  const issues: Issue[] = [];
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.screens)) return issues;

  // No duplicate screen.id.
  const seenScreen = new Map<string, number>();
  doc.screens.forEach((screen, si) => {
    if (typeof screen.id === "string") {
      const prev = seenScreen.get(screen.id);
      if (prev !== undefined)
        issues.push(
          err(`/screens/${si}/id`, `duplicate screen.id "${screen.id}" (already used by screens/${prev})`),
        );
      else seenScreen.set(screen.id, si);
    }

    const elements = screen.elements ?? {};
    for (const [id, el] of Object.entries(elements))
      checkElement(id, el, `/screens/${si}/elements/${id}`, issues);

    // Base layout.
    if (screen.layout !== undefined)
      checkLayout(screen.layout, `/screens/${si}/layout`, screen, issues);

    // Each variant must declare a class and a valid layout, and its layout
    // refs resolve against the same screen's elements.
    (screen.variants ?? []).forEach((v, vi) => {
      const vpath = `/screens/${si}/variants/${vi}`;
      if (typeof v.class !== "string" || v.class.trim().length === 0)
        issues.push(err(`${vpath}/class`, "variant must declare a non-empty class"));
      if (v.layout === undefined) issues.push(err(`${vpath}/layout`, "variant must declare a layout"));
      else checkLayout(v.layout, `${vpath}/layout`, screen, issues);
    });
  });

  // No duplicate alarm.id.
  const alarms = (doc.alarms ?? []) as Array<{ id?: string }>;
  const seenAlarm = new Map<string, number>();
  alarms.forEach((al, ai) => {
    if (al && typeof al.id === "string") {
      const prev = seenAlarm.get(al.id);
      if (prev !== undefined)
        issues.push(err(`/alarms/${ai}/id`, `duplicate alarm.id "${al.id}" (already used by alarms/${prev})`));
      else seenAlarm.set(al.id, ai);
    }
  });

  return issues;
}

// Convenience: just the error-severity issues (warnings filtered out).
export function semanticErrors(doc: ConfigDoc): Issue[] {
  return validateSemantics(doc).filter((i) => i.severity !== "warning");
}
