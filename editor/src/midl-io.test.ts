// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { parseMidl, serializeMidl } from "./midl-io";
import { EditorError } from "./model";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "__fixtures__");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf-8");
}

// Helper: round-trip parseMidl(serializeMidl(parseMidl(src))) must deep-equal parseMidl(src)
function assertRoundTrip(src: string, fmt?: "yaml" | "json"): void {
  const model1 = parseMidl(src);
  const serialized = serializeMidl(model1, fmt);
  const model2 = parseMidl(serialized);
  expect(model2).toEqual(model1);
}

describe("parseMidl", () => {
  it("parses navigation.midl.yaml into an EditorModel with correct shape", () => {
    const src = loadFixture("navigation.midl.yaml");
    const model = parseMidl(src);

    expect(model.screenId).toBe("nav");
    expect(model.title).toBe("Course");
    expect(model.midl).toBe("1.0.0");
    expect(Object.keys(model.elements)).toEqual(
      expect.arrayContaining(["dtw", "btw", "cog", "xte"])
    );
  });

  it("captures element type, name, format, and bindings from navigation fixture", () => {
    const src = loadFixture("navigation.midl.yaml");
    const model = parseMidl(src);

    const dtw = model.elements["dtw"];
    expect(dtw.type).toBe("single-value");
    expect(dtw.name).toBe("DTW");
    expect(dtw.format).toEqual({ unit: "nm" });
    expect(dtw.bindings?.["value"]).toEqual({
      kind: "signalk",
      path: "navigation.courseGreatCircle.nextPoint.distance",
    });

    // compass with raw binding (no format)
    const cog = model.elements["cog"];
    expect(cog.type).toBe("compass");
    expect(cog.format).toBeUndefined();
    expect(cog.bindings?.["value"]).toEqual({
      kind: "signalk",
      path: "navigation.courseOverGroundTrue",
    });
    expect(cog.bindings?.["dir"]).toEqual({
      kind: "signalk",
      path: "navigation.courseOverGroundTrue",
    });
  });

  it("captures layout grid from navigation fixture", () => {
    const src = loadFixture("navigation.midl.yaml");
    const model = parseMidl(src);

    expect(model.layout.rows).toBe(2);
    expect(model.layout.cols).toBe(2);
    expect(model.layout.cells).toHaveLength(4);
    expect(model.layout.cells[0]).toEqual({ element: "dtw" });
    expect(model.layout.cells[2]).toEqual({ element: "cog" });
  });

  it("captures variants from navigation fixture", () => {
    const src = loadFixture("navigation.midl.yaml");
    const model = parseMidl(src);

    expect(model.variants).toHaveLength(1);
    expect(model.variants[0].class).toBe("square-480");
    expect(model.variants[0].layout.rows).toBe(2);
    expect(model.variants[0].layout.cols).toBe(2);
  });

  it("captures trend element with format and bindings from electrical fixture", () => {
    const src = loadFixture("electrical.midl.yaml");
    const model = parseMidl(src);

    const solar = model.elements["solar"];
    expect(solar.type).toBe("trend");
    expect(solar.format).toEqual({ unit: "W" });
    expect(solar.bindings?.["value"]).toEqual({
      kind: "signalk",
      path: "electrical.solar.0.panelPower",
    });

    // soc has no format
    const soc = model.elements["soc"];
    expect(soc.format).toBeUndefined();
  });

  it("throws EditorError for a doc with no screens", () => {
    const noScreens = "midl: 1.0.0\nscreens: []\n";
    expect(() => parseMidl(noScreens)).toThrow(EditorError);
  });

  it("throws EditorError for a doc with more than one screen", () => {
    const twoScreens = `midl: 1.0.0
screens:
  - id: a
    elements: {}
    layout:
      rows: 1
      cols: 1
      cells: []
  - id: b
    elements: {}
    layout:
      rows: 1
      cols: 1
      cells: []
`;
    expect(() => parseMidl(twoScreens)).toThrow(EditorError);
  });
});

describe("round-trip stability (yaml)", () => {
  it("navigation.midl.yaml is a fixed point through yaml round-trip", () => {
    assertRoundTrip(loadFixture("navigation.midl.yaml"), "yaml");
  });

  it("electrical.midl.yaml is a fixed point through yaml round-trip", () => {
    assertRoundTrip(loadFixture("electrical.midl.yaml"), "yaml");
  });

  it("wind-steering.midl.yaml is a fixed point through yaml round-trip", () => {
    assertRoundTrip(loadFixture("wind-steering.midl.yaml"), "yaml");
  });
});

describe("round-trip stability (json)", () => {
  it("navigation.midl.yaml is a fixed point through json round-trip", () => {
    assertRoundTrip(loadFixture("navigation.midl.yaml"), "json");
  });

  it("electrical.midl.yaml is a fixed point through json round-trip", () => {
    assertRoundTrip(loadFixture("electrical.midl.yaml"), "json");
  });
});

describe("specific element survival round-trip", () => {
  it("element with NO format survives round-trip", () => {
    const src = loadFixture("navigation.midl.yaml");
    const model1 = parseMidl(src);
    // cog has no format
    expect(model1.elements["cog"].format).toBeUndefined();

    const model2 = parseMidl(serializeMidl(model1, "yaml"));
    expect(model2.elements["cog"].format).toBeUndefined();
    expect(model2.elements["cog"]).toEqual(model1.elements["cog"]);
  });

  it("compass with raw bindings (value + dir) survives round-trip", () => {
    const src = loadFixture("navigation.midl.yaml");
    const model1 = parseMidl(src);

    const model2 = parseMidl(serializeMidl(model1, "yaml"));
    expect(model2.elements["cog"].bindings).toEqual(model1.elements["cog"].bindings);
  });

  it("trend element with format and bindings survives round-trip", () => {
    const src = loadFixture("electrical.midl.yaml");
    const model1 = parseMidl(src);

    const model2 = parseMidl(serializeMidl(model1, "yaml"));
    expect(model2.elements["solar"]).toEqual(model1.elements["solar"]);
  });
});

describe("document-level meta (docMeta) round-trip", () => {
  it("parseMidl captures doc.meta from navigation fixture into model.docMeta", () => {
    const src = loadFixture("navigation.midl.yaml");
    const model = parseMidl(src);

    expect(model.docMeta).toBeDefined();
    expect(model.docMeta?.title).toBe("Navigation");
    expect(model.docMeta?.description).toContain("waypoint");
    expect(model.docMeta?.tags).toEqual(expect.arrayContaining(["navigation", "course"]));
    expect(model.docMeta?.agentNotes).toBeDefined();
  });

  it("docMeta survives yaml round-trip for navigation fixture (deep-equal)", () => {
    const src = loadFixture("navigation.midl.yaml");
    const model1 = parseMidl(src);
    const model2 = parseMidl(serializeMidl(model1, "yaml"));

    expect(model2.docMeta).toEqual(model1.docMeta);
  });

  it("docMeta survives json round-trip for electrical fixture (deep-equal)", () => {
    const src = loadFixture("electrical.midl.yaml");
    const model1 = parseMidl(src);
    const model2 = parseMidl(serializeMidl(model1, "json"));

    expect(model2.docMeta).toEqual(model1.docMeta);
    expect(model1.docMeta?.title).toBe("Electrical");
    expect(model1.docMeta?.tags).toEqual(expect.arrayContaining(["electrical", "battery"]));
  });

  it("doc without top-level meta produces undefined docMeta and no spurious meta on round-trip", () => {
    const noMeta = `midl: 1.0.0
screens:
  - id: test
    elements: {}
    layout:
      rows: 1
      cols: 1
      cells: []
`;
    const model1 = parseMidl(noMeta);
    expect(model1.docMeta).toBeUndefined();

    const model2 = parseMidl(serializeMidl(model1, "yaml"));
    expect(model2.docMeta).toBeUndefined();
  });

  it("full model deep-equal round-trip is preserved for wind-steering (docMeta included)", () => {
    assertRoundTrip(loadFixture("wind-steering.midl.yaml"), "yaml");
  });
});

describe("screen-level meta (screenMeta) round-trip", () => {
  it("parseMidl captures screen.meta.useCase into model.screenMeta from navigation fixture", () => {
    const src = loadFixture("navigation.midl.yaml");
    const model = parseMidl(src);

    expect(model.screenMeta).toBeDefined();
    expect((model.screenMeta as Record<string, unknown>)["useCase"]).toBe(
      "Watch progress toward the active waypoint."
    );
  });

  it("screen.meta.useCase survives a source→model→source→model round-trip (navigation fixture)", () => {
    const src = loadFixture("navigation.midl.yaml");
    const model1 = parseMidl(src);
    const serialized = serializeMidl(model1, "yaml");
    const model2 = parseMidl(serialized);

    expect((model2.screenMeta as Record<string, unknown> | undefined)?.["useCase"]).toBe(
      (model1.screenMeta as Record<string, unknown> | undefined)?.["useCase"]
    );
  });

  it("screen.meta.useCase survives round-trip for electrical fixture", () => {
    const src = loadFixture("electrical.midl.yaml");
    const model1 = parseMidl(src);

    expect((model1.screenMeta as Record<string, unknown> | undefined)?.["useCase"]).toBeDefined();

    const model2 = parseMidl(serializeMidl(model1, "yaml"));
    expect(model2.screenMeta).toEqual(model1.screenMeta);
  });

  it("screenMeta is undefined when screen has no extra meta beyond title", () => {
    const noExtraMeta = `midl: 1.0.0
screens:
  - id: test
    meta:
      title: Just Title
    elements: {}
    layout:
      rows: 1
      cols: 1
      cells: []
`;
    const model = parseMidl(noExtraMeta);
    expect(model.screenMeta).toBeUndefined();
  });
});

describe("wind-steering flow-layout fixture", () => {
  it("parseMidl succeeds on flow-based layout (no grid)", () => {
    const src = loadFixture("wind-steering.midl.yaml");
    // wind-steering uses flow: row layout, not grid — we store it as a single-cell grid or pass-through
    // EditorModel.layout must round-trip: whatever shape we choose, serialize→parse must be equal
    const model = parseMidl(src);
    expect(model.screenId).toBe("dash");
    expect(Object.keys(model.elements)).toEqual(
      expect.arrayContaining(["wind", "sog", "hdg"])
    );
  });
});

describe("colSpan/rowSpan grid cell round-trip", () => {
  it("parseMidl captures colSpan and rowSpan from grid cell YAML", () => {
    const src = `midl: 1.0.0
screens:
  - id: test
    meta:
      title: Span Test
    elements:
      sog:
        type: single-value
        bindings:
          value:
            kind: signalk
            path: navigation.speedOverGround
    layout:
      rows: 2
      cols: 2
      cells:
        - element: sog
          colSpan: 2
          rowSpan: 2
        - {}
        - {}
        - {}
`;
    const model = parseMidl(src);
    const layout = model.layout as { rows: number; cols: number; cells: Array<{ element?: string; colSpan?: number; rowSpan?: number }> };
    expect(layout.cells[0].colSpan).toBe(2);
    expect(layout.cells[0].rowSpan).toBe(2);
    // Cells with no span should have no colSpan/rowSpan
    expect(layout.cells[1].colSpan).toBeUndefined();
    expect(layout.cells[1].rowSpan).toBeUndefined();
  });

  it("serializeMidl emits colSpan/rowSpan in grid cells when non-default", () => {
    const src = `midl: 1.0.0
screens:
  - id: test
    meta:
      title: Span Test
    elements:
      sog:
        type: single-value
        bindings:
          value:
            kind: signalk
            path: navigation.speedOverGround
    layout:
      rows: 2
      cols: 2
      cells:
        - element: sog
          colSpan: 2
        - {}
        - {}
        - {}
`;
    const model = parseMidl(src);
    const yaml = serializeMidl(model, "yaml");
    expect(yaml).toContain("colSpan: 2");
    // rowSpan should not appear (default 1 omitted)
    expect(yaml).not.toContain("rowSpan");
  });

  it("colSpan/rowSpan survive a full serializeMidl→parseMidl round-trip", () => {
    const src = `midl: 1.0.0
screens:
  - id: test
    meta:
      title: Span Test
    elements:
      sog:
        type: single-value
        bindings:
          value:
            kind: signalk
            path: navigation.speedOverGround
    layout:
      rows: 2
      cols: 2
      cells:
        - element: sog
          colSpan: 2
          rowSpan: 2
        - {}
        - {}
        - {}
`;
    assertRoundTrip(src, "yaml");
    const model = parseMidl(src);
    const yaml = serializeMidl(model, "yaml");
    const reparsed = parseMidl(yaml);
    const layout = reparsed.layout as { rows: number; cols: number; cells: Array<{ element?: string; colSpan?: number; rowSpan?: number }> };
    expect(layout.cells[0].colSpan).toBe(2);
    expect(layout.cells[0].rowSpan).toBe(2);
  });
});
