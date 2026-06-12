// The wasm-backed checker — Stage 1 of the LSP-on-wasm migration (ROADMAP
// "Kill the TS host", step 1). Loads the SELF-HOSTED compiler
// (`build/vl-compiler.wasm`, the same seed `vl check` runs) and drives its
// driver exports for per-keystroke diagnostics: `srcReset`/`srcPush` +
// `checkSrc` + the structured diagnostic reads (`diagCount`/`diagMsg*`/
// `diagLine`/`diagCol`/`diagEndCol`), plus the H3 module-fetch protocol
// (`modReset`/`modKeyPush`/`modSrcPush`/`modCommit`/`modPending*`) wired to the
// LSP's workspace reader so sibling imports resolve against open buffers.
//
// Selected by the `vital.checker` setting (`"ts" | "wasm" | "both"` — see
// server.ts): `"wasm"` publishes these diagnostics, `"both"` runs both checkers
// and LOGS divergence — the parity instrument the TS-host teardown gates on.
// The TS path stays the default and the fallback: a missing/uninstantiable
// seed (e.g. an extension host whose V8 lacks WasmGC) degrades to `"ts"` with
// one log line, never an error.
//
// Latency contract (measured in the spike): cold compile+instantiate ~2 ms,
// steady-state `checkSrc` ~0.1–1.3 ms on editor-sized files, ~75 ms on the
// full 31k-line compiler assembly — one instance is reused across keystrokes
// (`checkSrc` resets all compiler state; `modReset` clears the module table,
// which `checkSrc` does NOT reset, so every check calls it).

import { readFileSync, statSync } from "node:fs";
import type { VLDiagnostic } from "../../compiler/compile.ts";
import type { ModuleReader } from "../../compiler/modules.ts";

type Exports = Record<string, (...args: number[]) => number>;

export type WasmChecker = {
  /** Diagnostics for `source` as the entry module at `entryKey`. */
  check: (
    source: string,
    entryKey: string,
    read: ModuleReader,
  ) => Promise<VLDiagnostic[]>;
};

/** One wasm call per code point — fine at editor scale (~0.2 ms/file). */
const pushString = (push: (cp: number) => number, text: string) => {
  for (const ch of text) push(ch.codePointAt(0)!);
};

const readString = (len: number, at: (j: number) => number): string => {
  const cps = new Array<number>(len);
  for (let j = 0; j < len; j++) cps[j] = at(j);
  return String.fromCodePoint(...cps);
};

/** Mirrors the Rust host's module gate: a LINE-LEADING `import {`. */
const hasImports = (source: string): boolean =>
  source.split("\n").some((l) => {
    const t = l.trimStart();
    return t.startsWith("import") && t.slice("import".length).trimStart().startsWith("{");
  });

/**
 * Load (or reuse) the checker for the seed at `wasmPath`. Returns undefined —
 * after one `log` line — when the seed is missing or the host cannot
 * instantiate it (no WasmGC). The instance is cached and transparently
 * reloaded when the seed file's mtime changes (a dev `refresh-compiler.sh`
 * mid-session picks up the new compiler without an editor reload).
 */
export const loadWasmChecker = (
  wasmPath: string,
  log: (msg: string) => void,
): WasmChecker | undefined => {
  let exports: Exports | undefined;
  let loadedMtime = -1;

  const instantiate = (): Exports | undefined => {
    let mtime: number;
    try {
      mtime = statSync(wasmPath).mtimeMs;
    } catch {
      log(`[wasm-checker] seed not found at ${wasmPath} — falling back to the TS checker`);
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
      log(`[wasm-checker] failed to instantiate ${wasmPath}: ${err} — falling back to the TS checker`);
      exports = undefined;
      return undefined;
    }
  };

  // Probe once at startup so a hopeless host degrades immediately (and the
  // caller can drop to "ts" mode); later mtime-driven reloads are per-check.
  if (instantiate() === undefined) return undefined;

  const check = async (
    source: string,
    entryKey: string,
    read: ModuleReader,
  ): Promise<VLDiagnostic[]> => {
    const exp = instantiate();
    if (exp === undefined) {
      throw new Error("wasm checker became unavailable (seed removed?)");
    }

    // The module table persists across checks by design (the host fetch loop
    // fills it once per build) — an LSP check is a fresh program every time.
    exp.modReset();
    if (hasImports(source)) {
      const commit = (key: string, src: string | undefined) => {
        pushString(exp.modKeyPush, key);
        if (src !== undefined) pushString(exp.modSrcPush, src);
        exp.modCommit(src !== undefined ? 1 : 0);
      };
      commit(entryKey, source);
      for (;;) {
        const n = exp.modPendingCount();
        if (n === 0) break;
        // Snapshot the pending keys FIRST — committing mutates the set.
        const keys: string[] = [];
        for (let i = 0; i < n; i++) {
          keys.push(readString(exp.modPendingLen(i), (j) => exp.modPendingAt(i, j)));
        }
        for (const key of keys) {
          commit(key, await read(key));
        }
      }
    }

    exp.srcReset();
    pushString(exp.srcPush, source);
    exp.checkSrc();

    const count = exp.diagCount();
    const diags: VLDiagnostic[] = [];
    // An older seed predates `diagEndCol`; degrade to zero-width ranges.
    const endColOf = typeof exp.diagEndCol === "function"
      ? (i: number) => exp.diagEndCol(i)
      : (i: number) => exp.diagCol(i);
    for (let i = 0; i < count; i++) {
      const message = readString(exp.diagMsgLen(i), (j) => exp.diagMsgAt(i, j));
      const line = exp.diagLine(i); // 1-based; 0 = positionless
      const col = exp.diagCol(i); // 0-based
      const lspLine = line > 0 ? line - 1 : 0;
      const startChar = line > 0 ? col : 0;
      const endChar = line > 0 ? Math.max(endColOf(i), col) : 0;
      diags.push({
        message,
        severity: "error",
        source: "vital",
        range: {
          start: { line: lspLine, character: startChar },
          end: { line: lspLine, character: endChar },
        },
      });
    }
    return diags;
  };

  return { check };
};

/**
 * Divergence report between the TS checker's ERROR diagnostics and the wasm
 * checker's, for `"both"` mode logging. Lint warnings/hints are excluded — the
 * wasm side has no lint tier yet (Stage 3). Message TEXTS are expected to
 * differ in places (REJECT parity pins verdicts, not wording), so the
 * comparison is structural: error count and start positions.
 */
export const diffDiagnostics = (
  ts: VLDiagnostic[],
  wasm: VLDiagnostic[],
): string | undefined => {
  const tsErrors = ts.filter((d) => d.severity === "error");
  const fmt = (d: VLDiagnostic) =>
    `${d.range.start.line + 1}:${d.range.start.character}: ${d.message}`;
  const posKey = (d: VLDiagnostic) =>
    `${d.range.start.line}:${d.range.start.character}`;
  const tsPos = new Set(tsErrors.map(posKey));
  const wasmPos = new Set(wasm.map(posKey));
  const samePositions = tsErrors.length === wasm.length &&
    tsErrors.every((d) => wasmPos.has(posKey(d))) &&
    wasm.every((d) => tsPos.has(posKey(d)));
  if (samePositions) return undefined;
  return [
    `ts errors (${tsErrors.length}):`,
    ...tsErrors.map((d) => `  ${fmt(d)}`),
    `wasm errors (${wasm.length}):`,
    ...wasm.map((d) => `  ${fmt(d)}`),
  ].join("\n");
};
