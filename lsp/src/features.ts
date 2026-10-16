// LSP features over the shared `WasmChecker`, as pure functions of the document
// text and a `FeatureContext`. `server.ts` is transport: it fetches the document,
// calls in here and maps the result onto the protocol's shapes. A feature moves
// here when it has no connection or document-store dependency; the playground
// adapter can then call the same function.
//
// Imports no `vscode-languageserver` runtime values, so the module loads in the
// playground bundle and under plain Deno.

import type { ModuleReader } from "../../compiler/coreTypes.ts";
import {
  type FixableDiagnostic,
  fixableDiagnosticsForRange,
  quickFixesForDiagnostic,
  ufcsImportFixes,
  ufcsImportModules,
  ufcsMissingImportAt,
} from "./codeActions.ts";
import {
  removeCharAt,
  type StdSurfaceCache,
  stdExportSurfaces,
  wordEndingBefore,
} from "./editorText.ts";
import { foldingRanges, type VlFoldingKind } from "./folding.ts";
import {
  crossFileReferences,
  type OpenDocument,
  type UnusedExportUseMap,
} from "./moduleGraph.ts";
import {
  invalidNewNameReason,
  planRenameAt,
  type RenamePlan,
  renameEdits,
} from "./rename.ts";
import { callSiteAt, repairedSource, signatureLabel } from "./signatureHelp.ts";
import {
  builtinCompletionsFromWasm,
  type Completion,
  displayableType,
  type DocRefResolver,
  docMarkdown,
  type DocumentHighlightSpan,
  documentHighlightsFromRefs,
  exactConstHover,
  exportRefLenses,
  flatDocumentSymbols,
  importInsertionEdit,
  inlayHintsFromWasm,
  isDisplayableType,
  keywordCompletions,
  type LspRange,
  memberCompletionsFromWasm,
  nestedDocumentSymbols,
  organizeImportEdits,
  type OutlineNode,
  refCountLensTitle,
  scopeCompletionsFromBindings,
  semanticTokensDataFromWasm,
  snippetCompletions,
  stdAutoImportCompletions,
  type StdExportCandidate,
  type TypeInlayHint,
  typeCompletionsFromWasm,
  typeLabelDetail,
  ufcsCompletions,
  type UfcsProbeModule,
  ufcsProbeSource,
  withEffects,
} from "./typeFeatures.ts";
import type {
  WasmChecker,
  WasmExactConstAt,
  WasmImportedSource,
  WasmMemberToken,
  WasmRange,
  WasmToken,
} from "./wasmChecker.ts";

/**
 * A protocol `FoldingRange` (lines only; see `folding.ts` for why no columns).
 * `kind` is the protocol's own string: `FoldingRangeKind.Comment` is "comment"
 * and `FoldingRangeKind.Imports` is "imports", which `VlFoldingKind` mirrors.
 */
export type FeatureFoldingRange = {
  startLine: number;
  endLine: number;
  kind?: VlFoldingKind;
};

/**
 * Foldable regions of `text`. `checker` is optional: without a seed the lexical
 * scan alone folds every brace, and the declaration extents (which start at the
 * header line rather than the brace) are simply absent.
 */
export const foldingRangesAt = (
  text: string,
  checker: Pick<WasmChecker, "declExtentsAt"> | undefined,
): FeatureFoldingRange[] => {
  const extents = (checker?.declExtentsAt(text) ?? []).map((e) => ({
    headerLine: e.header.line,
    endLine: e.range.end.line,
  }));
  return foldingRanges(text, extents).map((r) => {
    const range: FeatureFoldingRange = {
      startLine: r.startLine,
      endLine: r.endLine,
    };
    if (r.kind !== undefined) range.kind = r.kind;
    return range;
  });
};

// ---- the request context ----------------------------------------------------

/** A 0-based line and character, the protocol's position. */
export type FeaturePosition = { line: number; character: number };

/**
 * What a seed-backed feature reads besides the document text: the checker, the
 * document's module key, the reader that resolves its imports, and the host's log.
 * A checker query that rejects is logged here and answered as "no result".
 */
export type FeatureContext = {
  checker: WasmChecker;
  entryKey: string;
  reader: ModuleReader;
  log: (msg: string) => void;
};

/**
 * The workspace a cross-module feature crawls: the document's own URI, every open
 * buffer, and the capped on-disk file list. The two lists are thunks because a
 * single-file answer never needs them.
 */
export type FeatureWorkspace = {
  uri: string;
  openDocs: () => OpenDocument[];
  diskFiles: () => string[];
};

/** The markdown fence info string: the language id the extension registers. */
export const VL_LANGUAGE_ID = "vital";

// The text of 0-based `line`, split on the terminators a `TextDocument` splits on.
const lineAt = (text: string, line: number): string =>
  text.split(/\r\n|\r|\n/)[line] ?? "";

/**
 * The identifier `[A-Za-z_][A-Za-z0-9_]*` straddling `character` on `line`, or null
 * when the cursor is on no word or on a numeric literal.
 */
export const wordAt = (line: string, character: number): string | null =>
  wordSpan(line, character)?.word ?? null;

// `wordAt`'s word with its start and end columns on the line.
const wordSpan = (
  line: string,
  character: number,
): { word: string; start: number; end: number } | null => {
  const isWordChar = (c: string) => /[A-Za-z0-9_]/.test(c);
  let start = character;
  let end = character;
  while (start > 0 && isWordChar(line[start - 1])) start--;
  while (end < line.length && isWordChar(line[end])) end++;
  if (start === end) return null;
  const word = line.slice(start, end);
  return /^[A-Za-z_]/.test(word) ? { word, start, end } : null;
};

/** The range of the identifier `wordAt` finds at `pos` in `text`, or null. */
export const wordRangeAt = (text: string, pos: FeaturePosition): LspRange | null => {
  const span = wordSpan(lineAt(text, pos.line), pos.character);
  return span === null ? null : {
    start: { line: pos.line, character: span.start },
    end: { line: pos.line, character: span.end },
  };
};

// ---- go-to-definition (D2) --------------------------------------------------

/** A definition target: `key` names the declaring module when it is not this one. */
export type DefinitionTarget = { key?: string; range: LspRange };

/**
 * The declaration the name at `pos` resolves to. An imported name answers with the
 * exporting module's declaration first: `definitionAt` would give that span with no
 * module, and the host would place it in this file.
 */
export const definitionAt = async (
  text: string,
  pos: FeaturePosition,
  ctx: FeatureContext,
): Promise<DefinitionTarget | null> => {
  const { checker, entryKey, reader, log } = ctx;
  const word = wordAt(lineAt(text, pos.line), pos.character);
  if (word && checker.importedNameSources !== undefined) {
    const sources = await checker
      .importedNameSources(text, entryKey, reader)
      .catch((err) => {
        log(`[wasm-symbols] importedNameSources failed: ${err}`);
        return {} as Record<string, WasmImportedSource>;
      });
    const s = sources[word];
    if (s) {
      const line = s.line > 0 ? s.line - 1 : 0;
      return {
        key: s.key,
        range: {
          start: { line, character: s.col },
          end: { line, character: s.col + s.length },
        },
      };
    }
  }
  if (checker.definitionAt === undefined) return null;
  const decl = await checker
    .definitionAt(text, entryKey, reader, pos.line, pos.character)
    .catch((err) => {
      log(`[wasm-symbols] definitionAt failed: ${err}`);
      return undefined;
    });
  return decl ? { range: decl } : null;
};

// ---- find references --------------------------------------------------------

/** One occurrence, in the document `uri`. */
export type FeatureLocation = { uri: string; range: LspRange };

/**
 * Every occurrence of the binding at `pos`. The checker answers single-file; on a
 * miss the symbol may be cross-module, and the open buffers plus the capped disk
 * crawl are searched for it. Null when neither finds anything.
 */
export const referencesAt = async (
  text: string,
  pos: FeaturePosition,
  includeDeclaration: boolean,
  ctx: FeatureContext,
  workspace: FeatureWorkspace,
): Promise<FeatureLocation[] | null> => {
  const { checker, entryKey, reader, log } = ctx;
  const localRefs = checker.referencesAt !== undefined
    ? await checker
      .referencesAt(
        text,
        entryKey,
        reader,
        pos.line,
        pos.character,
        includeDeclaration,
      )
      .catch((err) => {
        log(`[wasm-symbols] referencesAt failed: ${err}`);
        return [] as WasmRange[];
      })
    : [];
  if (localRefs.length > 0) {
    return localRefs.map((range) => ({ uri: workspace.uri, range }));
  }
  const word = wordAt(lineAt(text, pos.line), pos.character);
  if (!word) return null;
  const crossRefs = await crossFileReferences(
    word,
    text,
    entryKey,
    workspace.openDocs(),
    reader,
    checker,
    includeDeclaration,
    workspace.diskFiles(),
  );
  return crossRefs ?? null;
};

// ---- document highlights (D9.1) ---------------------------------------------

/**
 * Same-file occurrences of the symbol at `pos`, the declaration as a write and the
 * rest as reads. Without a `definitionAt` answer every occurrence is a read.
 */
export const documentHighlightsAt = async (
  text: string,
  pos: FeaturePosition,
  ctx: FeatureContext,
): Promise<DocumentHighlightSpan[] | null> => {
  const { checker, entryKey, reader, log } = ctx;
  if (checker.referencesAt === undefined) return null;
  const refs = await checker
    .referencesAt(text, entryKey, reader, pos.line, pos.character, true)
    .catch((err) => {
      log(`[wasm-symbols] referencesAt failed: ${err}`);
      return [] as WasmRange[];
    });
  if (refs.length === 0) return null;
  const decl = checker.definitionAt !== undefined
    ? await checker
      .definitionAt(text, entryKey, reader, pos.line, pos.character)
      .catch(() => undefined)
    : undefined;
  return documentHighlightsFromRefs(refs, decl);
};

// ---- document symbols (D9.3) ------------------------------------------------

/**
 * The outline, nested by declaration extent. A seed reporting no extents gets the
 * flat outline off `tokensAt` instead, one leaf per declared name.
 */
export const documentSymbolsAt = async (
  text: string,
  ctx: FeatureContext,
): Promise<OutlineNode[] | null> => {
  const { checker, entryKey, reader, log } = ctx;
  if (checker.tokensAt === undefined) return null;
  const exportedNames = new Set(
    checker.moduleSurface(text, entryKey).exports.map((e) => e.name),
  );
  // No extents is an older seed or a file with no declarations; the flat path
  // answers the second with nothing too.
  const extents = checker.declExtentsAt(text);
  if (extents.length > 0) return nestedDocumentSymbols(extents, exportedNames);
  const idents = await checker
    .tokensAt(text, entryKey, reader)
    .catch((err) => {
      log(`[wasm-symbols] tokensAt failed: ${err}`);
      return [] as WasmToken[];
    });
  return flatDocumentSymbols(idents, text, exportedNames).map((s) => {
    const range = {
      start: { line: s.line, character: s.char },
      end: { line: s.line, character: s.char + s.length },
    };
    return {
      name: s.name,
      kind: s.kind,
      exported: s.exported,
      selection: range,
      range,
      children: [],
    };
  });
};

// ---- signature help (D9.10) -------------------------------------------------

/**
 * The signature of the call around a position. `parameters` are offset pairs into
 * `label`; `activeParameter` is unclamped, so a surplus argument highlights nothing.
 */
export type FeatureSignature = {
  label: string;
  parameters: [number, number][];
  activeParameter: number;
};

/**
 * Signature help: `callSiteAt` finds the call and argument lexically, the checker
 * answers the callee's parameters. The buffer as written is asked first, the
 * missing-`)` repair only when that has no answer.
 */
export const signatureHelpAt = async (
  text: string,
  pos: FeaturePosition,
  ctx: FeatureContext,
): Promise<FeatureSignature | null> => {
  const { checker, entryKey, reader, log } = ctx;
  if (checker.signatureAt === undefined) return null;
  const site = callSiteAt(text, pos.line, pos.character);
  if (site === undefined) return null;
  const ask = (source: string) =>
    checker
      .signatureAt(
        source,
        entryKey,
        reader,
        site.callee.line,
        site.callee.character,
      )
      .catch((err) => {
        log(`[wasm-symbols] signatureAt failed: ${err}`);
        return undefined;
      });
  let sig = await ask(text);
  if (sig === undefined) {
    const repaired = repairedSource(text, pos.line, pos.character, site);
    if (repaired !== undefined) sig = await ask(repaired);
  }
  if (sig === undefined) return null;
  const { label, parameters } = signatureLabel(site.name, sig);
  return { label, parameters, activeParameter: site.activeArgument };
};

// ---- hover ------------------------------------------------------------------

// The `///` block as prose, then the code as a fenced `vital` block, then effects.
const hoverMarkdown = (code: string, doc?: string, effects?: string): string =>
  withEffects(docMarkdown(code, VL_LANGUAGE_ID, doc), effects);

// A position query of the checker's: (source, key, reader, line, character).
type AtQuery<T> = (
  source: string,
  key: string,
  read: ModuleReader,
  line: number,
  character: number,
) => Promise<T | undefined>;

/**
 * Hover markdown for the word at `pos`. The ladder: an exact constant, a value
 * binding, a member access, a user `type` name, a builtin. A rung whose rendering
 * is not displayable VL falls through to the next.
 */
export const hoverAt = async (
  text: string,
  pos: FeaturePosition,
  ctx: FeatureContext,
): Promise<string | null> => {
  const { checker, entryKey, reader, log } = ctx;
  const ask = async <T>(
    name: string,
    query: AtQuery<T> | undefined,
  ): Promise<T | undefined> => {
    if (query === undefined) return undefined;
    return await query
      .call(checker, text, entryKey, reader, pos.line, pos.character)
      .catch((err) => {
        log(`[wasm-symbols] ${name} failed: ${err}`);
        return undefined;
      });
  };
  const word = wordAt(lineAt(text, pos.line), pos.character);
  if (!word) return null;
  // Asked once for the whole ladder: every rung names the same declaration.
  const doc = await ask("docAt", checker.docAt);
  const exact = await ask<WasmExactConstAt>("constAt", checker.constAt);
  if (exact) {
    const { code, note } = exactConstHover(word, exact);
    return hoverMarkdown(code, doc, note);
  }
  const effects = () => ask("effectsAt", checker.effectsAt);
  const t = displayableType(await ask("hoverTypeAt", checker.hoverTypeAt));
  if (t) return hoverMarkdown(`${word}: ${t}`, doc, await effects());
  const mt = displayableType(await ask("memberTypeAt", checker.memberTypeAt));
  if (mt) return hoverMarkdown(`${word}: ${mt}`, doc, await effects());
  const at = displayableType(await ask("typeAliasAt", checker.typeAliasAt));
  if (at) return hoverMarkdown(`${word}: ${at}`, doc);
  // A builtin has no declaration, so no `///` block.
  const b = checker.builtinCompletions?.().find((x) => x.name === word);
  if (b && isDisplayableType(b.detail)) return hoverMarkdown(`${word}: ${b.detail}`);
  return null;
};

// ---- inlay hints (D6) -------------------------------------------------------

/** Inferred-type hints for the un-annotated declarations inside `range`. */
export const inlayHintsAt = async (
  text: string,
  range: LspRange,
  ctx: FeatureContext,
): Promise<TypeInlayHint[]> => {
  const { checker, entryKey, reader, log } = ctx;
  if (checker.inlayHintsAt === undefined) return [];
  const candidates = await checker
    .inlayHintsAt(text, entryKey, reader)
    .catch((err) => {
      log(`[wasm-checker] inlayHintsAt failed: ${err}`);
      return [];
    });
  return inlayHintsFromWasm(candidates, range, text);
};

// ---- semantic tokens (D5) ---------------------------------------------------

/**
 * The whole document's delta-encoded semantic-token data: identifiers by resolved
 * binding kind, member names, and the lexical layer. A slice whose query fails or
 * predates the seed contributes nothing.
 */
export const semanticTokensAt = async (
  text: string,
  ctx: FeatureContext,
): Promise<number[]> => {
  const { checker, entryKey, reader, log } = ctx;
  const idents = checker.tokensAt !== undefined
    ? await checker.tokensAt(text, entryKey, reader)
      .catch((err) => {
        log(`[wasm-symbols] tokensAt failed: ${err}`);
        return [] as WasmToken[];
      })
    : [];
  const members = checker.memberTokensAt !== undefined
    ? await checker.memberTokensAt(text, entryKey, reader)
      .catch((err) => {
        log(`[wasm-symbols] memberTokensAt failed: ${err}`);
        return [] as WasmMemberToken[];
      })
    : [];
  const lexical = checker.lexicalTokensAt(text);
  return semanticTokensDataFromWasm(idents, lexical, members, text);
};

// ---- rename -----------------------------------------------------------------

/** A request the feature refuses, with the sentence the editor shows. */
export type FeatureRefusal = { error: string };

/** A text edit in the protocol's shape. */
export type FeatureTextEdit = { range: LspRange; newText: string };

/**
 * The span and current name a rename at `pos` would replace. `isStdDecl` says
 * which declaring module keys are std, whose names are refused. Null when the
 * cursor is on nothing renameable.
 */
export const prepareRenameAt = async (
  text: string,
  pos: FeaturePosition,
  ctx: FeatureContext,
  isStdDecl: (key: string) => boolean,
): Promise<{ range: LspRange; placeholder: string } | FeatureRefusal | null> => {
  const plan = await renamePlan(text, pos, ctx, isStdDecl);
  if (plan === undefined) return null;
  if (plan.kind === "refused") return { error: plan.reason };
  return { range: plan.range, placeholder: plan.word };
};

/**
 * The edits renaming the symbol at `pos` to `newName`, by document URI. An export
 * rename searches the same workspace as find-references; a local one never reads it.
 */
export const renameAt = async (
  text: string,
  pos: FeaturePosition,
  newName: string,
  ctx: FeatureContext,
  workspace: FeatureWorkspace,
  isStdDecl: (key: string) => boolean,
): Promise<{ changes: Record<string, FeatureTextEdit[]> } | FeatureRefusal | null> => {
  const badName = invalidNewNameReason(newName);
  if (badName !== undefined) return { error: badName };
  const plan = await renamePlan(text, pos, ctx, isStdDecl);
  if (plan === undefined) return null;
  if (plan.kind === "refused") return { error: plan.reason };
  const exported = plan.kind === "export";
  return await renameEdits(
    plan,
    newName,
    text,
    ctx.entryKey,
    workspace.uri,
    exported ? workspace.openDocs() : [],
    exported ? workspace.diskFiles() : [],
    ctx.reader,
    ctx.checker,
  );
};

const renamePlan = (
  text: string,
  pos: FeaturePosition,
  ctx: FeatureContext,
  isStdDecl: (key: string) => boolean,
): Promise<RenamePlan | undefined> =>
  planRenameAt(
    text,
    ctx.entryKey,
    ctx.reader,
    ctx.checker,
    pos.line,
    pos.character,
    isStdDecl,
  ).catch((err) => {
    ctx.log(`[rename] planRenameAt failed: ${err}`);
    return undefined;
  });

// ---- completion (D3) --------------------------------------------------------

// Every std module, named by one of its exports, for the UFCS probe to import.
// Workspace modules are not probed: the probe would compile up to the crawl cap on
// every `.`, and the module declaring the receiver's type is already in the graph.
const ufcsProbeModules = (
  stdExports: Map<string, StdExportCandidate[]>,
): UfcsProbeModule[] => {
  const out: UfcsProbeModule[] = [];
  for (const [key, exports] of stdExports) {
    if (exports.length > 0) out.push({ key, anyExport: exports[0].name });
  }
  return out;
};

/**
 * Completions at `pos`. After a `.`, the receiver's fields and then the UFCS
 * functions it dispatches to, an unimported one carrying its import edit. Elsewhere,
 * builtins under the scope's bindings under the type names, then std exports not in
 * scope (with their import edit), keywords and snippets. `stdCache` memoises the std
 * export surfaces across requests. Empty on a seed predating the scope queries.
 */
export const completionsAt = async (
  text: string,
  pos: FeaturePosition,
  ctx: FeatureContext,
  stdCache: StdSurfaceCache,
): Promise<Completion[]> => {
  const { checker, entryKey, reader, log } = ctx;
  if (
    checker.scopeAt === undefined ||
    checker.builtinCompletions === undefined ||
    checker.memberCompletionsAt === undefined
  ) {
    return [];
  }
  const formatImport = (stmt: string) => checker.formatSrc?.(stmt);
  const stdExports = () => stdExportSurfaces(checker, reader, reader, stdCache);
  const linePrefix = lineAt(text, pos.line).slice(0, pos.character);

  if (linePrefix[linePrefix.length - 1] === ".") {
    // The parser is not error-tolerant for `receiver.`, so the `.` is removed and a
    // bare-identifier receiver is resolved at its own position.
    const receiver = wordEndingBefore(linePrefix, linePrefix.length - 1);
    const dotCol = pos.character - 1;
    const members = receiver === null ? [] : await checker
      .memberCompletionsAt(
        removeCharAt(text, pos.line, dotCol),
        entryKey,
        reader,
        pos.line,
        dotCol - receiver.length,
      )
      .catch((err) => {
        log(`[wasm-checker] memberCompletionsAt failed: ${err}`);
        return [];
      });
    const fields = memberCompletionsFromWasm(members);
    const byName = new Set(fields.map((f) => f.name));
    const ufcs = ufcsCompletions(
      text,
      entryKey,
      await ufcsCandidatesAt(text, pos, ctx, async () => ufcsProbeModules(await stdExports())),
      (name) => byName.has(name),
      formatImport,
    );
    return [...fields, ...ufcs];
  }

  const bindings = await checker
    .scopeAt(text, entryKey, reader, pos.line, pos.character)
    .catch((err) => {
      log(`[wasm-checker] scopeAt failed: ${err}`);
      return [];
    });
  const byName = new Map<string, Completion>();
  for (const c of builtinCompletionsFromWasm(checker.builtinCompletions())) {
    byName.set(c.name, c);
  }
  for (const c of scopeCompletionsFromBindings(bindings)) byName.set(c.name, c);
  // Type names never take a label a value already holds: at a use site the value is
  // what the author reaches for.
  const typeNames = await checker
    .typeNamesAt?.(text, entryKey, reader)
    .catch((err) => {
      log(`[wasm-checker] typeNamesAt failed: ${err}`);
      return [];
    }) ?? [];
  for (const c of typeCompletionsFromWasm(typeNames, (n) => byName.has(n))) {
    byName.set(c.name, c);
  }
  const autoImports = stdAutoImportCompletions(
    text,
    await stdExports(),
    (name) => byName.has(name),
    formatImport,
  );
  return [
    ...byName.values(),
    ...autoImports,
    ...keywordCompletions(false),
    ...snippetCompletions(false),
  ];
};

/**
 * Where a completion shows its type: once inline (`labelDetail`, a compact
 * `: <type>`) and once as markdown, the `///` prose above a fenced block
 * (`documentation`). An item with neither a type nor a doc gets neither. `resolve`
 * turns `[Name]` spans in the doc into links.
 */
export const completionPresentation = (
  c: Completion,
  resolve?: DocRefResolver,
): { labelDetail?: string; documentation?: string } => {
  const out: { labelDetail?: string; documentation?: string } = {};
  if (c.detail !== undefined) out.labelDetail = c.labelDetail ?? typeLabelDetail(c.detail);
  if (c.detail !== undefined || (c.doc && c.doc.trim() !== "")) {
    out.documentation = docMarkdown(c.detail ?? "", VL_LANGUAGE_ID, c.doc, resolve);
  }
  return out;
};

// The UFCS functions the receiver before the cursor's `.` dispatches to, over the
// file's graph plus `modules`. Empty on a seed predating the query.
const ufcsCandidatesAt = async (
  text: string,
  pos: FeaturePosition,
  ctx: FeatureContext,
  modules: () => Promise<UfcsProbeModule[]>,
): Promise<{ name: string; detail: string; moduleKey: string }[]> => {
  const { checker, entryKey, reader, log } = ctx;
  if (checker.ufcsCandidatesAt === undefined) return [];
  const probe = ufcsProbeSource(text, await modules(), pos);
  return await checker
    .ufcsCandidatesAt(
      probe.source,
      entryKey,
      reader,
      pos.line + probe.lineOffset,
      pos.character,
    )
    .catch((err) => {
      log(`[wasm-checker] ufcsCandidatesAt failed: ${err}`);
      return [];
    });
};

// ---- document formatting (D4) -----------------------------------------------

/**
 * The whole document through the seed's formatter, as one full-range edit. No
 * edit when the text is already formatted, does not parse, or no seed loaded.
 */
export const formattingEditsAt = (
  text: string,
  checker: Pick<WasmChecker, "formatSrc"> | undefined,
): FeatureTextEdit[] => {
  const formatted = checker?.formatSrc?.(text);
  if (formatted === undefined || formatted === text) return [];
  const lines = text.split(/\r\n|\r|\n/);
  const end = { line: lines.length - 1, character: lines[lines.length - 1].length };
  return [{ range: { start: { line: 0, character: 0 }, end }, newText: formatted }];
};

// ---- code actions (B17, D9) -------------------------------------------------

const QUICK_FIX = "quickfix";
const ORGANIZE_IMPORTS = "source.organizeImports";

/** A code action in the protocol's shape, over the host's diagnostic type `D`. */
export type FeatureCodeAction<D> = {
  title: string;
  kind: typeof QUICK_FIX | typeof ORGANIZE_IMPORTS;
  diagnostics?: D[];
  isPreferred?: boolean;
  edit: { changes: Record<string, FeatureTextEdit[]> };
};

// A filter matches a kind equal to it or nested under it, per the protocol.
const kindMatchesOnly = (kind: string, only: string[] | undefined): boolean =>
  only === undefined ||
  only.some((k) => kind === k || kind.startsWith(k + "."));

/**
 * Quick fixes for the lint diagnostics over `range`, then organize imports.
 * `contextDiagnostics` are the client's; `cached` are this host's published ones,
 * so a fix is offered with the cursor off the exact range. Organize imports drops
 * unused and duplicate specifiers, re-linted from `text`, and is absent when it
 * would change nothing. `only` is the request's kind filter.
 */
export const codeActionsAt = <D extends FixableDiagnostic>(
  text: string,
  uri: string,
  range: LspRange,
  contextDiagnostics: D[],
  cached: () => D[],
  only: string[] | undefined,
  checker: Pick<WasmChecker, "lint" | "formatSrc"> | undefined,
  lintPath: string | undefined,
): FeatureCodeAction<D>[] => {
  const formatImport = (stmt: string) => checker?.formatSrc?.(stmt);
  const actions: FeatureCodeAction<D>[] = [];
  if (kindMatchesOnly(QUICK_FIX, only)) {
    const known = cached();
    for (const diag of fixableDiagnosticsForRange(contextDiagnostics, known, range)) {
      const fixes = quickFixesForDiagnostic(text, diag.code, diag.range);
      // The modules that can supply a missing UFCS import ride the diagnostic.
      const ufcsName = ufcsMissingImportAt(text, diag);
      if (ufcsName !== undefined) {
        fixes.push(...ufcsImportFixes(
          text,
          ufcsName,
          ufcsImportModules(diag, known),
          (src, spec, name) => importInsertionEdit(src, spec, name, formatImport),
        ));
      }
      for (const fix of fixes) {
        actions.push({
          title: fix.title,
          kind: QUICK_FIX,
          diagnostics: [diag],
          isPreferred: fix.isPreferred,
          edit: { changes: { [uri]: fix.edits } },
        });
      }
    }
  }
  if (kindMatchesOnly(ORGANIZE_IMPORTS, only)) {
    const redundant = (checker?.lint(text, lintPath) ?? [])
      .filter((d) => d.code === "unused-import" || d.code === "duplicate-import")
      .map((d) => d.range);
    const edits = organizeImportEdits(text, redundant, formatImport);
    if (edits.length > 0) {
      actions.push({
        title: "Organize imports",
        kind: ORGANIZE_IMPORTS,
        edit: { changes: { [uri]: edits } },
      });
    }
  }
  return actions;
};

// ---- code lens: export reference counts (D9.4) ------------------------------

/** What a lens carries from compute to resolve (`CodeLens.data`, JSON-safe). */
export type RefLensData = {
  uri: string;
  name: string;
  line: number; // 0-based decl-name line
  character: number; // 0-based decl-name col
  title: string;
};

/**
 * One "N refs" lens per export of `text`, counted from `useMap`, the unused-export
 * pass's last result. An export the pass has not counted yet gets no lens.
 */
export const codeLensesAt = (
  text: string,
  uri: string,
  ctx: FeatureContext,
  useMap: UnusedExportUseMap,
): { range: LspRange; data: RefLensData }[] => {
  const surface = ctx.checker.moduleSurface(text, ctx.entryKey);
  return exportRefLenses(surface.exports, useMap.get(ctx.entryKey)).map((l) => ({
    range: {
      start: { line: l.line, character: l.char },
      end: { line: l.line, character: l.char + l.length },
    },
    data: {
      uri,
      name: l.name,
      line: l.line,
      character: l.char,
      title: refCountLensTitle(l.count),
    },
  }));
};

/**
 * The locations behind a lens's count, found on click by the cross-file search
 * find-references uses, from the export's own document `text`. Empty when the
 * search fails.
 */
export const codeLensLocationsAt = async (
  data: RefLensData,
  text: string,
  ctx: FeatureContext,
  workspace: FeatureWorkspace,
): Promise<FeatureLocation[]> => {
  const openDocs = workspace.openDocs();
  const refs = await crossFileReferences(
    data.name,
    text,
    ctx.entryKey,
    openDocs,
    ctx.reader,
    ctx.checker,
    true,
    workspace.diskFiles(),
  ).catch((err) => {
    ctx.log(`[code-lens] reference crawl failed: ${err}`);
    return undefined;
  });
  return refs ?? [];
};
