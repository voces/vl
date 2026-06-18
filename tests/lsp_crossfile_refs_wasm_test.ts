// LSP-on-wasm step 3-C Stage 3: cross-file FIND-REFERENCES off the SELF-HOSTED
// checker. `crossFileReferences` resolves the cursor's symbol to its canonical
// export via the seed's import/export pass, then compiles each candidate file as
// its own entry through `wasmChecker.referencesInEntry` and unions the
// per-candidate occurrences — the native counterpart of the host's old
// tokenize/parseSymbols/checkDocument crawl. These tests load the real seed
// (`build/vl-compiler.wasm`); absent (fresh clone, no `refresh-compiler.sh` yet)
// they self-ignore, the same convention as the rest of the wasm suite.

import type { ModuleReader } from "../compiler/coreTypes.ts";
import { crossFileReferences, pathToUri } from "../lsp/src/moduleGraph.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";

const SEED = new URL("../build/vl-compiler.wasm", import.meta.url).pathname;
const seedExists = (() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})();
const ignore = !seedExists;
const log = (_m: string) => {};

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

// A reader keyed by RESOLVED filesystem path — `resolveSpecifier("./util",
// "/proj/main.vl")` yields `/proj/util.vl`, exactly the key the entry resolves
// its `./util` import to (mirrors the existing cross-file wasm test's setup).
const memoryReader = (files: Record<string, string>): ModuleReader =>
  (key: string) => files[key];

const util = "export function add(a: i32, b: i32): i32 {\n  a + b\n}\n";
const main = 'import { add } from "./util"\n\nprint(add(2, 3))\nprint(add(4, 5))\n';

Deno.test({
  name: "wasm-crossfile-refs: an exported symbol's references span the declaring file and an importer",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
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
    checker,
    true,
  );
  assert(refs !== undefined, "an imported symbol must resolve cross-module");
  const byUri = new Map<string, number>();
  for (const r of refs!) byUri.set(r.uri, (byUri.get(r.uri) ?? 0) + 1);
  // util.vl: the declaration of `add`. main.vl: two uses (the importer has no
  // synthesized decl occurrence — imports are parser-skipped).
  assert(
    (byUri.get(pathToUri("/proj/util.vl")) ?? 0) >= 1,
    `util.vl should hold the declaration; got ${JSON.stringify([...byUri])}`,
  );
  assert(
    (byUri.get(pathToUri("/proj/main.vl")) ?? 0) === 2,
    `main.vl should hold two uses; got ${JSON.stringify([...byUri])}`,
  );
  // The util.vl decl occurrence points at the `add` name (line 1, col 16:
  // `export function ` is 16 chars; 0-based LSP line 0).
  const utilUri = pathToUri("/proj/util.vl");
  const declRef = refs!.find((r) => r.uri === utilUri);
  assert(declRef !== undefined, "expected a util.vl reference");
  assert(
    declRef!.range.start.line === 0 && declRef!.range.start.character === 16,
    `util.vl decl should be at 0:16; got ${JSON.stringify(declRef!.range.start)}`,
  );
});

Deno.test({
  name: "wasm-crossfile-refs: includeDeclaration:false drops the declaration",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const files = { "/proj/util.vl": util, "/proj/main.vl": main };
  const open = [
    { uri: pathToUri("/proj/util.vl"), text: util },
    { uri: pathToUri("/proj/main.vl"), text: main },
  ];
  const withDecl = await crossFileReferences(
    "add",
    main,
    "/proj/main.vl",
    open,
    memoryReader(files),
    checker,
    true,
  );
  const withoutDecl = await crossFileReferences(
    "add",
    main,
    "/proj/main.vl",
    open,
    memoryReader(files),
    checker,
    false,
  );
  assert(withDecl !== undefined && withoutDecl !== undefined, "both must resolve");
  // Dropping the declaration removes exactly one occurrence (the util.vl decl).
  assert(
    withoutDecl!.length === withDecl!.length - 1,
    `excluding the decl should drop one ref; got ${withDecl!.length} → ${withoutDecl!.length}`,
  );
  const utilUri = pathToUri("/proj/util.vl");
  // util.vl's only occurrence is the decl, so it disappears entirely.
  assert(
    withoutDecl!.every((r) => r.uri !== utilUri),
    `the declaring file's decl-only occurrence should be dropped; got ${
      JSON.stringify(withoutDecl!.map((r) => r.uri))
    }`,
  );
});

Deno.test({
  name: "wasm-crossfile-refs: a purely-local symbol returns undefined (single-file fallback)",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const local = "let only = 1\nprint(only)\nprint(only)\n";
  const files = { "/proj/main.vl": local };
  const refs = await crossFileReferences(
    "only",
    local,
    "/proj/main.vl",
    [{ uri: pathToUri("/proj/main.vl"), text: local }],
    memoryReader(files),
    checker,
    true,
  );
  assert(
    refs === undefined,
    "a non-exported local must defer to the single-file references path",
  );
});
