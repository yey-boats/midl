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
