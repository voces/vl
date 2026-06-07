// Browser entry point for the VL playground.
//
// This is the ONLY module bundled for the browser (see build.ts). It imports the
// headless compiler core read-only and exposes a single `runProgram` helper that
// mirrors the CLI's run flow (compiler/cli.ts): compile -> collect diagnostics ->
// (when clean) instantiate + capture `log` output -> (optionally) emit WAT.
//
// The key integration risk is binaryen-in-the-browser. binaryen@130 is an
// Emscripten single-file ESM build with the wasm inlined and a *top-level await*
// that instantiates it; importing the module therefore resolves only once the
// wasm is ready (ROADMAP F8 relies on the same property for the ESM LSP server).
// `compile` reaches binaryen via a dynamic `import("./toWasm.ts")`, so esbuild
// bundles it into this module and the TLA runs at module-eval time in the page.

import {
  checkProgram,
  compile,
  compileProgram,
  runWasm,
  type VLDiagnostic,
  wasmToWat,
} from "../../compiler/compile.ts";

export type { VLDiagnostic };

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
  opts: { wat?: boolean } = {},
): Promise<PlaygroundResult> => {
  const { diagnostics, wasm } = await compile(source);
  return finishRun(diagnostics, wasm, opts);
};

/**
 * Multi-file (whole-program) variant of {@link runProgram}. `files` is the
 * project: filename → source. `entry` is the entry module (the first file,
 * `main.vl`), from which the import graph is resolved. The whole graph is
 * compiled to ONE wasm module via `compileProgram` (compiler/compile.ts),
 * matching VL's model: `N files → 1 module`. A single-file project is just this
 * with a one-entry graph — but `runProgram` stays the path for the no-import
 * case so existing callers/tests are untouched.
 */
export const runProject = async (
  files: Record<string, string>,
  entry: string,
  opts: { wat?: boolean } = {},
): Promise<PlaygroundResult> => {
  const { diagnostics, wasm } = await compileProgram(
    entry,
    (key) => files[key],
    entry,
  );
  return finishRun(diagnostics, wasm, opts);
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
