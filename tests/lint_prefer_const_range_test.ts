// Unit test for the prefer-const lint's diagnostic RANGE (roadmap B17).
//
// The actionable change for prefer-const is `let`→`const`, so the diagnostic now
// points at the `let` KEYWORD rather than the variable identifier (the squiggle
// lands on the word the fix changes). The parser records the keyword span on the
// binding (`Binding.declKeyword`) and the lint rule uses it. This test drives the
// real front end (`checkOnly`) and asserts the diagnostic's range covers `let`.
//
// Run with: deno test -A --no-check tests/lint_prefer_const_range_test.ts

import { checkOnly, type VLDiagnostic } from "../compiler/compile.ts";

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

const preferConstDiag = (src: string): VLDiagnostic | undefined =>
  checkOnly(src).diagnostics.find((d) => d.code === "prefer-const");

Deno.test("prefer-const reports at the `let` keyword, not the variable name", () => {
  // Line 1 (0-based): `  let total = n + 1` — `let` occupies cols 2..5, `total`
  // starts at col 6. The diagnostic must cover the `let` keyword.
  const src = "function sum(n: i32) {\n  let total = n + 1\n  return total\n}\n";
  const d = preferConstDiag(src);
  assert(d !== undefined, "expected a prefer-const diagnostic");
  const { start, end } = d!.range;
  // LSP-style 0-based line/character. `let` is on line index 1.
  assert(start.line === 1, `expected line 1, got ${start.line}`);
  assert(
    start.character === 2,
    `expected start col 2 (the \`let\`), got ${start.character}`,
  );
  assert(
    end.line === 1 && end.character === 5,
    `expected end col 5 (one past \`let\`), got ${end.line}:${end.character}`,
  );
});

Deno.test("prefer-const range covers exactly the three-character `let`", () => {
  const src = "function f() {\n  let v = 1\n  return v\n}\n";
  const d = preferConstDiag(src);
  assert(d !== undefined, "expected a prefer-const diagnostic");
  const { start, end } = d!.range;
  assert(
    end.character - start.character === 3,
    `expected a 3-char span (\`let\`), got ${end.character - start.character}`,
  );
});
