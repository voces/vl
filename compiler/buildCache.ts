// Content-addressed build cache — a Deno-only dev/build/test layer.
//
// IMPORTANT: this is NOT part of the runtime-agnostic compiler core. `compile.ts`
// and `toWasm.ts` stay free of `Deno`/filesystem use so they bundle into the LSP
// and playground; this module uses `Deno` directly (like `cli.ts`) and must only
// be imported by Deno entry points (the CLI, the test suite, build scripts) —
// never from the core or anything esbuild bundles.
//
// What it provides: a tiny content-addressed blob store for expensive,
// DETERMINISTIC compiler outputs (today: emitted wasm). Every key folds in a
// fingerprint of the compiler ITSELF — every `compiler/**/*.ts` file plus the
// dependency pins in `deno.json`/`deno.lock` — so any change to the compiler
// invalidates every entry. The cache can therefore never serve output produced
// by a different compiler: a miss after a compiler change recompiles from
// scratch. (The fingerprint is intentionally coarse — ANY compiler edit busts
// the whole cache. That trades some avoidable misses for an airtight no-stale
// guarantee; per-stage/per-module fingerprints are a later refinement.)
//
// Config:
//   VL_CACHE_DIR   override the cache location (default <tmpdir>/vl-cache)
//   VL_NO_CACHE=1  bypass entirely (every read misses, every write is a no-op)

const NO_CACHE = !!Deno.env.get("VL_NO_CACHE");

const CACHE_DIR = Deno.env.get("VL_CACHE_DIR") ??
  `${
    Deno.env.get("TMPDIR") ?? Deno.env.get("TEMP") ?? Deno.env.get("TMP") ??
      "/tmp"
  }/vl-cache`;

// This file lives in compiler/, so `./` is the compiler dir and `../` the repo
// root — the two inputs the fingerprint hashes.
const COMPILER_DIR = new URL("./", import.meta.url);
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
// per process: it never changes within a single run. Reading the ~20 compiler
// files costs a few ms once; a cache hit it enables saves ~1.4 s.
let fingerprintPromise: Promise<string> | undefined;
export const compilerFingerprint = (): Promise<string> => {
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
          enc.encode(
            rel + "\0" + Deno.readTextFileSync(new URL(rel, REPO_ROOT)),
          ),
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

/**
 * A cache key for `parts`, with the compiler fingerprint always folded in. Pass
 * a short namespace label first (e.g. `"wasm"`) plus whatever fully determines
 * the output (source text, flags). Two callers that pass the same parts under
 * the same compiler get the same key.
 */
export const cacheKey = async (...parts: string[]): Promise<string> => {
  const fp = await compilerFingerprint();
  return await sha256Hex(new TextEncoder().encode(fp + "\0" + parts.join("\0")));
};

let cacheDirReady = false;
const ensureCacheDir = (): void => {
  if (cacheDirReady) return;
  Deno.mkdirSync(CACHE_DIR, { recursive: true });
  cacheDirReady = true;
};

/** The cached blob for `key`, or `undefined` on a miss (or when disabled). */
export const readCachedBlob = (key: string): Uint8Array | undefined => {
  if (NO_CACHE) return undefined;
  try {
    return Deno.readFileSync(`${CACHE_DIR}/${key}`);
  } catch {
    return undefined; // miss
  }
};

/**
 * Store `bytes` under `key`. No-op when caching is disabled. Writes atomically
 * (temp + rename) so a parallel worker producing the same key can never observe
 * a half-written file.
 */
export const writeCachedBlob = (key: string, bytes: Uint8Array): void => {
  if (NO_CACHE) return;
  ensureCacheDir();
  const path = `${CACHE_DIR}/${key}`;
  const tmp = `${path}.${Deno.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  Deno.writeFileSync(tmp, bytes);
  Deno.renameSync(tmp, path);
};
