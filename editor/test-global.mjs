// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Smoke-test for the self-contained IIFE bundle.
// Run with: node editor/test-global.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const bundlePath = fileURLToPath(new URL("./dist-global/midl-editor.global.js", import.meta.url));
const src = readFileSync(bundlePath, "utf8");

// --- String-content assertions (always run) ---

const sizeKB = src.length / 1024;
console.log(`Bundle size: ${sizeKB.toFixed(1)} KB`);
if (sizeKB < 50) throw new Error(`Bundle too small: ${sizeKB.toFixed(1)} KB`);
console.log("  ✓ size > 50 KB");

if (!src.includes("MidlEditor")) throw new Error('Bundle missing "MidlEditor" string');
console.log('  ✓ contains "MidlEditor"');

// Check that react is NOT referenced as an external require/import
if (/require\(["']react["']\)/.test(src)) throw new Error('Bundle has external require("react") — React not inlined!');
console.log('  ✓ no external require("react")');

if (/require\(["']@yey-boats/.test(src)) throw new Error('Bundle has external require("@yey-boats/...") — midl packages not inlined!');
console.log('  ✓ no external require("@yey-boats/...")');

// --- jsdom eval assertions ---
let jsdomAvailable = false;
try {
  const require = createRequire(import.meta.url);
  const { JSDOM } = require("jsdom");
  jsdomAvailable = true;

  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    runScripts: "dangerously",
    url: "http://localhost/",
  });

  // Evaluate the IIFE inside the jsdom window
  const scriptEl = dom.window.document.createElement("script");
  scriptEl.textContent = src;
  dom.window.document.body.appendChild(scriptEl);

  const exports = dom.window.MidlEditor;
  if (!exports || typeof exports !== "object") throw new Error("window.MidlEditor is not an object");
  console.log("  ✓ window.MidlEditor is an object");

  if (typeof exports.MidlEditor !== "function") throw new Error("window.MidlEditor.MidlEditor is not a function");
  console.log("  ✓ window.MidlEditor.MidlEditor is a function");

  if (typeof exports.parseMidl !== "function") throw new Error("window.MidlEditor.parseMidl is not a function");
  console.log("  ✓ window.MidlEditor.parseMidl is a function");

  if (typeof exports.sanitizeSvg !== "function") throw new Error("window.MidlEditor.sanitizeSvg is not a function");
  console.log("  ✓ window.MidlEditor.sanitizeSvg is a function");

  if (typeof exports.serializeMidl !== "function") throw new Error("window.MidlEditor.serializeMidl is not a function");
  console.log("  ✓ window.MidlEditor.serializeMidl is a function");

  if (typeof exports.validateModel !== "function") throw new Error("window.MidlEditor.validateModel is not a function");
  console.log("  ✓ window.MidlEditor.validateModel is a function");

  if (!exports.layoutOps || typeof exports.layoutOps !== "object") throw new Error("window.MidlEditor.layoutOps is not an object");
  console.log("  ✓ window.MidlEditor.layoutOps is an object");

  if (typeof exports.mount !== "function") throw new Error("window.MidlEditor.mount is not a function");
  console.log("  ✓ window.MidlEditor.mount is a function");

  if (typeof exports.parseDoc !== "function") throw new Error("window.MidlEditor.parseDoc is not a function");
  console.log("  ✓ window.MidlEditor.parseDoc is a function");

  if (typeof exports.toCanonicalJson !== "function") throw new Error("window.MidlEditor.toCanonicalJson is not a function");
  console.log("  ✓ window.MidlEditor.toCanonicalJson is a function");

  if (typeof exports.createSignalKProvider !== "function") throw new Error("window.MidlEditor.createSignalKProvider is not a function");
  console.log("  ✓ window.MidlEditor.createSignalKProvider is a function");

} catch (e) {
  if (!jsdomAvailable) {
    console.log("  (jsdom not available — skipping eval assertions, string checks passed)");
  } else {
    throw e;
  }
}

console.log("\nAll assertions passed. Bundle is self-contained and exposes MidlEditor API.");
