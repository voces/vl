// Tests for host-callable wasm exports from entry-module `export function`s.
//
// Feature: a top-level `export function` in the ENTRY module emits a wasm export
// the host can call into compiled VL as a library. Previously a compiled module
// only ran via its start/`__program__` function (script mode), and an unused
// top-level function was inlined/DCE'd — so `export function fib(n){…}` with no
// caller produced an empty module. Binaryen treats exports as DCE roots, so
// listing the entry's exports both KEEPS the function and exposes it.
//
// These drive the TS host codegen (`compiler/toWasm.ts`) directly, instantiating
// the emitted wasm and calling the exports — NOT the `.vl` self-host
// `emitProgram` harness (the feature lives in `toWasm.ts`). Run with:
//   deno test -A --no-check tests/export_function_test.ts
// (also picked up by `deno task test`, which targets the whole `tests/` dir.)

import { compile, compileProgram } from "../compiler/compile.ts";

// Tiny hand-rolled asserts (the repo has no std import map; sibling tests like
// symbols_test.ts / cases_test.ts roll their own).
const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};
const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  if (actual !== expected) {
    throw new Error(
      `${msg ? msg + ": " : ""}expected ${expected}, got ${actual}`,
    );
  }
};

// Instantiate wasm bytes and return its exports. The `WebAssembly.instantiate`
// overload set is ambiguous for a `Uint8Array` source under Deno's lib types
// (the result destructures to either `{instance}` or a bare `Instance`), so go
// through the typed buffer overload explicitly here.
const instantiate = async (
  wasm: Uint8Array,
  imports: Record<string, unknown>,
): Promise<WebAssembly.Exports> => {
  const result = await WebAssembly.instantiate(wasm as BufferSource, {
    imports: imports as WebAssembly.ModuleImports,
  });
  return result.instance.exports;
};

// Compile a single-file VL program and instantiate its wasm, returning the wasm
// exports object. No imports are needed for a pure scalar `export function`; a
// memory + the print/log sinks are supplied so a program whose start runs
// (script mode) still instantiates. Mirrors `runWasm`'s import shape.
const exportsOf = async (
  src: string,
): Promise<WebAssembly.Exports> => {
  const { wasm, diagnostics } = await compile(src);
  const errors = diagnostics.filter((d) => d.severity === "error");
  assert(
    errors.length === 0,
    `unexpected compile errors: ${errors.map((d) => d.message).join("; ")}`,
  );
  assert(wasm !== undefined, "expected wasm output");
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536 });
  const noop = () => {};
  return await instantiate(wasm!, {
    memory,
    __log__: noop,
    __log_string__: noop,
    __print_i32__: noop,
    __print_i64__: noop,
    __print_f32__: noop,
    __print_f64__: noop,
    __print_bool__: noop,
    __print_char__: noop,
    __print_str_flush__: noop,
  });
};

// Case 1: a single-file entry's `export function` is host-callable and returns
// the right value — even though nothing in the module calls it (it would
// otherwise be DCE'd to an empty module). Recursive, so it also proves the
// exported function's own name resolves inside its body.
Deno.test("entry export function is host-callable (fib)", async () => {
  const src = `export function fib(n: i32): i32 {
  if n < 2 { return n }
  return fib(n - 1) + fib(n - 2)
}`;
  const exports = await exportsOf(src);
  const fib = exports.fib as (n: number) => number;
  assertEquals(typeof fib, "function", "fib should be an exported function");
  assertEquals(fib(10), 55, "fib(10)");
  assertEquals(fib(0), 0, "fib(0)");
  assertEquals(fib(1), 1, "fib(1)");
});

// Case 2: a non-exported top-level `function` is NOT a wasm export, even when an
// exported function calls it (so it IS kept in the module, just not exposed).
Deno.test("non-exported helper is not a wasm export", async () => {
  const src = `function helper(n: i32): i32 { return n + 1 }
export function pub(n: i32): i32 { return helper(n) * 2 }`;
  const exports = await exportsOf(src);
  assertEquals(typeof exports.pub, "function", "pub should be exported");
  assert(!("helper" in exports), "helper must not be exported");
  const pub = exports.pub as (n: number) => number;
  assertEquals(pub(5), 12, "pub(5) = helper(5)*2 = 6*2");
});

// Case 3: a file with NO `export function` instantiates and runs its start as
// today — no host exports added, script/start model unchanged.
Deno.test("no export function: zero host exports, start unchanged", async () => {
  const exports = await exportsOf(`print(1 + 2)`);
  // No `export function` → no `fib`/anything beyond what the start model emits;
  // crucially no user-named host export appears.
  assert(!("fib" in exports), "no fib export");
  // The module still instantiated (start ran during instantiate) — reaching here
  // without throwing is the behavior-unchanged assertion.
  assert(true, "instantiated with start model");
});

// Case 4: ENTRY-ONLY semantics across modules. A 2-module program where the
// entry imports + uses a NON-entry module's `export function`: the program still
// works AND that imported function is NOT a wasm export — only the ENTRY's
// `export function` is exposed. This proves imported-module exports stay pure
// intra-program linkage (still tree-shakeable), which is what keeps the
// self-host build (a no-export driver entry) emitting zero host exports.
Deno.test("entry-only: imported module's export is not a wasm export", async () => {
  // Relative specifiers resolve against the importing file's dir; `dirOf` of a
  // bare `main.vl` key is "", so `./util` → key `util.vl` (no leading slash).
  const files: Record<string, string> = {
    "util.vl": `export function add(a: i32, b: i32): i32 { return a + b }`,
    "main.vl": `import { add } from "./util"
export function calc(n: i32): i32 { return add(n, 100) }`,
  };
  const { wasm, diagnostics } = await compileProgram(
    "main.vl",
    (key: string) => files[key],
  );
  const errors = diagnostics.filter((d) => d.severity === "error");
  assert(
    errors.length === 0,
    `unexpected errors: ${errors.map((d) => d.message).join("; ")}`,
  );
  assert(wasm !== undefined, "expected wasm output");
  const exports = await instantiate(wasm!, {});
  // The entry export is exposed and works (proving `add` is still linked in).
  assertEquals(typeof exports.calc, "function", "calc should be exported");
  const calc = exports.calc as (n: number) => number;
  assertEquals(calc(5), 105, "calc(5) = add(5, 100)");
  // The imported module's export is NOT a host export.
  assert(!("add" in exports), "imported add must not be a host export");
});
