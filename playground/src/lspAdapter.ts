// The playground's language features: a transport over `lsp/src/features.ts`, the
// same functions `lsp/src/server.ts` calls, run in the browser against the wasm
// seed. Each export builds the request context, calls the shared feature and
// returns plain, Monaco-free data; `main.ts` maps it onto Monaco's providers.
//
// Every seed-backed export answers empty before `initLsp` is given a checker, and
// forever when the seed failed to load. Folding, formatting and the quick fixes
// still answer without one, as the server's do.
//
// Positions are the LSP wire form (0-based line and character); `main.ts` converts
// to Monaco's 1-based lines and columns. Files are named by their project key
// (`main.vl`, `mathx.vl`), which is also each query's entry key.

import type { ModuleReader } from "../../compiler/coreTypes.ts";
import type { VLDiagnostic } from "../../compiler/diagnostics.ts";
import { isStdKey, type StdSurfaceCache } from "../../lsp/src/editorText.ts";
import {
  codeActionsAt,
  completionPresentation,
  completionsAt,
  definitionAt,
  documentHighlightsAt,
  documentSymbolsAt,
  type FeatureCodeAction,
  type FeatureContext,
  type FeatureFoldingRange,
  type FeaturePosition,
  type FeatureSignature,
  type FeatureTextEdit,
  type FeatureWorkspace,
  foldingRangesAt,
  formattingEditsAt,
  hoverAt,
  inlayHintsAt,
  prepareRenameAt,
  referencesAt,
  renameAt,
  semanticTokensAt,
  signatureHelpAt,
  wordRangeAt,
} from "../../lsp/src/features.ts";
import { uriToPath } from "../../lsp/src/moduleGraph.ts";
import {
  type CompletionEdit,
  type CompletionKind,
  type DocumentHighlightSpan,
  type LspRange,
  type OutlineNode,
  SEMANTIC_TOKEN_LEGEND,
} from "../../lsp/src/typeFeatures.ts";
import type { WasmChecker } from "../../lsp/src/wasmChecker.ts";

export type {
  CompletionEdit,
  DocumentHighlightSpan,
  FeatureFoldingRange,
  FeatureTextEdit,
  LspRange,
  OutlineNode,
  VLDiagnostic,
};
export { SEMANTIC_TOKEN_LEGEND };

/** LSP 0-based line / 0-based character. */
export type LspPosition = FeaturePosition;

// A query runs the buffer as the entry module at its file key, with a reader that
// serves the sibling files, so an imported name resolves as it does in VS Code.
// Before `setWorkspace` (and in a single-file test) the reader yields nothing.
const DEFAULT_ENTRY = "main.vl";
let workspaceFiles: () => Record<string, string> = () => ({});
const reader: ModuleReader = (key: string) => workspaceFiles()[key];

/** Wire the project's files (filename → source) for cross-file analysis. */
export const setWorkspace = (getFiles: () => Record<string, string>): void => {
  workspaceFiles = getFiles;
};

let checker: WasmChecker | undefined;

/** Wire the loaded wasm checker into the adapter. Call once, after load. */
export const initLsp = (loaded: WasmChecker | undefined): void => {
  checker = loaded;
};

// The shared features' request context, or undefined before a seed loads. A
// failed checker query answers "no result" there and is logged here.
const contextFor = (entryKey: string): FeatureContext | undefined =>
  checker === undefined
    ? undefined
    : { checker, entryKey, reader, log: (msg) => console.debug(msg) };

// The project as the cross-module features crawl it: every file is an open
// document, its key standing in for a URI, and there is no disk.
const workspaceFor = (entryKey: string): FeatureWorkspace => ({
  uri: entryKey,
  openDocs: () =>
    Object.entries(workspaceFiles())
      .filter(([key]) => key !== entryKey)
      .map(([key, text]) => ({ uri: key, text })),
  diskFiles: () => [],
});

// A result's document back to its project key: the shared crawl names the entry
// by `file://<key>`, every other file by the key it was given.
const fileOf = (uri: string): string => uriToPath(uri);

// ---- diagnostics -------------------------------------------------------------

/**
 * Diagnostics for `text` as the entry at `entryKey`: the seed's whole-program
 * `check` plus the lint pass. Empty before the seed loads.
 */
export const diagnostics = async (
  text: string,
  entryKey: string = DEFAULT_ENTRY,
): Promise<VLDiagnostic[]> => {
  if (checker === undefined) return [];
  const errors = await checker.check(text, entryKey, reader).catch(() => []);
  const diags = [...errors, ...checker.lint(text, entryKey)];
  lastDiagnostics = { text, entryKey, diags };
  return diags;
};

// The editor runs `diagnostics` on every edit, so a code-action request on the
// same buffer reuses that answer, as the server reads its published ones. A
// different text recomputes rather than answering for a stale buffer.
let lastDiagnostics:
  | { text: string; entryKey: string; diags: VLDiagnostic[] }
  | undefined;

const diagnosticsForRequest = (
  text: string,
  entryKey: string,
): Promise<VLDiagnostic[]> =>
  lastDiagnostics !== undefined &&
    lastDiagnostics.text === text &&
    lastDiagnostics.entryKey === entryKey
    ? Promise.resolve(lastDiagnostics.diags)
    : diagnostics(text, entryKey);

// ---- seed-backed position features ------------------------------------------

/** The whole document's delta-encoded semantic-token data. */
export const semanticTokens = async (
  text: string,
  entryKey: string = DEFAULT_ENTRY,
): Promise<number[]> => {
  const ctx = contextFor(entryKey);
  return ctx === undefined ? [] : await semanticTokensAt(text, ctx);
};

/** A hover's markdown body and the identifier range it covers. */
export type HoverResult = { contents: string; range?: LspRange };

/** The hover at `pos`: `hoverAt`'s markdown, highlighting the word under it. */
export const hover = async (
  text: string,
  pos: LspPosition,
  entryKey: string = DEFAULT_ENTRY,
): Promise<HoverResult | null> => {
  const ctx = contextFor(entryKey);
  if (ctx === undefined) return null;
  const contents = await hoverAt(text, pos, ctx);
  if (contents === null) return null;
  return { contents, range: wordRangeAt(text, pos) ?? undefined };
};

/** One inferred-type inlay hint. */
export type InlayHint = { line: number; character: number; label: string };

/** Inferred-type hints for the un-annotated declarations inside `range`. */
export const inlayHints = async (
  text: string,
  range: LspRange,
  entryKey: string = DEFAULT_ENTRY,
): Promise<InlayHint[]> => {
  const ctx = contextFor(entryKey);
  if (ctx === undefined) return [];
  return (await inlayHintsAt(text, range, ctx)).map((h) => ({
    line: h.line,
    character: h.char,
    label: h.label,
  }));
};

/** A definition target; `file` names the declaring file when it is not this one. */
export type DefinitionResult = {
  start: LspPosition;
  end: LspPosition;
  file?: string;
};

/** The declaration the name at `pos` resolves to, cross-file for an import. */
export const definition = async (
  text: string,
  pos: LspPosition,
  entryKey: string = DEFAULT_ENTRY,
): Promise<DefinitionResult | null> => {
  const ctx = contextFor(entryKey);
  if (ctx === undefined) return null;
  const target = await definitionAt(text, pos, ctx);
  if (target === null) return null;
  const result: DefinitionResult = { start: target.range.start, end: target.range.end };
  if (target.key !== undefined) result.file = target.key;
  return result;
};

/** One occurrence, in the project file `file`. */
export type FileRange = { file: string; range: LspRange };

/** Every occurrence of the binding at `pos`, across the project's files. */
export const references = async (
  text: string,
  pos: LspPosition,
  includeDeclaration: boolean,
  entryKey: string = DEFAULT_ENTRY,
): Promise<FileRange[] | null> => {
  const ctx = contextFor(entryKey);
  if (ctx === undefined) return null;
  const refs = await referencesAt(text, pos, includeDeclaration, ctx, workspaceFor(entryKey));
  return refs?.map((r) => ({ file: fileOf(r.uri), range: r.range })) ?? null;
};

/** Same-file occurrences of the symbol at `pos`, the declaration as a write. */
export const documentHighlights = async (
  text: string,
  pos: LspPosition,
  entryKey: string = DEFAULT_ENTRY,
): Promise<DocumentHighlightSpan[] | null> => {
  const ctx = contextFor(entryKey);
  return ctx === undefined ? null : await documentHighlightsAt(text, pos, ctx);
};

/** The outline, nested by declaration extent. */
export const documentSymbols = async (
  text: string,
  entryKey: string = DEFAULT_ENTRY,
): Promise<OutlineNode[] | null> => {
  const ctx = contextFor(entryKey);
  return ctx === undefined ? null : await documentSymbolsAt(text, ctx);
};

/** The signature of the call around `pos`, with the argument it is in. */
export const signatureHelp = async (
  text: string,
  pos: LspPosition,
  entryKey: string = DEFAULT_ENTRY,
): Promise<FeatureSignature | null> => {
  const ctx = contextFor(entryKey);
  return ctx === undefined ? null : await signatureHelpAt(text, pos, ctx);
};

// ---- rename ------------------------------------------------------------------

/** A request the feature refuses, with the sentence the editor shows. */
export type Refusal = { error: string };

/** The span and current name a rename at `pos` would replace. */
export const prepareRename = async (
  text: string,
  pos: LspPosition,
  entryKey: string = DEFAULT_ENTRY,
): Promise<{ range: LspRange; placeholder: string } | Refusal | null> => {
  const ctx = contextFor(entryKey);
  return ctx === undefined ? null : await prepareRenameAt(text, pos, ctx, isStdKey);
};

/** The edits renaming the symbol at `pos` to `newName`, by project file. */
export const rename = async (
  text: string,
  pos: LspPosition,
  newName: string,
  entryKey: string = DEFAULT_ENTRY,
): Promise<{ changes: Record<string, FeatureTextEdit[]> } | Refusal | null> => {
  const ctx = contextFor(entryKey);
  if (ctx === undefined) return null;
  const answer = await renameAt(text, pos, newName, ctx, workspaceFor(entryKey), isStdKey);
  if (answer === null || "error" in answer) return answer;
  const changes: Record<string, FeatureTextEdit[]> = {};
  for (const [uri, edits] of Object.entries(answer.changes)) changes[fileOf(uri)] = edits;
  return { changes };
};

// ---- features that answer without a seed ----------------------------------------

/** `source` through the seed's formatter, or undefined when nothing changes. */
export const format = (source: string): string | undefined =>
  formattingEditsAt(source, checker)[0]?.newText;

/** Foldable regions; the lexical scan alone answers before the seed loads. */
export const foldingRanges = (source: string): FeatureFoldingRange[] =>
  foldingRangesAt(source, checker);

/** A code action over the one file it was asked about. */
export type CodeAction = {
  title: string;
  kind: FeatureCodeAction<VLDiagnostic>["kind"];
  isPreferred?: boolean;
  edits: FeatureTextEdit[];
};

/**
 * Quick fixes for the diagnostics over `range`, then organize imports.
 * `contextDiagnostics` are the editor's markers; the last `diagnostics` answer
 * for this text is folded in. `only` is the request's kind filter.
 */
export const codeActions = async (
  text: string,
  range: LspRange,
  contextDiagnostics: VLDiagnostic[] = [],
  entryKey: string = DEFAULT_ENTRY,
  only?: string[],
): Promise<CodeAction[]> => {
  const known = await diagnosticsForRequest(text, entryKey);
  return codeActionsAt(
    text,
    entryKey,
    range,
    contextDiagnostics,
    () => known,
    only,
    checker,
    entryKey,
  ).map((a) => {
    const action: CodeAction = { title: a.title, kind: a.kind, edits: a.edit.changes[entryKey] };
    if (a.isPreferred !== undefined) action.isPreferred = a.isPreferred;
    return action;
  });
};

/** Organize imports' edits for `text`; none when it is already organized. */
export const organizeImports = (
  text: string,
  entryKey: string = DEFAULT_ENTRY,
): FeatureTextEdit[] => {
  const zero = { line: 0, character: 0 };
  const [organize] = codeActionsAt(
    text,
    entryKey,
    { start: zero, end: zero },
    [],
    () => [],
    ["source.organizeImports"],
    checker,
    entryKey,
  );
  return organize?.edit.changes[entryKey] ?? [];
};

// ---- completion ----------------------------------------------------------------

/**
 * One completion in Monaco-free form: `labelDetail` is the inline type,
 * `documentation` the markdown panel, `description` the providing module of an
 * auto-import item, whose import rewrite rides `additionalTextEdits`.
 */
export type CompletionItem = {
  label: string;
  kind: CompletionKind;
  labelDetail?: string;
  documentation?: string;
  insertText?: string;
  description?: string;
  additionalTextEdits?: CompletionEdit[];
};

const stdExportCache: StdSurfaceCache = new Map();

/**
 * Completions at `pos`, as `completionsAt` composes them. `_triggerChar` is
 * accepted for Monaco's call shape; a member position is read off the line.
 */
export const completion = async (
  text: string,
  pos: LspPosition,
  _triggerChar?: string,
  entryKey: string = DEFAULT_ENTRY,
): Promise<CompletionItem[]> => {
  const ctx = contextFor(entryKey);
  if (ctx === undefined) return [];
  return (await completionsAt(text, pos, ctx, stdExportCache)).map((c) => {
    const item: CompletionItem = { label: c.name, kind: c.kind, ...completionPresentation(c) };
    if (c.insertText !== undefined) item.insertText = c.insertText;
    if (c.description !== undefined) item.description = c.description;
    if (c.extraEdits !== undefined) item.additionalTextEdits = c.extraEdits;
    return item;
  });
};
