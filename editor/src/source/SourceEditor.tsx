// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import React, { useState, useEffect, useRef, useCallback } from "react";
import type { Manifest } from "@yey-boats/midl";
import type { EditorModel } from "../model";
import type { Issue } from "../adapters";
import { parseMidl, serializeMidl } from "../midl-io";
import { validateModel } from "../validate";

// ── SourceEditor ───────────────────────────────────────────────────────────────

export interface SourceEditorProps {
  model: EditorModel;
  manifest: Manifest;
  onModelChange: (m: EditorModel) => void;
}

/**
 * Source (YAML text) editor panel.
 *
 * - Shows a textarea initialized from serializeMidl(model, "yaml").
 * - On change (debounced 250ms) + on blur, tries to parse the text.
 *   - Parse success → calls onModelChange(parsed) and runs validateModel.
 *   - Parse failure → does NOT call onModelChange, shows the error in the issues list.
 * - When the `model` prop identity changes and the textarea is not focused/dirty,
 *   re-serializes the new model into the textarea.
 */
export function SourceEditor({
  model,
  manifest,
  onModelChange,
}: SourceEditorProps): React.JSX.Element {
  // The text currently in the textarea.
  const [text, setText] = useState(() => serializeMidl(model, "yaml"));
  // Validation / parse issues to show below the textarea.
  // Initialize from the current model so issues are visible immediately on mount.
  const [issues, setIssues] = useState<Issue[]>(() => validateModel(model, manifest).issues);
  // Whether the textarea is focused (user is editing).
  const focusedRef = useRef(false);
  // Debounce timer reference.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the last model we serialized into the textarea (to detect external prop changes).
  const lastModelRef = useRef(model);

  // When the model prop changes from outside (e.g. visual→source switch) and the
  // textarea is not focused, re-sync the textarea content.
  useEffect(() => {
    if (model !== lastModelRef.current && !focusedRef.current) {
      const serialized = serializeMidl(model, "yaml");
      setText(serialized);
      lastModelRef.current = model;
      // Recompute issues for the new model.
      const validation = validateModel(model, manifest);
      setIssues(validation.issues);
    }
  }, [model, manifest]);

  // Apply the current text: parse → validate → propagate.
  const applyText = useCallback(
    (value: string) => {
      let parsed: EditorModel;
      try {
        parsed = parseMidl(value);
      } catch (err) {
        // Show parse error; keep last good model.
        setIssues([{ path: "", message: String(err) }]);
        return;
      }
      // Successful parse → update model and run validation.
      lastModelRef.current = parsed;
      onModelChange(parsed);
      const validation = validateModel(parsed, manifest);
      setIssues(validation.issues);
    },
    [onModelChange, manifest],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setText(value);

      // Debounce the apply.
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        applyText(value);
      }, 250);
    },
    [applyText],
  );

  const handleFocus = useCallback(() => {
    focusedRef.current = true;
  }, []);

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      focusedRef.current = false;
      // Cancel any pending debounce and apply immediately on blur.
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      applyText(e.target.value);
    },
    [applyText],
  );

  return (
    <div data-component="source-editor">
      <textarea
        data-testid="source-textarea"
        value={text}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        rows={20}
        style={{ width: "100%", fontFamily: "monospace", fontSize: "13px" }}
      />
      <ul data-testid="source-issues">
        {issues.map((issue, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <li key={i}>
            {issue.path ? <strong>{issue.path}: </strong> : null}
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
