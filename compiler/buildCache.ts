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

import type { OptimizeCache, WasmEmit } from "./toWasm.ts";

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

// Fingerprint = hash of the compiler's own source + dependency pins + the
// toolchain identity. Memoized per process: it never changes within a single
// run. Reading the ~20 compiler files costs a few ms once; a cache hit it
// enables saves ~1.4 s.
//
// Paths are folded in RELATIVE to the compiler dir (not absolute) so the
// fingerprint is identical across machines/checkouts — a prerequisite for ever
// sharing the cache between a dev box and CI. The Deno version + target (os/arch)
// are included because the emitted wasm is, in principle, a function of the whole
// toolchain, and a shared CI cache must not serve blobs across Deno upgrades or
// architectures.
let fingerprintPromise: Promise<string> | undefined;
export const compilerFingerprint = (): Promise<string> => {
  if (fingerprintPromise) return fingerprintPromise;
  fingerprintPromise = (async () => {
    const enc = new TextEncoder();
    const parts: Uint8Array[] = [];
    const base = COMPILER_DIR.pathname;
    for (const file of walkTs(COMPILER_DIR)) {
      const rel = file.startsWith(base) ? file.slice(base.length) : file;
      parts.push(enc.encode(rel + "\0" + Deno.readTextFileSync(file) + "\0"));
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
    // Toolchain identity: Deno version + os/arch target.
    parts.push(enc.encode(`deno\0${Deno.version.deno}\0${Deno.build.target}\0`));
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

// --- optimize-stage cache -------------------------------------------------
//
// Unlike the whole-compile cache, the binaryen `optimize()` stage depends ONLY
// on binaryen — not on any compiler/*.ts. So it is keyed on the UNOPTIMIZED
// module bytes (the actual IR handed to optimize) plus a fingerprint of just the
// binaryen pin. That key survives every compiler change: it hits whenever a
// module's pre-optimize bytes are unchanged, regardless of which compiler file
// moved. (It still costs IR-build to produce those bytes — it saves the
// ~40%-of-compile optimize pass, not the whole compile.)

// Identity of the binaryen the optimize() output depends on. We trust the
// `deno.lock` integrity hash — it IS binaryen's package content hash, and the
// Deno path (the only cache consumer) runs binaryen unpatched straight from the
// lock (patch-package only affects the bundled LSP, which never uses this cache),
// so hashing the installed binary would buy nothing. We parse the lock as JSON
// (by key) rather than grepping lines, so the integrity — which lives on its own
// line, NOT a line containing "binaryen" — is actually captured. `Deno.build.target`
// is folded in so a shared CI cache can't serve optimize blobs across
// architectures. Falls back to a line scan if the lock can't be parsed.
let binaryenFpPromise: Promise<string> | undefined;
export const binaryenFingerprint = (): Promise<string> => {
  if (binaryenFpPromise) return binaryenFpPromise;
  binaryenFpPromise = (async () => {
    const fields: string[] = [`target\0${Deno.build.target}`];
    try {
      const json = Deno.readTextFileSync(new URL("deno.json", REPO_ROOT));
      const m = json.match(/"binaryen"\s*:\s*"([^"]+)"/);
      if (m) fields.push(`spec\0${m[1]}`);
    } catch { /* deno.json absent */ }
    let parsedLock = false;
    try {
      const lock = JSON.parse(
        Deno.readTextFileSync(new URL("deno.lock", REPO_ROOT)),
      ) as {
        npm?: Record<string, { integrity?: string }>;
        specifiers?: Record<string, string>;
      };
      for (const [key, entry] of Object.entries(lock.npm ?? {})) {
        if (key.startsWith("binaryen@")) {
          fields.push(`npm\0${key}\0${entry.integrity ?? ""}`);
          parsedLock = true;
        }
      }
      for (const [key, ver] of Object.entries(lock.specifiers ?? {})) {
        if (key.includes("binaryen")) fields.push(`specifier\0${key}\0${ver}`);
      }
    } catch { /* fall through to line scan */ }
    if (!parsedLock) {
      // Defensive fallback: lock missing or unparseable — scan for binaryen lines.
      try {
        const text = Deno.readTextFileSync(new URL("deno.lock", REPO_ROOT));
        for (const line of text.split("\n")) {
          if (line.includes("binaryen")) fields.push(line.trim());
        }
      } catch { /* absent */ }
    }
    return await sha256Hex(new TextEncoder().encode(fields.join("\n")));
  })();
  return binaryenFpPromise;
};

// SHA-256 over (binaryen fp ⊕ salt ⊕ unoptimized bytes). A cryptographic hash
// (not a rolling hash) so a collision can't silently swap in the wrong optimized
// module. The unopt module is large but digesting it is a few ms — negligible
// against the ~600 ms optimize() pass a hit avoids.
const optimizeKey = async (
  binaryenFp: string,
  salt: string,
  unoptimized: Uint8Array,
): Promise<string> => {
  const header = new TextEncoder().encode(`${binaryenFp}\0${salt}\0`);
  const buf = new Uint8Array(header.length + unoptimized.length);
  buf.set(header, 0);
  buf.set(unoptimized, header.length);
  return `opt-${await sha256Hex(buf)}`;
};

/**
 * Build an {@link OptimizeCache} backed by the on-disk blob store, keyed on the
 * binaryen pin + the unoptimized module bytes. The binaryen fingerprint is
 * resolved once at creation; `get`/`put` are async (the toWasm seam awaits them)
 * so the per-call SHA-256 stays off any hot synchronous path.
 */
export const createOptimizeCache = async (): Promise<OptimizeCache> => {
  const binaryenFp = await binaryenFingerprint();
  return {
    async get(unoptimized: Uint8Array, salt: string): Promise<WasmEmit | undefined> {
      const key = await optimizeKey(binaryenFp, salt, unoptimized);
      const binary = readCachedBlob(`${key}.opt.wasm`);
      if (!binary) return undefined;
      const mapBytes = readCachedBlob(`${key}.opt.map`);
      const sourceMap = mapBytes ? new TextDecoder().decode(mapBytes) : undefined;
      return { binary, sourceMap };
    },
    async put(
      unoptimized: Uint8Array,
      salt: string,
      optimized: WasmEmit,
    ): Promise<void> {
      const key = await optimizeKey(binaryenFp, salt, unoptimized);
      writeCachedBlob(`${key}.opt.wasm`, optimized.binary);
      if (optimized.sourceMap !== undefined) {
        writeCachedBlob(
          `${key}.opt.map`,
          new TextEncoder().encode(optimized.sourceMap),
        );
      }
    },
  };
};
