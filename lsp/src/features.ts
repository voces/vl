// LSP features over the shared `WasmChecker`, as pure functions of the document
// text and a `FeatureContext`. `server.ts` is transport: it fetches the document,
// calls in here and maps the result onto the protocol's shapes. A feature moves
// here when it has no connection or document-store dependency; the playground
// adapter can then call the same function.
//
// Imports no `vscode-languageserver` runtime values, so the module loads in the
// playground bundle and under plain Deno.

import type { ModuleReader } from "../../compiler/coreTypes.ts";
import { foldingRanges, type VlFoldingKind } from "./folding.ts";
import { crossFileReferences, type OpenDocument } from "./moduleGraph.ts";
import { callSiteAt, repairedSource, signatureLabel } from "./signatureHelp.ts";
import {
  displayableType,
  docMarkdown,
  type DocumentHighlightSpan,
  documentHighlightsFromRefs,
  exactConstHover,
  flatDocumentSymbols,
  inlayHintsFromWasm,
  isDisplayableType,
  type LspRange,
  nestedDocumentSymbols,
  type OutlineNode,
  semanticTokensDataFromWasm,
  type TypeInlayHint,
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
export const wordAt = (line: string, character: number): string | null => {
  const isWordChar = (c: string) => /[A-Za-z0-9_]/.test(c);
  let start = character;
  let end = character;
  while (start > 0 && isWordChar(line[start - 1])) start--;
  while (end < line.length && isWordChar(line[end])) end++;
  if (start === end) return null;
  const word = line.slice(start, end);
  return /^[A-Za-z_]/.test(word) ? word : null;
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
