// Tests for the wasm debug pipeline (roadmap B-debug): the source map emitted
// during codegen, and the trap-to-source mapping that turns a raw wasm trap
// into a VL-source-located runtime error.
//
//   - `compile` carries a Source Map v3 alongside the wasm.
//   - a wasm trap (array OOB, divide-by-zero) is rethrown by `runWasm` as a
//     `VLRuntimeError` whose message names the VL `file:line:column` and reason.
//   - debug info is ADDITIVE: a `@run` program's behavior/output is unchanged.
//
// Run with:  deno test -A --no-check tests/source_map_test.ts

import { compile, runWasm, VLRuntimeError } from "../compiler/compile.ts";

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

// Run a source expected to compile cleanly; return its compile result.
const compileClean = async (src: string, file = "demo.vl") => {
  const result = await compile(src, file);
  const errs = result.diagnostics.filter((d) => d.severity === "error");
  assert(
    errs.length === 0,
    `expected clean compile, got errors: ${
      JSON.stringify(errs.map((e) => e.message))
    }`,
  );
  assert(result.wasm !== undefined, "expected wasm output");
  return result;
};

// Catch a trap thrown by runWasm; fail if no error is thrown.
const expectTrap = async (
  wasm: Uint8Array,
  sourceMap: string | undefined,
): Promise<VLRuntimeError> => {
  try {
    await runWasm(wasm, sourceMap);
  } catch (err) {
    if (err instanceof VLRuntimeError) return err;
    throw new Error(
      `expected a VLRuntimeError, got ${(err as Error).name}: ${
        (err as Error).message
      }`,
    );
  }
  throw new Error("expected a trap, but the program ran without trapping");
};

Deno.test("compile emits a source map referencing the VL file", async () => {
  const { sourceMap } = await compileClean(
    `let xs = [1, 2, 3]\nprint(xs[0])\n`,
  );
  assert(sourceMap !== undefined, "expected a source map");
  const parsed = JSON.parse(sourceMap!);
  assert(parsed.version === 3, "expected Source Map v3");
  assert(
    Array.isArray(parsed.sources) && parsed.sources.includes("demo.vl"),
    `expected sources to include demo.vl, got ${
      JSON.stringify(parsed.sources)
    }`,
  );
  assert(
    typeof parsed.mappings === "string" && parsed.mappings.length > 0,
    "expected non-empty mappings (debug locations survived optimization)",
  );
});

Deno.test("array out-of-bounds read maps to its VL source line", async () => {
  // OOB read on line 3: `print(xs[i])`.
  const { wasm, sourceMap } = await compileClean(
    `let xs = [10, 20, 30]\nlet i = 5\nprint(xs[i])\n`,
  );
  const err = await expectTrap(wasm!, sourceMap);
  assert(
    err.location !== undefined,
    `expected a precise source location, got: ${err.message}`,
  );
  assert(
    err.location!.line === 3,
    `expected line 3, got ${err.location!.line} (${err.message})`,
  );
  assert(
    err.reason === "array index out of bounds",
    `expected OOB reason, got "${err.reason}"`,
  );
  assert(
    err.message.startsWith("runtime error at demo.vl:3:"),
    `unexpected message: ${err.message}`,
  );
});

Deno.test("array out-of-bounds write maps to its VL source line", async () => {
  // OOB write on line 3: `xs[i] = 99`.
  const { wasm, sourceMap } = await compileClean(
    `let xs = [1, 2, 3]\nlet i = 9\nxs[i] = 99\n`,
  );
  const err = await expectTrap(wasm!, sourceMap);
  assert(
    err.location?.line === 3,
    `expected line 3, got ${err.location?.line} (${err.message})`,
  );
  assert(
    err.reason === "array index out of bounds",
    `expected OOB reason, got "${err.reason}"`,
  );
});

Deno.test("division by zero maps to its VL source line", async () => {
  // Divide-by-zero on line 3: `print(a / b)`.
  const { wasm, sourceMap } = await compileClean(
    `let a = 10\nlet b = 0\nprint(a / b)\n`,
  );
  const err = await expectTrap(wasm!, sourceMap);
  assert(
    err.location?.line === 3,
    `expected line 3, got ${err.location?.line} (${err.message})`,
  );
  assert(
    err.reason === "division by zero",
    `expected divide-by-zero reason, got "${err.reason}"`,
  );
});

Deno.test("a clean @run program is unaffected by debug info", async () => {
  // Debug info is additive: the program must produce its normal output.
  const { wasm, sourceMap } = await compileClean(
    `let xs = [10, 20, 30]\nprint(xs[1])\n`,
  );
  const { logs } = await runWasm(wasm!, sourceMap);
  assert(
    JSON.stringify(logs) === JSON.stringify(["20"]),
    `expected ["20"], got ${JSON.stringify(logs)}`,
  );
});

Deno.test("without a source map, a trap still yields a VLRuntimeError", async () => {
  // No source map → no precise line, but the trap reason is still recovered
  // (the function-level / reason-only fallback).
  const { wasm } = await compileClean(
    `let xs = [1, 2, 3]\nlet i = 7\nprint(xs[i])\n`,
  );
  let threw = false;
  try {
    await runWasm(wasm!); // omit the source map
  } catch (err) {
    threw = true;
    assert(
      err instanceof VLRuntimeError,
      `expected VLRuntimeError, got ${(err as Error).name}`,
    );
    assert(
      (err as VLRuntimeError).reason === "array index out of bounds",
      `expected OOB reason, got "${(err as VLRuntimeError).reason}"`,
    );
  }
  assert(threw, "expected a trap without a source map");
});

Deno.test("the emitted wasm carries the VL name section", async () => {
  // binaryen emits a name section for named functions; confirm the VL program's
  // entry function name (`__program__`) is present in the binary so a host trace
  // shows VL names, not bare indices. We assert on the raw bytes (the name
  // section stores names as UTF-8).
  const { wasm } = await compileClean(`print(1 + 2)\n`);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(wasm!);
  assert(
    text.includes("__program__"),
    "expected the wasm name section to contain the VL entry function name",
  );
});
