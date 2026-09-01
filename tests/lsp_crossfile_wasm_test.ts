// LSP-on-wasm step 3-C Stage 1: cross-file imported-source resolution off the
// SELF-HOSTED checker. `wasmChecker.importedNameSources` drives the seed's
// import/export pass so go-to-definition and doc-xref on an imported name jump
// to the EXPORTING sibling's declaration — the native counterpart of the host's
// `importedNameSources`. These tests load the real seed
// (`build/vl-compiler.wasm`); absent (fresh clone, no `refresh-compiler.sh` yet)
// they self-ignore, the same convention as the rest of the wasm suite.

import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import { crossFileUriOf, withStd } from "../lsp/src/moduleGraph.ts";
import { STD_SOURCES } from "../std/embedded.ts";

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
const logs: string[] = [];
const log = (m: string) => logs.push(m);

// The entry imports `add` from `./util`; the reader returns the sibling source
// keyed by the resolved `util.vl` path — mirrors the symbol suite's import test
// so the specifier resolves identically.
const entry = 'import { add } from "./util"\nprint(add(1, 2))\n';
const util = "export function add(a: i32, b: i32): i32 {\n  a + b\n}\n";
const read = (key: string) => (key.endsWith("util.vl") ? util : undefined);

Deno.test({
  name: "wasm-crossfile: an imported name resolves to the sibling's export decl",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  const sources = await checker.importedNameSources(entry, "/proj/main.vl", read);
  const src = sources.add;
  if (src === undefined) throw new Error("expected `add` to resolve cross-file");
  if (!src.key.endsWith("util.vl")) {
    throw new Error(`expected the util.vl key, got ${JSON.stringify(src.key)}`);
  }
  // `add`'s decl name is on `util` line 1 (1-based native line), column 16
  // (`export function ` is 16 chars). `length` is the exported name's length (3).
  if (src.line !== 1) throw new Error(`expected line 1, got ${src.line}`);
  if (src.col !== 16) throw new Error(`expected col 16, got ${src.col}`);
  if (src.length !== 3) throw new Error(`expected length 3, got ${src.length}`);
});

Deno.test({
  name: "wasm-crossfile: a name the sibling does not export is absent",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // `sub` is not exported by `util`, so the import is unresolvable and omitted.
  const missing = 'import { sub } from "./util"\nprint(sub(1, 2))\n';
  const sources = await checker.importedNameSources(missing, "/proj/main.vl", read);
  if (sources.sub !== undefined) {
    throw new Error(`expected no entry for the non-exported name, got ${JSON.stringify(sources.sub)}`);
  }
});

Deno.test({
  name: "wasm-crossfile: scopeAt shows an imported name under its source name (de-mangled)",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // In a multi-module compile the importer's use of `add` resolves to the merge's
  // canonical binding `add$m1`; completion must surface the SOURCE name `add`, not
  // the internal mangled form. (`print` is at line 2 / 0-based 1, col 0.)
  const scope = await checker.scopeAt(entry, "/proj/main.vl", read, 1, 0);
  const names = scope.map((b) => b.name);
  if (!names.includes("add")) {
    throw new Error(`expected the de-mangled \`add\`, got ${JSON.stringify(names)}`);
  }
  if (names.some((n) => n.includes("$"))) {
    throw new Error(`a mangled name leaked into completion: ${JSON.stringify(names)}`);
  }
});

Deno.test({
  name: "wasm-crossfile: a std import resolves to the embedded module's export decl (vl-std URI)",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, log)!;
  // The server reads std through `withStd` (no workspace std dir here → the
  // embedded map). `expect` is a std:test export.
  const stdEntry = 'import { expect } from "std:test"\nexpect(1)\n';
  const sources = await checker.importedNameSources(
    stdEntry,
    "/proj/main.vl",
    withStd(() => undefined),
  );
  const src = sources.expect;
  if (src === undefined) throw new Error("expected `expect` to resolve into std:test");
  if (src.key !== "std:test") {
    throw new Error(`expected key std:test, got ${JSON.stringify(src.key)}`);
  }
  // Range fidelity: the decl position must spell `expect` in the SAME source the
  // vl-std content provider serves (the embedded map) — that is the contract
  // that makes the provider's tab open at the right line and column.
  const declLine = STD_SOURCES["std:test"].split("\n")[src.line - 1] ?? "";
  const atDecl = declLine.slice(src.col, src.col + src.length);
  if (atDecl !== "expect") {
    throw new Error(
      `decl position (line ${src.line}, col ${src.col}) spells ${JSON.stringify(atDecl)} in the embedded source, not "expect"`,
    );
  }
  // And the key maps to the provider's URI form (no workspace std dir).
  const uri = crossFileUriOf(src.key, undefined, () => false);
  if (uri !== "vl-std:/test.vl") {
    throw new Error(`expected vl-std:/test.vl, got ${JSON.stringify(uri)}`);
  }
});
