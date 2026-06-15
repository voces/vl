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
// As of kill-TS step 2 `"wasm"` is the DEFAULT. The TS path stays the fallback:
// a missing/uninstantiable seed (e.g. an extension host whose V8 lacks WasmGC)
// degrades to `"ts"` with one log line, never an error.
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
 * One occurrence from the cross-file references pass (kill-TS step 3-C Stage 3):
 * the occurrence's 0-based LSP span plus whether it is the binding's DECLARATION,
 * so the orchestrator can honor `includeDeclaration` (drop the decl when false).
 * Only the entry module's (table index 0) occurrences of the target binding are
 * returned — the per-candidate compile model means each candidate file surfaces
 * just its own references (see {@link WasmChecker.referencesInEntry}).
 */
export type WasmOccurrence = {
  range: WasmRange;
  isDecl: boolean;
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

/**
 * One member-access property name from the wasm semantic-token pass — the native
 * equivalent of the host's AST member walk. `isMethod` is true for a
 * function-typed member (`xs.get`, `s.slice`), false for an object field (`o.x`);
 * the host maps these onto its `method`/`property` legend entries. Position is
 * 0-based line, 0-based char (LSP).
 */
export type WasmMemberToken = {
  line: number; // 0-based
  char: number; // 0-based
  length: number;
  isMethod: boolean;
};

/**
 * One classified lexical token from the wasm lexical pass (kill-TS) — the native
 * counterpart of the host's TS `tokenize` + `lexicalTokenType` + comment scan.
 * `tokenClass` is a stable small enum the host maps onto its semantic-token
 * legend: 0=keyword, 1=operator, 2=number, 3=boolean, 4=comment. Identifiers
 * (owned by the symbol slice), strings (left to the TextMate grammar), and
 * structural punctuation carry no class and are not emitted. Position is 0-based
 * line, 0-based char (LSP).
 */
export type WasmLexicalToken = {
  line: number; // 0-based
  char: number; // 0-based
  length: number;
  tokenClass: number; // 0=keyword 1=operator 2=number 3=boolean 4=comment
};

/** {@link WasmLexicalToken.tokenClass} values, for the host's legend mapping. */
export const WASM_LEX_KEYWORD = 0;
export const WASM_LEX_OPERATOR = 1;
export const WASM_LEX_NUMBER = 2;
export const WASM_LEX_BOOLEAN = 3;
export const WASM_LEX_COMMENT = 4;

/**
 * One in-scope binding from the wasm scope-at-position pass — a
 * variable/parameter/function visible at the cursor, the native counterpart of
 * the host's `bindingsInScopeAt` walk. `kind` is 0=variable / 1=parameter /
 * 2=function (the same convention as {@link WasmToken}'s `bindKind`); `type` is
 * the rendered type string, empty when the binding has no retained type. The
 * native set covers only USER bindings — builtins/imports/types stay host-side.
 */
export type WasmScopeBinding = {
  name: string;
  kind: number; // 0=variable 1=parameter 2=function
  type: string; // rendered type, "" when none
};

/**
 * One member-completion entry from the wasm member-completion pass (kill-TS) — a
 * field of a struct receiver, or a builtin method of a `string` receiver. The
 * native counterpart of the host's `receiverObjectType` + `memberCompletions`.
 * `name` is the member identifier; `detail` its rendered type; `isMethod` true for
 * a function-typed member (→ the `function` completion kind), else a plain field.
 */
export type WasmMemberCompletion = {
  name: string;
  detail: string;
  isMethod: boolean;
};

/**
 * One builtin completion from the wasm builtin pass (kill-TS) — a numeric/string
 * TYPE name or a builtin FUNCTION (`print`/`Map`/`Set`/…), the native source for
 * the builtin half the host used to fold in from the TS `defaultScope`. `kind` is
 * 0=type / 1=function; `detail` its rendered type. The set is fixed (the
 * compiler's builtin surface), so the host reads it once and reuses it.
 */
export type WasmBuiltin = {
  name: string;
  kind: number; // 0=type 1=function
  detail: string;
};

/**
 * One resolved cross-file imported source, from the wasm import/export pass — the
 * native counterpart of the host's `importedNameSources`. Keyed (in the returned
 * record) by the LOCAL binding name; `key` is the exporting sibling module's
 * resolved KEY, `exportedName` the name the sibling declares it under (the `name`
 * side of a `{ name as local }` specifier), `line`/`col` the export decl-name
 * token (1-based line, 0-based col — the native convention), `length` the
 * exported name's length so the host can shape the decl-name end column. The host
 * maps these onto its `CrossFileSource` (0-based LSP range + `file://` URI); the
 * canonical-export resolver in `crossFileReferences` uses `exportedName`.
 */
export type WasmImportedSource = {
  key: string;
  exportedName: string;
  line: number; // 1-based native line
  col: number; // 0-based column
  length: number; // exported name length (for the range end)
};

/**
 * One export of a module's surface, from the wasm import/export pass — the native
 * counterpart of the host's `exportedDeclRanges` plus the `export`-keyword span.
 * `name` is the exported name; `declLine`/`declCol` locate the decl NAME (1-based
 * line, 0-based col — the native convention), `kwLine`/`kwCol` the `export`
 * KEYWORD. Used by the project-wide unused-export pass to place its hints.
 */
export type WasmModuleExport = {
  name: string;
  declLine: number; // 1-based native line
  declCol: number; // 0-based column
  kwLine: number; // 1-based native line of the `export` keyword
  kwCol: number; // 0-based column of the `export` keyword
};

/**
 * One resolved import of a module's surface, from the wasm import/export pass:
 * the exporting sibling module's resolved `key` plus the exported source `name`.
 * Bare imports (`import "x"`) and unresolved/unexported specifiers are omitted by
 * {@link WasmChecker.moduleSurface}.
 */
export type WasmModuleImport = { key: string; name: string };

/**
 * A module's import/export surface, from the wasm import/export pass — the native
 * counterpart of the host's single-file symbol scan in the unused-export pass.
 * `exports` are the module's own `export`ed decls; `imports` are its resolved
 * cross-file references. Both are empty when the seed predates the import/export
 * exports (the caller then treats the module as having no surface).
 */
export type WasmModuleSurface = {
  exports: WasmModuleExport[];
  imports: WasmModuleImport[];
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
   * Member hover: the rendered type string of the member access (`o.x` / `o?.y`)
   * whose PROPERTY NAME is under the cursor, or undefined when the cursor is off
   * any recorded member / the seed predates the export. Lets the wasm path serve
   * member hover that `hoverTypeAt` (binding-only) can't.
   */
  memberTypeAt: (
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
   * Semantic tokens, member slice (kill-TS): every member-access property name
   * the checker resolved, each classified `method`/`property` from its native
   * type. Lets the wasm semantic-tokens path drop the TS AST member walk. Empty
   * when the seed predates the member exports — the host then keeps its TS walk.
   */
  memberTokensAt: (
    source: string,
    entryKey: string,
    read: ModuleReader,
  ) => Promise<WasmMemberToken[]>;
  /**
   * Semantic tokens, lexical slice (kill-TS): every keyword / operator / numeric
   * or boolean literal / comment in `source`, each tagged with its
   * {@link WasmLexicalToken.tokenClass}. The native counterpart of the host's TS
   * `tokenize` + `lexicalTokenType` + comment scan, letting the wasm
   * semantic-tokens path drop the last TS lexer dependency. Synchronous +
   * single-file: lexing resolves no imports, so the source is staged directly (no
   * `prepare`). Empty when the seed predates the lexical exports — the host then
   * keeps its TS lexical pass.
   */
  lexicalTokensAt: (source: string) => WasmLexicalToken[];
  /**
   * Builtin completions (kill-TS): the compiler's builtin surface — numeric/string
   * type names + builtin functions — the host folds into identifier completion,
   * replacing the TS `defaultScope`. A fixed set (no source / `prepare`); empty
   * when the seed predates the export, so the host then keeps its TS builtins.
   */
  builtinCompletions: () => WasmBuiltin[];
  /**
   * Scope-at-position completions (kill-TS): every user binding
   * (variable/parameter/function) visible at (`line`, `character`) — both
   * 0-based, LSP — the native counterpart of the host's `bindingsInScopeAt`
   * walk. The set excludes builtins/imports/types (the host folds those in), so
   * the completion path merges these over the builtin-derived items. Empty when
   * the seed predates the scope exports — the host then falls back to its TS
   * `identifierCompletions`.
   */
  scopeAt: (
    source: string,
    entryKey: string,
    read: ModuleReader,
    line: number,
    character: number,
  ) => Promise<WasmScopeBinding[]>;
  /**
   * Member-completion (kill-TS): the members of the receiver whose binding is
   * under (`line`, `character`) — both 0-based, LSP — a struct receiver's fields
   * or a `string` receiver's builtin methods, the native counterpart of the
   * host's `receiverObjectType` + `memberCompletions`. The caller passes the
   * source with the trailing `.` STRIPPED (so the receiver parses as a bare
   * expression — the native parser isn't error-tolerant for `receiver.`) and a
   * position on the receiver name. Empty when the cursor is off a typed binding,
   * the receiver has no completable members (arrays/maps, like the host), or the
   * seed predates the exports — the host then falls back to its TS member path.
   */
  memberCompletionsAt: (
    source: string,
    entryKey: string,
    read: ModuleReader,
    line: number,
    character: number,
  ) => Promise<WasmMemberCompletion[]>;
  /**
   * Cross-file imported sources (kill-TS step 3-C): for each LOCAL imported name
   * in `source` (as the entry module at `entryKey`), the exporting sibling
   * module's decl-name location — the native counterpart of the host's
   * `importedNameSources`. Powers cross-file go-to-definition and doc-xref links
   * off the self-hosted checker. Names whose import is unresolvable (bad
   * specifier, missing module, not-exported) or that resolve to the entry itself
   * are omitted; a bare `import "x"` is skipped. Empty when the seed predates the
   * import/export exports — the host then falls back to its TS path.
   */
  importedNameSources: (
    source: string,
    entryKey: string,
    read: ModuleReader,
  ) => Promise<Record<string, WasmImportedSource>>;
  /**
   * Module import/export surface (kill-TS step 3-C Stage 2): the ENTRY module's
   * own `export`ed decls (name + decl-name span + `export`-keyword span) and its
   * RESOLVED cross-file imports (sibling key + exported source name). Powers the
   * project-wide unused-export pass off the self-hosted checker. Bare imports and
   * unresolved/unexported specifiers are omitted. `{exports:[],imports:[]}` when
   * the seed predates the import/export exports — the caller then treats the
   * module as surface-less.
   */
  moduleSurface: (
    source: string,
    entryKey: string,
  ) => WasmModuleSurface;
  /**
   * Cross-file find-references, per-candidate slice (kill-TS step 3-C Stage 3):
   * the occurrences IN `candidateSource` (committed as the entry, module 0) that
   * refer to the canonical export `target` (its declaring file `key` + exported
   * `name` + 1-based decl-name `declLine` / 0-based `declCol`). Empty when the
   * candidate doesn't reach the declaring module, the declaration isn't found at
   * `target`'s position, or the seed predates the module-tag exports. The
   * orchestrator (`crossFileReferences`) compiles each candidate file as its own
   * entry — an entry's committed graph only spans modules it imports, so refs in
   * OTHER importers live in those importers' own compiles — and unions the
   * results, honoring `includeDeclaration` via each occurrence's `isDecl`.
   */
  referencesInEntry: (
    candidateSource: string,
    candidateKey: string,
    read: ModuleReader,
    target: {
      key: string;
      exportedName: string;
      declLine: number; // 1-based native line of the decl name
      declCol: number; // 0-based column of the decl name
    },
  ) => Promise<WasmOccurrence[]>;
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

  // The per-occurrence module-tag exports (`symOccModuleAt`/`modKeyCount`) ride a
  // Stage-3 seed; an older Stage-2 seed has the occurrence spans but no module
  // tag, so cross-file references degrades to [] (the host keeps its TS crawl).
  const hasModuleTags = (exp: Exports): boolean =>
    typeof exp.symOccModuleAt === "function" &&
    typeof exp.modKeyCount === "function";

  const referencesInEntry = async (
    candidateSource: string,
    candidateKey: string,
    read: ModuleReader,
    target: {
      key: string;
      exportedName: string;
      declLine: number;
      declCol: number;
    },
  ): Promise<WasmOccurrence[]> => {
    const exp = instantiate();
    if (exp === undefined || !hasSymbols(exp) || !hasModuleTags(exp)) return [];
    // Compile this candidate as its own entry (module 0) + its transitive deps,
    // so its committed graph includes the declaring module IFF the candidate
    // reaches it via imports.
    await prepare(exp, candidateSource, candidateKey, read);
    exp.checkSrcSym();

    // The declaring module's table index — the candidate may not reach it (then
    // it holds no occurrence of the target binding) → no refs here. An import-free
    // candidate compiles single-file (no module table, `modKeyCount() === 0`): it
    // is its own module 0, so it reaches the declaration IFF it IS the declaring
    // file (e.g. the exporting module with no imports of its own).
    const modCount = exp.modKeyCount();
    let declModuleIndex = -1;
    if (modCount === 0) {
      declModuleIndex = candidateKey === target.key ? 0 : -1;
    } else {
      for (let m = 0; m < modCount; m++) {
        const k = readString(exp.modKeyAtLen(m), (j) => exp.modKeyAtCharAt(m, j));
        if (k === target.key) {
          declModuleIndex = m;
          break;
        }
      }
    }
    if (declModuleIndex < 0) return [];

    // The canonical binding id: the declaration occurrence in the declaring
    // module at `target`'s decl-name position. Every other occurrence of this
    // binding — including an importer's uses, which the merge rewrites to the
    // canonical symbol — shares this id.
    const count = exp.symCount();
    let canonicalBinding = -1;
    for (let i = 0; i < count; i++) {
      if (exp.symOccModuleAt(i) !== declModuleIndex) continue;
      if (exp.symIsDecl(i) !== 1) continue;
      if (exp.symSpanStartLine(i) !== target.declLine) continue;
      if (exp.symSpanStartCol(i) !== target.declCol) continue;
      canonicalBinding = exp.symBindingId(i);
      break;
    }
    if (canonicalBinding < 0) return [];

    // Collect only THIS candidate's own occurrences (module 0) of the binding.
    const out: WasmOccurrence[] = [];
    for (let i = 0; i < count; i++) {
      if (exp.symOccModuleAt(i) !== 0) continue;
      if (exp.symBindingId(i) !== canonicalBinding) continue;
      const sl = exp.symSpanStartLine(i);
      const el = exp.symSpanEndLine(i);
      out.push({
        range: {
          start: { line: sl > 0 ? sl - 1 : 0, character: exp.symSpanStartCol(i) },
          end: { line: el > 0 ? el - 1 : 0, character: exp.symSpanEndCol(i) },
        },
        isDecl: exp.symIsDecl(i) === 1,
      });
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

  const memberTypeAt = async (
    source: string,
    entryKey: string,
    read: ModuleReader,
    line: number,
    character: number,
  ): Promise<string | undefined> => {
    const exp = instantiate();
    if (exp === undefined || !hasSymbols(exp) ||
      typeof exp.memberTypeStrAt !== "function") {
      return undefined;
    }
    await prepare(exp, source, entryKey, read);
    exp.checkSrcSym();
    const len = exp.memberTypeStrAt(line + 1, character);
    if (len <= 0) return undefined;
    return readString(len, (j) => exp.memberTypeStrCharAt(j));
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

  // The member exports ride the same seed as the symbol exports; an older seed
  // lacks them, so the member slice yields [] (the host keeps its TS walk).
  const hasMembers = (exp: Exports): boolean =>
    typeof exp.memberCount === "function" &&
    typeof exp.memberLineAt === "function" &&
    typeof exp.memberIsMethodAt === "function";

  const memberTokensAt = async (
    source: string,
    entryKey: string,
    read: ModuleReader,
  ): Promise<WasmMemberToken[]> => {
    const exp = instantiate();
    if (exp === undefined || !hasSymbols(exp) || !hasMembers(exp)) return [];
    await prepare(exp, source, entryKey, read);
    exp.checkSrcSym();
    const count = exp.memberCount();
    const out: WasmMemberToken[] = [];
    for (let i = 0; i < count; i++) {
      const length = exp.memberLenAt(i);
      if (length <= 0) continue; // defensive: a name never has a zero-width span
      const line = exp.memberLineAt(i); // 1-based native line
      out.push({
        line: line > 0 ? line - 1 : 0,
        char: exp.memberColAt(i),
        length,
        isMethod: exp.memberIsMethodAt(i) === 1,
      });
    }
    return out;
  };

  // The scope exports ride the same Stage-2 seed as the symbol exports; an older
  // seed lacks them, so the method yields [] (the host falls back to its TS
  // `identifierCompletions`).
  const hasScope = (exp: Exports): boolean =>
    typeof exp.scopeAt === "function" &&
    typeof exp.scopeNameLen === "function" &&
    typeof exp.scopeKindAt === "function";

  const scopeAt = async (
    source: string,
    entryKey: string,
    read: ModuleReader,
    line: number,
    character: number,
  ): Promise<WasmScopeBinding[]> => {
    const exp = instantiate();
    if (exp === undefined || !hasSymbols(exp) || !hasScope(exp)) return [];
    await prepare(exp, source, entryKey, read);
    exp.checkSrcSym();
    // Native lines are 1-based; the LSP cursor line is 0-based.
    const count = exp.scopeAt(line + 1, character);
    const out: WasmScopeBinding[] = [];
    for (let i = 0; i < count; i++) {
      // The native side rebuilds the per-index NAME buffer on each
      // `scopeNameLen(i)`/`scopeNameCharAt(i, j)` call keyed by `i`, then the
      // TYPE buffer likewise — so read all of one name, then all of one type,
      // for a given `i` before moving on (nothing interleaves another index).
      const name = readString(exp.scopeNameLen(i), (j) => exp.scopeNameCharAt(i, j));
      if (name.length === 0) continue; // defensive: a binding always has a name
      const typeLen = exp.scopeTypeLen(i);
      const type = typeLen <= 0
        ? ""
        : readString(typeLen, (j) => exp.scopeTypeCharAt(i, j));
      out.push({ name, kind: exp.scopeKindAt(i), type });
    }
    return out;
  };

  // The member-completion exports ride the same Stage-2+ seed as the symbol
  // exports; an older seed lacks them, so the method yields [] (the host falls
  // back to its TS `memberCompletions`).
  const hasMemberScan = (exp: Exports): boolean =>
    typeof exp.memberScanAt === "function" &&
    typeof exp.memberScanNameLen === "function" &&
    typeof exp.memberScanIsFn === "function";

  const memberCompletionsAt = async (
    source: string,
    entryKey: string,
    read: ModuleReader,
    line: number,
    character: number,
  ): Promise<WasmMemberCompletion[]> => {
    const exp = instantiate();
    if (exp === undefined || !hasSymbols(exp) || !hasMemberScan(exp)) return [];
    await prepare(exp, source, entryKey, read);
    exp.checkSrcSym();
    // Native lines are 1-based; the LSP cursor line is 0-based.
    const count = exp.memberScanAt(line + 1, character);
    const out: WasmMemberCompletion[] = [];
    for (let i = 0; i < count; i++) {
      // Per-index buffers (like `scopeAt`): read this index's NAME fully, then its
      // detail TYPE fully, before moving on.
      const name = readString(
        exp.memberScanNameLen(i),
        (j) => exp.memberScanNameCharAt(i, j),
      );
      if (name.length === 0) continue; // defensive: a member always has a name
      const detailLen = exp.memberScanTypeLen(i);
      const detail = detailLen <= 0
        ? ""
        : readString(detailLen, (j) => exp.memberScanTypeCharAt(i, j));
      out.push({ name, detail, isMethod: exp.memberScanIsFn(i) === 1 });
    }
    return out;
  };

  // The import/export tables ride the same Stage-2+ seed as the symbol exports;
  // an older seed lacks them, so the method yields {} (the host falls back to its
  // TS `importedNameSources`).
  const hasCrossFile = (exp: Exports): boolean =>
    typeof exp.impCount === "function" &&
    typeof exp.expCount === "function" &&
    typeof exp.modKeyCount === "function" &&
    typeof exp.expDeclLineAt === "function";

  const importedNameSources = async (
    source: string,
    entryKey: string,
    read: ModuleReader,
  ): Promise<Record<string, WasmImportedSource>> => {
    const exp = instantiate();
    if (exp === undefined || !hasSymbols(exp) || !hasCrossFile(exp)) return {};
    // `prepare` commits the entry (table index 0) plus its transitive deps, so
    // the import/export tables below cover every committed module.
    await prepare(exp, source, entryKey, read);

    // Module KEY by table index — the bridge between an import's resolved key and
    // the export entry's owning module.
    const modCount = exp.modKeyCount();
    const keyOf = new Array<string>(modCount);
    for (let m = 0; m < modCount; m++) {
      keyOf[m] = readString(exp.modKeyAtLen(m), (j) => exp.modKeyAtCharAt(m, j));
    }

    // Index every export by `${moduleKey} ${exportName}` so an import resolves in
    // one lookup. Native line is 1-based, col 0-based.
    const exportsByKey = new Map<string, { line: number; col: number }>();
    const expCount = exp.expCount();
    for (let i = 0; i < expCount; i++) {
      const mod = exp.expModAt(i);
      const modKey = mod >= 0 && mod < modCount ? keyOf[mod] : "";
      if (modKey === "") continue;
      const name = readString(exp.expNameLen(i), (j) => exp.expNameCharAt(i, j));
      if (name.length === 0) continue;
      exportsByKey.set(`${modKey} ${name}`, {
        line: exp.expDeclLineAt(i),
        col: exp.expDeclColAt(i),
      });
    }

    const out: Record<string, WasmImportedSource> = {};
    const impCount = exp.impCount();
    for (let i = 0; i < impCount; i++) {
      // Only the entry module's own imports (table index 0); a transitive dep's
      // imports are not the current file's.
      if (exp.impModAt(i) !== 0) continue;
      const key = readString(exp.impKeyLen(i), (j) => exp.impKeyCharAt(i, j));
      if (key === "" || key === entryKey) continue; // unresolved or self
      const name = readString(exp.impNameLen(i), (j) => exp.impNameCharAt(i, j));
      if (name.length === 0) continue; // bare `import "x"` — no name to resolve
      const decl = exportsByKey.get(`${key} ${name}`);
      if (decl === undefined) continue; // not exported by the resolved module
      const local = readString(
        exp.impLocalLen(i),
        (j) => exp.impLocalCharAt(i, j),
      );
      if (local.length === 0) continue; // defensive: an import always binds a name
      out[local] = {
        key,
        exportedName: name,
        line: decl.line,
        col: decl.col,
        length: name.length,
      };
    }
    return out;
  };

  // The `export`-keyword span exports ride the same Stage-2+ seed as the rest of
  // the import/export table; an older seed has the decl-name span (`hasCrossFile`)
  // but not the keyword span, so the surface query degrades to an empty result.
  const hasExportKw = (exp: Exports): boolean =>
    typeof exp.expKwLineAt === "function" &&
    typeof exp.expKwColAt === "function";

  const moduleSurface = (
    source: string,
    entryKey: string,
  ): WasmModuleSurface => {
    const exp = instantiate();
    if (exp === undefined || !hasCrossFile(exp) || !hasExportKw(exp)) {
      return { exports: [], imports: [] };
    }
    // Commit the entry (table index 0) so `modScan` fills the import/export tables
    // for it. Unlike `prepare` — whose graph commit is import-gated (a single-file
    // check needs no module table) — the entry must be committed here even when it
    // has no imports, since we read its EXPORTS. A module's own surface (its
    // exports + its imports' resolved keys) comes from its own tokens, so no
    // dependency fetch is needed; key resolution is pure string math.
    exp.modReset();
    pushString(exp.modKeyPush, entryKey);
    pushString(exp.modSrcPush, source);
    exp.modCommit(1);

    const exports: WasmModuleExport[] = [];
    const expCount = exp.expCount();
    for (let i = 0; i < expCount; i++) {
      if (exp.expModAt(i) !== 0) continue; // entry module only
      const name = readString(exp.expNameLen(i), (j) => exp.expNameCharAt(i, j));
      if (name.length === 0) continue;
      exports.push({
        name,
        declLine: exp.expDeclLineAt(i),
        declCol: exp.expDeclColAt(i),
        kwLine: exp.expKwLineAt(i),
        kwCol: exp.expKwColAt(i),
      });
    }

    const imports: WasmModuleImport[] = [];
    const impCount = exp.impCount();
    for (let i = 0; i < impCount; i++) {
      if (exp.impModAt(i) !== 0) continue; // entry module only
      const key = readString(exp.impKeyLen(i), (j) => exp.impKeyCharAt(i, j));
      if (key.length === 0) continue; // unresolved specifier
      const name = readString(exp.impNameLen(i), (j) => exp.impNameCharAt(i, j));
      if (name.length === 0) continue; // bare `import "x"`
      imports.push({ key, name });
    }

    return { exports, imports };
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

  // The lexical-token exports ride the same seed as the Stage-1+ exports; an older
  // seed lacks them, so this yields [] and the host keeps its TS lexical pass.
  // Like `formatSrc`/`lint`: single-file, parse-free, no `prepare`.
  const lexicalTokensAt = (source: string): WasmLexicalToken[] => {
    const exp = instantiate();
    if (
      exp === undefined ||
      typeof exp.lexScan !== "function" ||
      typeof exp.lexClassAt !== "function"
    ) {
      return [];
    }
    exp.srcReset();
    pushString(exp.srcPush, source);
    const n = exp.lexScan();
    const out: WasmLexicalToken[] = [];
    for (let i = 0; i < n; i++) {
      const length = exp.lexLenAt(i);
      if (length <= 0) continue; // defensive: a coloured token never has zero width
      const line = exp.lexLineAt(i); // 1-based native line
      out.push({
        line: line > 0 ? line - 1 : 0,
        char: exp.lexColAt(i),
        length,
        tokenClass: exp.lexClassAt(i),
      });
    }
    return out;
  };

  // The builtin-completion export rides the same seed as the Stage-2+ exports; an
  // older seed lacks it, so this yields [] and the host keeps its TS builtins.
  // Static (no source / `prepare`) — the builtin surface is fixed.
  const builtinCompletions = (): WasmBuiltin[] => {
    const exp = instantiate();
    if (exp === undefined || typeof exp.builtinScan !== "function") return [];
    const n = exp.builtinScan();
    const out: WasmBuiltin[] = [];
    for (let i = 0; i < n; i++) {
      const name = readString(
        exp.builtinNameLen(i),
        (j) => exp.builtinNameCharAt(i, j),
      );
      if (name.length === 0) continue;
      const detailLen = exp.builtinTypeLen(i);
      const detail = detailLen <= 0
        ? ""
        : readString(detailLen, (j) => exp.builtinTypeCharAt(i, j));
      out.push({ name, kind: exp.builtinKindAt(i), detail });
    }
    return out;
  };

  return {
    check,
    definitionAt,
    referencesAt,
    referencesInEntry,
    hoverTypeAt,
    memberTypeAt,
    tokensAt,
    memberTokensAt,
    lexicalTokensAt,
    builtinCompletions,
    scopeAt,
    memberCompletionsAt,
    importedNameSources,
    moduleSurface,
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
