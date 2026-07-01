// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

import React from "react";
import type { Manifest } from "@yey-boats/midl";

export interface PaletteProps {
  manifest: Manifest;
  onAdd: (type: string) => void;
}

// ── Type metadata ──────────────────────────────────────────────────────────────

interface TypeMeta {
  label: string;
  description: string;
  icon: React.JSX.Element;
}

const W = 14;
const H = 14;

const TYPE_META: Record<string, TypeMeta> = {
  "single-value": {
    label: "Single value",
    description: "Large numeric readout",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <text x="1" y="11" fontSize="10" fill="currentColor" fontFamily="monospace">42</text>
      </svg>
    ),
  },
  "text": {
    label: "Text",
    description: "Label / text",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <text x="2" y="11" fontSize="11" fill="currentColor" fontFamily="sans-serif" fontWeight="bold">T</text>
      </svg>
    ),
  },
  "gauge": {
    label: "Gauge",
    description: "Radial gauge w/ zones",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M2 11 A5 5 0 0 1 12 11" stroke="currentColor" strokeWidth="1.5"/>
        <line x1="7" y1="11" x2="10.5" y2="5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
  "bar": {
    label: "Bar",
    description: "Bar w/ zones",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <rect x="1" y="4" width="12" height="6" rx="2" stroke="currentColor" strokeWidth="1.2"/>
        <rect x="1" y="4" width="7" height="6" rx="2" fill="currentColor" opacity="0.6"/>
      </svg>
    ),
  },
  "compass": {
    label: "Compass",
    description: "Heading / bearing dial",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
        <polygon points="7,2 8.2,7 7,6 5.8,7" fill="currentColor"/>
        <polygon points="7,12 8.2,7 7,8 5.8,7" fill="currentColor" opacity="0.4"/>
      </svg>
    ),
  },
  "windrose": {
    label: "Wind rose",
    description: "Wind dial",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
        <line x1="7" y1="1.5" x2="7" y2="12.5" stroke="currentColor" strokeWidth="0.9"/>
        <line x1="1.5" y1="7" x2="12.5" y2="7" stroke="currentColor" strokeWidth="0.9"/>
        <line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" strokeWidth="0.7" opacity="0.5"/>
        <line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" strokeWidth="0.7" opacity="0.5"/>
      </svg>
    ),
  },
  "trend": {
    label: "Trend",
    description: "Time-series line",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <polyline points="1,11 4,8 7,9 10,5 13,3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round"/>
      </svg>
    ),
  },
  "autopilot": {
    label: "Autopilot",
    description: "Autopilot status + nudge",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
        <circle cx="7" cy="7" r="2" fill="currentColor"/>
        <line x1="7" y1="1.5" x2="7" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  "button": {
    label: "Button",
    description: "Action button",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <rect x="1" y="4" width="12" height="6" rx="2.5" stroke="currentColor" strokeWidth="1.2"/>
        <line x1="5" y1="7" x2="9" y2="7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
};

function getMeta(type: string): TypeMeta {
  return TYPE_META[type] ?? {
    label: type,
    description: "",
    icon: (
      <svg width={W} height={H} viewBox="0 0 14 14" fill="none" aria-hidden>
        <rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/>
      </svg>
    ),
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export function Palette({ manifest, onAdd }: PaletteProps): React.JSX.Element {
  return (
    <div data-component="palette" style={{ display: "flex", flexDirection: "column", gap: "3px", padding: "8px", flex: 1, overflowY: "auto" }}>
      {manifest.elements.map((el) => {
        const meta = getMeta(el.type);
        return (
          <button
            key={el.type}
            data-testid={`palette-${el.type}`}
            onClick={() => onAdd(el.type)}
          >
            {/* Icon */}
            <span style={{ flexShrink: 0, lineHeight: 0, color: "var(--ink-dim, #8aa0b4)" }}>
              {meta.icon}
            </span>
            {/* Label + description */}
            <span style={{ display: "flex", flexDirection: "column", gap: "1px", textAlign: "left", minWidth: 0 }}>
              <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--ink, #cbd6e2)", lineHeight: 1.2 }}>
                {meta.label}
              </span>
              {meta.description && (
                <span style={{ fontSize: "10px", color: "var(--ink-faint, #5b7286)", fontWeight: 400, lineHeight: 1.2 }}>
                  {meta.description}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
