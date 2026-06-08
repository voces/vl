// Cross-file LSP navigation (cross-file LSP / H0 phase 3, Track D).
//
// Builds on the module-graph foundation (`lsp/src/moduleGraph.ts`): when the
// symbol under the cursor is an IMPORTED name, go-to-definition and doc-comment
// xrefs resolve to the EXPORTING sibling module's declaration; find-references
// gathers occurrences across the current file plus other open documents.
//
// Like `lsp_module_diagnostics_test.ts`, these drive the PURE module-graph
// helpers with an injected in-memory `ModuleReader` (no filesystem / cwd), since
// `server.ts` can't load under Deno (Node-only `vscode-languageserver`).
//
// Run: deno test -A --no-check tests/lsp_crossfile_test.ts

import type { ModuleReader } from "../compiler/modules.ts";
import {
  crossFileReferences,
  importedNameSource,
  importedNameSources,
  pathToUri,
} from "../lsp/src/moduleGraph.ts";

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

const memoryReader = (files: Record<string, string>): ModuleReader =>
  (key: string) => files[key];

// ---- (1) cross-file go-to-definition ---------------------------------------

Deno.test("cross-file go-to-def: an imported name resolves to the sibling's declaration", async () => {
  const files = {
    "/proj/util.vl": "export function add(a: i32, b: i32) {\n  return a + b\n}\n",
    "/proj/main.vl": 'import { add } from "./util"\n\nprint(add(2, 3))\n',
  };
  const source = await importedNameSource(
    "add",
    files["/proj/main.vl"],
    "/proj/main.vl",
    memoryReader(files),
  );
  assert(source !== undefined, "imported `add` should resolve cross-file");
  // Right FILE: the exporting sibling, not the importer.
  assert(
    source!.uri === pathToUri("/proj/util.vl"),
    `should point at util.vl; got ${source!.uri}`,
  );
  assert(source!.key === "/proj/util.vl", `key should be util.vl; got ${source!.key}`);
  // Right LINE: `export function add` is on line 0 (0-based LSP).
  assert(
    source!.range.start.line === 0,
    `add's declaration is on line 0; got ${source!.range.start.line}`,
  );
  // The range points at the NAME `add` (column 16 in `export function add(`).
  assert(
    source!.range.start.character === "export function ".length,
    `range should start at the name; got col ${source!.range.start.character}`,
  );
});

Deno.test("cross-file go-to-def: a renamed import (`as`) resolves by EXPORTED name", async () => {
  const files = {
    "/proj/util.vl": "let _x = 0\nexport function compute() {\n  return 1\n}\n",
    "/proj/main.vl": 'import { compute as run } from "./util"\n\nprint(run())\n',
  };
  // The local name is `run`; it must resolve via the exported name `compute`.
  const source = await importedNameSource(
    "run",
    files["/proj/main.vl"],
    "/proj/main.vl",
    memoryReader(files),
  );
  assert(source !== undefined, "renamed import `run` should resolve");
  assert(
    source!.uri === pathToUri("/proj/util.vl"),
    "renamed import should point at util.vl",
  );
  // `export function compute` is on line 1 (0-based).
  assert(
    source!.range.start.line === 1,
    `compute's declaration is on line 1; got ${source!.range.start.line}`,
  );
});

Deno.test("cross-file go-to-def: a non-imported local name does NOT resolve cross-file", async () => {
  const files = {
    "/proj/util.vl": "export function add(a: i32, b: i32) {\n  return a + b\n}\n",
    "/proj/main.vl": 'import { add } from "./util"\n\nlet local = 7\nprint(local)\n',
  };
  const sources = await importedNameSources(
    files["/proj/main.vl"],
    "/proj/main.vl",
    memoryReader(files),
  );
  assert("add" in sources, "imported `add` should be a cross-file source");
  assert(!("local" in sources), "a local binding must NOT resolve cross-file");
});

Deno.test("cross-file go-to-def: a not-exported import yields no source", async () => {
  const files = {
    "/proj/util.vl": "function secret() {\n  return 2\n}\n", // not exported
    "/proj/main.vl": 'import { secret } from "./util"\n\nprint(1)\n',
  };
  const source = await importedNameSource(
    "secret",
    files["/proj/main.vl"],
    "/proj/main.vl",
    memoryReader(files),
  );
  assert(source === undefined, "a non-exported import must not resolve");
});

// ---- (2) cross-file doc-comment xrefs --------------------------------------
//
// `buildDocRefResolver` (in server.ts) layers `importedNameSources` over the
// single-file resolver. We assert the underlying source resolution here (the
// resolver's cross-import branch is `importedSources[name]` → `uri#L<line+1>`),
// since server.ts can't load under Deno.

Deno.test("cross-file doc-xref: an imported `[`Name`]` resolves to the sibling source line", async () => {
  const files = {
    "/proj/util.vl": "export function add(a: i32, b: i32) {\n  return a + b\n}\n",
    "/proj/main.vl":
      'import { add } from "./util"\n\n/// see [`add`]\nfunction main() {\n  return add(1, 2)\n}\n',
  };
  const sources = await importedNameSources(
    files["/proj/main.vl"],
    "/proj/main.vl",
    memoryReader(files),
  );
  const imported = sources["add"];
  assert(imported !== undefined, "doc-xref `[`add`]` must resolve cross-import");
  // The doc link the resolver builds: `<siblingUri>#L<1-based line>`.
  const link = `${imported.uri}#L${imported.range.start.line + 1}`;
  assert(
    link === `${pathToUri("/proj/util.vl")}#L1`,
    `doc link should jump to util.vl line 1; got ${link}`,
  );
});

// ---- (3) cross-file find-references -----------------------------------------

Deno.test("cross-file find-refs: an exported symbol's references span the open graph", async () => {
  const util = "export function add(a: i32, b: i32) {\n  return a + b\n}\n";
  const main = 'import { add } from "./util"\n\nprint(add(2, 3))\nprint(add(4, 5))\n';
  const files = { "/proj/util.vl": util, "/proj/main.vl": main };
  const open = [
    { uri: pathToUri("/proj/util.vl"), text: util },
    { uri: pathToUri("/proj/main.vl"), text: main },
  ];
  // Cursor on `add` in main.vl (an imported name): references across the graph.
  const refs = await crossFileReferences(
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

Deno.test("cross-file find-refs: resolving from the DECLARING module also finds importers", async () => {
  const util = "export function add(a: i32, b: i32) {\n  return a + b\n}\n";
  const main = 'import { add } from "./util"\n\nprint(add(2, 3))\n';
  const files = { "/proj/util.vl": util, "/proj/main.vl": main };
  const open = [
    { uri: pathToUri("/proj/util.vl"), text: util },
    { uri: pathToUri("/proj/main.vl"), text: main },
  ];
  // Cursor on the `add` DECLARATION in util.vl (an exported local).
  const refs = await crossFileReferences(
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

Deno.test("cross-file find-refs: a purely-local symbol returns undefined (single-file fallback)", async () => {
  const main = 'let only = 1\nprint(only)\nprint(only)\n';
  const files = { "/proj/main.vl": main };
  const refs = await crossFileReferences(
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

// ---- (4) REGRESSION: single-file go-to-def is untouched ---------------------

Deno.test("regression: a no-import file exposes no cross-file sources", async () => {
  const main = "function add(a: i32, b: i32) {\n  return a + b\n}\nprint(add(1, 2))\n";
  const sources = await importedNameSources(
    main,
    "/proj/solo.vl",
    memoryReader({ "/proj/solo.vl": main }),
  );
  assert(
    Object.keys(sources).length === 0,
    `a no-import file has no cross-file sources; got ${JSON.stringify(sources)}`,
  );
});
