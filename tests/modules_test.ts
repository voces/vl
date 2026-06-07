// Tests for the VL module system (phase 1): cross-`.vl` import/export.
//
// Drives `compileProgram` / `checkProgram` (the multi-file front end) directly,
// with an in-memory module reader so the graph is self-contained and no
// filesystem layout is assumed. Covers the phase-1 contract:
//   - a 2-file program importing an exported FUNCTION and an exported TYPE,
//     compiled + run, producing the expected `print` output via `runWasm`;
//   - the `import { x as y }` rename;
//   - per-module name isolation (two files each declaring `helper` privately,
//     plus a private `Tok`-style same-name type, do NOT collide);
//   - error cases: importing a non-exported name, a name that doesn't exist, an
//     unresolvable path, and an import cycle.
// Run with: deno test -A --no-check tests/modules_test.ts

import { checkProgram, compileProgram, runWasm } from "../compiler/compile.ts";

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};
const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
};

/** A reader over an in-memory `{ key: source }` map. Keys carry `.vl`. */
const memReader = (files: Record<string, string>) => (key: string) =>
  Object.hasOwn(files, key) ? files[key] : undefined;

const noErrors = (ds: { severity: string; message: string }[]): boolean =>
  !ds.some((d) => d.severity === "error");

const errorMessages = (ds: { severity: string; message: string }[]): string[] =>
  ds.filter((d) => d.severity === "error").map((d) => d.message);

Deno.test("imports an exported function AND type; compiles + runs", async () => {
  const files = {
    "util.vl": [
      "export type Point = { x: i32, y: i32 }",
      "export function add(a: i32, b: i32): i32 { return a + b }",
      "function makePoint(x: i32, y: i32): Point { return { x: x, y: y } }",
      "export function originX(): i32 { let p = makePoint(0, 7)\n return p.x }",
    ].join("\n"),
    "main.vl": [
      'import { add, Point, originX } from "./util"',
      "let p: Point = { x: 3, y: 4 }",
      "print(add(p.x, p.y))",
      "print(originX())",
    ].join("\n"),
  };
  const r = await compileProgram("main.vl", memReader(files));
  assert(
    noErrors(r.diagnostics),
    `unexpected errors: ${errorMessages(r.diagnostics)}`,
  );
  assert(r.wasm instanceof Uint8Array, "expected wasm output");
  const { logs } = await runWasm(r.wasm!);
  assertEquals(logs, ["7", "0"], "program output");
});

Deno.test("exports need no annotations — inferred types resolve across modules", async () => {
  // `add` has no return-type annotation (inferred from `a + b`) and `SEED` is an
  // inferred `const`; the importer must still type-check and run. Exported members
  // are typed exactly as they would be locally — the module boundary adds no
  // annotation requirement; cross-module resolution uses the inferred type.
  const files = {
    "util.vl": [
      "export function add(a: i32, b: i32) { return a + b }",
      "export const SEED = 41",
    ].join("\n"),
    "main.vl": [
      'import { add, SEED } from "./util"',
      "print(add(SEED, 1))",
    ].join("\n"),
  };
  const r = await compileProgram("main.vl", memReader(files));
  assert(
    noErrors(r.diagnostics),
    `unexpected errors: ${errorMessages(r.diagnostics)}`,
  );
  const { logs } = await runWasm(r.wasm!);
  assertEquals(logs, ["42"], "inferred-export program output");
});

Deno.test("rename: `import { add as plus }`", async () => {
  const files = {
    "util.vl": "export function add(a: i32, b: i32): i32 { return a + b }",
    "main.vl": [
      'import { add as plus } from "./util"',
      "print(plus(40, 2))",
    ].join("\n"),
  };
  const r = await compileProgram("main.vl", memReader(files));
  assert(
    noErrors(r.diagnostics),
    `unexpected errors: ${errorMessages(r.diagnostics)}`,
  );
  const { logs } = await runWasm(r.wasm!);
  assertEquals(logs, ["42"], "renamed import output");
});

Deno.test("name isolation: same-named private decls in two files don't collide", async () => {
  // Both files declare a private `helper` AND a private type `Tok` with DIFFERENT
  // shapes/behaviour. The merged module must keep them distinct.
  const files = {
    "util.vl": [
      "type Tok = { kind: i32 }",
      "function helper(n: i32): i32 { return n + 1 }",
      "export function fromUtil(n: i32): i32 { let t: Tok = { kind: 9 }\n return helper(n) + t.kind }",
    ].join("\n"),
    "main.vl": [
      'import { fromUtil } from "./util"',
      "type Tok = { name: i32 }",
      "function helper(n: i32): i32 { return n * 10 }",
      "let t: Tok = { name: 5 }",
      "print(helper(2))", // main helper: 20
      "print(fromUtil(3))", // util helper(3)=4, + t.kind 9 = 13
      "print(t.name)", // main's Tok: 5
    ].join("\n"),
  };
  const r = await compileProgram("main.vl", memReader(files));
  assert(
    noErrors(r.diagnostics),
    `unexpected errors: ${errorMessages(r.diagnostics)}`,
  );
  const { logs } = await runWasm(r.wasm!);
  assertEquals(logs, ["20", "13", "5"], "isolated same-name decls");
});

Deno.test("error: importing a name that exists but is not exported", async () => {
  const files = {
    "util.vl": [
      "function secret(): i32 { return 1 }", // NOT exported
      "export function pub(): i32 { return 2 }",
    ].join("\n"),
    "main.vl": 'import { secret } from "./util"\nprint(secret())',
  };
  const r = await checkProgram("main.vl", memReader(files));
  assert(
    !noErrors(r.diagnostics),
    "expected an error for a non-exported import",
  );
  assert(
    errorMessages(r.diagnostics).some((m) => m.includes("not exported")),
    `expected a 'not exported' error, got: ${errorMessages(r.diagnostics)}`,
  );
});

Deno.test("error: importing a name that does not exist", async () => {
  const files = {
    "util.vl": "export function pub(): i32 { return 2 }",
    "main.vl": 'import { nope } from "./util"\nprint(nope())',
  };
  const r = await checkProgram("main.vl", memReader(files));
  assert(!noErrors(r.diagnostics), "expected an error for an undefined import");
  assert(
    errorMessages(r.diagnostics).some((m) => m.includes("not exported")),
    `expected a 'not exported' error, got: ${errorMessages(r.diagnostics)}`,
  );
});

Deno.test("error: import from an unresolvable path", async () => {
  const files = {
    "main.vl": 'import { x } from "./missing"\nprint(1)',
  };
  const r = await checkProgram("main.vl", memReader(files));
  assert(
    !noErrors(r.diagnostics),
    "expected an error for an unresolvable path",
  );
  assert(
    errorMessages(r.diagnostics).some((m) =>
      m.includes("Cannot resolve import")
    ),
    `expected a 'Cannot resolve' error, got: ${errorMessages(r.diagnostics)}`,
  );
});

Deno.test("error: import cycle is reported, not an infinite loop", async () => {
  const files = {
    "a.vl": 'import { b } from "./b"\nexport function a(): i32 { return b() }',
    "b.vl": 'import { a } from "./a"\nexport function b(): i32 { return a() }',
  };
  const r = await checkProgram("a.vl", memReader(files));
  assert(!noErrors(r.diagnostics), "expected an error for an import cycle");
  assert(
    errorMessages(r.diagnostics).some((m) => m.includes("cycle")),
    `expected an 'cycle' error, got: ${errorMessages(r.diagnostics)}`,
  );
});

Deno.test("transitive imports resolve (a -> b -> c)", async () => {
  const files = {
    "c.vl": "export function c(): i32 { return 100 }",
    "b.vl":
      'import { c } from "./c"\nexport function b(): i32 { return c() + 10 }',
    "a.vl": 'import { b } from "./b"\nprint(b() + 1)',
  };
  const r = await compileProgram("a.vl", memReader(files));
  assert(
    noErrors(r.diagnostics),
    `unexpected errors: ${errorMessages(r.diagnostics)}`,
  );
  const { logs } = await runWasm(r.wasm!);
  assertEquals(logs, ["111"], "transitive import output");
});

Deno.test("a file with no imports still compiles via the graph driver", async () => {
  const files = { "solo.vl": "print(1 + 2)" };
  const r = await compileProgram("solo.vl", memReader(files));
  assert(
    noErrors(r.diagnostics),
    `unexpected errors: ${errorMessages(r.diagnostics)}`,
  );
  const { logs } = await runWasm(r.wasm!);
  assertEquals(logs, ["3"], "single-module graph output");
});
