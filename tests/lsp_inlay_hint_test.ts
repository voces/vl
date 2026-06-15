// Unit tests for inlay-hint derivation (roadmap D6) — specifically the
// source-aware behaviour that the bare symbol-table transform can't express:
// suppressing hints on declarations the user *already annotated*, hinting an
// omitted function return type, and skipping uninformative inference holes.
//
// The pure-table cases (no `source`) live in `tests/lsp_type_features_test.ts`;
// these drive `deriveInlayHints` with the real source text it gets from the LSP
// so annotation detection is exercised end to end. Run with:
//   deno test -A --no-check tests/lsp_inlay_hint_test.ts
// (also included in `deno task test`).

import { parseSymbols, stringifyType } from "../compiler/compile.ts";
import {
  deriveInlayHints,
  inlayHintsFromWasm,
  type TypeInlayHint,
} from "../lsp/src/typeFeatures.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
};

// Derive hints from source, with the source threaded in so annotated positions
// are suppressed. `label` is rendered as `name<label>` (e.g. `x: i32`) so the
// assertions read naturally.
const hintsFor = (src: string): string[] =>
  deriveInlayHints(parseSymbols(src), stringifyType, undefined, src)
    .map((h: TypeInlayHint) => `${h.name}${h.label}`)
    .sort();

// ---- the headline rule: never echo an annotation the user wrote -------------

Deno.test("inlay: an annotated let gets NO hint", () => {
  // `a` is inferred (hint it); `b` is annotated (suppress — echoing it is noise).
  assertEquals(hintsFor("let a = 1\nlet b: i32 = 2\n"), ["a: i32"]);
});

Deno.test("inlay: a const annotation is suppressed too", () => {
  // `const a` is inferred — an immutable binding keeps the narrow literal type
  // (`1`, not the widened `i32` a reassignable `let` would get); `b` is
  // annotated, so its hint is suppressed.
  assertEquals(hintsFor("const a = 1\nconst b: i32 = 2\n"), ["a: 1"]);
});

Deno.test("inlay: whitespace before the annotation colon is still detected", () => {
  // `let b : i32` (space before the colon) must still count as annotated.
  assertEquals(hintsFor("let a = 1\nlet b : i32 = 2\n"), ["a: i32"]);
});

Deno.test("inlay: an annotated parameter gets NO hint", () => {
  // `function f(x: i32)` — `x` is annotated, so no parameter hint; the return
  // type is omitted, so a `: i32` return hint is the only hint.
  assertEquals(hintsFor("function f(x: i32) x + 1\n"), ["f: i32"]);
});

// ---- inferred parameters and return types -----------------------------------

Deno.test("inlay: an inferred parameter IS hinted", () => {
  // A concretely-inferred parameter (constrained by the body) gets a hint.
  const hints = hintsFor("function dbl(x: i32) x * 2\nlet r = dbl(3)\n");
  // `x` is annotated (no hint); `r` is inferred; `dbl` return is inferred.
  assertEquals(hints, ["dbl: i32", "r: i32"]);
});

Deno.test("inlay: an omitted return type is hinted just after the param list", () => {
  const src = "function f(x: i32) x + 1\n";
  const hints = deriveInlayHints(parseSymbols(src), stringifyType, undefined, src);
  const ret = hints.find((h) => h.name === "f");
  if (!ret) throw new Error("expected a return-type hint for `f`");
  assertEquals(ret.label, ": i32");
  // `function f(x: i32)` — the `)` is at column 17, so the hint sits at 18.
  assertEquals(ret.line, 0);
  assertEquals(ret.char, 18);
});

Deno.test("inlay: an explicit return annotation suppresses the return hint", () => {
  // `): i32` is authored — no return hint; params annotated too → nothing.
  assertEquals(hintsFor("function g(n: i32): i32 { return n }\n"), []);
});

Deno.test("inlay: a multi-line function signature still resolves its return type", () => {
  // The param list spans lines; `closingParen` must track across the newline.
  const src = "function add(\n  a: i32,\n  b: i32\n) a + b\n";
  const hints = hintsFor(src);
  assertEquals(hints, ["add: i32"]);
});

// ---- uninformative inference holes are skipped ------------------------------

Deno.test("inlay: an unconstrained generic param/return is not hinted", () => {
  // `h(p) p + 1` leaves `p` an inference hole; `: I<…>` / `: any` is noise, so
  // neither the parameter nor the (also-hole) return type is hinted.
  assertEquals(hintsFor("function h(p) p + 1\n"), []);
});

// ---- object literals don't trip the annotation detector ---------------------

Deno.test("inlay: a let bound to an object literal is still hinted", () => {
  // The `x:`/`y:` colons belong to the literal, not the binding `o`, so `o` is
  // inferred (hint it), not mistaken for annotated.
  const hints = hintsFor("let o = { x: 1, y: 2 }\n");
  assertEquals(hints, ["o: {x: i32, y: i32}"]);
});

// ---- arrays render `T[]`, not the raw `{i32: T}` index signature ------------
// An array is internally an `{[i32]: T}` index-signature object; an array LITERAL
// (and the `A-infer-empty` empty `[]`) used to be keyed by the integer type
// `i32` and so fell through to the generic object render `{i32: i32}`. They now
// build the CANONICAL `number`-keyed shape — identical to what a `T[]`
// annotation produces — so all three render `T[]`. Regression guard.

Deno.test("inlay: an array literal is hinted as `T[]`, not `{i32: T}`", () => {
  assertEquals(hintsFor("let a = [1, 2]\n"), ["a: i32[]"]);
});

Deno.test("inlay: a string array literal renders `string[]`", () => {
  assertEquals(hintsFor(`let a = ["x"]\n`), ["a: string[]"]);
});

Deno.test("inlay: a nested array literal renders `i32[][]`", () => {
  assertEquals(hintsFor("let a = [[1]]\n"), ["a: i32[][]"]);
});

Deno.test("inlay: an inferred-empty array (`[]` + push) renders `i32[]`", () => {
  // The element hole is pinned by the `.push(1)` and collapses into the binding
  // type, so the display is `i32[]` (no leftover `I<any>`/Infer), matching an
  // explicit `i32[]` annotation byte-for-byte.
  assertEquals(hintsFor("let c = []\nc.push(1)\n"), ["c: i32[]"]);
});

// ---- range filtering still applies with source ------------------------------

Deno.test("inlay: a requested range still filters source-aware hints", () => {
  const src = "let a = 1\nlet b = 2\nlet c = 3\n";
  const ranged = deriveInlayHints(parseSymbols(src), stringifyType, {
    start: { line: 1, character: 0 },
    end: { line: 1, character: 100 },
  }, src);
  assertEquals(ranged.map((h) => h.name), ["b"]);
});

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
