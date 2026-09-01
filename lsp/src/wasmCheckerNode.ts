// The Node-side seed loader for the wasm-backed checker. This is the only piece
// of the LSP-on-wasm path that touches the filesystem or spawns a process: it
// resolves the compiler seed, instantiates it, and hands the live driver exports
// to the environment-agnostic core (`createWasmChecker` in wasmChecker.ts). The
// browser playground has its own loader (fetched bytes) and never imports this
// module — keeping `node:fs` out of the browser bundle.
//
// THE LADDER, AND WHY IT IS A LADDER. This used to resolve exactly one path,
// `<workspace>/build/vl-compiler.wasm`, and that path is a GITIGNORED ARTIFACT OF
// THE COMPILER REPO. So the extension worked inside the vl checkout and silently
// did nothing in every other project — no diagnostics, no go-to-definition, no
// hover, no inlay hints, and no way to tell that apart from a clean file. The
// only symptom was one line in the server log.
//
// The CLI had already solved this. `scripts/vl-host/src/main.rs` resolves
// `--compiler → $VL_COMPILER_WASM → ./build/vl-compiler.wasm → embedded`, the last
// rung being a seed baked into a release binary so a distributed `vl` runs
// anywhere. This mirrors that ladder and adds the two rungs an editor needs:
// asking an installed `vl` for its seed, and a copy shipped inside the extension.
//
// Order is deliberate — most specific first, most portable last:
//
//   1. `vital.compilerWasm`          explicit; a stated path is honoured or fails
//   2. `$VL_COMPILER_WASM`           same variable the CLI reads
//   3. <workspace>/build/…           the compiler repo's own dev loop
//   4. the extension's bundled copy  built from the SAME tree as this server
//   5. `vl seed`                     an installed CLI's seed — the fallback for
//                                    a bundle shipped without one
//
// Rungs 4 and 5 swapped on 2026-08-31, from a live failure: an installed CLI's
// embedded seed was ABI-compatible but BEHAVIORALLY stale (pre-scopeAt-filter),
// `speaksAbi` rightly accepted it — it answers "can I decode you", not "are you
// current" — and completion silently regressed in every non-checkout workspace.
// What decides the order is that the two failure modes are ASYMMETRIC IN
// VISIBILITY: `vl seed` first fails SILENTLY (new server, old compiler — a
// feature just doesn't happen, nothing reports), while bundled-first fails
// VISIBLY (old compiler against a newer project toolchain — diagnostics
// disagree with the user's own `vl`, odd enough to get reported). With no
// stamp to compare, prefer the seed PAIRED with this server binary: that
// pairing is the one the code actually assumes, and the build step is the only
// thing that guarantees it. Rung 5 is consequently RARE rather than routine —
// `bundle-seed.ts` writes a seed on every build that can reach one, so the CLI
// rung fires only for a bundle built where neither a checkout seed nor `vl`
// existed. The real resolution is a BUILD-IDENTITY stamp the seed exports and
// the server compares to its own baked-in value (equal → use; different → say
// which is newer) — an ABI version is too coarse, pre- and post-filter seeds
// share one. Until that exists, rung order stops standing in for freshness
// only by keeping the paired artifact first.

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import type { ModuleReader } from "../../compiler/coreTypes.ts";
import { withStd } from "./moduleGraph.ts";
import { createWasmChecker, type Exports, type WasmChecker } from "./wasmChecker.ts";

export * from "./wasmChecker.ts";

/**
 * One rung. `path` reads a file (and re-reads it when its mtime moves, so a dev
 * `refresh-compiler.sh` mid-session is picked up without an editor reload);
 * `exec` runs a command whose stdout IS the seed. `explicit` marks a rung the
 * user asked for by name: those fail loudly rather than falling through, the
 * same rule `resolve_compiler` applies to `--compiler`/`$VL_COMPILER_WASM`.
 */
export type SeedSource =
  | { kind: "path"; label: string; path: string; explicit?: boolean }
  | { kind: "exec"; label: string; cmd: string; args: string[] };

/** Where the loaded seed came from, for the log line and the degraded-state UI. */
export type SeedOrigin = { label: string; detail: string; bytes: number };

const readSource = (
  src: SeedSource,
  log: (msg: string) => void,
): { bytes: Uint8Array; detail: string; mtime: number } | undefined => {
  if (src.kind === "path") {
    let mtime: number;
    try {
      mtime = statSync(src.path).mtimeMs;
    } catch {
      // An EXPLICIT request that is absent is an error worth saying out loud —
      // silently using a different seed than the one asked for is how a stale
      // artifact gets mistaken for a compiler bug.
      if (src.explicit) log(`[wasm-checker] ${src.label}: not found at ${src.path}`);
      return undefined;
    }
    try {
      return { bytes: new Uint8Array(readFileSync(src.path)), detail: src.path, mtime };
    } catch (err) {
      log(`[wasm-checker] ${src.label}: unreadable at ${src.path}: ${err}`);
      return undefined;
    }
  }
  try {
    // 8 MiB ceiling: the seed is ~1.6 MiB and this guards a command that is not
    // the CLI we expect. One spawn per session, at startup — never per keystroke.
    const out = execFileSync(src.cmd, src.args, {
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    if (out.length === 0) return undefined;
    return {
      bytes: new Uint8Array(out),
      detail: `${src.cmd} ${src.args.join(" ")}`,
      mtime: -1,
    };
  } catch {
    return undefined; // no `vl` on PATH, or a build too old to know `seed`
  }
};

/**
 * Load (or reuse) the checker, trying `sources` in order. Returns undefined —
 * after a log line naming every rung that was tried — when no rung yields a seed
 * the host can instantiate (e.g. no WasmGC). `onOrigin` reports which rung won,
 * so the caller can surface the degraded state instead of returning empty
 * results forever.
 *
 * A `path` rung is re-read when its mtime changes; an `exec` rung is loaded once.
 */
export const loadWasmChecker = (
  /**
   * One path, or a ladder tried in order. The single-path form is the whole API a
   * test or a one-off tool wants, and keeping it means the ladder is additive
   * rather than a break — every existing caller passes a string.
   */
  sources: string | SeedSource[],
  log: (msg: string) => void,
  getStdDir?: () => string | undefined,
  onOrigin?: (origin: SeedOrigin | undefined) => void,
): WasmChecker | undefined => {
  const ladder: SeedSource[] = typeof sources === "string"
    ? [{ kind: "path", label: "seed", path: sources, explicit: true }]
    : sources;

  let exports: Exports | undefined;
  let loadedFrom: SeedSource | undefined;
  let loadedMtime = -1;

  const instantiate = (): Exports | undefined => {
    // Fast path: the winning rung was a file and it has not changed.
    if (exports !== undefined && loadedFrom?.kind === "path") {
      try {
        if (statSync(loadedFrom.path).mtimeMs === loadedMtime) return exports;
      } catch {
        // fall through and re-resolve: the file went away
      }
    } else if (exports !== undefined) {
      return exports;
    }

    const tried: string[] = [];
    for (const src of ladder) {
      const got = readSource(src, log);
      if (got === undefined) {
        tried.push(src.kind === "path" ? `${src.label}(${src.path})` : src.label);
        continue;
      }
      try {
        const module = new WebAssembly.Module(got.bytes as BufferSource);
        exports = new WebAssembly.Instance(module, {}).exports as unknown as Exports;
        loadedFrom = src;
        loadedMtime = got.mtime;
        log(
          `[wasm-checker] loaded from ${src.label}: ${got.detail} (${got.bytes.byteLength} bytes)`,
        );
        onOrigin?.({ label: src.label, detail: got.detail, bytes: got.bytes.byteLength });
        return exports;
      } catch (err) {
        log(`[wasm-checker] ${src.label}: cannot instantiate ${got.detail}: ${err}`);
        tried.push(src.label);
      }
    }
    // NAME EVERY RUNG. The old loader logged one path and left the reader to guess
    // whether the others had even been considered.
    log(
      `[wasm-checker] no compiler seed — tried: ${tried.join(", ")}. ` +
        `Set \`vital.compilerWasm\`, or put \`vl\` on PATH.`,
    );
    exports = undefined;
    loadedFrom = undefined;
    onOrigin?.(undefined);
    return undefined;
  };

  if (instantiate() === undefined) return undefined;

  return createWasmChecker(
    instantiate,
    (read: ModuleReader) => withStd(read, getStdDir),
  );
};
