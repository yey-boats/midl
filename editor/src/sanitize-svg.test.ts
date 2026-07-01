// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { sanitizeSvg } from "./sanitize-svg";

// Helper: parse sanitized output into a DOM for querying
function parse(svg: string): Document {
  return new DOMParser().parseFromString(svg, "image/svg+xml");
}

describe("sanitizeSvg — malicious inputs neutralized", () => {
  it("removes <script> elements but keeps sibling <rect>", () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect/></svg>`;
    const out = sanitizeSvg(input);
    const doc = parse(out);
    expect(doc.querySelectorAll("script")).toHaveLength(0);
    expect(doc.querySelectorAll("rect")).toHaveLength(1);
  });

  it("removes onload attribute from <rect> but keeps width attribute", () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg"><rect onload="x()" width="10"/></svg>`;
    const out = sanitizeSvg(input);
    const doc = parse(out);
    const rect = doc.querySelector("rect")!;
    expect(rect).not.toBeNull();
    expect(rect.hasAttribute("onload")).toBe(false);
    expect(rect.getAttribute("width")).toBe("10");
  });

  it("removes javascript: href from <a> but keeps the <a> element and child <text>", () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>y</text></a></svg>`;
    const out = sanitizeSvg(input);
    const doc = parse(out);
    const a = doc.querySelector("a");
    expect(a).not.toBeNull();
    expect(a!.hasAttribute("href")).toBe(false);
    expect(doc.querySelector("text")).not.toBeNull();
  });

  it("removes <foreignObject> elements entirely (including children)", () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div onclick="evil()"></div></foreignObject></svg>`;
    const out = sanitizeSvg(input);
    const doc = parse(out);
    expect(doc.querySelectorAll("foreignObject")).toHaveLength(0);
    expect(doc.querySelectorAll("div")).toHaveLength(0);
  });

  it("removes xlink:href with javascript: scheme from <image>", () => {
    const xlinkNs = "http://www.w3.org/1999/xlink";
    const input = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="${xlinkNs}"><image xlink:href="javascript:evil()"/></svg>`;
    const out = sanitizeSvg(input);
    const doc = parse(out);
    const image = doc.querySelector("image");
    // either the attribute is removed or the element has no xlink:href
    expect(image?.getAttributeNS(xlinkNs, "href") ?? null).toBeNull();
  });

  it("strips all on* event handler attributes across different elements", () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg">
      <g onclick="bad()" onmouseover="bad2()">
        <circle onfocus="bad3()" r="5"/>
      </g>
    </svg>`;
    const out = sanitizeSvg(input);
    const doc = parse(out);
    const g = doc.querySelector("g")!;
    expect(g.hasAttribute("onclick")).toBe(false);
    expect(g.hasAttribute("onmouseover")).toBe(false);
    const circle = doc.querySelector("circle")!;
    expect(circle.hasAttribute("onfocus")).toBe(false);
  });

  it("returns safe empty SVG for a parser-error document", () => {
    const out = sanitizeSvg("<<<not svg at all>>>");
    expect(out).toBe(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`);
  });

  // C1 — uppercase/mixed-case tag names must be removed too
  it("removes <SCRIPT> (uppercase) element", () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg"><SCRIPT>alert(1)</SCRIPT><rect/></svg>`;
    const out = sanitizeSvg(input);
    const doc = parse(out);
    // No element whose lowercased tag is "script"
    const scripts = Array.from(doc.querySelectorAll("*")).filter(
      (el) => el.tagName.toLowerCase() === "script"
    );
    expect(scripts).toHaveLength(0);
    expect(doc.querySelectorAll("rect")).toHaveLength(1);
  });

  it("removes <ForeignObject> (mixed-case) element", () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg"><ForeignObject><div onclick="evil()"></div></ForeignObject></svg>`;
    const out = sanitizeSvg(input);
    const doc = parse(out);
    const fos = Array.from(doc.querySelectorAll("*")).filter(
      (el) => el.tagName.toLowerCase() === "foreignobject"
    );
    expect(fos).toHaveLength(0);
    const divs = Array.from(doc.querySelectorAll("*")).filter(
      (el) => el.tagName.toLowerCase() === "div"
    );
    expect(divs).toHaveLength(0);
  });

  // M2 — data: href stripped on <image> and <use>
  it("strips data: href from <image> element", () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,abc"/></svg>`;
    const out = sanitizeSvg(input);
    const doc = parse(out);
    const image = doc.querySelector("image");
    expect(image).not.toBeNull();
    expect(image!.hasAttribute("href")).toBe(false);
  });

  it("strips data: xlink:href from <use> element", () => {
    const xlinkNs = "http://www.w3.org/1999/xlink";
    const input = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="${xlinkNs}"><use xlink:href="data:text/html;base64,xyz"/></svg>`;
    const out = sanitizeSvg(input);
    const doc = parse(out);
    const useEl = doc.querySelector("use");
    expect(useEl?.getAttributeNS(xlinkNs, "href") ?? null).toBeNull();
  });
});

describe("sanitizeSvg — benign SVG survives structurally unchanged", () => {
  it("keeps all benign elements and geometry/style attributes in a representative renderer SVG", () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:rgb(255,255,0);stop-opacity:1"/>
    </linearGradient>
  </defs>
  <g transform="translate(10,10)" fill="blue" stroke="black">
    <rect x="0" y="0" width="100" height="50" fill="url(#grad1)"/>
    <circle cx="50" cy="50" r="25" stroke-width="2"/>
    <text x="5" y="20" font-size="14">Hello</text>
    <line x1="0" y1="0" x2="100" y2="100" stroke="red"/>
    <polyline points="0,0 50,50 100,0" stroke="green" fill="none"/>
    <path d="M10 10 L90 90" stroke="purple"/>
    <tspan>span</tspan>
  </g>
</svg>`;

    const out = sanitizeSvg(input);
    const doc = parse(out);

    // structural: all expected elements present
    expect(doc.querySelector("svg")).not.toBeNull();
    expect(doc.querySelector("defs")).not.toBeNull();
    expect(doc.querySelector("linearGradient")).not.toBeNull();
    expect(doc.querySelector("stop")).not.toBeNull();
    expect(doc.querySelector("g")).not.toBeNull();
    expect(doc.querySelector("rect")).not.toBeNull();
    expect(doc.querySelector("circle")).not.toBeNull();
    expect(doc.querySelector("text")).not.toBeNull();
    expect(doc.querySelector("line")).not.toBeNull();
    expect(doc.querySelector("polyline")).not.toBeNull();
    expect(doc.querySelector("path")).not.toBeNull();

    // geometry/style attrs on specific elements
    const g = doc.querySelector("g")!;
    expect(g.getAttribute("transform")).toBe("translate(10,10)");
    expect(g.getAttribute("fill")).toBe("blue");
    expect(g.getAttribute("stroke")).toBe("black");

    const rect = doc.querySelector("rect")!;
    expect(rect.getAttribute("x")).toBe("0");
    expect(rect.getAttribute("y")).toBe("0");
    expect(rect.getAttribute("width")).toBe("100");
    expect(rect.getAttribute("height")).toBe("50");
    expect(rect.getAttribute("fill")).toBe("url(#grad1)");

    const circle = doc.querySelector("circle")!;
    expect(circle.getAttribute("cx")).toBe("50");
    expect(circle.getAttribute("cy")).toBe("50");
    expect(circle.getAttribute("r")).toBe("25");

    const line = doc.querySelector("line")!;
    expect(line.getAttribute("x1")).toBe("0");
    expect(line.getAttribute("stroke")).toBe("red");
  });
});
