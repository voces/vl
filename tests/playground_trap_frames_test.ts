// THE TRAPPING INSTRUCTION'S LINE, IN THE PLAYGROUND (ROADMAP row 22 / row 27 residue).
//
// The native host and the Deno test host already print the `at <line>:<col>  in `fn`` block
// under a trap (`tests/vl_trap_source_frames_test.ts`), joined from the emitter's `vl-src`
// custom section against the trap frame's byte offset. This suite is the PLAYGROUND's half:
// `runProgram` enables the section for the run-path compile (`setEmitNames`), runs the module
// on the browser's `WebAssembly.instantiate` (`runtime.ts`), and — on a trap — resolves the
// same block through the SHARED reader now at `compiler/vlSrcSection.ts`.
//
// The join key is V8's `wasm-function[N]:0xNNN` offset, and V8 is V8 whether it is Deno's
// (here) or the browser's, so this grades the reader the page runs. The EXPECTED block is
// the same array the Deno suite asserts for the same program — that is the point: one format,
// read once, so the two hosts cannot drift.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the suite self-ignores, the same
// convention the other wasm suites use.

import { createWasmChecker, type Exports, type WasmChecker } from "../lsp/src/wasmChecker.ts";
import { runProgram } from "../playground/src/playground.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
};

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

// One compiled Module, a fresh Instance per checker — the module is immutable and compiling
// is the expensive half, so every checker gets its own store (independent `setEmitNames`).
const module = seedExists
  ? new WebAssembly.Module(Deno.readFileSync(SEED) as BufferSource)
  : undefined;
const seedChecker = (): WasmChecker => {
  if (!module) throw new Error(`no seed at ${SEED}`);
  const instance = new WebAssembly.Instance(module, {});
  return createWasmChecker(() => instance.exports as unknown as Exports);
};

// A trap INSIDE a function: `boom` is declared on line 3 and its out-of-bounds read is on
// line 7; the module-scope call that reaches it is on line 11. The lines differ from the
// declarations, so a regression to naming the declaration (or to no frames) cannot pass.
const TRAP_SRC = [
  "// line 1",
  "// line 2",
  "function boom(n: i32): i32 {",
  "  // line 4",
  "  const xs = [1, 2]",
  "  // line 6",
  "  xs[n]",
  "}",
  "// line 9",
  "print(boom(0))",
  "print(boom(9))",
  "",
].join("\n");

Deno.test({
  name: "playground-trap: a trap resolves to the instruction's source frames",
  ignore,
  fn: async () => {
    const result = await runProgram(TRAP_SRC, seedChecker());
    // The run trapped, so it is surfaced as an error diagnostic (positionless) plus the
    // resolved frames — the same block `vl run` and the Deno host print for this program.
    if (!result.diagnostics.some((d) => d.severity === "error")) {
      throw new Error(`expected a runtime-error diagnostic, got ${JSON.stringify(result.diagnostics)}`);
    }
    assertEquals(
      result.sourceFrames,
      ["at 7:3  in `boom`", "at 11:1  in `__start__`"],
      "resolved trap frames",
    );
  },
});

Deno.test({
  name: "playground-trap: a clean run carries no source frames",
  ignore,
  fn: async () => {
    const result = await runProgram("print(1 + 2)\n", seedChecker());
    if (result.diagnostics.some((d) => d.severity === "error")) {
      throw new Error(`unexpected errors: ${JSON.stringify(result.diagnostics)}`);
    }
    assertEquals(result.logs, ["3"], "captured output");
    if (result.sourceFrames !== undefined) {
      throw new Error(`a clean run must carry no frames, got ${JSON.stringify(result.sourceFrames)}`);
    }
  },
});

Deno.test({
  name: "playground-trap: a module-scope trap names its own line",
  ignore,
  fn: async () => {
    // Depth 1 — the out-of-bounds read is at module scope, on line 3.
    const src = ["// line 1", "// line 2", "const xs = [1, 2]", "print(xs[9])", ""].join("\n");
    const result = await runProgram(src, seedChecker());
    if (!result.diagnostics.some((d) => d.severity === "error")) {
      throw new Error(`expected a runtime-error diagnostic, got ${JSON.stringify(result.diagnostics)}`);
    }
    assertEquals(result.sourceFrames, ["at 4:1  in `__start__`"], "module-scope frame");
  },
});
