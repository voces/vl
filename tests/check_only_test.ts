// Unit tests for the codegen-free `checkOnly` front end used by `vl check`.
//
// `checkOnly` is `compile` MINUS the binaryen codegen tail: it must return the
// SAME diagnostics as `compile` for both a type-error case and a clean case,
// and (being codegen-free) must never produce `wasm`. Run with:
//   deno test -A --no-check tests/check_only_test.ts

import { checkOnly, compile } from "../compiler/compile.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
};

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

// A clean program (no errors) and a type-error program. For the clean case,
// `compile` runs codegen (so it has `wasm`) while `checkOnly` does not; their
// DIAGNOSTICS must match exactly. The error case never reaches codegen in
// either, so diagnostics are trivially identical — but we assert it anyway.
const OK = "let x: i32 = 1\nprint(x)\n";
const TYPE_ERROR = "let x: i32 = true\n";

Deno.test("checkOnly matches compile diagnostics on a type error", async () => {
  const checked = checkOnly(TYPE_ERROR);
  const compiled = await compile(TYPE_ERROR);

  assertEquals(
    checked.diagnostics,
    compiled.diagnostics,
    "diagnostics should match compile()",
  );
  assert(
    checked.diagnostics.some((d) => d.severity === "error"),
    "expected at least one error diagnostic for a type error",
  );
  // checkOnly returns no `wasm` field at all.
  assert(
    !("wasm" in (checked as Record<string, unknown>)),
    "checkOnly result must not carry wasm",
  );
});

Deno.test("checkOnly matches compile diagnostics on a clean program", async () => {
  const checked = checkOnly(OK);
  const compiled = await compile(OK);

  // Same diagnostics (both empty / warnings only)...
  assertEquals(
    checked.diagnostics,
    compiled.diagnostics,
    "diagnostics should match compile() on a clean program",
  );
  assertEquals(
    checked.diagnostics.filter((d) => d.severity === "error").length,
    0,
    "clean program should have no error diagnostics",
  );
  // ...but compile produced wasm and checkOnly produced none.
  assert(compiled.wasm instanceof Uint8Array, "compile should produce wasm");
  assert(
    !("wasm" in (checked as Record<string, unknown>)),
    "checkOnly result must not carry wasm",
  );
});
