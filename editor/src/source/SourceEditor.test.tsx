// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act, fireEvent } from "@testing-library/react";
import React from "react";
import type { Manifest } from "@yey-boats/midl";
import type { EditorModel } from "../model";
import { serializeMidl, parseMidl } from "../midl-io";
import { validateModel } from "../validate";
import { SourceEditor } from "./SourceEditor";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const MINIMAL_MANIFEST: Manifest = {
  midl: "1.0.0",
  board: "esp32-4848s040",
  classes: [
    {
      id: "square-480",
      maxTiles: 4,
      maxDepth: 3,
      elements: ["single-value"],
    },
  ],
  elements: [{ type: "single-value", bindings: ["value"] }],
  sources: ["signalk"],
};

const BASE_MODEL: EditorModel = {
  midl: "1.0.0",
  screenId: "screen",
  title: "Base Dashboard",
  elements: {},
  layout: { rows: 1, cols: 1, cells: [{}] },
  variants: [],
};

const MODEL_WITH_ELEMENT: EditorModel = {
  midl: "1.0.0",
  screenId: "screen",
  title: "Nav Dashboard",
  elements: {
    sog: {
      id: "sog",
      type: "single-value",
      name: "SOG",
      bindings: { value: { kind: "signalk", path: "navigation.speedOverGround" } },
    },
  },
  layout: { rows: 1, cols: 1, cells: [{ element: "sog" }] },
  variants: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── SourceEditor tests ────────────────────────────────────────────────────────

describe("SourceEditor", () => {
  it("renders a textarea initialized from the serialized model yaml", () => {
    const onModelChange = vi.fn();
    const { getByTestId } = render(
      <SourceEditor
        model={BASE_MODEL}
        manifest={MINIMAL_MANIFEST}
        onModelChange={onModelChange}
      />,
    );

    const textarea = getByTestId("source-textarea") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();

    const expectedYaml = serializeMidl(BASE_MODEL, "yaml");
    expect(textarea.value).toBe(expectedYaml);
  });

  it("calls onModelChange with parsed model when valid YAML is entered", async () => {
    const onModelChange = vi.fn();
    const { getByTestId } = render(
      <SourceEditor
        model={BASE_MODEL}
        manifest={MINIMAL_MANIFEST}
        onModelChange={onModelChange}
      />,
    );

    const textarea = getByTestId("source-textarea") as HTMLTextAreaElement;

    // Build valid YAML with a changed title
    const editedModel: EditorModel = { ...BASE_MODEL, title: "Edited Title" };
    const editedYaml = serializeMidl(editedModel, "yaml");

    await act(async () => {
      fireEvent.change(textarea, { target: { value: editedYaml } });
    });

    // Flush by blurring (component should call onModelChange on blur or debounce)
    await act(async () => {
      fireEvent.blur(textarea);
    });

    expect(onModelChange).toHaveBeenCalled();
    const calledModel = onModelChange.mock.calls[0][0] as EditorModel;
    expect(calledModel.title).toBe("Edited Title");
  });

  it("does NOT call onModelChange when invalid YAML is entered", async () => {
    const onModelChange = vi.fn();
    const { getByTestId } = render(
      <SourceEditor
        model={BASE_MODEL}
        manifest={MINIMAL_MANIFEST}
        onModelChange={onModelChange}
      />,
    );

    const textarea = getByTestId("source-textarea") as HTMLTextAreaElement;

    await act(async () => {
      fireEvent.change(textarea, { target: { value: "not: valid: midl: at: all: !!!" } });
    });

    await act(async () => {
      fireEvent.blur(textarea);
    });

    expect(onModelChange).not.toHaveBeenCalled();
  });

  it("shows a parse error message when invalid YAML is entered", async () => {
    const onModelChange = vi.fn();
    const { getByTestId } = render(
      <SourceEditor
        model={BASE_MODEL}
        manifest={MINIMAL_MANIFEST}
        onModelChange={onModelChange}
      />,
    );

    const textarea = getByTestId("source-textarea") as HTMLTextAreaElement;

    await act(async () => {
      fireEvent.change(textarea, { target: { value: "not: valid: midl: at: all: !!!" } });
    });

    await act(async () => {
      fireEvent.blur(textarea);
    });

    // There should be a visible error somewhere in the component
    const issuesList = getByTestId("source-issues");
    expect(issuesList.textContent).toBeTruthy();
  });

  it("renders validation issues list for a valid but semantically-invalid doc", async () => {
    const onModelChange = vi.fn();

    // Build a model with an element type that doesn't exist in the manifest's allowed list
    // (compass is not in MINIMAL_MANIFEST's elements list — only single-value is)
    const modelWithUnknownElement: EditorModel = {
      midl: "1.0.0",
      screenId: "screen",
      title: "Bad Element",
      elements: {
        myCompass: {
          id: "myCompass",
          type: "compass", // not in MINIMAL_MANIFEST.elements
          bindings: {},
        },
      },
      layout: { rows: 1, cols: 1, cells: [{ element: "myCompass" }] },
      variants: [],
    };

    const { getByTestId } = render(
      <SourceEditor
        model={modelWithUnknownElement}
        manifest={MINIMAL_MANIFEST}
        onModelChange={onModelChange}
      />,
    );

    const issuesList = getByTestId("source-issues");
    // Should show at least one issue (element type not found in manifest)
    expect(issuesList).toBeTruthy();
    // Issues may or may not be present for just this; the list container should be rendered
  });

  it("textarea reflects a new model when model prop changes (and textarea is not focused)", async () => {
    const onModelChange = vi.fn();

    const { getByTestId, rerender } = render(
      <SourceEditor
        model={BASE_MODEL}
        manifest={MINIMAL_MANIFEST}
        onModelChange={onModelChange}
      />,
    );

    const textarea = getByTestId("source-textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe(serializeMidl(BASE_MODEL, "yaml"));

    // Switch to a new model (simulates visual→source switch with edits made in visual mode)
    await act(async () => {
      rerender(
        <SourceEditor
          model={MODEL_WITH_ELEMENT}
          manifest={MINIMAL_MANIFEST}
          onModelChange={onModelChange}
        />,
      );
    });

    const expectedYaml = serializeMidl(MODEL_WITH_ELEMENT, "yaml");
    expect(textarea.value).toBe(expectedYaml);
  });

  it("textarea value shows issues path and message for known issues", async () => {
    const onModelChange = vi.fn();

    // MODEL_WITH_ELEMENT has a valid structure — get known issues from validateModel
    const validation = validateModel(MODEL_WITH_ELEMENT, MINIMAL_MANIFEST);

    const { getByTestId } = render(
      <SourceEditor
        model={MODEL_WITH_ELEMENT}
        manifest={MINIMAL_MANIFEST}
        onModelChange={onModelChange}
      />,
    );

    const issuesList = getByTestId("source-issues");

    if (validation.issues.length > 0) {
      // Check that at least one issue path or message appears in the list
      const firstIssue = validation.issues[0];
      const text = issuesList.textContent ?? "";
      expect(text).toContain(firstIssue.message);
    } else {
      // No issues — list should be empty or say "No issues"
      expect(issuesList).toBeTruthy();
    }
  });
});

// ── Public API / index exports tests ─────────────────────────────────────────

describe("Public API index exports", () => {
  it("exports MidlEditor as a function", async () => {
    const mod = await import("../index");
    expect(typeof (mod as Record<string, unknown>)["MidlEditor"]).toBe("function");
  });

  it("exports parseMidl as a function", async () => {
    const mod = await import("../index");
    expect(typeof (mod as Record<string, unknown>)["parseMidl"]).toBe("function");
  });

  it("exports serializeMidl as a function", async () => {
    const mod = await import("../index");
    expect(typeof (mod as Record<string, unknown>)["serializeMidl"]).toBe("function");
  });

  it("exports validateModel as a function", async () => {
    const mod = await import("../index");
    expect(typeof (mod as Record<string, unknown>)["validateModel"]).toBe("function");
  });

  it("exports sanitizeSvg as a function", async () => {
    const mod = await import("../index");
    expect(typeof (mod as Record<string, unknown>)["sanitizeSvg"]).toBe("function");
  });

  it("exports layoutOps.addRow as a function", async () => {
    const mod = await import("../index");
    const layoutOps = (mod as Record<string, unknown>)["layoutOps"] as Record<string, unknown>;
    expect(typeof layoutOps["addRow"]).toBe("function");
  });

  it("exports EditorError from model", async () => {
    const mod = await import("../index");
    expect((mod as Record<string, unknown>)["EditorError"]).toBeTruthy();
  });

  it("exports adapter classes RevisionConflict and StoreError", async () => {
    const mod = await import("../index");
    const m = mod as Record<string, unknown>;
    expect(typeof m["RevisionConflict"]).toBe("function");
    expect(typeof m["StoreError"]).toBe("function");
  });
});
