// Run a wasm module the seed emitted, capturing its `print`/`log` output — the
// browser execution half of the playground's Run path. This is the pure
// `WebAssembly.instantiate` over VL's host-import ABI, lifted from
// `compiler/compile.ts`'s `runWasm` so the playground depends on NOTHING from the
// TS compiler (it compiles on the self-hosted seed; see `wasmCheckerBrowser.ts`).
// No binaryen, no front end — just the import object the emitted module expects.
//
// The seed's emitted module is byte-ABI-identical to the TS compiler's (the
// self-host fixpoint equivalence), so this import object — the SHARED
// `vlHostImports` the Deno test host also provides — runs it unchanged. The
// program runs as the module's START function, so a trap throws out of
// `instantiate`; the caller (`finishRun`) catches it and surfaces a
// runtime-error diagnostic.

import { vlHostImports } from "../../compiler/vlHostImports.ts";

/** Instantiate `wasm` and return the captured `print`/`log` lines. */
export const runWasmBytes = async (wasm: Uint8Array): Promise<string[]> => {
  const logs: string[] = [];
  // The ONLY imports any emitted module declares are the seven `__print_*__`
  // sinks: a program that uses linear memory DEFINES and exports its own, and no
  // module imports a host memory or the legacy log decoders. The playground
  // provides no fs floor, so a program using it LinkErrors, which is the design's
  // enforcement.
  const { extern, imports } = vlHostImports(logs);
  await WebAssembly.instantiate(wasm, { extern, imports });
  return logs;
};
