// Unit tests for the unused-binding lint rule's SEVERITY/TAG wiring (roadmap
// B17). Driven through the public codegen-free front end (`checkOnly`), so they
// exercise the real lint pass exactly as the CLI/LSP/harness consume it.
//
// Contract under test:
//   - A `_`-prefixed UNUSED binding emits a `hint`-severity, `unnecessary`-tagged
//     `unused-variable` diagnostic (greyed/faded in editors, NOT a warning).
//   - A non-underscore unused binding stays a `warning` (also `unnecessary`).
//   - A USED `_`-prefixed binding emits nothing.
//
// Run with: deno test -A --no-check tests/lint_severity_test.ts

import { checkOnly, type VLDiagnostic } from "../compiler/compile.ts";

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

const diagsFor = (src: string): VLDiagnostic[] => checkOnly(src).diagnostics;

const findByCode = (diags: VLDiagnostic[], code: string) =>
  diags.filter((d) => d.code === code);

Deno.test("`_`-prefixed unused local emits a hint with the unnecessary tag", () => {
  // `_scratch` is declared inside a function and never read -> hint, not warning.
  const src = "function h(n: i32): i32 {\n  let _scratch = n + 1\n  return n\n}\n";
  const diags = diagsFor(src);

  assert(
    !diags.some((d) => d.severity === "error"),
    `expected no errors, got: ${JSON.stringify(diags)}`,
  );

  const unused = findByCode(diags, "unused-variable");
  assert(
    unused.length === 1,
    `expected exactly one unused-variable diagnostic, got: ${
      JSON.stringify(unused)
    }`,
  );
  const d = unused[0];
  assert(
    d.severity === "hint",
    `expected severity "hint", got "${d.severity}"`,
  );
  assert(
    (d.tags ?? []).includes("unnecessary"),
    `expected the "unnecessary" tag, got: ${JSON.stringify(d.tags)}`,
  );
  assert(
    d.message.includes("_scratch"),
    `expected the message to mention _scratch, got: ${d.message}`,
  );
});

Deno.test("`_`-prefixed unused parameter emits a hint", () => {
  const src = "function h(n: i32, _unused: i32): i32 {\n  return n\n}\n";
  const unused = findByCode(diagsFor(src), "unused-variable");
  assert(
    unused.length === 1 && unused[0].severity === "hint" &&
      (unused[0].tags ?? []).includes("unnecessary"),
    `expected a single hint+unnecessary diagnostic, got: ${
      JSON.stringify(unused)
    }`,
  );
});

Deno.test("a non-underscore unused local stays a warning (unnecessary tag)", () => {
  const src = "function h(n: i32): i32 {\n  let scratch = n + 1\n  return n\n}\n";
  const unused = findByCode(diagsFor(src), "unused-variable");
  assert(
    unused.length === 1,
    `expected one unused-variable diagnostic, got: ${JSON.stringify(unused)}`,
  );
  const d = unused[0];
  assert(
    d.severity === "warning",
    `expected severity "warning", got "${d.severity}"`,
  );
  assert(
    (d.tags ?? []).includes("unnecessary"),
    `expected the "unnecessary" tag, got: ${JSON.stringify(d.tags)}`,
  );
});

Deno.test("a USED `_`-prefixed binding emits no diagnostic", () => {
  const src = "function h(n: i32): i32 {\n  let _x = n + 1\n  return _x\n}\n";
  const unused = findByCode(diagsFor(src), "unused-variable");
  assert(
    unused.length === 0,
    `expected no unused-variable diagnostic for a used _x, got: ${
      JSON.stringify(unused)
    }`,
  );
});
