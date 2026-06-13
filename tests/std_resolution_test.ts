// The `std:` scheme's resolution semantics in the TS host (docs/std-design.md
// D2), driven against the pure resolver and `loadProgram` with in-memory
// readers (no filesystem):
//   • a well-formed `std:` specifier resolves VERBATIM (the specifier IS the
//     key) — including slash segments;
//   • malformed `std:` shapes and bare specifiers stay unsupported;
//   • the std-internal guard: a RELATIVE specifier inside a std module is an
//     unsupported-specifier error (std imports std via `std:` only).
// The corpus pins the end-to-end behaviors (`modules/std-basic`,
// `modules/std-unknown`) in both pipelines; the std-internal guard has no
// corpus case (it would need a deliberately-broken module in the GLOBAL
// `std/` dir), so the native driver's port of the guard is covered by review
// parity with this file, not by a fixture.
//
// Run: deno test -A --no-check tests/std_resolution_test.ts

import { loadProgram, resolveSpecifier } from "../compiler/modules.ts";

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

Deno.test("resolveSpecifier: well-formed std specifiers resolve verbatim", () => {
  for (const spec of ["std:seed", "std:fmt", "std:test/runner", "std:a/b/c_0"]) {
    assert(
      resolveSpecifier(spec, "/proj/main.vl") === spec,
      `${spec} must resolve to itself`,
    );
  }
});

Deno.test("resolveSpecifier: malformed std and bare specifiers stay unsupported", () => {
  for (
    const spec of [
      "std:", // empty name
      "std:Fmt", // uppercase
      "std:a/", // trailing slash (empty segment)
      "std:a//b", // empty segment
      "std:a.b", // dot
      "std", // bare
      "fmt", // bare
    ]
  ) {
    assert(
      resolveSpecifier(spec, "/proj/main.vl") === undefined,
      `${spec} must not resolve`,
    );
  }
});

Deno.test("resolveSpecifier: the std-internal relative guard", () => {
  // From a std module, a relative specifier is rejected…
  assert(
    resolveSpecifier("./helper", "std:seed") === undefined,
    "relative import inside std must not resolve",
  );
  // …while a std: specifier resolves fine (std imports std via std: only).
  assert(
    resolveSpecifier("std:fmt", "std:seed") === "std:fmt",
    "std: import inside std must resolve verbatim",
  );
  // From a user module the same relative specifier still resolves normally.
  assert(
    resolveSpecifier("./helper", "/proj/main.vl") === "/proj/helper.vl",
    "relative import outside std must keep resolving",
  );
});

Deno.test("loadProgram: a relative import inside a std module is an unsupported-specifier error", async () => {
  const files: Record<string, string> = {
    "/proj/main.vl": 'import { broken } from "std:badseed"\n\nprint(broken())\n',
    "std:badseed":
      'import { helper } from "./helper"\n\nexport function broken(): i32 {\n  return helper()\n}\n',
  };
  const { diagnostics } = await loadProgram(
    "/proj/main.vl",
    (key) => files[key],
  );
  assert(
    diagnostics.some((d) =>
      d.severity === "error" &&
      d.message.includes('Unsupported import specifier "./helper"') &&
      d.message.includes("std modules import only via `std:` specifiers")
    ),
    `expected the std-internal guard diagnostic; got ${
      JSON.stringify(diagnostics.map((d) => d.message))
    }`,
  );
});

Deno.test("loadProgram: std-to-std imports resolve through the reader", async () => {
  const files: Record<string, string> = {
    "/proj/main.vl": 'import { outer } from "std:outerseed"\n\nprint(outer())\n',
    "std:outerseed":
      'import { inner } from "std:innerseed"\n\nexport function outer(): i32 {\n  return inner() + 1\n}\n',
    "std:innerseed": "export function inner(): i32 {\n  return 41\n}\n",
  };
  const { diagnostics } = await loadProgram(
    "/proj/main.vl",
    (key) => files[key],
  );
  assert(
    !diagnostics.some((d) => d.severity === "error"),
    `std-to-std chain should be clean; got ${
      JSON.stringify(diagnostics.map((d) => d.message))
    }`,
  );
});
