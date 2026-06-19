import { test, expect } from "vitest";
import { validateDocument, expand } from "@yey-boats/midl";

test("can import @yey-boats/midl via the vite alias", () => {
  expect(typeof validateDocument).toBe("function");
  expect(expand({ preset: "full", slots: ["x"] })).toEqual({ element: "x" });
});
