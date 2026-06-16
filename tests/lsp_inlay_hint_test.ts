// Unit tests for inlay-hint derivation (roadmap D6) off the self-hosted wasm
// checker — specifically the source-aware behaviour: suppressing hints on
// declarations the user *already annotated*, hinting an omitted function return
// type, and honouring the request range.
//
// Run with:
//   deno test -A --no-check tests/lsp_inlay_hint_test.ts
// (also included in `deno task test`).

import { inlayHintsFromWasm } from "../lsp/src/typeFeatures.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
};

// ---- kill-TS: inlay hints off the self-hosted checker -----------------------
// `wasmChecker.inlayHintsAt` supplies the inferred types + name-end positions;
// `inlayHintsFromWasm` applies the same source-scan annotation/range filters as
// the TS path. Seed-gated; self-ignores when the seed is absent.

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
const noSiblings = () => undefined;

Deno.test({
  name: "wasm-inlay: value + function-return hints, annotated suppressed",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  // `x` inferred (hint), `add` return inferred (hint after `)`), `a`/`b` params
  // annotated (suppressed), `s` inferred (hint).
  const src = "let x = 1 + 2\nfunction add(a: i32, b: i32) {\n  a + b\n}\nlet s = \"hi\"\n";
  const candidates = await checker.inlayHintsAt(src, "/tmp/x.vl", noSiblings);
  const hints = inlayHintsFromWasm(candidates, undefined, src);
  const labels = hints.map((h) => h.label).sort();
  // `: i32` for `x`, `: i32` for the `add` return, `: string` for `s` — the two
  // annotated params produce no hint.
  assertEquals(labels, [": i32", ": i32", ": string"], "wasm inlay labels");
  // The function-return hint sits just after the param list's `)` (line 1, col 29).
  const ret = hints.find((h) => h.label === ": i32" && h.line === 1);
  if (ret === undefined) throw new Error(`expected a return hint on line 1; got ${JSON.stringify(hints)}`);
  assertEquals(ret.char, "function add(a: i32, b: i32)".length, "return hint after `)`");
});

Deno.test({
  name: "wasm-inlay: a range filters the native hints",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const src = "let a = 1\nlet b = 2\nlet c = 3\n";
  const candidates = await checker.inlayHintsAt(src, "/tmp/x.vl", noSiblings);
  const ranged = inlayHintsFromWasm(candidates, {
    start: { line: 1, character: 0 },
    end: { line: 1, character: 100 },
  }, src);
  assertEquals(ranged.map((h) => h.line), [1], "only the line-1 hint survives the range");
});
