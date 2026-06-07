// Content-addressed wasm cache for the self-host test compiles.
//
// Why this exists: every `selfhost_*_test.ts` sub-test compiles a large
// concatenated compiler module (`ast.vl ++ parser.vl ++ typecheck.vl[ ++
// lexer.vl] ++ driver`) through the full pipeline — lex/parse/typecheck, then
// binaryen IR build + `optimize()` + emit. That is ~1.4 s each (optimize alone
// is ~40%), and the suite does ~13 of them. The compiles are PURE functions of
// (source text, compiler code), so their output is reusable across runs.
//
// `compileCached(source)` keys the emitted wasm on a SHA-256 of the source plus
// a fingerprint of the compiler itself (every `compiler/**/*.ts` file + the
// dependency pins in `deno.json`/`deno.lock`). On a hit it returns the cached
// bytes and skips compilation entirely; on a miss it compiles (with the real
// `optimize()` pass — coverage is unchanged) and stores the result. Any edit to
// the compiler changes the fingerprint, so the cache can never serve stale
// codegen: a miss after a compiler change recompiles from scratch.
//
// This is TEST-ONLY glue: the production `compile()`/`toWasm()` path is
// untouched, the CLI/LSP/playground never see this cache, and the wasm the
// tests run is byte-identical to what `compile()` produces uncached.
//
// Cache location: `$VL_CACHE_DIR` if set, else `<tmpdir>/vl-selfhost-cache`.
// Set `VL_NO_CACHE=1` to bypass entirely (always compile fresh).

import { compile, type VLDiagnostic } from "../compiler/compile.ts";

const NO_CACHE = !!Deno.env.get("VL_NO_CACHE");

const CACHE_DIR = Deno.env.get("VL_CACHE_DIR") ??
  `${
    Deno.env.get("TMPDIR") ?? Deno.env.get("TEMP") ?? Deno.env.get("TMP") ??
      "/tmp"
  }/vl-selfhost-cache`;

const COMPILER_DIR = new URL("../compiler/", import.meta.url);
const REPO_ROOT = new URL("../", import.meta.url);

const toHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );

const sha256Hex = async (data: Uint8Array): Promise<string> =>
  toHex(await crypto.subtle.digest("SHA-256", data as BufferSource));

// Every `.ts` under compiler/, sorted for a stable order.
const walkTs = (dir: URL): string[] => {
  const out: string[] = [];
  for (const entry of Deno.readDirSync(dir)) {
    const child = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) out.push(...walkTs(child));
    else if (entry.name.endsWith(".ts")) out.push(child.pathname);
  }
  return out.sort();
};

// Fingerprint = hash of the compiler's own source + dependency pins. Memoized
// per process: it never changes within a single test run. Reading the ~20
// compiler files costs a few ms once; a cache hit saves ~1.4 s.
let fingerprintPromise: Promise<string> | undefined;
const compilerFingerprint = (): Promise<string> => {
  if (fingerprintPromise) return fingerprintPromise;
  fingerprintPromise = (async () => {
    const enc = new TextEncoder();
    const parts: Uint8Array[] = [];
    for (const file of walkTs(COMPILER_DIR)) {
      parts.push(enc.encode(file + "\0" + Deno.readTextFileSync(file) + "\0"));
    }
    // Dependency pins (binaryen version etc.) affect codegen output too.
    for (const rel of ["deno.json", "deno.lock"]) {
      try {
        parts.push(
          enc.encode(rel + "\0" + Deno.readTextFileSync(new URL(rel, REPO_ROOT))),
        );
      } catch { /* deno.lock may be absent — skip */ }
    }
    let total = 0;
    for (const p of parts) total += p.length;
    const joined = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      joined.set(p, off);
      off += p.length;
    }
    return await sha256Hex(joined);
  })();
  return fingerprintPromise;
};

const cacheKey = async (source: string): Promise<string> => {
  const fp = await compilerFingerprint();
  return await sha256Hex(new TextEncoder().encode(fp + "\0" + source));
};

let cacheDirReady = false;
const ensureCacheDir = (): void => {
  if (cacheDirReady) return;
  Deno.mkdirSync(CACHE_DIR, { recursive: true });
  cacheDirReady = true;
};

// Write atomically (temp + rename) so a parallel worker compiling the same
// source can never observe a half-written file.
const writeAtomic = (path: string, bytes: Uint8Array): void => {
  const tmp = `${path}.${Deno.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  Deno.writeFileSync(tmp, bytes);
  Deno.renameSync(tmp, path);
};

/** Subset of `CompileResult` the self-host drivers consume. */
export type CachedCompile = {
  wasm: Uint8Array | undefined;
  diagnostics: VLDiagnostic[];
};

/**
 * Like `compile(source)` but serves the emitted wasm from a content-addressed
 * disk cache when source + compiler are unchanged. On a hit, `diagnostics` is
 * empty (only clean compiles are cached); on a miss it runs the real
 * `compile()` and caches the wasm when it compiled cleanly.
 */
export const compileCached = async (source: string): Promise<CachedCompile> => {
  if (NO_CACHE) {
    const { wasm, diagnostics } = await compile(source);
    return { wasm, diagnostics };
  }
  ensureCacheDir();
  const key = await cacheKey(source);
  const path = `${CACHE_DIR}/${key}.wasm`;
  try {
    const wasm = Deno.readFileSync(path);
    return { wasm, diagnostics: [] };
  } catch { /* miss — fall through to compile */ }

  const { wasm, diagnostics } = await compile(source);
  if (wasm && !diagnostics.some((d) => d.severity === "error")) {
    writeAtomic(path, wasm);
  }
  return { wasm, diagnostics };
};
