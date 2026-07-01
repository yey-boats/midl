// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

const SAFE_EMPTY_SVG = `<svg xmlns="http://www.w3.org/2000/svg"></svg>`;

/** Returns true when the attribute value is a javascript: URI. */
function isJavascriptUri(value: string): boolean {
  return /^\s*javascript:/i.test(value);
}

/** Returns true when the attribute value is a data: URI. */
function isDataUri(value: string): boolean {
  return /^\s*data:/i.test(value);
}

/** Elements for which data: href/xlink:href should also be stripped. */
const DATA_HREF_STRIP_TAGS = new Set(["image", "use"]);

/**
 * Removes dangerous content from an SVG string while leaving benign
 * structure and attributes intact.
 *
 * Removed:
 *   - All <script> elements
 *   - All <foreignObject> elements
 *   - Any attribute whose name starts with "on" (event handlers)
 *   - href / xlink:href attributes whose value is a javascript: URI
 *
 * If the input cannot be parsed as valid SVG, returns a safe empty SVG.
 */
export function sanitizeSvg(svg: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, "image/svg+xml");

  // Detect parser error documents (jsdom / browsers inject a <parsererror> element)
  if (doc.querySelector("parsererror")) {
    return SAFE_EMPTY_SVG;
  }

  // Remove <script> and <foreignObject> elements — walk ALL elements and match by
  // lowercase tagName so uppercase/mixed-case variants (e.g. <SCRIPT>, <ForeignObject>)
  // are caught too. (querySelectorAll is case-sensitive in XML documents.)
  const DANGEROUS_TAGS = new Set(["script", "foreignobject"]);
  for (const el of Array.from(doc.querySelectorAll("*"))) {
    if (DANGEROUS_TAGS.has(el.tagName.toLowerCase())) {
      el.parentNode?.removeChild(el);
    }
  }

  // Walk every element and clean dangerous attributes
  for (const el of Array.from(doc.querySelectorAll("*"))) {
    const attrNames = Array.from(el.attributes).map((a) => a.name);
    for (const name of attrNames) {
      const localName = name.includes(":") ? name.split(":").pop()! : name;

      // Remove all event-handler attributes (on*)
      if (localName.startsWith("on")) {
        el.removeAttribute(name);
        continue;
      }

      // Remove href / xlink:href that carry javascript: or (for image/use) data: URIs
      if (localName === "href" || name === "xlink:href") {
        const value = el.getAttribute(name) ?? el.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? "";
        const tagLower = el.tagName.toLowerCase();
        if (isJavascriptUri(value) || (isDataUri(value) && DATA_HREF_STRIP_TAGS.has(tagLower))) {
          el.removeAttribute(name);
        }
      }
    }

    // Also check namespaced xlink:href explicitly
    const xlinkHref = el.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    if (xlinkHref !== null) {
      const tagLower = el.tagName.toLowerCase();
      if (isJavascriptUri(xlinkHref) || (isDataUri(xlinkHref) && DATA_HREF_STRIP_TAGS.has(tagLower))) {
        el.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
      }
    }
  }

  return new XMLSerializer().serializeToString(doc);
}
