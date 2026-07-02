// LSP-on-wasm regression: `readString` (lsp/src/wasmChecker.ts) must decode
// MB-scale strings. The single-spread `String.fromCodePoint(...cps)` threw
// `RangeError: Maximum call stack size exceeded` on ~2 MB payloads (V8 caps a
// call's argument count at the stack size), so formatting a large file killed
// the server; the chunked decode keeps every spread bounded. Exercised through
// `formatSrc`, the biggest readString consumer (it returns the whole file).
//
// Loads the real seed (`build/vl-compiler.wasm`); absent (fresh clone, no
// `refresh-compiler.sh` yet) it self-ignores — the wasm-suite convention.

import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";

const SEED = new URL("../build/vl-compiler.wasm", import.meta.url).pathname;
const seedExists = (() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})();

Deno.test({
  name: "wasm formatSrc: an MB-scale file round-trips (no fromCodePoint stack overflow)",
  ignore: !seedExists,
  fn: () => {
    const checker = loadWasmChecker(SEED, () => undefined, () => {});
    // Already-formatted lines, so the formatter's output length matches the
    // input — ~2.2 MB, comfortably past the argument-count RangeError point.
    const line = "print(1234567890)\n";
    const source = line.repeat(120_000);
    const out = checker.formatSrc(source);
    if (out === undefined) {
      throw new Error("formatSrc returned undefined on a valid large file");
    }
    if (out !== source) {
      throw new Error(
        `large-file format round-trip drifted: ${out.length} vs ${source.length} chars`,
      );
    }
  },
});

Deno.test({
  name: "wasm formatSrc: non-ASCII content survives the chunked decode",
  ignore: !seedExists,
  fn: () => {
    const checker = loadWasmChecker(SEED, () => undefined, () => {});
    // Astral + multi-byte code points across chunk boundaries: readString
    // operates on CODE POINTS, so no chunk may ever split a surrogate pair.
    const line = 'print("héllo 😀 wörld")\n';
    const source = line.repeat(9_000); // well past one 4096-cp chunk
    const out = checker.formatSrc(source);
    if (out !== source) {
      throw new Error("unicode large-file format round-trip drifted");
    }
  },
});
