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
  // Compile first so the module's OWN declared imports drive the host object: a
  // program with no `print` imports nothing under `imports`, so it instantiates
  // against an EMPTY sink object rather than seven stubs it never calls — the
  // zero-glue browser host (veldt surprise #4). A program using linear memory
  // DEFINES and exports its own, and none imports a host memory or the legacy log
  // decoders; the playground provides no fs floor, so a program using it
  // LinkErrors, which is the design's enforcement.
  // `as BufferSource` bridges the same `ArrayBufferLike`/`ArrayBuffer` variance
  // gap `runWasm.ts` documents — invisible to this API, which accepts the bytes.
  const module = await WebAssembly.compile(wasm as BufferSource);
  const declared = WebAssembly.Module.imports(module)
    .filter((i) => i.module === "imports")
    .map((i) => i.name);
  const { extern, imports } = vlHostImports(logs, declared);
  await WebAssembly.instantiate(module, { extern, imports });
  return logs;
};
