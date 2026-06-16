// The playground's Run path (DOM-free): compile -> collect diagnostics -> (when
// clean) instantiate + capture `log` output -> (optionally) emit WAT.
//
// CODEGEN runs on the self-hosted compiler seed (the SAME `build/vl-compiler.wasm`
// the editor features and `vl build` run): the injected `WasmChecker.compile`
// turns source into wasm bytes via the driver's `compileSrc`. Execution is the
// pure `runWasm` (a `WebAssembly.instantiate` with the VL host-import ABI — no
// binaryen, no compiler front end). The TS compiler front end is no longer on the
// Run path.
//
// binaryen is now used ONLY to render the WAT text (`wasmToWat`), reached via a
// dynamic `import("./toWasm.ts")` so it loads lazily when the WAT pane is shown,
// not at module-eval time. `checkProgram` (the codegen-free TS front end) still
// backs the multi-file `checkProject` import-resolution diagnostics — pending its
// own move to the seed.

import { checkProgram, runWasm, type VLDiagnostic, wasmToWat } from "../../compiler/compile.ts";
import type { WasmChecker } from "../../lsp/src/wasmChecker.ts";

export type { VLDiagnostic };

// The playground is single-file by default; multi-file Run threads a reader over
// the project's in-memory file map. The entry module's key is its filename.
const NO_SIBLINGS = () => undefined;

export type PlaygroundResult = {
  diagnostics: VLDiagnostic[];
  /** Captured `log`/`print` output, one entry per line. Empty if not run. */
  logs: string[];
  /** WAT text, only when `wat: true` was requested and codegen succeeded. */
  wat?: string;
  /** True when codegen produced a module (no error diagnostics). */
  compiled: boolean;
  /** Size in bytes of the emitted wasm module, when one was produced. */
  wasmBytes?: number;
};

/**
 * Compile `source`, and — when it compiles cleanly — run it, capturing `log`
 * output. Optionally also emit the WAT text. Never throws: a thrown codegen
 * value is already folded into `diagnostics` by `compile`, and a runtime trap is
 * surfaced as a synthetic error diagnostic so the UI always has something to
 * show.
 */
export const runProgram = async (
  source: string,
  checker: WasmChecker,
  opts: { wat?: boolean } = {},
): Promise<PlaygroundResult> => {
  const { diagnostics, bytes } = await checker.compile(source, "main.vl", NO_SIBLINGS);
  return finishRun(diagnostics, bytes, opts);
};

/**
 * Multi-file (whole-program) variant of {@link runProgram}. `files` is the
 * project: filename → source. `entry` is the entry module (the first file,
 * `main.vl`), from which the import graph is resolved. `checker.compile` threads
 * the `read` over the file map (the seed's module pipeline resolves the graph to
 * ONE wasm module), matching VL's model: `N files → 1 module`. A single-file
 * project is just this with a one-entry graph — but `runProgram` stays the path
 * for the no-import case so existing callers/tests are untouched.
 */
export const runProject = async (
  files: Record<string, string>,
  entry: string,
  checker: WasmChecker,
  opts: { wat?: boolean } = {},
): Promise<PlaygroundResult> => {
  const { diagnostics, bytes } = await checker.compile(
    files[entry] ?? "",
    entry,
    (key) => files[key],
  );
  return finishRun(diagnostics, bytes, opts);
};

/**
 * Whole-program (codegen-free) front end for a project: resolve + parse +
 * type-check the import graph from `entry`, returning the aggregated diagnostics
 * (parse/type errors PLUS cross-module import-resolution errors). This is the
 * graph-aware analogue of the single-file `lsp.diagnostics` — `main.ts` uses it
 * so a multi-file project surfaces real import errors (bad path, name not
 * exported) instead of single-file "undeclared <imported-name>" noise.
 */
export const checkProject = async (
  files: Record<string, string>,
  entry: string,
): Promise<VLDiagnostic[]> => {
  const { diagnostics } = await checkProgram(entry, (key) => files[key]);
  return diagnostics;
};

// Shared tail: optionally emit WAT, then instantiate + capture `log` output.
const finishRun = async (
  diagnostics: VLDiagnostic[],
  wasm: Uint8Array | undefined,
  opts: { wat?: boolean },
): Promise<PlaygroundResult> => {
  // No module means error diagnostics (or codegen failed) — nothing to run.
  if (!wasm) {
    return { diagnostics, logs: [], compiled: false };
  }

  const wasmBytes = wasm.length;

  let wat: string | undefined;
  if (opts.wat) {
    try {
      wat = await wasmToWat(wasm);
    } catch (err) {
      // WAT rendering is a non-essential extra; never let it sink the run.
      wat = `; failed to emit WAT: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  }

  try {
    const { logs } = await runWasm(wasm);
    return { diagnostics, logs, wat, compiled: true, wasmBytes };
  } catch (err) {
    // A runtime trap (e.g. an out-of-bounds access) escapes WebAssembly
    // instantiation. Surface it as an error diagnostic with no source span so
    // the UI renders a clear message instead of a blank log pane.
    diagnostics.push({
      message: `Runtime error: ${
        err instanceof Error ? err.message : String(err)
      }`,
      severity: "error",
      source: "vital",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
    });
    return { diagnostics, logs: [], wat, compiled: true, wasmBytes };
  }
};
