// Unit tests for the D2 symbol model (go-to-definition / find-references).
//
// The `.vl` corpus (run.ts) is black-box behavioral and can't exercise the
// symbol table, so these drive `parseSymbols` directly. Run with:
//   deno test -A --no-check tests/symbols_test.ts
// (the `deno task test` task targets only run.ts; this file is a sibling.)

import { parseSymbols } from "../compiler/compile.ts";
import type { Position } from "../compiler/ast.ts";

// Tiny structural-equality assert (the repo has no std import map; run.ts
// likewise rolls its own checks).
const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
};

// Cursor on the first occurrence of `needle` in `src` (1-based line, 0-based
// column — the VL `Position` convention). `nth` selects a later occurrence.
const cursorOn = (src: string, needle: string, nth = 0): Position => {
  const lines = src.split("\n");
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    let from = 0;
    for (;;) {
      const col = lines[i].indexOf(needle, from);
      if (col < 0) break;
      if (seen === nth) return { line: i + 1, column: col };
      seen++;
      from = col + 1;
    }
  }
  throw new Error(`needle ${JSON.stringify(needle)} #${nth} not found`);
};

Deno.test("go-to-definition: local let binding", () => {
  const src = "let x = 1\nlet y = x + x\n";
  const symbols = parseSymbols(src);
  // Cursor on the use of `x` in `x + x` resolves to the `let x` declaration.
  const def = symbols.definitionAt(cursorOn(src, "x", 1));
  assertEquals(def?.start, { line: 1, column: 4 });
});

Deno.test("go-to-definition: function parameter", () => {
  const src = "function f(a) {\n  return a + 1\n}\n";
  const symbols = parseSymbols(src);
  // `a` in the body jumps to the parameter `a`.
  const def = symbols.definitionAt(cursorOn(src, "a", 1));
  assertEquals(def?.start, { line: 1, column: 11 });
});

Deno.test("go-to-definition: function declaration via call", () => {
  const src = "function inc(a) {\n  return a + 1\n}\nlet z = inc(1)\n";
  const symbols = parseSymbols(src);
  const def = symbols.definitionAt(cursorOn(src, "inc", 1));
  assertEquals(def?.start, { line: 1, column: 9 });
});

Deno.test("go-to-definition: type alias reference", () => {
  const src = "type Pair = { a: i32, b: i32 }\nlet p: Pair = { a: 1, b: 2 }\n";
  const symbols = parseSymbols(src);
  // `Pair` in the annotation resolves to the `type Pair` declaration.
  const def = symbols.definitionAt(cursorOn(src, "Pair", 1));
  assertEquals(def?.start, { line: 1, column: 5 });
});

Deno.test("find-references: all occurrences of a binding", () => {
  const src = "let count = 0\ncount = count + 1\nlet d = count\n";
  const symbols = parseSymbols(src);
  const refs = symbols.referencesAt(cursorOn(src, "count", 0));
  // declaration + 3 uses = 4 occurrences.
  assertEquals(refs.length, 4);
  // includeDeclaration=false drops the declaring identifier.
  const usesOnly = symbols.referencesAt(cursorOn(src, "count", 0), false);
  assertEquals(usesOnly.length, 3);
});

Deno.test("shadowing: inner binding resolves to inner declaration", () => {
  const src = "let v = 1\nfunction g(v) {\n  return v\n}\n";
  const symbols = parseSymbols(src);
  // The `v` inside g resolves to the parameter, not the outer let.
  const def = symbols.definitionAt(cursorOn(src, "v", 2));
  assertEquals(def?.start, { line: 2, column: 11 });
  // The references of the inner `v` do not include the outer let.
  const refs = symbols.referencesAt(cursorOn(src, "v", 2));
  assertEquals(refs.length, 2); // param decl + one use
});

Deno.test("cursor off any symbol yields no definition", () => {
  const src = "let x = 1\n";
  const symbols = parseSymbols(src);
  assertEquals(symbols.definitionAt({ line: 1, column: 0 }), undefined);
});
