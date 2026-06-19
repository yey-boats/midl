import { validateDocument, parseDoc, expand } from "@yey-boats/midl";
import type { ConfigDoc, Element, Manifest, Node } from "@yey-boats/midl";
import { solveLayout, type Placement, type Rect } from "./solve";

export interface ScreenPlan { screenId: string; placements: Placement[]; }
export interface PreviewResult {
  ok: boolean;
  issues: { path: string; message: string }[];
  screens: ScreenPlan[];
  elements: Record<string, Record<string, Element>>; // screenId -> elementId -> element
}

// Validate the document against the target manifest/class, then for each
// screen pick the class variant (or base), expand presets, and solve rects.
export function previewConfig(text: string, manifest: Manifest, className: string, viewport: Rect): PreviewResult {
  const res = validateDocument(text, manifest, className);
  if (!res.ok) return { ok: false, issues: res.issues, screens: [], elements: {} };

  const doc = parseDoc(text) as ConfigDoc;
  const screens: ScreenPlan[] = [];
  const elements: Record<string, Record<string, Element>> = {};
  for (const screen of doc.screens) {
    const variant = screen.variants?.find((v) => v.class === className);
    const layout: Node = variant ? variant.layout : screen.layout;
    const tree = expand(layout);
    screens.push({ screenId: screen.id, placements: solveLayout(tree, viewport) });
    elements[screen.id] = screen.elements;
  }
  return { ok: true, issues: [], screens, elements };
}
