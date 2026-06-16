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

// Regression: a whole-program compile records inlay candidates for EVERY module,
// each with module-local line/col. The checker must return ONLY the entry
// module's (table index 0); otherwise a dependency's hints (e.g. `./mathx`'s
// function-return types) render against the importer — bleeding onto the
// `import` line and into string literals (the `inlayModuleAt` filter).
Deno.test({
  name: "wasm-inlay: a dependency's hints don't bleed onto the importer",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const main = `import { add, square } from "./mathx"
import { TAU as twoPi } from "./mathx"

let r = add(square(3), 4)
print(r)
print(twoPi)
`;
  const mathx = `export function add(a: i32, b: i32): i32 {
  return a + b
}
export function square(n: i32): i32 {
  return n * n
}
export const TAU: f64 = 6.28318
`;
  const files: Record<string, string> = { "main.vl": main, "mathx.vl": mathx };
  const candidates = await checker.inlayHintsAt(
    main,
    "main.vl",
    (key) => files[key],
  );
  const hints = inlayHintsFromWasm(candidates, undefined, main);
  // The ONLY unannotated decl in main.vl is `let r` (inferred `i32`). `mathx`'s
  // params/returns/`TAU` are in module 1 and must not appear.
  assertEquals(
    hints.map((h) => ({ line: h.line, char: h.char, label: h.label })),
    [{ line: 3, char: 5, label: ": i32" }],
    "only the entry module's hint survives",
  );
});
