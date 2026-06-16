// Render a wasm module as WAT text for the playground's WAT pane — binaryen
// disassembling the SEED's emitted bytes (binaryen no longer compiles VL; codegen
// is on the seed). Lifted out of `compiler/compile.ts`'s `wasmToWat` so the
// playground depends on nothing from the TS compiler.
//
// binaryen is imported here via a dynamic `import("binaryen")` so the build code-
// splits it into a chunk fetched only when the WAT pane is first shown — keeping
// the ~13 MB toolchain off the initial load (and off the Run path entirely).

/** Disassemble `wasm` to WAT text. Throws if binaryen can't read the module. */
export const watFromBytes = async (wasm: Uint8Array): Promise<string> => {
  const Binaryen = (await import("binaryen")).default;
  // Tolerate both binaryen forms (sync object / async init), mirroring toWasm.
  // deno-lint-ignore no-explicit-any
  const _Binaryen = Binaryen as any;
  const binaryen = typeof _Binaryen === "function" ? await _Binaryen() : _Binaryen;
  const m = binaryen.readBinary(wasm);
  try {
    return m.emitText();
  } finally {
    m.dispose();
  }
};
