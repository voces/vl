// Unit tests for the unused-function lint rule (roadmap B17). Driven through the
// public codegen-free front end (`checkOnly`), so they exercise the real lint
// pass exactly as the CLI/LSP/harness consume it.
//
// Contract under test:
//   - A non-exported, unreferenced top-level function emits a `warning`-severity,
//     `unnecessary`-tagged `unused-function` diagnostic.
//   - An EXPORTED unreferenced function emits NOTHING (public surface).
//   - A function that IS called (directly, by forward reference, or via UFCS)
//     emits nothing — the rule reuses the file's reference tracking.
//   - A `_`-prefixed unreferenced function emits a `hint` (intentionally unused).
//
// Run with: deno test -A --no-check tests/lint_unused_function_test.ts

import { checkOnly, type VLDiagnostic } from "../compiler/compile.ts";

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

const diagsFor = (src: string): VLDiagnostic[] => checkOnly(src).diagnostics;

const findByCode = (diags: VLDiagnostic[], code: string) =>
  diags.filter((d) => d.code === code);

Deno.test("a non-exported, unreferenced top-level function warns", () => {
  const src = "function dead(n: i32): i32 {\n  return n + 1\n}\nprint(1)\n";
  const diags = diagsFor(src);
  assert(
    !diags.some((d) => d.severity === "error"),
    `expected no errors, got: ${JSON.stringify(diags)}`,
  );
  const unused = findByCode(diags, "unused-function");
  assert(
    unused.length === 1,
    `expected one unused-function diagnostic, got: ${JSON.stringify(unused)}`,
  );
  const d = unused[0];
  assert(d.severity === "warning", `expected "warning", got "${d.severity}"`);
  assert(
    (d.tags ?? []).includes("unnecessary"),
    `expected the "unnecessary" tag, got: ${JSON.stringify(d.tags)}`,
  );
  assert(
    d.message.includes("dead"),
    `expected the message to mention dead, got: ${d.message}`,
  );
});

Deno.test("an exported unreferenced function is NOT flagged", () => {
  const src = "export function pub(n: i32): i32 {\n  return n + 1\n}\n";
  const unused = findByCode(diagsFor(src), "unused-function");
  assert(
    unused.length === 0,
    `expected no unused-function diagnostic for an export, got: ${
      JSON.stringify(unused)
    }`,
  );
});

Deno.test("a called function is NOT flagged", () => {
  const src = "function triple(n: i32): i32 {\n  return n * 3\n}\nprint(triple(2))\n";
  const unused = findByCode(diagsFor(src), "unused-function");
  assert(
    unused.length === 0,
    `expected no unused-function diagnostic for a called fn, got: ${
      JSON.stringify(unused)
    }`,
  );
});

Deno.test("a forward-referenced function is NOT flagged", () => {
  // `b` is declared AFTER `a` calls it; the parser resolves the call against a
  // hoisted signature, so the symbol table records no occurrence — the AST call
  // set covers it. Both functions are reachable from `print(a())`.
  const src =
    "function a(): i32 { return b() }\nfunction b(): i32 { return 1 }\nprint(a())\n";
  const unused = findByCode(diagsFor(src), "unused-function");
  assert(
    unused.length === 0,
    `expected no unused-function diagnostic for forward refs, got: ${
      JSON.stringify(unused)
    }`,
  );
});

Deno.test("a mutually-recursive pair reachable from a call is NOT flagged", () => {
  const src = `function isEven(n: i32): i32 {
  if n == 0 { return 1 }
  return isOdd(n - 1)
}
function isOdd(n: i32): i32 {
  if n == 0 { return 0 }
  return isEven(n - 1)
}
print(isEven(4))
`;
  const unused = findByCode(diagsFor(src), "unused-function");
  assert(
    unused.length === 0,
    `expected no unused-function diagnostic for mutual recursion, got: ${
      JSON.stringify(unused)
    }`,
  );
});

Deno.test("a UFCS-called function is NOT flagged", () => {
  // `triple` is called via UFCS (`2.triple()`), which the parser desugars to a
  // `FunctionCall "triple"` — covered by the AST call set, not the symbol table.
  const src =
    "function triple(self: i32): i32 {\n  return self * 3\n}\nprint(2.triple())\n";
  const unused = findByCode(diagsFor(src), "unused-function");
  assert(
    unused.length === 0,
    `expected no unused-function diagnostic for a UFCS call, got: ${
      JSON.stringify(unused)
    }`,
  );
});

Deno.test("a `_`-prefixed unreferenced function emits a hint", () => {
  const src = "function _scratch(n: i32): i32 {\n  return n\n}\nprint(1)\n";
  const unused = findByCode(diagsFor(src), "unused-function");
  assert(
    unused.length === 1,
    `expected one unused-function diagnostic, got: ${JSON.stringify(unused)}`,
  );
  const d = unused[0];
  assert(d.severity === "hint", `expected "hint", got "${d.severity}"`);
  assert(
    (d.tags ?? []).includes("unnecessary"),
    `expected the "unnecessary" tag, got: ${JSON.stringify(d.tags)}`,
  );
});
