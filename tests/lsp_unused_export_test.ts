// Project-wide unused-export hints (Track D / B17 extension).
//
// Tests for `buildUnusedExportUseMap` and `unusedExportHints` in
// `lsp/src/moduleGraph.ts`. These are the two pure functions that power the
// debounced workspace pass; they accept an injected in-memory reader (same
// pattern as the cross-file tests in `lsp_crossfile_test.ts`) so no real
// filesystem is needed and no timers are involved.
//
// Fixture design (multi-file in-memory):
//   util.vl      — exports `add` (referenced by main.vl) and `secret` (never used)
//   main.vl      — imports and calls `add`; exports `main` (used locally too)
//   orphan.vl    — exports `orphan` (never used anywhere)
//   local.vl     — exports `localOnly`; uses it within its own file (never imported)
//   recursive.vl — exports `fib` which calls itself (local use), never imported
//
// Two-signal hint design (per ExportRefCounts { cross, local }):
//   cross == 0 && local == 0  → fully dead   → grey the export NAME  (unused-export)
//   cross == 0 && local  > 0  → redundant    → grey the `export` KEYWORD (redundant-export)
//   cross  > 0               → real export  → no hint
//
// Scenarios tested:
//   1. An export referenced by a sibling (cross > 0) → NO hint.
//   2. An export referenced nowhere (cross=0, local=0) → hint on its name.
//   3. An export used only within its own module (cross=0, local>0) → hint on `export` keyword.
//   4. A non-exported unused local is still handled by the normal lint (not this pass).
//   5. Use-map split counts (cross / local) are correct.
//   6. Recursive export: calls itself → local>0, never imported → keyword hint.
//
// Run: deno test -A --no-check tests/lsp_unused_export_test.ts

import type { ModuleReader } from "../compiler/modules.ts";
import {
  buildUnusedExportUseMap,
  unusedExportHints,
} from "../lsp/src/moduleGraph.ts";

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

const memoryReader = (files: Record<string, string>): ModuleReader =>
  (key: string) => files[key];

// ── Fixtures ──────────────────────────────────────────────────────────────────

// util.vl: exports `add` (used by main) and `secret` (used nowhere).
const UTIL = `export function add(a: i32, b: i32) {
  return a + b
}
export function secret() {
  return 42
}
`;

// main.vl: imports and uses `add`; exports `main` which uses `add` locally.
const MAIN = `import { add } from "./util"

export function main() {
  return add(1, 2)
}
`;

// orphan.vl: exports `orphan` which is never used anywhere.
const ORPHAN = `export function orphan() {
  return 0
}
`;

// local.vl: exports `localOnly` AND uses it within the same file, never imported.
// New design: cross=0, local>0 → redundant-export hint on the `export` keyword.
const LOCAL = `export function localOnly() {
  return 99
}

function helper() {
  return localOnly()
}
`;

// recursive.vl: exports `fib` which calls itself (local use) but is never imported.
// cross=0, local>0 → redundant-export hint on the `export` keyword.
const RECURSIVE = `export function fib(n: i32): i32 {
  if n <= 1 {
    return n
  }
  return fib(n - 1) + fib(n - 2)
}
`;

const ALL_FILES = {
  "/proj/util.vl": UTIL,
  "/proj/main.vl": MAIN,
  "/proj/orphan.vl": ORPHAN,
  "/proj/local.vl": LOCAL,
};

// ── (1) Build the use-map and verify split entry counts ───────────────────────

Deno.test("buildUnusedExportUseMap: seeds all exports at {0,0} then increments", async () => {
  const read = memoryReader(ALL_FILES);
  const allFiles = Object.keys(ALL_FILES);
  const useMap = await buildUnusedExportUseMap(allFiles, read);

  // util.vl should have entries for both its exports.
  const utilMap = useMap.get("/proj/util.vl");
  assert(utilMap !== undefined, "util.vl must appear in use-map");

  // `add` is imported by main.vl → cross count ≥ 1.
  const addCounts = utilMap!.get("add");
  assert(addCounts !== undefined, "add must have an entry");
  assert(
    addCounts!.cross >= 1,
    `add should have cross ≥ 1; got cross=${addCounts!.cross}`,
  );

  // `secret` is never imported or used anywhere → both counts = 0.
  const secretCounts = utilMap!.get("secret");
  assert(secretCounts !== undefined, "secret must have an entry");
  assert(
    secretCounts!.cross === 0,
    `secret should have cross=0; got ${secretCounts!.cross}`,
  );
  assert(
    secretCounts!.local === 0,
    `secret should have local=0; got ${secretCounts!.local}`,
  );
});

Deno.test("buildUnusedExportUseMap: locally-used export has local count > 0 and cross count = 0", async () => {
  const read = memoryReader(ALL_FILES);
  const allFiles = Object.keys(ALL_FILES);
  const useMap = await buildUnusedExportUseMap(allFiles, read);

  const localMap = useMap.get("/proj/local.vl");
  assert(localMap !== undefined, "local.vl must appear in use-map");

  // `localOnly` is called within local.vl itself → local ≥ 1, cross = 0 (no importer).
  const counts = localMap!.get("localOnly");
  assert(counts !== undefined, "localOnly must have an entry");
  assert(
    counts!.local >= 1,
    `localOnly is used in its own module; expected local ≥ 1, got ${counts!.local}`,
  );
  assert(
    counts!.cross === 0,
    `localOnly is never imported; expected cross=0, got ${counts!.cross}`,
  );
});

Deno.test("buildUnusedExportUseMap: export in orphan.vl has both counts = 0", async () => {
  const read = memoryReader(ALL_FILES);
  const allFiles = Object.keys(ALL_FILES);
  const useMap = await buildUnusedExportUseMap(allFiles, read);

  const orphanMap = useMap.get("/proj/orphan.vl");
  assert(orphanMap !== undefined, "orphan.vl must appear in use-map");

  const counts = orphanMap!.get("orphan");
  assert(counts !== undefined, "orphan must have an entry");
  assert(counts!.cross === 0, `orphan cross should be 0; got ${counts!.cross}`);
  assert(counts!.local === 0, `orphan local should be 0; got ${counts!.local}`);
});

// ── (2) unusedExportHints: export referenced by sibling → NO hint ─────────────

Deno.test("unusedExportHints: `add` is imported by a sibling → no hint", async () => {
  const read = memoryReader(ALL_FILES);
  const allFiles = Object.keys(ALL_FILES);
  const useMap = await buildUnusedExportUseMap(allFiles, read);

  const hints = unusedExportHints(UTIL, "/proj/util.vl", useMap);
  const hintNames = hints.map((h) => {
    // Extract the exported name from the hint message.
    const m = h.message.match(/`(\w+)`/);
    return m ? m[1] : "?";
  });

  assert(
    !hintNames.includes("add"),
    `add is used by main.vl; must not be flagged. Hints: ${JSON.stringify(hintNames)}`,
  );
});

// ── (3) unusedExportHints: export referenced nowhere → hint on its name ───────

Deno.test("unusedExportHints: `secret` is never used → name hint (unused-export)", async () => {
  const read = memoryReader(ALL_FILES);
  const allFiles = Object.keys(ALL_FILES);
  const useMap = await buildUnusedExportUseMap(allFiles, read);

  const hints = unusedExportHints(UTIL, "/proj/util.vl", useMap);
  const secretHint = hints.find((h) => h.code === "unused-export" && h.message.includes("`secret`"));

  assert(
    secretHint !== undefined,
    `secret has no references; an unused-export hint must be emitted. Hints: ${
      JSON.stringify(hints.map((h) => h.message))
    }`,
  );
  // Check hint shape.
  assert(secretHint!.severity === "hint", "hint severity must be 'hint'");
  assert(
    secretHint!.code === "unused-export",
    `code must be 'unused-export'; got ${secretHint!.code}`,
  );
  assert(
    secretHint!.source === "vital",
    `source must be 'vital'; got ${secretHint!.source}`,
  );
  assert(
    secretHint!.tags?.includes("unnecessary") === true,
    "hint must be tagged 'unnecessary' for VS Code grey-out",
  );
  assert(
    secretHint!.message === "Exported `secret` is never used in the project",
    `unexpected message: ${secretHint!.message}`,
  );
});

Deno.test("unusedExportHints: `orphan` export → name hint; range points at name", async () => {
  const read = memoryReader(ALL_FILES);
  const allFiles = Object.keys(ALL_FILES);
  const useMap = await buildUnusedExportUseMap(allFiles, read);

  const hints = unusedExportHints(ORPHAN, "/proj/orphan.vl", useMap);
  const nameHint = hints.find((h) => h.code === "unused-export");
  assert(nameHint !== undefined, `expected an unused-export hint; got ${JSON.stringify(hints.map((h) => h.code))}`);
  assert(nameHint!.message.includes("`orphan`"), `message should name 'orphan'; got: ${nameHint!.message}`);
  // The range must be on line 0 (first line of orphan.vl: `export function orphan()`).
  assert(
    nameHint!.range.start.line === 0,
    `range.start.line should be 0; got ${nameHint!.range.start.line}`,
  );
  // The character should point at "orphan" (after "export function ").
  const col = "export function ".length;
  assert(
    nameHint!.range.start.character === col,
    `range.start.character should be ${col}; got ${nameHint!.range.start.character}`,
  );
});

// ── (4) unusedExportHints: locally-used-but-not-imported → keyword hint ───────

Deno.test("unusedExportHints: `localOnly` is used locally but never imported → redundant-export hint on keyword", async () => {
  const read = memoryReader(ALL_FILES);
  const allFiles = Object.keys(ALL_FILES);
  const useMap = await buildUnusedExportUseMap(allFiles, read);

  const hints = unusedExportHints(LOCAL, "/proj/local.vl", useMap);
  const kwHint = hints.find((h) => h.code === "redundant-export");

  assert(
    kwHint !== undefined,
    `localOnly is used locally but never imported; expected a redundant-export hint. Hints: ${
      JSON.stringify(hints.map((h) => ({ code: h.code, msg: h.message })))
    }`,
  );
  // The hint should mention the name.
  assert(
    kwHint!.message.includes("`localOnly`"),
    `message should name 'localOnly'; got: ${kwHint!.message}`,
  );
  // Severity + tags.
  assert(kwHint!.severity === "hint", "redundant-export hint must have severity 'hint'");
  assert(
    kwHint!.tags?.includes("unnecessary") === true,
    "redundant-export hint must be tagged 'unnecessary'",
  );
  assert(kwHint!.source === "vital", `source must be 'vital'; got ${kwHint!.source}`);
  // The range must point at the `export` KEYWORD (column 0, line 0 of local.vl).
  // `export function localOnly()` — `export` is at character 0.
  assert(
    kwHint!.range.start.line === 0,
    `range.start.line should be 0 (the export keyword line); got ${kwHint!.range.start.line}`,
  );
  assert(
    kwHint!.range.start.character === 0,
    `range.start.character should be 0 (the 'e' in 'export'); got ${kwHint!.range.start.character}`,
  );
  // The range should end after "export" (6 chars) on the same line.
  assert(
    kwHint!.range.end.character === "export".length,
    `range.end.character should be ${"export".length} (end of 'export'); got ${kwHint!.range.end.character}`,
  );
  // Crucially: the range must NOT point at the name "localOnly".
  const nameCol = "export function ".length;
  assert(
    kwHint!.range.start.character !== nameCol,
    "range must point at the `export` keyword, not the exported name",
  );
});

Deno.test("unusedExportHints: `localOnly` hint does NOT have code unused-export (only redundant-export)", async () => {
  const read = memoryReader(ALL_FILES);
  const allFiles = Object.keys(ALL_FILES);
  const useMap = await buildUnusedExportUseMap(allFiles, read);

  const hints = unusedExportHints(LOCAL, "/proj/local.vl", useMap);
  const deadHint = hints.find((h) => h.code === "unused-export" && h.message.includes("localOnly"));
  assert(
    deadHint === undefined,
    `localOnly is locally used; must not get an unused-export (dead) hint`,
  );
});

// ── (5) recursive export → keyword hint ───────────────────────────────────────

Deno.test("unusedExportHints: recursive export (self-calling, never imported) → redundant-export hint on keyword", async () => {
  const files = { "/proj/recursive.vl": RECURSIVE };
  const read = memoryReader(files);
  const useMap = await buildUnusedExportUseMap(Object.keys(files), read);

  const hints = unusedExportHints(RECURSIVE, "/proj/recursive.vl", useMap);
  const kwHint = hints.find((h) => h.code === "redundant-export");

  assert(
    kwHint !== undefined,
    `fib calls itself (local use) but is never imported; expected redundant-export hint. Hints: ${
      JSON.stringify(hints.map((h) => h.code))
    }`,
  );
  assert(
    kwHint!.message.includes("`fib`"),
    `message should name 'fib'; got: ${kwHint!.message}`,
  );
  // `export` keyword is at column 0 of line 0.
  assert(kwHint!.range.start.line === 0, `expected line 0; got ${kwHint!.range.start.line}`);
  assert(kwHint!.range.start.character === 0, `expected col 0; got ${kwHint!.range.start.character}`);
  assert(
    kwHint!.range.end.character === "export".length,
    `expected end at col 6; got ${kwHint!.range.end.character}`,
  );
});

// ── (6) Normal lint for non-exported unused locals is unchanged ───────────────
//
// The unused-export pass does NOT interfere with the per-file lint. A
// non-exported unused local inside a function still gets the `unused-variable`
// warning from `lint.ts`. We verify this via `checkDocument` (the normal LSP
// diagnostic path) to confirm no regression.

import { checkDocument } from "../lsp/src/moduleGraph.ts";

Deno.test("regression: non-exported unused local still triggers unused-variable lint", async () => {
  // A file with a local variable inside a function that is never read.
  const source = `function foo() {
  let unused = 1
  return 0
}
print(foo())
`;
  const files = { "/proj/solo.vl": source };
  const read = memoryReader(files);
  const { diagnostics } = await checkDocument(source, "/proj/solo.vl", read);

  const unusedVarDiag = diagnostics.find((d) => d.code === "unused-variable");
  assert(
    unusedVarDiag !== undefined,
    `non-exported unused local must still emit unused-variable; got: ${
      JSON.stringify(diagnostics.map((d) => d.code))
    }`,
  );
});

// ── (7) Single-file: no exports → empty use-map / no hints ───────────────────

Deno.test("buildUnusedExportUseMap: a file with no exports has no use-map entry", async () => {
  const source = "let x = 1\nprint(x)\n";
  const files = { "/proj/noexport.vl": source };
  const read = memoryReader(files);
  const useMap = await buildUnusedExportUseMap(["/proj/noexport.vl"], read);

  const entry = useMap.get("/proj/noexport.vl");
  assert(
    entry === undefined || entry.size === 0,
    "a file with no exports should have an empty or absent use-map entry",
  );

  const hints = unusedExportHints(source, "/proj/noexport.vl", useMap);
  assert(hints.length === 0, `expected 0 hints for a no-export file; got ${hints.length}`);
});

// ── (8) Multi-consumer: export used by MULTIPLE siblings → no hint ────────────

Deno.test("buildUnusedExportUseMap: export used by multiple consumers → cross count > 1", async () => {
  const lib = `export function greet() {
  return 1
}
`;
  const a = `import { greet } from "./lib"
print(greet())
`;
  const b = `import { greet } from "./lib"
print(greet())
`;
  const files = {
    "/proj/lib.vl": lib,
    "/proj/a.vl": a,
    "/proj/b.vl": b,
  };
  const read = memoryReader(files);
  const useMap = await buildUnusedExportUseMap(Object.keys(files), read);

  const libMap = useMap.get("/proj/lib.vl");
  assert(libMap !== undefined, "lib.vl must appear in use-map");
  const counts = libMap!.get("greet");
  assert(counts !== undefined, "greet must have an entry");
  assert(counts!.cross >= 2, `greet used by 2 consumers; expected cross ≥ 2, got ${counts!.cross}`);

  const hints = unusedExportHints(lib, "/proj/lib.vl", useMap);
  const greetHint = hints.find((h) => h.message.includes("`greet`"));
  assert(greetHint === undefined, "greet is used by 2 siblings; must not be flagged");
});

// ── (9) Empty file list → empty use-map / no hints ───────────────────────────

Deno.test("buildUnusedExportUseMap: empty file list yields empty map", async () => {
  const read = memoryReader({});
  const useMap = await buildUnusedExportUseMap([], read);
  assert(useMap.size === 0, "empty file list must yield empty use-map");
});
