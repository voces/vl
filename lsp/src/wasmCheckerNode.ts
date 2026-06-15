// The Node-side seed loader for the wasm-backed checker. This is the only piece
// of the LSP-on-wasm path that touches the filesystem: it reads
// `build/vl-compiler.wasm` off disk (`node:fs`), instantiates it, and hands the
// live driver exports to the environment-agnostic core (`createWasmChecker` in
// wasmChecker.ts). The browser playground has its own loader (fetched bytes) and
// never imports this module — keeping `node:fs` out of the browser bundle.
//
// Re-exports the whole `wasmChecker.ts` surface (types + diff helpers) so a Node
// consumer needs a single import for both `loadWasmChecker` and the checker
// types.

import { readFileSync, statSync } from "node:fs";
import type { ModuleReader } from "../../compiler/modules.ts";
import { withStd } from "./moduleGraph.ts";
import { createWasmChecker, type Exports, type WasmChecker } from "./wasmChecker.ts";

export * from "./wasmChecker.ts";

/**
 * Load (or reuse) the checker for the seed at `wasmPath`. Returns undefined —
 * after one `log` line — when the seed is missing or the host cannot
 * instantiate it (no WasmGC). The instance is cached and transparently
 * reloaded when the seed file's mtime changes (a dev `refresh-compiler.sh`
 * mid-session picks up the new compiler without an editor reload).
 *
 * `getStdDir` feeds the `withStd` wrapper around every check's reader: a
 * workspace `std/` dir (when one exists) wins over the embedded std map, the
 * same precedence the TS checker's workspace reader applies.
 */
export const loadWasmChecker = (
  wasmPath: string,
  log: (msg: string) => void,
  getStdDir?: () => string | undefined,
): WasmChecker | undefined => {
  let exports: Exports | undefined;
  let loadedMtime = -1;

  const instantiate = (): Exports | undefined => {
    let mtime: number;
    try {
      mtime = statSync(wasmPath).mtimeMs;
    } catch {
      log(`[wasm-checker] seed not found at ${wasmPath}`);
      return undefined;
    }
    if (exports !== undefined && mtime === loadedMtime) return exports;
    try {
      const bytes = readFileSync(wasmPath);
      const module = new WebAssembly.Module(bytes as BufferSource);
      const instance = new WebAssembly.Instance(module, {});
      exports = instance.exports as unknown as Exports;
      loadedMtime = mtime;
      log(`[wasm-checker] loaded ${wasmPath} (${bytes.length} bytes)`);
      return exports;
    } catch (err) {
      log(`[wasm-checker] failed to instantiate ${wasmPath}: ${err}`);
      exports = undefined;
      return undefined;
    }
  };

  // Probe once at startup so a hopeless host degrades immediately; later
  // mtime-driven reloads are per-check (handled inside `instantiate`).
  if (instantiate() === undefined) return undefined;

  return createWasmChecker(
    instantiate,
    (read: ModuleReader) => withStd(read, getStdDir),
  );
};
