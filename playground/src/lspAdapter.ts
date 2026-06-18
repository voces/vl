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
  type CompletionKind,
  docMarkdown,
  inlayHintsFromWasm,
  keywordCompletions,
  type LspRange,
  memberCompletionsFromWasm,
  scopeCompletionsFromBindings,
  SEMANTIC_TOKEN_LEGEND,
  semanticTokensDataFromWasm,
  snippetCompletions,
  typeLabelDetail,
} from "../../lsp/src/typeFeatures.ts";
import type { WasmChecker } from "../../lsp/src/wasmChecker.ts";
import type { ModuleReader } from "../../compiler/coreTypes.ts";
import {
  fixableDiagnosticsForRange,
  type LspTextEdit,
  type QuickFix,
  quickFixesForDiagnostic,
} from "../../lsp/src/codeActions.ts";

export type { LspTextEdit, QuickFix, VLDiagnostic };
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

/** A resolved hover: the markdown-ish body plus the source range it covers. */
export type HoverResult = {
  /** `name: type` body, rendered by `main.ts` as a fenced `vital` code block. */
  contents: string;
  /** 0-based range of the hovered identifier/member, for Monaco's hover box. */
  range?: { start: LspPosition; end: LspPosition };
};

/**
 * Resolve the type at `pos`, mirroring `server.ts`'s wasm-mode `onHover` chain:
 * value binding (`hoverTypeAt`) → member access (`memberTypeAt`) → user `type`
 * alias (`typeAliasAt`) → builtin (the native builtin set). Returns `null` when
 * the cursor isn't on a typeable word (or the seed hasn't loaded). The hovered
 * word's range comes from a local scan so Monaco can highlight it.
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

  const t = await at(checker.hoverTypeAt) ??
    await at(checker.memberTypeAt) ??
    await at(checker.typeAliasAt);
  if (t) return { contents: `${word.text}: ${t}`, range: word.range };

  // Builtin (`print`/`i32`/…): the word in the native builtin set.
  const b = checker.builtinCompletions().find((x) => x.name === word.text);
  if (b && b.detail.length > 0) {
    return { contents: `${word.text}: ${b.detail}`, range: word.range };
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
  }
  return fixes;
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
  return item;
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
    return memberCompletionsFromWasm(members).map(toCompletionItem);
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
  const identifiers = [...byName.values()].map(toCompletionItem);
  const keywords = keywordCompletions(false).map(toCompletionItem);
  const snippets = snippetCompletions(false).map(toCompletionItem);
  return [...identifiers, ...keywords, ...snippets];
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
