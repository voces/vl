// Browser-side "language server" adapter for the playground.
//
// VL has no server process. The playground runs the SAME self-hosted compiler
// seed the Node LSP (`lsp/src/server.ts`) and `vl check` run, driven through the
// environment-agnostic wasm checker (`lsp/src/wasmChecker.ts` via the browser
// loader `wasmCheckerBrowser.ts`). So the same logic `server.ts` runs per request
// runs here, client-side, on the current editor text — but against the wasm seed
// rather than the TS compiler. This module is the bridge: it drives the checker +
// the LSP-neutral assembly helpers (`typeFeatures.ts`'s `*FromWasm` family) and
// returns plain, Monaco-free data (positions, ranges, token arrays). `main.ts`
// maps these onto Monaco's provider shapes.
//
// The seed-backed methods are ASYNC (the checker stages the source, then queries)
// and degrade to an empty result before `initLsp` is called or when the seed
// failed to load — Monaco accepts a Thenable from every provider, so this is
// transparent. `diagnostics` stays on the TS `checkOnly` (the playground's Run
// path already pulls the TS compiler in for codegen; moving the squiggle pass to
// wasm is a separate, later step) and `codeActions` is pure string surgery.
//
// Position convention: VL spans / the wasm checker use 1-based line / 0-based
// column natively, but every method here speaks the LSP wire form (0-based line /
// 0-based character) — the checker does the 1↔0 line bridge internally, and
// `main.ts` bridges LSP↔Monaco (Monaco is 1-based line / 1-based column).

import type { VLDiagnostic } from "../../compiler/diagnostics.ts";
import {
  builtinCompletionsFromWasm,
  type Completion,
  type CompletionEdit,
  type CompletionKind,
  displayableType,
  docMarkdown,
  importInsertionEdit,
  inlayHintsFromWasm,
  isDisplayableType,
  keywordCompletions,
  type LspRange,
  memberCompletionsFromWasm,
  organizeImportEdits,
  scopeCompletionsFromBindings,
  stdAutoImportCompletions,
  type StdExportCandidate,
  typeCompletionsFromWasm,
  SEMANTIC_TOKEN_LEGEND,
  semanticTokensDataFromWasm,
  snippetCompletions,
  typeLabelDetail,
  ufcsCompletions,
} from "../../lsp/src/typeFeatures.ts";
import { STD_SOURCES } from "../../std/embedded.ts";
import {
  foldingRanges as computeFoldingRanges,
  type VlFoldingRange,
} from "../../lsp/src/folding.ts";
import {
  callSiteAt,
  repairedSource,
  type SigLabel,
  signatureLabel,
} from "../../lsp/src/signatureHelp.ts";
import type { WasmChecker } from "../../lsp/src/wasmChecker.ts";
import type { ModuleReader } from "../../compiler/coreTypes.ts";
import {
  fixableDiagnosticsForRange,
  type LspTextEdit,
  type QuickFix,
  quickFixesForDiagnostic,
  ufcsImportFixes,
  ufcsImportModules,
  ufcsMissingImportAt,
} from "../../lsp/src/codeActions.ts";

export type { LspTextEdit, QuickFix, VlFoldingRange, VLDiagnostic };
export { SEMANTIC_TOKEN_LEGEND };

/** LSP 0-based line / 0-based character — the wire form `server.ts` speaks. */
export type LspPosition = { line: number; character: number };

// Each LSP query runs a buffer as the entry module at its file's KEY, with a
// reader that resolves SIBLING modules (`./mathx`) from the project — the browser
// counterpart of the Node LSP's workspace reader. Cross-file analysis (an
// imported name's type/hover, completion, go-to-definition) needs this: a
// single-file check of an importer can't see the exported decls, so imported
// names — and anything whose inferred type depends on them — come back untyped.
// (`std:` imports still resolve via the embedded-map wrapper baked into the
// checker by `wasmCheckerBrowser.ts`.)
//
// `main.ts` wires the live project files via `setWorkspace`. Before that — and in
// a single-file unit test — the reader yields nothing and queries run single-file
// under the default entry key.
const DEFAULT_ENTRY = "main.vl";
let workspaceFiles: () => Record<string, string> = () => ({});
const reader: ModuleReader = (key: string) => workspaceFiles()[key];

/** Wire the project's files (filename → source) for cross-file analysis. */
export const setWorkspace = (getFiles: () => Record<string, string>): void => {
  workspaceFiles = getFiles;
};

// The injected checker (set once by `main.ts` after the seed loads). Undefined
// until then — and forever if the seed couldn't be fetched/instantiated — in
// which case every seed-backed feature returns an empty result.
let checker: WasmChecker | undefined;

/** Wire the loaded wasm checker into the adapter. Call once, after load. */
export const initLsp = (loaded: WasmChecker | undefined): void => {
  checker = loaded;
};

// ---- diagnostics -----------------------------------------------------------

/**
 * Diagnostics for `text` (as the entry at `entryKey`) off the self-hosted seed:
 * the error tier (`check` — parse + type, whole-program via the workspace reader,
 * so cross-module import errors surface and resolved imports don't read as
 * "undeclared") merged with the lint pass (`lint` — unused/prefer-const/…, with
 * the `unnecessary` tag for dead spans). This drives the editor squiggles; the
 * heavier codegen only runs on Run. Empty before the seed loads.
 */
export const diagnostics = async (
  text: string,
  entryKey: string = DEFAULT_ENTRY,
): Promise<VLDiagnostic[]> => {
  if (checker === undefined) return [];
  const errors = await checker.check(text, entryKey, reader).catch(() => []);
  return [...errors, ...checker.lint(text)];
};

// ---- semantic tokens -------------------------------------------------------

/**
 * The delta-encoded semantic-token `data` array for the whole document, sourced
 * entirely from the wasm checker (the same path `server.ts`'s
 * `textDocument/semanticTokens` takes): identifiers (`tokensAt`) + the lexical
 * layer (`lexicalTokensAt` — keywords/operators/literals/comments) + member names
 * (`memberTokensAt`), assembled by `semanticTokensDataFromWasm`. Empty before the
 * seed loads.
 */
export const semanticTokens = async (
  text: string,
  entryKey: string = DEFAULT_ENTRY,
): Promise<number[]> => {
  if (checker === undefined) return [];
  const idents = await checker.tokensAt(text, entryKey, reader).catch(() => []);
  const members = await checker.memberTokensAt(text, entryKey, reader)
    .catch(() => []);
  const lexical = checker.lexicalTokensAt(text);
  return semanticTokensDataFromWasm(idents, lexical, members);
};

// ---- hover -----------------------------------------------------------------

/** A resolved hover: the markdown body plus the source range it covers. */
export type HoverResult = {
  /**
   * The hover body as MARKDOWN: the declaration's `///` block (D9.11) as prose above a
   * fenced `vital` code block, composed by `docMarkdown` — the same layout `server.ts`
   * and completion use. An undocumented declaration is exactly the bare fence, so
   * `main.ts` renders this verbatim rather than fencing it a second time.
   */
  contents: string;
  /** 0-based range of the hovered identifier/member, for Monaco's hover box. */
  range?: { start: LspPosition; end: LspPosition };
};

/**
 * Resolve the type at `pos`, mirroring `server.ts`'s wasm-mode `onHover` chain:
 * value binding (`hoverTypeAt`) → member access (`memberTypeAt`) → user `type`
 * alias (`typeAliasAt`) → builtin (the native builtin set). Returns `null` when
 * the cursor isn't on a typeable word (or the seed hasn't loaded). The hovered
 * word's range comes from a local scan so Monaco can highlight it. The body is
 * already markdown — see {@link HoverResult}.
 */
export const hover = async (
  text: string,
  pos: LspPosition,
  entryKey: string = DEFAULT_ENTRY,
): Promise<HoverResult | null> => {
  if (checker === undefined) return null;
  const word = wordAt(text, pos);
  if (!word) return null;
  const at = async (
    fn: (s: string, k: string, r: ModuleReader, l: number, c: number) => Promise<string | undefined>,
  ): Promise<string | undefined> =>
    await fn(text, entryKey, reader, pos.line, pos.character).catch(() => undefined);

  // Each rung is filtered through `displayableType` (same as `server.ts`): the
  // body renders as a fenced `vital` code block, so a native rendering carrying
  // an absence-of-a-type sentinel (`<error>` for an annotation that didn't
  // resolve) counts as NO ANSWER and falls through to the next rung instead of
  // printing a type name VL does not have.
  const t = displayableType(await at(checker.hoverTypeAt)) ??
    displayableType(await at(checker.memberTypeAt)) ??
    displayableType(await at(checker.typeAliasAt));
  if (t) {
    // The `///` block above the declaration this name resolves to (D9.11), asked
    // once for the whole ladder as `server.ts` does — the rungs disagree about which
    // query answers the type, but they all name the same declaration.
    const doc = await at(checker.docAt);
    return {
      contents: docMarkdown(`${word.text}: ${t}`, VL_LANGUAGE_ID, doc),
      range: word.range,
    };
  }

  // Builtin (`print`/`i32`/…): the word in the native builtin set. No user
  // declaration, so no `///` block can be above it.
  const b = checker.builtinCompletions().find((x) => x.name === word.text);
  if (b && isDisplayableType(b.detail)) {
    return {
      contents: docMarkdown(`${word.text}: ${b.detail}`, VL_LANGUAGE_ID),
      range: word.range,
    };
  }
  return null;
};

// The identifier straddling the cursor (`[A-Za-z_][A-Za-z0-9_]*`), with its
// 0-based range, or null. Mirrors `server.ts`'s `wordAt` but also returns the
// span so the hover can highlight it.
const wordAt = (
  text: string,
  pos: LspPosition,
): { text: string; range: { start: LspPosition; end: LspPosition } } | null => {
  const line = text.split("\n")[pos.line] ?? "";
  const isWordChar = (c: string) => /[A-Za-z0-9_]/.test(c);
  let start = pos.character;
  let end = pos.character;
  while (start > 0 && isWordChar(line[start - 1])) start--;
  while (end < line.length && isWordChar(line[end])) end++;
  if (start === end) return null;
  const word = line.slice(start, end);
  if (!/^[A-Za-z_]/.test(word)) return null; // reject numeric literals
  return {
    text: word,
    range: {
      start: { line: pos.line, character: start },
      end: { line: pos.line, character: end },
    },
  };
};

// ---- inlay hints (D6) ------------------------------------------------------

/** One inferred-type inlay hint, in LSP 0-based coordinates. */
export type InlayHint = { line: number; character: number; label: string };

/**
 * Inferred-type inlay hints for the (visible) range, mirroring `server.ts`'s
 * wasm-mode inlay handler: the inferred types + decl positions come from the
 * checker (`inlayHintsAt`); the source-scan annotation/range filters stay
 * host-side (`inlayHintsFromWasm`). Empty before the seed loads.
 */
export const inlayHints = async (
  text: string,
  range: LspRange,
  entryKey: string = DEFAULT_ENTRY,
): Promise<InlayHint[]> => {
  if (checker === undefined) return [];
  const candidates = await checker.inlayHintsAt(text, entryKey, reader)
    .catch(() => []);
  return inlayHintsFromWasm(candidates, range, text).map((h) => ({
    line: h.line,
    character: h.char,
    label: h.label,
  }));
};

// ---- go-to-definition (D2) -------------------------------------------------

/**
 * The defining span of the binding under `pos`, in LSP 0-based coordinates, or
 * null — the data behind go-to-definition. Mirrors `server.ts`'s wasm-mode
 * `onDefinition`: an IMPORTED name jumps CROSS-FILE first (to the exporting
 * sibling's decl via `importedNameSources`) — `definitionAt` would return the
 * canonical decl's span in the DEPENDENCY with no module, mis-attributing it to
 * the current file (the import line). A purely-local name falls to `definitionAt`.
 * `file` names the target module key when the jump is cross-file (`main.ts` maps
 * it to the sibling model); undefined for a same-file jump.
 */
export type DefinitionResult = {
  start: LspPosition;
  end: LspPosition;
  file?: string;
};

export const definition = async (
  text: string,
  pos: LspPosition,
  entryKey: string = DEFAULT_ENTRY,
): Promise<DefinitionResult | null> => {
  if (checker === undefined) return null;
  // Imported name → its exporting sibling's declaration.
  const word = wordAt(text, pos);
  if (word) {
    const sources = await checker
      .importedNameSources(text, entryKey, reader)
      .catch(() => ({} as Record<string, { key: string; line: number; col: number; length: number }>));
    const src = sources[word.text];
    if (src) {
      return {
        file: src.key,
        start: { line: src.line - 1, character: src.col }, // native 1-based line → 0-based
        end: { line: src.line - 1, character: src.col + src.length },
      };
    }
  }
  // Local binding declaration (same file).
  const range = await checker
    .definitionAt(text, entryKey, reader, pos.line, pos.character)
    .catch(() => undefined);
  return range ?? null;
};

// ---- whole-document formatting (D4) ----------------------------------------

/**
 * Reprint `source` via the self-hosted formatter (`format.vl` through
 * `wasmChecker.formatSrc`), or undefined on a parse error / before the seed
 * loads — `main.ts` then leaves the buffer untouched.
 */
export const format = (source: string): string | undefined =>
  checker?.formatSrc(source);

// ---- folding ranges (D9.9) --------------------------------------------------

/**
 * Foldable regions of `source` — bracketed blocks, multi-line paren/bracket
 * groups, `//` comment runs, the leading import block. Lines are 0-based and
 * `endLine` is inclusive, the LSP wire form `server.ts` returns;
 * `main.ts` shifts both to Monaco's 1-based lines.
 *
 * The ONE exception to this module's shape: it is neither async nor
 * seed-dependent. Folding is a token scan (`lsp/src/folding.ts`) over VL's
 * lexical grammar, so the playground folds before `initLsp` and keeps folding
 * when the seed fails to load.
 */
export const foldingRanges = (source: string): VlFoldingRange[] =>
  computeFoldingRanges(source);

// ---- signature help (D9.10) -------------------------------------------------

/** A resolved signature plus the argument the cursor is in. */
export type SignatureHelpResult = SigLabel & {
  /** 0-based; may point past the last parameter, which highlights nothing. */
  activeParameter: number;
};

/**
 * The signature of the call at `pos`, mirroring `server.ts`'s `onSignatureHelp`:
 * the lexical half (`callSiteAt` — which call, which argument) is the shared
 * pure module, the parameter table comes from the checker's `sigAt`. Null when
 * the cursor is not inside an argument list, the callee is not callable, or the
 * seed hasn't loaded.
 */
export const signatureHelp = async (
  text: string,
  pos: LspPosition,
  entryKey: string = DEFAULT_ENTRY,
): Promise<SignatureHelpResult | null> => {
  if (checker === undefined) return null;
  const site = callSiteAt(text, pos.line, pos.character);
  if (site === undefined) return null;
  const ask = (source: string) =>
    checker!
      .signatureAt(
        source,
        entryKey,
        reader,
        site.callee.line,
        site.callee.character,
      )
      .catch(() => undefined);
  // Buffer as written first, then the missing-`)` repair — `server.ts`'s order,
  // and for the reason documented at `repairedSource`.
  let sig = await ask(text);
  if (sig === undefined) {
    const repaired = repairedSource(text, pos.line, pos.character, site);
    if (repaired !== undefined) sig = await ask(repaired);
  }
  if (sig === undefined) return null;
  return {
    ...signatureLabel(site.name, sig),
    activeParameter: site.activeArgument,
  };
};

// ---- quick-fixes (code actions / B17) --------------------------------------

/**
 * Quick-fixes for the lint diagnostics overlapping `range`, mirroring
 * `server.ts`'s `onCodeAction`. Pure string surgery over the diagnostic `code`
 * + range (`codeActions.ts`) — unchanged by the wasm migration.
 */
export const codeActions = async (
  text: string,
  range: LspRange,
  contextDiagnostics: VLDiagnostic[] = [],
  entryKey: string = DEFAULT_ENTRY,
): Promise<QuickFix[]> => {
  const cached = await diagnostics(text, entryKey);
  const fixable = fixableDiagnosticsForRange(contextDiagnostics, cached, range);
  const fixes: QuickFix[] = [];
  for (const d of fixable) {
    fixes.push(...quickFixesForDiagnostic(text, d.code, d.range));
    // A missing UFCS import is the one fix whose candidate set the document
    // cannot supply: which modules export the `self`-function this receiver
    // dispatches to is the CHECKER's answer, riding the diagnostic's
    // `data.modules` (recovered from `cached` when the editor did not round-trip
    // it). No second query — the compiler decided it once, at the raise.
    const ufcsName = ufcsMissingImportAt(text, d);
    if (ufcsName !== undefined) {
      fixes.push(...ufcsImportFixes(
        text,
        ufcsName,
        ufcsImportModules(d, cached),
        (src, spec, name) =>
          importInsertionEdit(src, spec, name, (stmt) => checker?.formatSrc?.(stmt)),
      ));
    }
  }
  return fixes;
};

/**
 * Organize imports: drop every REDUNDANT specifier — unused AND duplicate alike,
 * both lint codes — and reprint each surviving statement through the seed's
 * formatter, a specifier-less statement's line removed whole. The browser half of
 * `server.ts`'s `source.organizeImports` action. No edits (already organized)
 * means no action. Empty before the seed loads.
 */
export const organizeImports = async (
  text: string,
  entryKey: string = DEFAULT_ENTRY,
): Promise<CompletionEdit[]> => {
  if (checker === undefined) return [];
  const redundant = (await diagnostics(text, entryKey))
    .filter((d) => d.code === "unused-import" || d.code === "duplicate-import")
    .map((d) => d.range);
  return organizeImportEdits(text, redundant, (stmt) => checker?.formatSrc?.(stmt));
};

// ---- completion (D3) -------------------------------------------------------

/**
 * One completion item in playground (Monaco-free) form. `main.ts` maps each onto
 * a Monaco `CompletionItem`. The render decisions (inline label detail +
 * highlighted `documentation` panel, snippet flag) are made HERE so the Monaco
 * provider stays a thin shape-mapper, exactly as `server.ts` keeps them in
 * `toCompletionItem`.
 */
export type CompletionItem = {
  label: string;
  kind: CompletionKind;
  labelDetail?: string;
  documentation?: string;
  insertText?: string;
  /** Right-aligned secondary label — the providing module for an auto-import item. */
  description?: string;
  /**
   * Edits applied ALONGSIDE the insertion (Monaco `additionalTextEdits`) — a std
   * auto-import item carries the `import { … } from "std:…"` rewrite here, so
   * accepting the name also adds its import.
   */
  additionalTextEdits?: CompletionEdit[];
};

/** The fence language id the playground hover/completion code blocks use. */
const VL_LANGUAGE_ID = "vital";

// One LSP-neutral `Completion` → the playground `CompletionItem`, mirroring
// `server.ts`'s `toCompletionItem`: a typed item renders its type once inline
// (`labelDetail`) and once highlighted (`documentation`), never the top-level
// `detail`. A snippet carries its insert text + the snippet kind.
const toCompletionItem = (c: Completion): CompletionItem => {
  const item: CompletionItem = { label: c.name, kind: c.kind };
  if (c.detail !== undefined) item.labelDetail = typeLabelDetail(c.detail);
  if (c.detail !== undefined || (c.doc && c.doc.trim() !== "")) {
    item.documentation = docMarkdown(c.detail ?? "", VL_LANGUAGE_ID, c.doc);
  }
  if (c.insertText !== undefined) item.insertText = c.insertText;
  if (c.description !== undefined) item.description = c.description;
  if (c.extraEdits !== undefined) item.additionalTextEdits = c.extraEdits;
  return item;
};

// Per-std-module export surfaces (name/kind/type) for `stdAutoImportCompletions`,
// the browser twin of `server.ts`'s `stdExportsForCompletion`. The browser has no
// workspace `std/`, so every source is the embedded map; types come from one
// `scopeAt` over the module itself, matched to its export list, and a re-export
// carries its origin instead. Cached by source text so the walk runs once.
const stdExportCache = new Map<string, { src: string; exports: StdExportCandidate[] }>();
const SCOPE_KINDS = ["variable", "parameter", "function"] as const;
const stdExportsForPlayground = async (): Promise<Map<string, StdExportCandidate[]>> => {
  const out = new Map<string, StdExportCandidate[]>();
  if (checker === undefined) return out;
  for (const key of Object.keys(STD_SOURCES)) {
    const src = STD_SOURCES[key];
    const cached = stdExportCache.get(key);
    if (cached !== undefined && cached.src === src) {
      out.set(key, cached.exports);
      continue;
    }
    const surface = checker.moduleSurface(src, key);
    const lastLine = src.split("\n").length - 1;
    const scope = await checker.scopeAt(src, key, reader, lastLine, 0).catch(() => []);
    const byName = new Map(scope.map((b) => [b.name, b]));
    const exports: StdExportCandidate[] = surface.exports.map((e) => {
      // A re-export has no binding in this module's own scope, so it carries its
      // origin instead of a type detail (the ranking uses that origin).
      const b = e.origin === "" ? byName.get(e.name) : undefined;
      return {
        name: e.name,
        kind: b !== undefined ? SCOPE_KINDS[b.kind] ?? "function" : "function",
        detail: b !== undefined && b.type !== "" ? b.type : undefined,
        ...(e.origin === "" ? {} : { origin: e.origin }),
      };
    });
    stdExportCache.set(key, { src, exports });
    out.set(key, exports);
  }
  return out;
};

/**
 * Completion candidates at `pos`, mirroring `server.ts`'s wasm-mode
 * `onCompletion`:
 *   - after a `.` receiver: strip the trailing `.` (the native parser isn't
 *     error-tolerant for `receiver.`) and return the receiver's members
 *     (`memberCompletionsAt`) — keywords/snippets suppressed.
 *   - otherwise: native in-scope bindings (`scopeAt`) + native builtins
 *     (`builtinCompletions`) + keyword and snippet completions. A user binding
 *     shadows a same-named builtin (added last).
 * Empty before the seed loads.
 */
export const completion = async (
  text: string,
  pos: LspPosition,
  triggerChar?: string,
  entryKey: string = DEFAULT_ENTRY,
): Promise<CompletionItem[]> => {
  if (checker === undefined) return [];

  const line = text.split("\n")[pos.line] ?? "";
  const linePrefix = line.slice(0, pos.character);
  const charBeforeCursor = linePrefix[linePrefix.length - 1];

  // Member completion: cursor follows `<receiver>.`.
  if (triggerChar === "." || charBeforeCursor === ".") {
    const receiver = wordEndingBefore(linePrefix, linePrefix.length - 1);
    if (!receiver) return [];
    const dotCol = pos.character - 1;
    const repaired = removeCharAt(text, pos.line, dotCol);
    const members = await checker
      .memberCompletionsAt(repaired, entryKey, reader, pos.line, dotCol - receiver.length)
      .catch(() => []);
    const fields = memberCompletionsFromWasm(members);
    // The UFCS half, which this path offered nothing of: `x.f(…)` over a free
    // `function f(self: T, …)` is a call the checker resolves only against names IN SCOPE,
    // and the editor is what surfaces the rest. A FIELD of the same name wins at a real
    // call, so `taken` drops the free function under that label.
    const taken = new Set(fields.map((f) => f.name));
    const cands = await checker
      .ufcsCandidatesAt(repaired, entryKey, reader, pos.line, dotCol - receiver.length)
      .catch(() => []);
    const ufcs = ufcsCompletions(text, entryKey, cands, (n) => taken.has(n));
    return [...fields, ...ufcs].map(toCompletionItem);
  }

  // Identifier completion: in-scope user bindings + builtins, plus keyword/snippet
  // items. A user binding shadows a same-named builtin (added last).
  const bindings = await checker
    .scopeAt(text, entryKey, reader, pos.line, pos.character)
    .catch(() => []);
  const byName = new Map<string, Completion>();
  for (const c of builtinCompletionsFromWasm(checker.builtinCompletions())) {
    byName.set(c.name, c);
  }
  for (const c of scopeCompletionsFromBindings(bindings)) byName.set(c.name, c);
  // The TYPE namespace, on the same terms `server.ts` adds it: never over a name a value
  // already took.
  const typeNames = await checker
    .typeNamesAt(text, entryKey, reader)
    .catch(() => []);
  for (const c of typeCompletionsFromWasm(typeNames, (n) => byName.has(n))) {
    byName.set(c.name, c);
  }
  const identifiers = [...byName.values()].map(toCompletionItem);
  const keywords = keywordCompletions(false).map(toCompletionItem);
  const snippets = snippetCompletions(false).map(toCompletionItem);
  // std exports NOT in scope, offered with an import-statement rewrite on accept
  // (`additionalTextEdits`) — the browser half of `server.ts`'s auto-import pass,
  // spelled by the seed's own formatter so the added import is what `vl fmt` keeps.
  const autoImports = stdAutoImportCompletions(
    text,
    await stdExportsForPlayground(),
    (name) => byName.has(name),
    (stmt) => checker?.formatSrc?.(stmt),
  ).map(toCompletionItem);
  return [...identifiers, ...autoImports, ...keywords, ...snippets];
};

// The identifier `[A-Za-z_][A-Za-z0-9_]*` immediately to the LEFT of `character`
// on `line`, or null — the `<name>.` member-completion receiver. Mirrors
// `server.ts`'s `wordEndingBefore`.
const wordEndingBefore = (line: string, character: number): string | null => {
  const isWordChar = (c: string) => /[A-Za-z0-9_]/.test(c);
  const end = character;
  let start = end;
  while (start > 0 && isWordChar(line[start - 1])) start--;
  if (start === end) return null;
  const word = line.slice(start, end);
  return /^[A-Za-z_]/.test(word) ? word : null;
};

// Remove the single character at (0-based line, 0-based col) — strips the trailing
// `.` so the wasm member-completion path resolves the receiver as a bare
// expression (the native parser isn't error-tolerant for `receiver.`). Mirrors
// `server.ts`'s `removeCharAt`. A no-op if the position is out of range.
const removeCharAt = (text: string, line: number, col: number): string => {
  const lines = text.split("\n");
  if (line < 0 || line >= lines.length) return text;
  const l = lines[line];
  if (col < 0 || col >= l.length) return text;
  lines[line] = l.slice(0, col) + l.slice(col + 1);
  return lines.join("\n");
};
