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
import { cacheKey, readCachedBlob, writeCachedBlob } from "../compiler/buildCache.ts";

/** Subset of `CompileResult` the self-host drivers consume. */
export type CachedCompile = {
  wasm: Uint8Array | undefined;
  diagnostics: VLDiagnostic[];
};

/**
 * Like `compile(source)` but serves the emitted wasm from the content-addressed
 * cache when source + compiler are unchanged. On a hit, `diagnostics` is empty
 * (only clean compiles are cached); on a miss it runs the real `compile()` and
 * caches the wasm when it compiled cleanly.
 */
export const compileCached = async (source: string): Promise<CachedCompile> => {
  const key = `${await cacheKey("selfhost-wasm", source)}.wasm`;
  const cached = readCachedBlob(key);
  if (cached) return { wasm: cached, diagnostics: [] };

  const { wasm, diagnostics } = await compile(source);
  if (wasm && !diagnostics.some((d) => d.severity === "error")) {
    writeCachedBlob(key, wasm);
  }
  return { wasm, diagnostics };
};
