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
import { withStd } from "./moduleGraph.ts";

type Exports = Record<string, (...args: number[]) => number>;

/** An LSP source span (0-based line, 0-based character — the LSP convention). */
export type WasmRange = {
  start: { line: number; character: number };
  end: { line: number; character: number };
};

/**
 * One classified identifier from the wasm semantic-token pass (Stage 2). The
 * native checker records only IDENTIFIER occurrences with their binding kind, so
 * `bindKind` is 0=variable / 1=parameter / 2=function; `isDecl` marks the
 * declaring occurrence. Position is 0-based line, 0-based char (LSP). The host
 * maps `bindKind` onto its semantic-token legend and keeps its own lexical pass
 * for keywords/operators/literals/comments + member walk for properties.
 */
export type WasmToken = {
  line: number; // 0-based
  char: number; // 0-based
  length: number;
  bindKind: number; // 0=variable 1=parameter 2=function
  isDecl: boolean;
};

export type WasmChecker = {
  /** Diagnostics for `source` as the entry module at `entryKey`. */
  check: (
    source: string,
    entryKey: string,
    read: ModuleReader,
  ) => Promise<VLDiagnostic[]>;
  /**
   * Go-to-definition (Stage 2): the declaring span for the binding under
   * (`line`, `character`) (both 0-based, LSP), or undefined when the cursor is
   * off any tracked binding (or the seed predates the symbol exports).
   */
  definitionAt: (
    source: string,
    entryKey: string,
    read: ModuleReader,
    line: number,
    character: number,
  ) => Promise<WasmRange | undefined>;
  /**
   * Find-references (Stage 2): every occurrence span (declaration + uses) of the
   * binding under the cursor. `includeDeclaration` drops the declaration's own
   * span when false. Empty when the cursor is off any tracked binding.
   */
  referencesAt: (
    source: string,
    entryKey: string,
    read: ModuleReader,
    line: number,
    character: number,
    includeDeclaration: boolean,
  ) => Promise<WasmRange[]>;
  /**
   * Hover-types (Stage 2): the rendered type string of the binding under the
   * cursor, or undefined when the cursor is off any tracked binding / no type was
   * retained / the seed predates the exports.
   */
  hoverTypeAt: (
    source: string,
    entryKey: string,
    read: ModuleReader,
    line: number,
    character: number,
  ) => Promise<string | undefined>;
  /**
   * Semantic tokens (Stage 2): every classified IDENTIFIER occurrence in the
   * document (binding kind + declaration flag + span). Empty when the seed
   * predates the token exports — the host then falls back to its TS pass.
   */
  tokensAt: (
    source: string,
    entryKey: string,
    read: ModuleReader,
  ) => Promise<WasmToken[]>;
  /**
   * Whole-document formatting (kill-TS step 1, the `format.ts` consumer): the
   * canonical reprint of `source` via the self-hosted formatter (`format.vl`'s
   * `formatSrc`), or undefined when the source has a parse error (the driver
   * returns -1) or the seed predates the format exports — the host then falls
   * back to the TS `format()`. Synchronous: formatting is single-file, so no
   * module fetch / `prepare` is needed.
   */
  formatSrc: (source: string) => string | undefined;
  /**
   * Lint diagnostics (Stage 3): the AST-derivable lint pass (`lint.vl`) over
   * `source` — `unused-variable`, `prefer-const`, `unused-import`, … — each with
   * its stable `code` (for quick-fixes), `severity` (warning/info/hint), and
   * position. The error tier (`check`) excludes these, so the diagnostics path
   * merges both. Empty on a parse error or a seed without the lint exports.
   * Synchronous + single-file: the lint pass is parse-only and resolves no
   * imports, so the source is staged directly (no `prepare`).
   */
  lint: (source: string) => VLDiagnostic[];
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

  // Shared setup for every query: reset the module table (it persists across
  // checks by design — an LSP check is a fresh program every time), run the
  // import fetch loop against the workspace reader, then stage the entry source.
  // Leaves the instance ready for a `checkSrc`/`checkSrcSym` call by the caller.
  const prepare = async (
    exp: Exports,
    source: string,
    entryKey: string,
    read: ModuleReader,
  ): Promise<void> => {
    exp.modReset();
    if (hasImports(source)) {
      // `std:` keys resolve through the shared withStd wrapper (workspace
      // `std/` dir first, then the embedded map) — same precedence as the TS
      // checker's workspace reader, so the two checkers agree about std.
      const readModule = withStd(read, getStdDir);
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
          commit(key, await readModule(key));
        }
      }
    }
    exp.srcReset();
    pushString(exp.srcPush, source);
  };

  // The symbol-query exports land in a single Stage-2 seed. An older Stage-1 seed
  // (diagnostics only) lacks them; the methods degrade to "no result" so the LSP
  // falls back to its TS path rather than crashing on a missing export.
  const hasSymbols = (exp: Exports): boolean =>
    typeof exp.checkSrcSym === "function" &&
    typeof exp.defAt === "function" &&
    typeof exp.symSpanStartLine === "function";

  // The k-th coordinate-set of occurrence `occ`, as a 0-based LSP range. The
  // native spans are 1-based line / 0-based column (the diagnostic convention).
  const occRange = (exp: Exports, occ: number): WasmRange => {
    const sl = exp.symSpanStartLine(occ);
    const el = exp.symSpanEndLine(occ);
    return {
      start: { line: sl > 0 ? sl - 1 : 0, character: exp.symSpanStartCol(occ) },
      end: { line: el > 0 ? el - 1 : 0, character: exp.symSpanEndCol(occ) },
    };
  };

  const definitionAt = async (
    source: string,
    entryKey: string,
    read: ModuleReader,
    line: number,
    character: number,
  ): Promise<WasmRange | undefined> => {
    const exp = instantiate();
    if (exp === undefined || !hasSymbols(exp)) return undefined;
    await prepare(exp, source, entryKey, read);
    exp.checkSrcSym();
    // Native lines are 1-based; the LSP cursor line is 0-based.
    const occ = exp.defAt(line + 1, character);
    return occ >= 0 ? occRange(exp, occ) : undefined;
  };

  const referencesAt = async (
    source: string,
    entryKey: string,
    read: ModuleReader,
    line: number,
    character: number,
    includeDeclaration: boolean,
  ): Promise<WasmRange[]> => {
    const exp = instantiate();
    if (exp === undefined || !hasSymbols(exp)) return [];
    await prepare(exp, source, entryKey, read);
    exp.checkSrcSym();
    const nativeLine = line + 1;
    const count = exp.refsCountAt(nativeLine, character);
    const out: WasmRange[] = [];
    for (let k = 0; k < count; k++) {
      const occ = exp.refAt(nativeLine, character, k);
      if (occ < 0) continue;
      if (!includeDeclaration && exp.symIsDecl(occ) === 1) continue;
      out.push(occRange(exp, occ));
    }
    return out;
  };

  const hoverTypeAt = async (
    source: string,
    entryKey: string,
    read: ModuleReader,
    line: number,
    character: number,
  ): Promise<string | undefined> => {
    const exp = instantiate();
    if (exp === undefined || !hasSymbols(exp) ||
      typeof exp.typeStrAt !== "function") {
      return undefined;
    }
    await prepare(exp, source, entryKey, read);
    exp.checkSrcSym();
    const len = exp.typeStrAt(line + 1, character);
    if (len <= 0) return undefined;
    return readString(len, (j) => exp.typeStrCharAt(j));
  };

  // The token exports ride the same Stage-2 seed as the symbol exports; an older
  // seed lacks them, so the method yields [] (the host falls back to TS).
  const hasTokens = (exp: Exports): boolean =>
    typeof exp.tokCount === "function" &&
    typeof exp.tokBindKindAt === "function" &&
    typeof exp.tokSpanStartLine === "function";

  const tokensAt = async (
    source: string,
    entryKey: string,
    read: ModuleReader,
  ): Promise<WasmToken[]> => {
    const exp = instantiate();
    if (exp === undefined || !hasSymbols(exp) || !hasTokens(exp)) return [];
    await prepare(exp, source, entryKey, read);
    exp.checkSrcSym();
    const count = exp.tokCount();
    const out: WasmToken[] = [];
    for (let i = 0; i < count; i++) {
      const bindKind = exp.tokBindKindAt(i);
      // Only identifiers with a known binding kind are coloured by this slice;
      // a -1 (not a tracked binding) is skipped (the host's lexical pass owns it).
      if (bindKind < 0) continue;
      const sl = exp.tokSpanStartLine(i); // 1-based native line
      const startCol = exp.tokSpanStartCol(i);
      const endCol = exp.tokSpanEndCol(i);
      const length = endCol - startCol;
      if (length <= 0) continue; // defensive: a name never has a zero-width span
      out.push({
        line: sl > 0 ? sl - 1 : 0,
        char: startCol,
        length,
        bindKind,
        isDecl: exp.symIsDecl(i) === 1,
      });
    }
    return out;
  };

  const check = async (
    source: string,
    entryKey: string,
    read: ModuleReader,
  ): Promise<VLDiagnostic[]> => {
    const exp = instantiate();
    if (exp === undefined) {
      throw new Error("wasm checker became unavailable (seed removed?)");
    }

    await prepare(exp, source, entryKey, read);
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

  // Formatting rides the same seed as the other Stage-1+ exports; an older seed
  // (or a future one built without the formatter) lacks `formatSrc`/`fmtByteAt`,
  // so the method yields undefined and the host falls back to the TS `format()`.
  const formatSrc = (source: string): string | undefined => {
    const exp = instantiate();
    if (
      exp === undefined ||
      typeof exp.formatSrc !== "function" ||
      typeof exp.fmtByteAt !== "function"
    ) {
      return undefined;
    }
    // No `prepare`: the formatter is purely syntactic (lex → parse → print) and
    // never resolves imports, so the source is staged directly.
    exp.srcReset();
    pushString(exp.srcPush, source);
    const len = exp.formatSrc();
    if (len < 0) return undefined; // parse error — the driver signals -1
    return readString(len, (j) => exp.fmtByteAt(j));
  };

  // Coerce the native severity lexeme to a VLSeverity; an unknown value (a future
  // tier) degrades to "warning" so it still surfaces.
  const asSeverity = (s: string): VLDiagnostic["severity"] =>
    s === "error" || s === "warning" || s === "info" || s === "hint"
      ? s
      : "warning";

  // The lint pass reports a start line/col but no end column. Widen to the
  // identifier (or, failing that, one char) starting at `col` on `line` so the
  // squiggle is visible and a quick-fix range overlaps the cursor.
  const wordEndCol = (source: string, line: number, col: number): number => {
    const lines = source.split("\n");
    const text = lines[line] ?? "";
    let end = col;
    while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) end++;
    return end > col ? end : col + 1;
  };

  // Lint diagnostics ride the same seed as the Stage-1+ exports; an older seed
  // (or one built before the lint code/pos exports) lacks them, so this yields []
  // and the diagnostics path keeps its TS lint. Like `formatSrc`: single-file,
  // parse-only, no `prepare`.
  const lint = (source: string): VLDiagnostic[] => {
    const exp = instantiate();
    if (
      exp === undefined ||
      typeof exp.lintSrc !== "function" ||
      typeof exp.lintCodeLen !== "function"
    ) {
      return [];
    }
    exp.srcReset();
    pushString(exp.srcPush, source);
    const n = exp.lintSrc();
    if (n <= 0) return []; // -1 = parse error, 0 = no lint diagnostics
    const out: VLDiagnostic[] = [];
    for (let i = 0; i < n; i++) {
      const message = readString(exp.lintMsgLen(i), (j) => exp.lintMsgByte(i, j));
      const code = readString(exp.lintCodeLen(i), (j) => exp.lintCodeByte(i, j));
      const sev = readString(exp.lintSevLen(i), (j) => exp.lintSevByte(i, j));
      const line = exp.lintLine(i); // 1-based; 0 = positionless
      const col = exp.lintCol(i); // 0-based
      const lspLine = line > 0 ? line - 1 : 0;
      const startChar = line > 0 ? col : 0;
      const endChar = line > 0 ? wordEndCol(source, lspLine, col) : 0;
      out.push({
        message,
        severity: asSeverity(sev),
        source: "vital",
        code: code.length > 0 ? code : undefined,
        range: {
          start: { line: lspLine, character: startChar },
          end: { line: lspLine, character: endChar },
        },
      });
    }
    return out;
  };

  return {
    check,
    definitionAt,
    referencesAt,
    hoverTypeAt,
    tokensAt,
    formatSrc,
    lint,
  };
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

const rangeKey = (r: WasmRange): string =>
  `${r.start.line}:${r.start.character}-${r.end.line}:${r.end.character}`;

/**
 * Divergence between the TS and wasm go-to-definition spans for `"both"` mode
 * logging. Compares only the start position (the span the editor jumps to), so a
 * difference in span WIDTH — the wasm side anchors to the name token, the TS side
 * may range the whole declaration — is not flagged. Undefined = agree (including
 * both-undefined).
 */
export const diffDefinition = (
  ts: WasmRange | undefined,
  wasm: WasmRange | undefined,
): string | undefined => {
  const k = (r: WasmRange | undefined) =>
    r ? `${r.start.line}:${r.start.character}` : "none";
  if (k(ts) === k(wasm)) return undefined;
  return `def: ts ${k(ts)} vs wasm ${k(wasm)}`;
};

/**
 * Divergence between the TS and wasm find-references span SETS (order-
 * independent), for `"both"` mode logging. Undefined = the two sets match.
 */
export const diffReferences = (
  ts: WasmRange[],
  wasm: WasmRange[],
): string | undefined => {
  const tsSet = new Set(ts.map(rangeKey));
  const wasmSet = new Set(wasm.map(rangeKey));
  const same = tsSet.size === wasmSet.size &&
    [...tsSet].every((k) => wasmSet.has(k));
  if (same) return undefined;
  return `refs: ts {${[...tsSet].sort().join(", ")}} vs wasm {${
    [...wasmSet].sort().join(", ")
  }}`;
};

/**
 * Divergence between the TS and wasm hover type STRINGS, for `"both"` mode
 * logging. Exact-string comparison (the native renderer's output is allowed to
 * differ from `stringifyType` — this is the instrument that surfaces where).
 * Undefined = identical (including both-empty).
 */
export const diffHoverType = (
  ts: string | undefined,
  wasm: string | undefined,
): string | undefined => {
  const a = ts ?? "";
  const b = wasm ?? "";
  if (a === b) return undefined;
  return `hover: ts ${JSON.stringify(a)} vs wasm ${JSON.stringify(b)}`;
};

/** One TS-side classified identifier token, for `diffSemanticTokens`. */
export type TsIdentToken = {
  line: number;
  char: number;
  length: number;
  bindKind: number; // 0=variable 1=parameter 2=function (the legend's first 3)
  isDecl: boolean;
};

const tokenKey = (t: WasmToken | TsIdentToken): string =>
  `${t.line}:${t.char}+${t.length}/${t.bindKind}${t.isDecl ? "d" : ""}`;

/**
 * Divergence between the TS and wasm SEMANTIC-TOKEN identifier sets (order-
 * independent), for `"both"` mode logging. This slice classifies identifiers
 * ONLY (variable/parameter/function); the caller filters the TS tokens to that
 * same subset before comparing, so keywords/operators/literals/comments/members
 * — which stay TS-only — never count as divergence. Undefined = the sets match.
 */
export const diffSemanticTokens = (
  ts: TsIdentToken[],
  wasm: WasmToken[],
): string | undefined => {
  const tsSet = new Set(ts.map(tokenKey));
  const wasmSet = new Set(wasm.map(tokenKey));
  const same = tsSet.size === wasmSet.size &&
    [...tsSet].every((k) => wasmSet.has(k));
  if (same) return undefined;
  return `semtok: ts {${[...tsSet].sort().join(", ")}} vs wasm {${
    [...wasmSet].sort().join(", ")
  }}`;
};
