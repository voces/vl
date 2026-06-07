// Self-host test compile cache — a thin wrapper over the shared, content-
// addressed build cache (`compiler/buildCache.ts`).
//
// Why it exists: every `selfhost_*_test.ts` sub-test compiles a large
// concatenated compiler module (`ast.vl ++ parser.vl ++ typecheck.vl[ ++
// lexer.vl] ++ driver`) through the full pipeline — lex/parse/typecheck, then
// binaryen IR build + `optimize()` + emit. That is ~1.4 s each (optimize alone
// ~40%), and the suite does ~19 of them. The output is a pure function of
// (source text, compiler code), so it caches perfectly across runs.
//
// `compileCached(source)` keys the emitted wasm on the source plus the compiler
// fingerprint (see `buildCache.ts`). On a hit it serves the cached bytes and
// skips compilation; on a miss it runs the real `compile()` — with `optimize()`
// ON, so the wasm is byte-identical to an uncached build — and stores the
// result. Any compiler edit changes the fingerprint, so the cache can never
// serve stale codegen.
//
// Test-only glue: the production `compile()`/`toWasm()` path is untouched.

import { compile, type VLDiagnostic } from "../compiler/compile.ts";
import {
  cacheKey,
  createOptimizeCache,
  readCachedBlob,
  writeCachedBlob,
} from "../compiler/buildCache.ts";

/** Subset of `CompileResult` the self-host drivers consume. */
export type CachedCompile = {
  wasm: Uint8Array | undefined;
  diagnostics: VLDiagnostic[];
};

// Two cache tiers (the second is what survives the constant compiler churn):
//   1. Whole-compile cache, keyed on source + the WHOLE compiler. A full hit is
//      free (no compile at all) but it busts on any compiler edit.
//   2. Optimize-stage cache, keyed on the unoptimized bytes + binaryen only.
//      When tier 1 misses because the compiler changed, this still reuses the
//      ~40%-of-compile optimize() pass for every module whose codegen output is
//      unchanged — i.e. the common "added a feature, existing output identical"
//      commit. Injected into `compile()` so the core never imports the cache.
const optimizeCache = createOptimizeCache(); // memoized promise

/**
 * Like `compile(source)` but cached. Tier 1: a full hit returns the stored wasm
 * with no compile. Tier 2 (on a tier-1 miss): the real `compile()` runs with the
 * optimize-stage cache injected, so `optimize()` is skipped for any module whose
 * pre-optimize bytes are unchanged. Only clean compiles are cached.
 */
export const compileCached = async (source: string): Promise<CachedCompile> => {
  const key = `${await cacheKey("selfhost-wasm", source)}.wasm`;
  const cached = readCachedBlob(key);
  if (cached) return { wasm: cached, diagnostics: [] };

  const { wasm, diagnostics } = await compile(source, "source.vl", {
    optimizeCache: await optimizeCache,
  });
  if (wasm && !diagnostics.some((d) => d.severity === "error")) {
    writeCachedBlob(key, wasm);
  }
  return { wasm, diagnostics };
};
