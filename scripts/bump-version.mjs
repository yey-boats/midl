#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.
//
// Keep the three published packages in lockstep (midl#17).
//
//   node scripts/bump-version.mjs <version>          set every version + range
//   node scripts/bump-version.mjs --check <version>  verify only (used by CI)
//
// Sets "version" in the root, ts/, web/ and editor/ package.json files, sets
// every @yey-boats/* dependency range in the workspaces to "^<version>", and
// mirrors both into package-lock.json so `npm ci` stays in sync. The check
// mode fails if any of those differ, so a tag can never publish packages whose
// inter-package ranges reject each other (a caret on 0.x is minor-locked:
// ^0.1.0 does not accept 0.2.0).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const WORKSPACES = ["ts", "web", "editor"];
const DEP_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies", "devDependencies"];
const SCOPE = "@yey-boats/";

const args = process.argv.slice(2);
const check = args[0] === "--check";
const version = check ? args[1] : args[0];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("usage: node scripts/bump-version.mjs [--check] <x.y.z[-pre]>");
  process.exit(2);
}
const range = `^${version}`;
const errors = [];

function load(rel) {
  const path = join(root, rel);
  const text = readFileSync(path, "utf8");
  return { path, text, json: JSON.parse(text) };
}
function save({ path, text, json }) {
  // Leave untouched files byte-identical (keeps their hand formatting).
  if (JSON.stringify(json) === JSON.stringify(JSON.parse(text))) return;
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
}

// Apply (or verify) version + scoped ranges on one manifest-shaped object.
function fix(obj, label, { withVersion = true } = {}) {
  if (withVersion && obj.version !== version) {
    if (check) errors.push(`${label}: version ${obj.version} != ${version}`);
    else obj.version = version;
  }
  for (const field of DEP_FIELDS) {
    for (const [name, have] of Object.entries(obj[field] ?? {})) {
      if (!name.startsWith(SCOPE) || have === range) continue;
      if (check) errors.push(`${label}: ${field}["${name}"] = "${have}" (want "${range}")`);
      else obj[field][name] = range;
    }
  }
}

const manifests = [load("package.json"), ...WORKSPACES.map((w) => load(`${w}/package.json`))];
for (const m of manifests) fix(m.json, m.path.slice(root.length));

const lock = load("package-lock.json");
fix(lock.json, "package-lock.json");
for (const key of ["", ...WORKSPACES]) {
  const entry = lock.json.packages?.[key];
  if (!entry) {
    errors.push(`package-lock.json: missing packages["${key}"]`);
    continue;
  }
  fix(entry, `package-lock.json packages["${key}"]`);
}

if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  process.exit(1);
}
if (check) {
  console.log(`ok: all packages at ${version}, @yey-boats/* ranges ${range}`);
} else {
  for (const m of [...manifests, lock]) save(m);
  console.log(`set version ${version} and @yey-boats/* ranges ${range}`);
}
