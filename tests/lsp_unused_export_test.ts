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
//   local.vl     — exports `localOnly`; uses it within its own file (NOT unused)
//
// Scenarios tested:
//   1. An export referenced by a sibling → NO hint.
//   2. An export referenced nowhere → hint on its name.
//   3. An export used only within its own module → NO hint (locally used = not dead).
//   4. A non-exported unused local is still handled by the normal lint (not this pass).
//   5. Use-map counts are correct (cross-file refs and local refs both counted).
//
// Design note: the "used locally but not imported" decision:
//   An export that the exporting module itself references is NOT flagged as unused.
//   Only exports with zero references ANYWHERE (local + cross-module) are flagged.
//   Rationale: a locally-used export is not dead code — it fulfils a real role
//   within its own module. The question is "is this symbol ever exercised?", not
//   "does another module import it?".
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

// local.vl: exports `localOnly` AND uses it within the same file.
// Decision: locally-used-but-not-imported = NOT unused → no hint.
const LOCAL = `export function localOnly() {
  return 99
}

function helper() {
  return localOnly()
}
`;

const ALL_FILES = {
  "/proj/util.vl": UTIL,
  "/proj/main.vl": MAIN,
  "/proj/orphan.vl": ORPHAN,
  "/proj/local.vl": LOCAL,
};

// ── (1) Build the use-map and verify entry counts ────────────────────────────

Deno.test("buildUnusedExportUseMap: seeds all exports at count 0 then increments", async () => {
  const read = memoryReader(ALL_FILES);
  const allFiles = Object.keys(ALL_FILES);
  const useMap = await buildUnusedExportUseMap(allFiles, read);

  // util.vl should have entries for both its exports.
  const utilMap = useMap.get("/proj/util.vl");
  assert(utilMap !== undefined, "util.vl must appear in use-map");

  // `add` is imported + called in main.vl → count ≥ 1.
  const addCount = utilMap!.get("add") ?? 0;
  assert(addCount >= 1, `add should be referenced; got count ${addCount}`);

  // `secret` is never imported or used anywhere → count = 0.
  const secretCount = utilMap!.get("secret") ?? 0;
  assert(secretCount === 0, `secret should have 0 refs; got ${secretCount}`);
});

Deno.test("buildUnusedExportUseMap: locally-used export is counted (non-zero)", async () => {
  const read = memoryReader(ALL_FILES);
  const allFiles = Object.keys(ALL_FILES);
  const useMap = await buildUnusedExportUseMap(allFiles, read);

  const localMap = useMap.get("/proj/local.vl");
  assert(localMap !== undefined, "local.vl must appear in use-map");

  // `localOnly` is called within local.vl itself → count ≥ 1.
  const count = localMap!.get("localOnly") ?? 0;
  assert(
    count >= 1,
    `localOnly is used in its own module; expected count ≥ 1, got ${count}`,
  );
});

Deno.test("buildUnusedExportUseMap: export in orphan.vl has count 0", async () => {
  const read = memoryReader(ALL_FILES);
  const allFiles = Object.keys(ALL_FILES);
  const useMap = await buildUnusedExportUseMap(allFiles, read);

  const orphanMap = useMap.get("/proj/orphan.vl");
  assert(orphanMap !== undefined, "orphan.vl must appear in use-map");

  const count = orphanMap!.get("orphan") ?? 0;
  assert(count === 0, `orphan export should have 0 refs; got ${count}`);
});

// ── (2) unusedExportHints: export referenced by sibling → NO hint ────────────

Deno.test("unusedExportHints: `add` is imported by a sibling → no hint", async () => {
  const read = memoryReader(ALL_FILES);
  const allFiles = Object.keys(ALL_FILES);
  const useMap = await buildUnusedExportUseMap(allFiles, read);

  const hints = unusedExportHints(UTIL, "/proj/util.vl", useMap);
  const hintNames = hints.map((h) => {
    // Extract the exported name from the hint message.
    const m = h.message.match(/Exported `(\w+)`/);
    return m ? m[1] : "?";
  });

  assert(
    !hintNames.includes("add"),
    `add is used by main.vl; must not be flagged. Hints: ${JSON.stringify(hintNames)}`,
  );
});

// ── (3) unusedExportHints: export referenced nowhere → hint on its name ──────

Deno.test("unusedExportHints: `secret` is never used → hint", async () => {
  const read = memoryReader(ALL_FILES);
  const allFiles = Object.keys(ALL_FILES);
  const useMap = await buildUnusedExportUseMap(allFiles, read);

  const hints = unusedExportHints(UTIL, "/proj/util.vl", useMap);
  const secretHint = hints.find((h) => h.message.includes("`secret`"));

  assert(
    secretHint !== undefined,
    `secret has no references; a hint must be emitted. Hints: ${
      JSON.stringify(hints.map((h) => h.message))
    }`,
  );
  // Check hint shape: severity hint, tag unnecessary, code unused-export.
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
  // Message matches the expected format.
  assert(
    secretHint!.message === "Exported `secret` is never used in the project",
    `unexpected message: ${secretHint!.message}`,
  );
});

Deno.test("unusedExportHints: `orphan` export → hint; range points at name", async () => {
  const read = memoryReader(ALL_FILES);
  const allFiles = Object.keys(ALL_FILES);
  const useMap = await buildUnusedExportUseMap(allFiles, read);

  const hints = unusedExportHints(ORPHAN, "/proj/orphan.vl", useMap);
  assert(hints.length === 1, `expected 1 hint; got ${hints.length}`);
  const h = hints[0];
  assert(h.message.includes("`orphan`"), `message should name 'orphan'; got: ${h.message}`);
  // The range must be on line 0 (first line of orphan.vl: `export function orphan()`).
  assert(
    h.range.start.line === 0,
    `range.start.line should be 0; got ${h.range.start.line}`,
  );
  // The character should point at "orphan" (after "export function ").
  const col = "export function ".length;
  assert(
    h.range.start.character === col,
    `range.start.character should be ${col}; got ${h.range.start.character}`,
  );
});

// ── (4) unusedExportHints: locally-used export → NO hint ─────────────────────

Deno.test("unusedExportHints: `localOnly` is used in its own file → no hint", async () => {
  const read = memoryReader(ALL_FILES);
  const allFiles = Object.keys(ALL_FILES);
  const useMap = await buildUnusedExportUseMap(allFiles, read);

  const hints = unusedExportHints(LOCAL, "/proj/local.vl", useMap);
  const hintNames = hints.map((h) => {
    const m = h.message.match(/Exported `(\w+)`/);
    return m ? m[1] : "?";
  });

  assert(
    !hintNames.includes("localOnly"),
    `localOnly is used within its own file; must not be flagged. Hints: ${JSON.stringify(hintNames)}`,
  );
});

// ── (5) Normal lint for non-exported unused locals is unchanged ───────────────
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

// ── (6) Single-file: no exports → empty use-map / no hints ───────────────────

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

// ── (7) Multi-consumer: export used by MULTIPLE siblings → no hint ────────────

Deno.test("buildUnusedExportUseMap: export used by multiple consumers → count > 1", async () => {
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
  const count = libMap!.get("greet") ?? 0;
  assert(count >= 2, `greet used by 2 consumers; expected count ≥ 2, got ${count}`);

  const hints = unusedExportHints(lib, "/proj/lib.vl", useMap);
  const greetHint = hints.find((h) => h.message.includes("`greet`"));
  assert(greetHint === undefined, "greet is used by 2 siblings; must not be flagged");
});

// ── (8) Empty file list → empty use-map / no hints ───────────────────────────

Deno.test("buildUnusedExportUseMap: empty file list yields empty map", async () => {
  const read = memoryReader({});
  const useMap = await buildUnusedExportUseMap([], read);
  assert(useMap.size === 0, "empty file list must yield empty use-map");
});
