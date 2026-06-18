// Browser seed loader for the self-hosted compiler. The playground's LSP
// features (hover, completion, semantic tokens, inlay hints, go-to-definition,
// format) run on the SAME wasm seed the Node LSP and `vl check` run — driven
// through the environment-agnostic `createWasmChecker` core (lsp/src/
// wasmChecker.ts). This module is the browser counterpart of `wasmCheckerNode.ts`:
// where the Node loader reads the seed off disk (`node:fs`), here we FETCH it.
//
// The seed is `build/vl-compiler.wasm`, copied next to the bundle by build.ts;
// `new URL("vl-compiler.wasm", import.meta.url)` resolves it relative to the
// loaded module (`dist/playground.js`), so it works under any base path.
//
// Single global instance, loaded once. A failed fetch / instantiate (an old
// browser without WasmGC, or a build that didn't copy the seed) resolves to
// undefined — every LSP feature then degrades to "no result", exactly as the
// Node path does when no seed is present.

import {
  createWasmChecker,
  type Exports,
  type WasmChecker,
} from "../../lsp/src/wasmChecker.ts";
import type { ModuleReader } from "../../compiler/coreTypes.ts";
import { STD_SOURCES } from "../../std/embedded.ts";

// `std:` keys resolve from the generated embedded map — the no-filesystem path
// (docs/std-design.md D3). This mirrors `withStd` with no workspace `std/` dir
// (the browser has none): a `std:` key hits the embedded map, everything else
// passes through to the inner reader. The browser is single-file today, so the
// inner reader yields undefined for sibling imports.
const wrapReader = (read: ModuleReader): ModuleReader => (key) =>
  key.startsWith("std:") ? STD_SOURCES[key] : read(key);

let checker: WasmChecker | undefined;
let loadOnce: Promise<WasmChecker | undefined> | undefined;

/**
 * Load (once) the browser wasm checker, or undefined when the seed can't be
 * fetched/instantiated. Idempotent: concurrent callers share one fetch, and the
 * resolved checker is cached for the page's lifetime.
 */
export const loadBrowserChecker = (): Promise<WasmChecker | undefined> => {
  if (loadOnce !== undefined) return loadOnce;
  loadOnce = (async () => {
    try {
      const res = await fetch(new URL("vl-compiler.wasm", import.meta.url));
      if (!res.ok) return undefined;
      const bytes = new Uint8Array(await res.arrayBuffer());
      const module = await WebAssembly.compile(bytes);
      const instance = await WebAssembly.instantiate(module, {});
      const exports = instance.exports as unknown as Exports;
      checker = createWasmChecker(() => exports, wrapReader);
      return checker;
    } catch {
      return undefined;
    }
  })();
  return loadOnce;
};
