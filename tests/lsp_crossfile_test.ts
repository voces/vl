// Cross-file find-references (cross-file LSP / H0 phase 3, Track D).
//
// `crossFileReferences` (`lsp/src/moduleGraph.ts`) gathers a symbol's occurrences
// across the current file, other open documents, AND unopened on-disk siblings
// (the disk crawl), orchestrating the self-hosted checker per candidate. These
// drive that orchestrator + the workspace-enumeration helpers with an injected
// in-memory `ModuleReader` (no filesystem / cwd), since `server.ts` can't load
// under Deno (Node-only `vscode-languageserver`). Cross-file go-to-def / doc-xref
// (the import/export pass) is covered by `tests/lsp_crossfile_wasm_test.ts`.
//
// Run: deno test -A --no-check tests/lsp_crossfile_test.ts

import type { ModuleReader } from "../compiler/coreTypes.ts";
import {
  crossFileReferences,
  detectProjectRoot,
  enumerateWorkspaceFiles,
  type OpenDocument,
  pathToUri,
} from "../lsp/src/moduleGraph.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

const memoryReader = (files: Record<string, string>): ModuleReader =>
  (key: string) => files[key];

// Cross-file find-references runs off the self-hosted checker; load the seed once
// and inject it via `xref`. Absent (fresh clone, no `refresh-compiler.sh`) the
// find-refs tests self-ignore via `refsIgnore` — the convention of the rest of the
// wasm suite. The go-to-def tests use the TS module-graph helpers and need no seed.
const SEED = new URL("../build/vl-compiler.wasm", import.meta.url).pathname;
const refsIgnore = !((() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})());
const checker = refsIgnore ? undefined : loadWasmChecker(SEED, () => {});
const xref = (
  name: string,
  entrySource: string,
  entryKey: string,
  openDocs: OpenDocument[],
  read: ModuleReader,
  includeDeclaration = true,
  diskFiles: string[] = [],
) =>
  crossFileReferences(
    name,
    entrySource,
    entryKey,
    openDocs,
    read,
    checker!,
    includeDeclaration,
    diskFiles,
  );

// ---- (3) cross-file find-references -----------------------------------------

Deno.test({ name: "cross-file find-refs: an exported symbol's references span the open graph", ignore: refsIgnore }, async () => {
  const util = "export function add(a: i32, b: i32) {\n  return a + b\n}\n";
  const main = 'import { add } from "./util"\n\nprint(add(2, 3))\nprint(add(4, 5))\n';
  const files = { "/proj/util.vl": util, "/proj/main.vl": main };
  const open = [
    { uri: pathToUri("/proj/util.vl"), text: util },
    { uri: pathToUri("/proj/main.vl"), text: main },
  ];
  // Cursor on `add` in main.vl (an imported name): references across the graph.
  const refs = await xref(
    "add",
    main,
    "/proj/main.vl",
    open,
    memoryReader(files),
    true,
  );
  assert(refs !== undefined, "an imported symbol must resolve cross-module");
  const byUri = new Map<string, number>();
  for (const r of refs!) byUri.set(r.uri, (byUri.get(r.uri) ?? 0) + 1);
  // util.vl: the declaration of `add`. main.vl: two uses (the import-statement
  // synthetic decl is excluded for the importer).
  assert(
    (byUri.get(pathToUri("/proj/util.vl")) ?? 0) >= 1,
    `util.vl should hold the declaration; got ${JSON.stringify([...byUri])}`,
  );
  assert(
    (byUri.get(pathToUri("/proj/main.vl")) ?? 0) === 2,
    `main.vl should hold two uses; got ${JSON.stringify([...byUri])}`,
  );
});

Deno.test({ name: "cross-file find-refs: resolving from the DECLARING module also finds importers", ignore: refsIgnore }, async () => {
  const util = "export function add(a: i32, b: i32) {\n  return a + b\n}\n";
  const main = 'import { add } from "./util"\n\nprint(add(2, 3))\n';
  const files = { "/proj/util.vl": util, "/proj/main.vl": main };
  const open = [
    { uri: pathToUri("/proj/util.vl"), text: util },
    { uri: pathToUri("/proj/main.vl"), text: main },
  ];
  // Cursor on the `add` DECLARATION in util.vl (an exported local).
  const refs = await xref(
    "add",
    util,
    "/proj/util.vl",
    open,
    memoryReader(files),
    true,
  );
  assert(refs !== undefined, "an exported local must resolve cross-module");
  const uris = new Set(refs!.map((r) => r.uri));
  assert(
    uris.has(pathToUri("/proj/util.vl")) && uris.has(pathToUri("/proj/main.vl")),
    `refs should span both modules; got ${JSON.stringify([...uris])}`,
  );
});

Deno.test({ name: "cross-file find-refs: a purely-local symbol returns undefined (single-file fallback)", ignore: refsIgnore }, async () => {
  const main = 'let only = 1\nprint(only)\nprint(only)\n';
  const files = { "/proj/main.vl": main };
  const refs = await xref(
    "only",
    main,
    "/proj/main.vl",
    [{ uri: pathToUri("/proj/main.vl"), text: main }],
    memoryReader(files),
    true,
  );
  assert(
    refs === undefined,
    "a non-exported local must defer to the single-file references path",
  );
});

// ---- (5) on-disk sibling crawl (H0 phase 3 extension) ----------------------
//
// These tests inject a `diskFiles` list and an in-memory reader to simulate the
// workspace crawl without touching the filesystem.

Deno.test({ name: "on-disk find-refs: a symbol referenced in an UNOPENED on-disk sibling is included", ignore: refsIgnore }, async () => {
  // util.vl exports `add`; main.vl (the entry, treated as open) imports it.
  // consumer.vl also imports and uses `add` but is NOT in the openDocs set —
  // only on the injected reader (simulating an on-disk-only file).
  const util = "export function add(a: i32, b: i32) {\n  return a + b\n}\n";
  const main = 'import { add } from "./util"\n\nprint(add(1, 2))\n';
  const consumer = 'import { add } from "./util"\n\nprint(add(10, 20))\nprint(add(30, 40))\n';
  const files = {
    "/proj/util.vl": util,
    "/proj/main.vl": main,
    "/proj/consumer.vl": consumer,
  };
  const read = memoryReader(files);

  // openDocs includes only main.vl (open in editor); consumer.vl is on-disk only.
  const openDocs = [{ uri: pathToUri("/proj/main.vl"), text: main }];
  // diskFiles lists all three files (as enumerateWorkspaceFiles would), including
  // consumer.vl which is not in openDocs.
  const diskFiles = ["/proj/util.vl", "/proj/main.vl", "/proj/consumer.vl"];

  const refs = await xref(
    "add",
    main,
    "/proj/main.vl",
    openDocs,
    read,
    true,
    diskFiles,
  );

  assert(refs !== undefined, "imported `add` must resolve cross-module");
  const byUri = new Map<string, number>();
  for (const r of refs!) byUri.set(r.uri, (byUri.get(r.uri) ?? 0) + 1);

  // util.vl: the declaration of `add`.
  assert(
    (byUri.get(pathToUri("/proj/util.vl")) ?? 0) >= 1,
    `util.vl should hold the declaration; got ${JSON.stringify([...byUri])}`,
  );
  // main.vl: one use (the import-statement synthetic decl is excluded).
  assert(
    (byUri.get(pathToUri("/proj/main.vl")) ?? 0) >= 1,
    `main.vl should hold a use; got ${JSON.stringify([...byUri])}`,
  );
  // consumer.vl: two uses — this file was NOT open, only on disk.
  assert(
    (byUri.get(pathToUri("/proj/consumer.vl")) ?? 0) === 2,
    `consumer.vl (on-disk only) should hold two uses; got ${JSON.stringify([...byUri])}`,
  );
});

Deno.test({ name: "on-disk find-refs: a file in BOTH openDocs and diskFiles is NOT double-counted", ignore: refsIgnore }, async () => {
  // main.vl is in both openDocs and diskFiles — it must appear exactly once.
  const util = "export function add(a: i32, b: i32) {\n  return a + b\n}\n";
  const main = 'import { add } from "./util"\n\nprint(add(1, 2))\n';
  const files = { "/proj/util.vl": util, "/proj/main.vl": main };
  const read = memoryReader(files);

  const openDocs = [
    { uri: pathToUri("/proj/util.vl"), text: util },
    { uri: pathToUri("/proj/main.vl"), text: main },
  ];
  // diskFiles also lists both files — duplicates must be de-duped.
  const diskFiles = ["/proj/util.vl", "/proj/main.vl"];

  const refs = await xref(
    "add",
    main,
    "/proj/main.vl",
    openDocs,
    read,
    true,
    diskFiles,
  );

  assert(refs !== undefined, "imported `add` must resolve cross-module");
  // Count total refs per URI; each file should appear at most the right number
  // of times (not doubled because it was in both lists).
  const byUri = new Map<string, number>();
  for (const r of refs!) byUri.set(r.uri, (byUri.get(r.uri) ?? 0) + 1);

  const mainCount = byUri.get(pathToUri("/proj/main.vl")) ?? 0;
  assert(
    mainCount === 1,
    `main.vl must appear exactly once (no double-count); got ${mainCount}`,
  );
  const utilCount = byUri.get(pathToUri("/proj/util.vl")) ?? 0;
  assert(
    utilCount >= 1,
    `util.vl should appear (declaration); got ${utilCount}`,
  );
});

Deno.test({ name: "on-disk find-refs: empty diskFiles list behaves like the open-docs-only path", ignore: refsIgnore }, async () => {
  // Without diskFiles the behaviour must be identical to the pre-extension path.
  const util = "export function add(a: i32, b: i32) {\n  return a + b\n}\n";
  const main = 'import { add } from "./util"\n\nprint(add(2, 3))\nprint(add(4, 5))\n';
  const files = { "/proj/util.vl": util, "/proj/main.vl": main };
  const read = memoryReader(files);

  const openDocs = [
    { uri: pathToUri("/proj/util.vl"), text: util },
    { uri: pathToUri("/proj/main.vl"), text: main },
  ];

  const refs = await xref(
    "add",
    main,
    "/proj/main.vl",
    openDocs,
    read,
    true,
    [], // empty — no on-disk crawl
  );

  assert(refs !== undefined, "imported `add` must resolve cross-module");
  const byUri = new Map<string, number>();
  for (const r of refs!) byUri.set(r.uri, (byUri.get(r.uri) ?? 0) + 1);
  assert(
    (byUri.get(pathToUri("/proj/util.vl")) ?? 0) >= 1,
    `util.vl should hold the declaration`,
  );
  assert(
    (byUri.get(pathToUri("/proj/main.vl")) ?? 0) === 2,
    `main.vl should hold two uses; got ${byUri.get(pathToUri("/proj/main.vl"))}`,
  );
});

// ---- (6) workspace enumeration helpers --------------------------------------

Deno.test("enumerateWorkspaceFiles: lists .vl files and skips excluded dirs", () => {
  // Simulate a directory tree:
  //   /proj/
  //     main.vl
  //     util.vl
  //     node_modules/   ← skipped
  //       lib.vl
  //     sub/
  //       helper.vl
  const tree: Record<string, string[]> = {
    "/proj": ["main.vl", "util.vl", "node_modules", "sub"],
    "/proj/node_modules": ["lib.vl"],
    "/proj/sub": ["helper.vl"],
  };
  const listDir = (dir: string): string[] => tree[dir] ?? [];
  const isDir = (path: string): boolean => path in tree;

  const files = enumerateWorkspaceFiles("/proj", listDir, isDir);
  const names = files.map((f) => f.replace("/proj/", "")).sort();

  assert(names.includes("main.vl"), "main.vl should be found");
  assert(names.includes("util.vl"), "util.vl should be found");
  assert(names.includes("sub/helper.vl"), "sub/helper.vl should be found");
  assert(
    !names.some((n) => n.includes("node_modules")),
    "node_modules must be skipped",
  );
});

Deno.test("detectProjectRoot: walks up to the directory containing deno.json", () => {
  // Simulate:
  //   /workspace/           ← has deno.json
  //     src/
  //       module.vl         ← fromPath
  const tree: Record<string, string[]> = {
    "/workspace": ["deno.json", "src"],
    "/workspace/src": ["module.vl"],
  };
  const listDir = (dir: string): string[] => tree[dir] ?? [];

  const root = detectProjectRoot("/workspace/src/module.vl", listDir);
  assert(
    root === "/workspace",
    `should detect /workspace as root; got ${root}`,
  );
});

Deno.test("detectProjectRoot: falls back to immediate parent when no sentinel found", () => {
  // No deno.json / package.json / .git anywhere in the walk.
  const listDir = (_dir: string): string[] => [];

  const root = detectProjectRoot("/a/b/c/file.vl", listDir);
  assert(
    root === "/a/b/c",
    `should fall back to immediate parent /a/b/c; got ${root}`,
  );
});

// ---- (7) REGRESSION: single-file find-refs unchanged after extension ---------

Deno.test({ name: "regression: single-file find-refs (no exports) unchanged with disk extension", ignore: refsIgnore }, async () => {
  // A purely-local symbol must still return undefined (triggering single-file
  // fallback in the caller), even when diskFiles is supplied.
  const main = "let only = 1\nprint(only)\nprint(only)\n";
  const files = { "/proj/main.vl": main };
  const refs = await xref(
    "only",
    main,
    "/proj/main.vl",
    [{ uri: pathToUri("/proj/main.vl"), text: main }],
    memoryReader(files),
    true,
    ["/proj/main.vl"], // diskFiles supplied but symbol is purely local
  );
  assert(
    refs === undefined,
    "a non-exported local must still defer to single-file even with diskFiles",
  );
});
