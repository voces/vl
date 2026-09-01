import {
  CodeAction,
  CodeActionKind,
  CodeLens,
  CodeLensRefreshRequest,
  CompletionItem,
  CompletionItemKind,
  createConnection,
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticTag,
  DocumentHighlight,
  DocumentHighlightKind,
  DocumentSymbol,
  Hover,
  InlayHint,
  InlayHintKind,
  InsertTextFormat,
  Location,
  MarkupKind,
  ProposedFeatures,
  Range,
  SemanticTokens,
  SymbolKind,
  TextDocuments,
  TextDocumentSyncKind,
  TextEdit,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import type {
  VLDiagnostic,
  VLDiagnosticTag,
  VLSeverity,
} from "../../compiler/diagnostics.ts";
import {
  buildUnusedExportUseMap,
  crossFileReferences,
  type CrossFileSource,
  crossFileUriOf,
  detectProjectRoot,
  enumerateWorkspaceFiles,
  makeWorkspaceReader,
  type UnusedExportUseMap,
  unusedExportHints,
  uriToPath,
} from "./moduleGraph.ts";
import {
  fixableDiagnosticsForRange,
  quickFixesForDiagnostic,
} from "./codeActions.ts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadWasmChecker,
  type SeedOrigin,
  type SeedSource,
  type WasmChecker,
  type WasmImportedSource,
  type WasmMemberToken,
  type WasmRange,
  type WasmToken,
} from "./wasmCheckerNode.ts";
import {
  builtinCompletionsFromWasm,
  type Completion,
  type CompletionKind,
  displayableType,
  docMarkdown,
  documentHighlightsFromRefs,
  type DocRefResolver,
  exportRefLenses,
  flatDocumentSymbols,
  type HighlightKind,
  inlayHintsFromWasm,
  isDisplayableType,
  keywordCompletions,
  type LspRange,
  memberCompletionsFromWasm,
  type OutlineSymbolKind,
  refCountLensTitle,
  scopeCompletionsFromBindings,
  SEMANTIC_TOKEN_LEGEND,
  semanticTokensDataFromWasm,
  snippetCompletions,
  stdAutoImportCompletions,
  type StdExportCandidate,
  typeLabelDetail,
} from "./typeFeatures.ts";
import { STD_SOURCES } from "../../std/embedded.ts";

// The language id the extension registers (`package.json` → contributes.languages,
// id `vital`, scope `source.vital`). Used as the markdown fence info string so
// hover code blocks render syntax-highlighted via the TextMate grammar.
const VL_LANGUAGE_ID = "vital";

declare const process: NodeJS.Process;

// Creates the LSP connection
const connection = createConnection(ProposedFeatures.all);

// Create a manager for open text documents
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// The workspace's `std/` source dir, when the workspace root is known — feeds
// the `withStd` std-module precedence (workspace files win over the embedded
// map, so dogfooding in the compiler repo sees `std/` edits live). A thunk
// because readers are built at module load while the root arrives in
// `onInitialize`; a workspace without a `std/` dir simply never satisfies a
// read there and falls through to the embedded map.
let workspaceStdDir: string | undefined;
const getStdDir = (): string | undefined => workspaceStdDir;

// Module-aware analysis reads sibling `.vl` files: it prefers the open document
// buffers (so unsaved edits are seen) and falls back to disk; `std:` keys are
// served via `withStd`. Keyed on the open-document URIs the manager tracks
// (see `makeWorkspaceReader`).
const workspaceReader = makeWorkspaceReader(
  {
    get: (uri: string) => documents.get(uri),
  },
  undefined,
  getStdDir,
);

// The current document's module key: its filesystem path (resolveSpecifier
// resolves relative imports against this). Falls back to a synthetic key for a
// non-`file:` URI (e.g. untitled buffers) — such a doc has no resolvable
// relative imports, so analysis degrades to single-file, which is correct.
const entryKeyOf = (uri: string): string => uriToPath(uri);

// The workspace folder this server is operating on
let workspaceFolder: string | null;

// The self-hosted compiler, loaded from the wasm seed in `onInitialize` (kill-TS:
// the LSP runs ENTIRELY on this — no TS checker). `undefined` when the seed is
// absent or this host can't instantiate it (no WasmGC); every handler then
// degrades to an empty/no-op result rather than a TS fallback.
let wasmChecker: WasmChecker | undefined;

// Shape a native `WasmImportedSource` (1-based line, 0-based col, exported-name
// length) onto the host's `CrossFileSource` (0-based LSP range + URI), the form
// go-to-definition and the doc-xref resolver consume. The URI is `file://` for
// a path key; a `std:` key maps to the workspace's own `std/` file when one
// exists, else a `vl-std:` URI the extension serves from the embedded map
// (`crossFileUriOf` — mirrors `withStd`'s read precedence).
const toCrossFileSource = (s: WasmImportedSource): CrossFileSource => {
  const line = s.line > 0 ? s.line - 1 : 0;
  return {
    key: s.key,
    uri: crossFileUriOf(s.key, getStdDir),
    range: {
      start: { line, character: s.col },
      end: { line, character: s.col + s.length },
    },
  };
};

// Cross-file imported sources for the document at `uri`, off the self-hosted
// checker's import/export pass — the exporting sibling's decl location for each
// imported name (powers cross-file go-to-definition + doc-xref). Undefined when
// no checker is loaded / the seed predates the export, or nothing resolved.
const wasmImportedSources = async (
  uri: string,
  text: string,
): Promise<Record<string, CrossFileSource> | undefined> => {
  if (wasmChecker?.importedNameSources === undefined) {
    return undefined;
  }
  const native = await wasmChecker
    .importedNameSources(text, entryKeyOf(uri), workspaceReader)
    .catch((err) => {
      connection.console.log(`[wasm-symbols] importedNameSources failed: ${err}`);
      return {} as Record<string, WasmImportedSource>;
    });
  const locals = Object.keys(native);
  if (locals.length === 0) return undefined; // nothing resolved — fall back to TS
  const out: Record<string, CrossFileSource> = {};
  for (const local of locals) out[local] = toCrossFileSource(native[local]);
  return out;
};

const severityMap: Record<VLSeverity, DiagnosticSeverity> = {
  error: DiagnosticSeverity.Error,
  warning: DiagnosticSeverity.Warning,
  info: DiagnosticSeverity.Information,
  // Hint: no squiggle, not in the warning tier. With the `unnecessary` tag this
  // greys/fades the span (e.g. a `_`-prefixed intentionally-unused binding).
  hint: DiagnosticSeverity.Hint,
};

const tagMap: Record<VLDiagnosticTag, DiagnosticTag> = {
  unnecessary: DiagnosticTag.Unnecessary,
  deprecated: DiagnosticTag.Deprecated,
};

// Most-recently-computed VL lint diagnostics per document URI. `onCodeAction`
// only receives the diagnostics VS Code pre-filtered to the requested range in
// `params.context.diagnostics`; when the cursor sits off a diagnostic's exact
// range (e.g. on the variable name while the `prefer-const` range is on the `let`
// keyword) that diagnostic is absent and no fix would be offered. We cache the
// diagnostics here as they're published so `onCodeAction` can additionally
// surface fixes for any cached `vital` diagnostic on a line overlapping the
// request — purely additive discoverability over the editor-supplied set.
const diagnosticsByUri = new Map<string, VLDiagnostic[]>();

const toLspDiagnostic = (d: VLDiagnostic): Diagnostic => ({
  message: d.message,
  severity: severityMap[d.severity],
  range: d.range,
  code: d.code,
  source: d.source,
  // `unnecessary` → VS Code dims/greys the span (unused/unreachable code).
  tags: d.tags?.map((t) => tagMap[t]),
});

// ---- Project-wide unused-export hints (debounced workspace pass) ------------
//
// A debounced workspace crawl runs on document SAVE (and on a 3-second idle
// after edits). The crawl is NOT per-keystroke — it enumerates up to 500 .vl
// files, parses each to build a project-wide USE-MAP, and publishes `hint`
// diagnostics for exported symbols that have zero references anywhere in the
// project. These hints are merged with the file's regular lint/type diagnostics
// when the workspace pass completes.
//
// Cost profile: the pass runs only on save (or after a 3-second idle timer
// fires). Each file is parsed once (via `parseSymbols`, not full graph-seeded
// `checkDocument`), so the crawl is lightweight. The 500-file cap from
// `crossFileReferences` / `MAX_DISK_FILES` is reused.
//
// The most-recent use-map is stored here; open documents are re-published
// whenever a new map is computed (so their hints update after every save).

let lastUseMap: UnusedExportUseMap = new Map();

// Debounce timer handle (Node-style number; cleared on each new edit or save).
let useMapDebounceTimer: ReturnType<typeof setTimeout> | undefined;

// Delay (ms) between the last edit and a debounced workspace pass. A save
// triggers the pass immediately (the timer is cleared); idling for 3 seconds
// after the last keystroke also triggers it.
const UNUSED_EXPORT_DEBOUNCE_MS = 3000;

/**
 * Run the project-wide unused-export workspace pass: enumerate all .vl files,
 * build the use-map, re-publish diagnostics for every open document (merging
 * the updated hints with the cached lint/type diagnostics).
 *
 * Called on document SAVE (immediate) and by the idle debounce timer.
 */
const runUnusedExportPass = async (): Promise<void> => {
  // The pass is driven entirely off the self-hosted checker (the surface scan
  // and local-use counts). A host that couldn't instantiate the seed has no
  // checker, so it skips the pass rather than crawling the workspace for nothing.
  if (wasmChecker === undefined) return;
  // Determine the project root (same logic as onReferences).
  const openUris = documents.all().map((d) => d.uri);
  // Use the first open document's key to detect the root; fall back to an
  // empty crawl if there are no open documents.
  if (openUris.length === 0) return;
  const firstKey = uriToPath(openUris[0]);
  const crawlRoot = workspaceFolder
    ? uriToPath(workspaceFolder)
    : detectProjectRoot(firstKey);
  const diskFiles = enumerateWorkspaceFiles(crawlRoot);

  // Build the use-map over all project files (open buffers + disk).
  const useMap = await buildUnusedExportUseMap(
    diskFiles,
    workspaceReader,
    wasmChecker,
  );
  lastUseMap = useMap;

  // Re-publish diagnostics for every open document so hints update atomically.
  for (const doc of documents.all()) {
    const cached = diagnosticsByUri.get(doc.uri) ?? [];
    const hints = unusedExportHints(
      doc.getText(),
      uriToPath(doc.uri),
      useMap,
      wasmChecker,
    );
    connection.sendDiagnostics({
      uri: doc.uri,
      version: doc.version,
      diagnostics: [...cached, ...hints].map(toLspDiagnostic),
    });
  }

  // The export-reference-count lenses (D9.4) read this map, so a fresh map
  // means every visible lens count may have moved — ask the client to re-query
  // them. Best-effort: a client without `workspace/codeLens/refresh` support
  // still re-queries on its own edit/save heuristics.
  connection.sendRequest(CodeLensRefreshRequest.type).catch(() => {});
};

documents.onDidChangeContent(async (event) => {
  connection.console.log(
    `[Server(${process.pid}) ${workspaceFolder}] Document changed: ${event.document.uri}`,
  );

  // Diagnostics only — running a program is explicit (the `vital.runFile`
  // command / Ctrl+F5), never a side effect of editing. (Auto-running on every
  // change executed arbitrary program logic on each keystroke — e.g. an infinite
  // loop would hang the server.)
  //
  // Module-aware: the current file is the ENTRY module, parsed against a scope
  // seeded with its imports' resolved types, so `import { foo } from "./x"`
  // resolves (no spurious "undeclared") and genuine import errors (bad path,
  // not-exported, cycle) surface, attributed to the current file's import
  // statements. A file with no imports analyzes exactly as the single-file
  // `checkOnly` path did. Codegen-only diagnostics (the rare `Codegen error:`)
  // aren't produced here, same trade-off as `vl check`.
  // Diagnostics from the self-hosted compiler: the error tier (`check`) PLUS the
  // Stage-3 lint tier (`lint`, which `check` excludes). No checker (no seed / no
  // WasmGC in this host) → no diagnostics, rather than a TS fallback.
  let diagnostics: VLDiagnostic[] = [];
  if (wasmChecker !== undefined) {
    try {
      const text = event.document.getText();
      const errors = await wasmChecker.check(
        text,
        entryKeyOf(event.document.uri),
        workspaceReader,
      );
      diagnostics = [...errors, ...wasmChecker.lint(text)];
    } catch (err) {
      connection.console.log(`[wasm-checker] check failed: ${err}`);
    }
  }

  // Cache the raw VL diagnostics (which carry `code`/`range`/`source`) so
  // `onCodeAction` can offer fixes by line overlap, not just for the exact
  // diagnostics VS Code passes back.
  diagnosticsByUri.set(event.document.uri, diagnostics);

  // Merge the most-recently-computed unused-export hints (from the last
  // workspace pass) with the per-file lint/type diagnostics. The hints are
  // stale relative to this edit — they will be refreshed by the debounce
  // timer that fires after idle. Publishing the stale hints avoids losing
  // them entirely on every keystroke.
  const hints = wasmChecker !== undefined
    ? unusedExportHints(
      event.document.getText(),
      entryKeyOf(event.document.uri),
      lastUseMap,
      wasmChecker,
    )
    : [];

  connection.sendDiagnostics({
    uri: event.document.uri,
    version: event.document.version,
    diagnostics: [...diagnostics, ...hints].map(toLspDiagnostic),
  });

  // Arm the idle debounce timer: after UNUSED_EXPORT_DEBOUNCE_MS of no edits,
  // trigger a fresh workspace pass. A subsequent edit or a save resets the timer.
  if (useMapDebounceTimer !== undefined) clearTimeout(useMapDebounceTimer);
  useMapDebounceTimer = setTimeout(() => {
    useMapDebounceTimer = undefined;
    runUnusedExportPass().catch(() => {});
  }, UNUSED_EXPORT_DEBOUNCE_MS);
});

// On document SAVE: trigger the workspace pass immediately (clear the debounce
// timer so the idle pass doesn't duplicate work). This is the primary trigger —
// saves are intentional "I'm done with this file" signals, a natural point to
// pay the crawl cost. NOT every keystroke.
documents.onDidSave(async (_event) => {
  if (useMapDebounceTimer !== undefined) {
    clearTimeout(useMapDebounceTimer);
    useMapDebounceTimer = undefined;
  }
  await runUnusedExportPass().catch(() => {});
});


// Go-to-definition: map the cursor to the binding it lands on, return that
// binding's declaring span (D2). When the cursor lands on an IMPORTED name
// (resolved via the module graph), jump CROSS-FILE to the export's declaration
// in the exporting sibling module instead (H0 phase 3).
//
// Order matters: the single-file symbol table seeds imported names into scope
// (so they're not "undeclared"), but their `Binding.decl` is the IMPORT
// statement, not the real definition. So we check the imported-name resolution
// FIRST for a name that is genuinely imported, and fall back to the single-file
// declaration for everything local. A no-import file never hits the graph path.
connection.onDefinition(async (params): Promise<Location | null> => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const text = doc.getText();

  // Go-to-definition off the self-hosted checker (kill-TS). An IMPORTED name jumps
  // CROSS-FILE first — to the exporting sibling's declaration via the native
  // import/export pass (`wasmImportedSources`). This must precede the local
  // `definitionAt`: for an imported name, `definitionAt` returns the canonical
  // declaration's span in the DEPENDENCY, but the span carries no module, so the
  // host would mis-attribute it to THIS file (landing on the import line). For a
  // purely-local name the cross-file lookup misses and `definitionAt` gives the
  // correct same-file declaration. No checker (no seed / no WasmGC) → no result.
  if (wasmChecker === undefined) return null;

  const lineText = doc.getText({
    start: { line: params.position.line, character: 0 },
    end: { line: params.position.line + 1, character: 0 },
  });
  const word = wordAt(lineText, params.position.character);
  if (word) {
    const sources = await wasmImportedSources(params.textDocument.uri, text);
    const source = sources?.[word];
    if (source) return Location.create(source.uri, source.range);
  }

  const nativeDecl = wasmChecker.definitionAt !== undefined
    ? await wasmChecker
      .definitionAt(
        text,
        entryKeyOf(params.textDocument.uri),
        workspaceReader,
        params.position.line,
        params.position.character,
      )
      .catch((err) => {
        connection.console.log(`[wasm-symbols] definitionAt failed: ${err}`);
        return undefined;
      })
    : undefined;
  if (nativeDecl) return Location.create(params.textDocument.uri, nativeDecl);
  return null;
});

// Find-references: every occurrence (declaration + uses) of the binding under
// the cursor. For a CROSS-MODULE symbol (a name that is imported here, or an
// exported local declaration), references are gathered across the current file,
// every OTHER OPEN document, AND every `.vl` file on disk under the project root
// that is not already open (the on-disk sibling crawl — H0 phase 3 complete).
// The crawl is scoped and capped: see `crossFileReferences` + ROADMAP for the
// root-detection strategy, the MAX_DISK_FILES cap, and the excluded dirs. A
// purely-local (non-exported, non-imported) symbol falls back to single-file.
connection.onReferences(async (params): Promise<Location[] | null> => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const text = doc.getText();
  const includeDeclaration = params.context?.includeDeclaration ?? true;

  // Find-references off the self-hosted checker (kill-TS). No checker → no result.
  if (wasmChecker === undefined) return null;

  // The native references are SINGLE-FILE (the binding's occurrences in the entry
  // module). Try that first; on a miss, the symbol may be cross-module, so run the
  // cross-module crawl (itself wasm-backed, kill-TS step 3-C Stage 3).
  const localRefs = wasmChecker.referencesAt !== undefined
    ? await wasmChecker
      .referencesAt(
        text,
        entryKeyOf(params.textDocument.uri),
        workspaceReader,
        params.position.line,
        params.position.character,
        includeDeclaration,
      )
      .catch((err) => {
        connection.console.log(`[wasm-symbols] referencesAt failed: ${err}`);
        return [] as WasmRange[];
      })
    : [];
  if (localRefs.length > 0) {
    return localRefs.map((r) => Location.create(params.textDocument.uri, r));
  }

  const lineText = doc.getText({
    start: { line: params.position.line, character: 0 },
    end: { line: params.position.line + 1, character: 0 },
  });
  const word = wordAt(lineText, params.position.character);
  if (word) {
    const openDocs = documents.all().map((d) => ({ uri: d.uri, text: d.getText() }));
    const entryKey = entryKeyOf(params.textDocument.uri);
    const crawlRoot = workspaceFolder
      ? uriToPath(workspaceFolder)
      : detectProjectRoot(entryKey);
    const diskFiles = enumerateWorkspaceFiles(crawlRoot);
    const crossRefs = await crossFileReferences(
      word,
      text,
      entryKey,
      openDocs,
      workspaceReader,
      wasmChecker,
      includeDeclaration,
      diskFiles,
    );
    if (crossRefs !== undefined) {
      return crossRefs.map((r) => Location.create(r.uri, r.range));
    }
  }
  return null;
});

// Document highlights (D9.1): every same-file occurrence of the symbol under
// the cursor lights up on cursor rest — `referencesAt` verbatim (the survey's
// cheapest polish item), single-file by design (highlights only ever apply to
// the current document, so the cross-module crawl `onReferences` falls back to
// has no business here). The declaration renders as a Write, uses as Reads:
// `referencesAt` returns bare ranges, so the decl is identified by one extra
// `definitionAt` at the same cursor (~0.1–1.3 ms — same budget as the
// reference query itself); if that rung is unavailable every occurrence
// degrades to Read (see `documentHighlightsFromRefs`). No checker → null.
const highlightKindMap: Record<HighlightKind, DocumentHighlightKind> = {
  read: DocumentHighlightKind.Read,
  write: DocumentHighlightKind.Write,
};
connection.onDocumentHighlight(
  async (params): Promise<DocumentHighlight[] | null> => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;
    if (wasmChecker?.referencesAt === undefined) return null;
    const text = doc.getText();
    const entryKey = entryKeyOf(params.textDocument.uri);
    const refs = await wasmChecker
      .referencesAt(
        text,
        entryKey,
        workspaceReader,
        params.position.line,
        params.position.character,
        true, // the declaration is an occurrence to light up too
      )
      .catch((err) => {
        connection.console.log(`[wasm-symbols] referencesAt failed: ${err}`);
        return [] as WasmRange[];
      });
    if (refs.length === 0) return null;
    const decl = wasmChecker.definitionAt !== undefined
      ? await wasmChecker
        .definitionAt(
          text,
          entryKey,
          workspaceReader,
          params.position.line,
          params.position.character,
        )
        .catch(() => undefined)
      : undefined;
    return documentHighlightsFromRefs(refs, decl).map((h) => ({
      range: h.range,
      kind: highlightKindMap[h.kind],
    }));
  },
);

// Document symbols (D9.3): the FLAT outline — Outline view, breadcrumbs,
// Ctrl+Shift+O. Functions + module-level `let`/`const` come from the checker's
// decl-flagged identifier tokens (`tokensAt`), `type` aliases from the host
// line scan, the exported flag from `moduleSurface` — all assembled by
// `flatDocumentSymbols`. Flat is the shipped grade: nesting needs a
// declaration-body-extent export the seed doesn't have (survey §6/§7), so
// `range` and `selectionRange` are both the NAME span rather than a guessed
// body. No checker → null.
const outlineKindMap: Record<OutlineSymbolKind, SymbolKind> = {
  function: SymbolKind.Function,
  variable: SymbolKind.Variable,
  constant: SymbolKind.Constant,
  // VL types are structural objects, not nominal classes — same mapping as
  // completion's `type` items.
  type: SymbolKind.Struct,
};
connection.onDocumentSymbol(
  async (params): Promise<DocumentSymbol[] | null> => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;
    if (wasmChecker?.tokensAt === undefined) return null;
    const text = doc.getText();
    const entryKey = entryKeyOf(params.textDocument.uri);
    const idents = await wasmChecker
      .tokensAt(text, entryKey, workspaceReader)
      .catch((err) => {
        connection.console.log(`[wasm-symbols] tokensAt failed: ${err}`);
        return [] as WasmToken[];
      });
    const exportedNames = new Set(
      wasmChecker.moduleSurface(text, entryKey).exports.map((e) => e.name),
    );
    return flatDocumentSymbols(idents, text, exportedNames).map((s) => {
      const range = {
        start: { line: s.line, character: s.char },
        end: { line: s.line, character: s.char + s.length },
      };
      const sym: DocumentSymbol = {
        name: s.name,
        kind: outlineKindMap[s.kind],
        range,
        selectionRange: range,
      };
      if (s.exported) sym.detail = "export";
      return sym;
    });
  },
);

// Extract the identifier `[A-Za-z_][A-Za-z0-9_]*` straddling `character` on
// `line`, or null if the cursor isn't on a word. We scan outward from the
// cursor rather than regex-matching the whole line so the result is the single
// word under the cursor.
const wordAt = (line: string, character: number): string | null => {
  const isWordChar = (c: string) => /[A-Za-z0-9_]/.test(c);
  let start = character;
  let end = character;
  while (start > 0 && isWordChar(line[start - 1])) start--;
  while (end < line.length && isWordChar(line[end])) end++;
  if (start === end) return null;
  const word = line.slice(start, end);
  // Identifiers can't start with a digit; reject numeric literals.
  return /^[A-Za-z_]/.test(word) ? word : null;
};

// Render a hover body as a fenced `vital` code block so the client syntax-
// highlights it via the TextMate grammar (rather than flat inline `code`). The
// fence info string must match the registered language id (`VL_LANGUAGE_ID`).
const hoverMarkdown = (code: string): Hover["contents"] => ({
  kind: "markdown",
  value: "```" + VL_LANGUAGE_ID + "\n" + code + "\n```",
});

// D8 stepwise alias expansion (hover verbosity): the renderer (`stringifyType`'s
// `maxDepth`) supports peeling one alias layer per step, and the per-kind depths
// below already wire it for the default view. The interactive +/- VERBOSITY
// controls require the proposed LSP 3.18 hover-verbosity API
// (`HoverParams.context.verbosityLevel` + `Hover.canIncrease`/`canDecrease`),
// which is NOT in the `vscode-languageserver@9` / protocol 3.17.5 in use here.
// REMAINING PIECE (unblocked-by-design): once that protocol lands, read the
// requested verbosity level off `params.context`, map it to `maxDepth`, and set
// `canIncrease`/`canDecrease` on the returned `Hover` — no renderer change needed.
connection.onHover(async (params): Promise<Hover | null> => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  // LSP-on-wasm Stage 2: the native hover type for the binding under the cursor.
  // `"wasm"` returns it when present (else falls through to the TS hover, which
  // also covers members + flow types the native path doesn't yet render);
  // `"both"` logs the type-string divergence against the TS render below.
  const wasmHoverType = async (): Promise<string | undefined> => {
    if (wasmChecker?.hoverTypeAt === undefined) return undefined;
    return await wasmChecker
      .hoverTypeAt(
        document.getText(),
        entryKeyOf(params.textDocument.uri),
        workspaceReader,
        params.position.line,
        params.position.character,
      )
      .catch((err) => {
        connection.console.log(`[wasm-symbols] hoverTypeAt failed: ${err}`);
        return undefined;
      });
  };
  // The native member-access type (`o.x`, `s.length`) under the cursor — the
  // member hover the binding-only `hoverTypeAt` can't serve.
  const wasmMemberType = async (): Promise<string | undefined> => {
    if (wasmChecker?.memberTypeAt === undefined) return undefined;
    return await wasmChecker
      .memberTypeAt(
        document.getText(),
        entryKeyOf(params.textDocument.uri),
        workspaceReader,
        params.position.line,
        params.position.character,
      )
      .catch((err) => {
        connection.console.log(`[wasm-symbols] memberTypeAt failed: ${err}`);
        return undefined;
      });
  };
  // The native type of a user `type` NAME (struct/union alias) under the cursor —
  // the type-alias hover `hoverTypeAt` (value-binding only) can't serve.
  const wasmTypeAlias = async (): Promise<string | undefined> => {
    if (wasmChecker?.typeAliasAt === undefined) return undefined;
    return await wasmChecker
      .typeAliasAt(
        document.getText(),
        entryKeyOf(params.textDocument.uri),
        workspaceReader,
        params.position.line,
        params.position.character,
      )
      .catch((err) => {
        connection.console.log(`[wasm-symbols] typeAliasAt failed: ${err}`);
        return undefined;
      });
  };
  const wordForHover = wordAt(
    document.getText({
      start: { line: params.position.line, character: 0 },
      end: { line: params.position.line + 1, character: 0 },
    }),
    params.position.character,
  );

  // ── Kill-TS: fully self-hosted hover in "wasm" mode ────────────────────────
  // Value binding (`hoverTypeAt`, incl. imported names) → member access
  // (`memberTypeAt`) → user `type` alias (`typeAliasAt`) → builtin (native
  // builtin list). No checkOnly/parseSymbols/importedScope. Source `///` docs are
  // not rendered — unchanged from the prior wasm-mode behaviour (the native path
  // never carried them; a doc-aware hover needs a separate native export).
  //
  // Each rung is filtered through `displayableType`: the body is rendered as a
  // fenced `vital` code block, i.e. a claim that the text is VL, so a native
  // rendering carrying an absence-of-a-type sentinel (`<error>` for an annotation
  // that didn't resolve) is treated as NO ANSWER and falls through to the next
  // rung rather than printing a type name the language does not have.
  if (wasmChecker === undefined) return null;
  if (!wordForHover) return null;
  const t = displayableType(await wasmHoverType());
  if (t) return { contents: hoverMarkdown(`${wordForHover}: ${t}`) };
  const mt = displayableType(await wasmMemberType());
  if (mt) return { contents: hoverMarkdown(`${wordForHover}: ${mt}`) };
  const at = displayableType(await wasmTypeAlias());
  if (at) return { contents: hoverMarkdown(`${wordForHover}: ${at}`) };
  // Builtin (`print`/`i32`/…): the word in the native builtin set.
  const b = wasmChecker.builtinCompletions?.().find((x) => x.name === wordForHover);
  if (b && isDisplayableType(b.detail)) {
    return { contents: hoverMarkdown(`${wordForHover}: ${b.detail}`) };
  }
  return null;
});

// Inlay hints (D6): for every declaration that *lacks* a visible annotation,
// surface the inferred type after the identifier (`x: i32`) — the headline
// feature for a language that otherwise hides its types. Driven by the wasm
// checker's `inlayHintsAt` + the `inlayHintsFromWasm` source-scan filters;
// honours the request's `range`.
connection.languages.inlayHint.on(async (params): Promise<InlayHint[]> => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const text = doc.getText();
  const range: LspRange = params.range;
  const toHint = (h: { line: number; char: number; label: string }): InlayHint => ({
    position: { line: h.line, character: h.char },
    label: h.label, // `: <type>`
    kind: InlayHintKind.Type,
    paddingLeft: true, // keep it unobtrusive: a space before `: type`
  });

  // Kill-TS: the inferred types + decl positions come from the native checker
  // (`inlayHintsAt`); the source-scan annotation/range filters stay host-side
  // (`inlayHintsFromWasm`). No checker → no hints.
  if (wasmChecker?.inlayHintsAt === undefined) return [];
  const candidates = await wasmChecker
    .inlayHintsAt(text, entryKeyOf(params.textDocument.uri), workspaceReader)
    .catch((err) => {
      connection.console.log(`[wasm-checker] inlayHintsAt failed: ${err}`);
      return [];
    });
  return inlayHintsFromWasm(candidates, range, text).map(toHint);
});

// Semantic tokens (D5): richer, semantically-accurate highlighting beyond the
// TextMate grammar. Identifiers are classified by their resolved binding kind
// (local vs parameter vs function vs type) via the D2 symbol table — something a
// grammar can't tell apart — and merged with a lexical pass over the token
// stream for literals/keywords/operators plus recovered `//` comments. The
// `data` array is the delta-encoded form LSP mandates (see `encodeSemanticTokens`).
connection.languages.semanticTokens.on(
  async (params): Promise<SemanticTokens> => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return { data: [] };
    const text = doc.getText();
    const uri = params.textDocument.uri;
    if (wasmChecker === undefined) return { data: [] };

    // Whole document off the self-hosted checker: identifiers (`tokensAt`) +
    // members (`memberTokensAt`) + the lexical layer (`lexicalTokensAt` —
    // keywords/operators/literals/comments). No TS. Each slice yields [] on any
    // error / a seed predating its export.
    const idents = wasmChecker.tokensAt !== undefined
      ? await wasmChecker.tokensAt(text, entryKeyOf(uri), workspaceReader)
        .catch((err) => {
          connection.console.log(`[wasm-symbols] tokensAt failed: ${err}`);
          return [] as WasmToken[];
        })
      : [];
    const members = wasmChecker.memberTokensAt !== undefined
      ? await wasmChecker.memberTokensAt(text, entryKeyOf(uri), workspaceReader)
        .catch((err) => {
          connection.console.log(`[wasm-symbols] memberTokensAt failed: ${err}`);
          return [] as WasmMemberToken[];
        })
      : [];
    const lexical = wasmChecker.lexicalTokensAt(text);
    return { data: semanticTokensDataFromWasm(idents, lexical, members, text) };
  },
);

// Map a neutral completion kind (from `typeFeatures.ts`) to the LSP enum. A VL
// `type` alias / builtin type maps to `Struct` (VL types are structural objects,
// not nominal classes) — the closest fit and what semantic tokens treat as a
// "type". Locals/params are `Variable`; callables are `Function`. `keyword`
// maps to `Keyword`; `snippet` maps to `Snippet`.
const completionKind: Record<CompletionKind, CompletionItemKind> = {
  variable: CompletionItemKind.Variable,
  parameter: CompletionItemKind.Variable,
  function: CompletionItemKind.Function,
  type: CompletionItemKind.Struct,
  keyword: CompletionItemKind.Keyword,
  snippet: CompletionItemKind.Snippet,
};

// For items that carry a type we render it in exactly two places, never the same
// place twice:
//   - `labelDetails.detail` — a compact `: <type>` shown inline right after the
//     label (less prominent, no spacing), per the LSP 3.17 field. This is the
//     at-a-glance type on the suggestion row.
//   - `documentation` — a markdown `MarkupContent` wrapping the type in a fenced
//     `vital` block (`typeMarkdown`), which the client renders syntax-highlighted
//     via the TextMate grammar (matching the hover) in the expanded detail panel.
// We deliberately do NOT set the top-level `detail`: VS Code echoes `detail` BOTH
// on the label row AND in the panel header, so combined with the markdown
// `documentation` the type showed up twice (once unstyled from `detail`, once
// highlighted from the doc). `labelDetails` gives the inline type WITHOUT
// populating the panel body, leaving the highlighted `documentation` as the only
// thing in the panel — type shown once inline, once highlighted, never duplicated.
// Items without a type omit both.
//
// When the declaration carries a `///` doc-comment (`c.doc`), it's rendered as
// markdown ABOVE the type block in `documentation` via `docMarkdown` — prose
// first, type beneath. Items with neither a type nor a doc omit `documentation`.
// `resolve` (D7): when present, `` [`Name`] `` / `[Name]` spans in the doc are
// rewritten as clickable links to the named symbol's definition.
const toCompletionItem = (
  c: Completion,
  resolve?: DocRefResolver,
): CompletionItem => {
  const item: CompletionItem = { label: c.name, kind: completionKind[c.kind] };
  if (c.detail !== undefined) {
    item.labelDetails = { detail: typeLabelDetail(c.detail) };
  }
  if (c.detail !== undefined || (c.doc && c.doc.trim() !== "")) {
    item.documentation = {
      kind: MarkupKind.Markdown,
      value: docMarkdown(c.detail ?? "", VL_LANGUAGE_ID, c.doc, resolve),
    };
  }
  // Snippet items: set the insert text + format so the editor expands tab-stops.
  if (c.insertText !== undefined) {
    item.insertText = c.insertText;
    item.insertTextFormat = InsertTextFormat.Snippet;
  }
  // Auto-import items: the providing module on the label row and the import
  // rewrite on accept. NO sortText demotion: an auto-import name is by
  // construction not in scope, so its only same-label competitor is the
  // editor's word-based suggestion — and a demoted item loses that race, so
  // Tab accepted the word (no edits) whenever the name already appeared
  // anywhere in the buffer. Measured live 2026-08-31: merge-into-existing-
  // import "never worked" while fresh-module imports did, purely because the
  // tested buffer already contained the word.
  if (c.description !== undefined) {
    item.labelDetails = { ...item.labelDetails, description: c.description };
  }
  if (c.extraEdits !== undefined) {
    item.additionalTextEdits = c.extraEdits.map((e) => TextEdit.replace(e.range, e.newText));
  }
  return item;
};

// ---- std auto-import completion source ---------------------------------------
//
// Per-std-module export surfaces (name/kind/type) for `stdAutoImportCompletions`.
// Sources are read through the SAME reader precedence the checker uses (the
// workspace's own `std/` wins over the embedded map, so dogfooding offers what
// the checker will actually accept), and cached by module source text so a
// workspace std edit refreshes its entry. Types come from one `scopeAt` over the
// module itself (its own decls, rendered unmangled), matched to the surface's
// export list.
const stdExportCache = new Map<string, { src: string; exports: StdExportCandidate[] }>();
const SCOPE_KINDS = ["variable", "parameter", "function"] as const;
const stdExportsForCompletion = async (): Promise<Map<string, StdExportCandidate[]>> => {
  const out = new Map<string, StdExportCandidate[]>();
  if (wasmChecker === undefined) return out;
  for (const key of Object.keys(STD_SOURCES)) {
    const src = (await workspaceReader(key)) ?? STD_SOURCES[key];
    const cached = stdExportCache.get(key);
    if (cached !== undefined && cached.src === src) {
      out.set(key, cached.exports);
      continue;
    }
    const surface = wasmChecker.moduleSurface(src, key);
    const lastLine = src.split("\n").length - 1;
    const scope = await wasmChecker
      .scopeAt(src, key, workspaceReader, lastLine, 0)
      .catch(() => []);
    const byName = new Map(scope.map((b) => [b.name, b]));
    const exports: StdExportCandidate[] = surface.exports.map((e) => {
      const b = byName.get(e.name);
      return {
        name: e.name,
        kind: b !== undefined ? SCOPE_KINDS[b.kind] ?? "function" : "function",
        detail: b !== undefined && b.type !== "" ? b.type : undefined,
      };
    });
    stdExportCache.set(key, { src, exports });
    out.set(key, exports);
  }
  return out;
};

// The identifier `[A-Za-z_][A-Za-z0-9_]*` immediately to the LEFT of `character`
// on `line`, or null. Used to find a `<name>.` member-completion receiver: we
// scan back over `.` then the preceding word. (Cursor-on-word extraction is
// `wordAt`; this is specifically "the word ending just before the cursor".)
const wordEndingBefore = (line: string, character: number): string | null => {
  const isWordChar = (c: string) => /[A-Za-z0-9_]/.test(c);
  const end = character;
  let start = end;
  while (start > 0 && isWordChar(line[start - 1])) start--;
  if (start === end) return null;
  const word = line.slice(start, end);
  return /^[A-Za-z_]/.test(word) ? word : null;
};

// Remove the single character at (0-based line, 0-based col) from `text` — used to
// strip the trailing `.` so the wasm member-completion path can resolve the
// receiver as a bare expression (the native parser isn't error-tolerant for the
// incomplete `receiver.`). A no-op if the position is out of range.
const removeCharAt = (text: string, line: number, col: number): string => {
  const lines = text.split("\n");
  if (line < 0 || line >= lines.length) return text;
  const l = lines[line];
  if (col < 0 || col >= l.length) return text;
  lines[line] = l.slice(0, col) + l.slice(col + 1);
  return lines.join("\n");
};

// Completion (D3): scope-aware identifier suggestions everywhere, structural
// member suggestions after `.`, plus keyword and snippet completions for
// statement-position typing. Driven by the pure helpers in `typeFeatures.ts`
// over the compiler's symbol table + program scope (which folds in builtins).
connection.onCompletion(async (params): Promise<CompletionItem[]> => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const text = doc.getText();
  const uri = params.textDocument.uri;

  // The text on the current line up to the cursor — to detect a `.` trigger and
  // find the receiver name before it.
  const linePrefix = doc.getText({
    start: { line: params.position.line, character: 0 },
    end: params.position,
  });
  const charBeforeCursor = linePrefix[linePrefix.length - 1];

  // Fully self-hosted completion (kill-TS): native in-scope bindings (`scopeAt`,
  // incl. imported names) + native builtins (`builtinCompletions`, the source the
  // TS `defaultScope` used to provide) + native member completion — no
  // `checkOnly`/`parseSymbols`/`importedScope`/`defaultScope`. Items carry no
  // source `///` docs (the native scope set doesn't retain them). No checker (no
  // seed, or one predating these exports) → no completions.
  if (
    wasmChecker === undefined ||
    wasmChecker.scopeAt === undefined ||
    wasmChecker.builtinCompletions === undefined ||
    wasmChecker.memberCompletionsAt === undefined
  ) {
    return [];
  }

  if (charBeforeCursor === ".") {
    const receiver = wordEndingBefore(linePrefix, linePrefix.length - 1);
    if (!receiver) return [];
    // The native parser isn't error-tolerant for the incomplete `receiver.`, so
    // strip the trailing `.` and resolve the receiver as a bare expression at its
    // own position. Empty for a receiver with no completable members (arrays/maps)
    // or one that can't resolve.
    const dotCol = params.position.character - 1;
    const repaired = removeCharAt(text, params.position.line, dotCol);
    const members = await wasmChecker
      .memberCompletionsAt(
        repaired,
        entryKeyOf(uri),
        workspaceReader,
        params.position.line,
        dotCol - receiver.length,
      )
      .catch((err) => {
        connection.console.log(`[wasm-checker] memberCompletionsAt failed: ${err}`);
        return [];
      });
    return memberCompletionsFromWasm(members).map((c) => toCompletionItem(c));
  }

  // Identifier completion: native in-scope user bindings + native builtins +
  // keywords/snippets. A user binding shadows a same-named builtin (added last).
  const bindings = await wasmChecker
    .scopeAt(
      text,
      entryKeyOf(uri),
      workspaceReader,
      params.position.line,
      params.position.character,
    )
    .catch((err) => {
      connection.console.log(`[wasm-checker] scopeAt failed: ${err}`);
      return [];
    });
  const byName = new Map<string, Completion>();
  for (const c of builtinCompletionsFromWasm(wasmChecker.builtinCompletions())) {
    byName.set(c.name, c);
  }
  for (const c of scopeCompletionsFromBindings(bindings)) byName.set(c.name, c);
  const identifiers = [...byName.values()].map((c) => toCompletionItem(c));
  const keywords = keywordCompletions(false).map((c) => toCompletionItem(c));
  const snippets = snippetCompletions(false).map((c) => toCompletionItem(c));
  // std exports NOT in scope, offered with an import-statement rewrite on
  // accept (`additionalTextEdits`) — spelled by the seed's own formatter so the
  // rewritten import is exactly what `vl fmt` keeps.
  const autoImports = stdAutoImportCompletions(
    text,
    await stdExportsForCompletion(),
    (name) => byName.has(name),
    (stmt) => wasmChecker?.formatSrc?.(stmt),
  ).map((c) => toCompletionItem(c));
  return [...identifiers, ...autoImports, ...keywords, ...snippets];
});

// Document formatting (D4): rewrite the whole document through the self-hosted
// formatter (`format.vl` via the seed's `wasmChecker.formatSrc`). Returned as a
// single full-range TextEdit — the formatter is whole-document and idempotent, so
// a full replace is correct and lets the editor compute a minimal on-disk diff. A
// parse error / no seed yields `undefined` → no edits (rather than a corrupting
// partial result); there is no TS-formatter fallback (kill-TS).
connection.onDocumentFormatting((params): TextEdit[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const text = doc.getText();
  const formatted = wasmChecker?.formatSrc?.(text);
  if (formatted === undefined || formatted === text) return [];
  const fullRange: Range = {
    start: { line: 0, character: 0 },
    end: doc.positionAt(text.length),
  };
  return [{ range: fullRange, newText: formatted }];
});

// Quick-fixes (code actions) for lint diagnostics (B17). The editor passes the
// diagnostics overlapping the cursor/selection in `params.context.diagnostics`;
// we key off each diagnostic's stable `code` and precise `range` to compute
// plain text edits (see `codeActions.ts`), then wrap them in `CodeAction` +
// `WorkspaceEdit` envelopes. We also fold in cached `vital` diagnostics on an
// overlapping line, so a fix is still offered when the cursor sits off the
// diagnostic's exact range. Only `vital`-sourced lint diagnostics with a known
// code yield actions; everything else is ignored.
connection.onCodeAction((params): CodeAction[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const source = doc.getText();
  const uri = params.textDocument.uri;

  const cached = (diagnosticsByUri.get(uri) ?? []).map(toLspDiagnostic);
  const diagnostics = fixableDiagnosticsForRange(
    params.context.diagnostics,
    cached,
    params.range,
  );

  const actions: CodeAction[] = [];
  for (const diag of diagnostics) {
    const fixes = quickFixesForDiagnostic(source, diag.code, diag.range);
    for (const fix of fixes) {
      actions.push({
        title: fix.title,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        isPreferred: fix.isPreferred,
        edit: { changes: { [uri]: fix.edits } },
      });
    }
  }
  return actions;
});

// ---- code lens: export reference counts (D9.4) -------------------------------
//
// One lens per EXPORT declaration in the open file: "N refs" (cross-module +
// same-file), read from `lastUseMap` — the use-map the unused-export workspace
// pass ALREADY computes on every save. Rendering a lens therefore costs one
// `moduleSurface` + a map lookup, no crawl; before the first pass has run (or
// for an export added since it ran) there is simply no lens yet rather than an
// invented count, and `runUnusedExportPass` requests a client-side lens
// refresh whenever the map is rebuilt.
//
// The click-through is wired in `codeLens/resolve` — the expensive part
// (reference LOCATIONS, via the same capped cross-file crawl find-references
// uses) is paid on click, not on render. The resolved command is the
// extension-side `vital.showReferences`, which revives the JSON-serialized
// arguments into real `Uri`/`Position`/`Location` values and forwards to
// `editor.action.showReferences` (the LSP wire strips classes, so the built-in
// command can't be targeted directly — the standard shim, same as
// rust-analyzer's).

/** What a lens carries from compute to resolve (`CodeLens.data`, JSON-safe). */
type RefLensData = {
  uri: string;
  name: string;
  line: number; // 0-based decl-name line
  character: number; // 0-based decl-name col
  title: string;
};

connection.onCodeLens((params): CodeLens[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc || wasmChecker === undefined) return [];
  const entryKey = entryKeyOf(params.textDocument.uri);
  const surface = wasmChecker.moduleSurface(doc.getText(), entryKey);
  return exportRefLenses(surface.exports, lastUseMap.get(entryKey)).map(
    (l): CodeLens => ({
      range: {
        start: { line: l.line, character: l.char },
        end: { line: l.line, character: l.char + l.length },
      },
      data: {
        uri: params.textDocument.uri,
        name: l.name,
        line: l.line,
        character: l.char,
        title: refCountLensTitle(l.count),
      } satisfies RefLensData,
    }),
  );
});

connection.onCodeLensResolve(async (lens): Promise<CodeLens> => {
  const data = lens.data as RefLensData | undefined;
  if (data === undefined) return lens;
  // The locations behind the count: the same cross-file machinery as
  // find-references, driven from the export's decl (`crossFileReferences`
  // resolves the canonical export and unions per-candidate occurrences — the
  // entry file's own uses included). A closed document / degraded checker
  // resolves to an empty peek rather than an error.
  const doc = documents.get(data.uri);
  let locations: { uri: string; range: Range }[] = [];
  if (doc && wasmChecker !== undefined) {
    const entryKey = entryKeyOf(data.uri);
    const openDocs = documents.all().map((d) => ({ uri: d.uri, text: d.getText() }));
    const crawlRoot = workspaceFolder
      ? uriToPath(workspaceFolder)
      : detectProjectRoot(entryKey);
    const refs = await crossFileReferences(
      data.name,
      doc.getText(),
      entryKey,
      openDocs,
      workspaceReader,
      wasmChecker,
      true,
      enumerateWorkspaceFiles(crawlRoot),
    ).catch((err) => {
      connection.console.log(`[code-lens] reference crawl failed: ${err}`);
      return undefined;
    });
    if (refs !== undefined) locations = refs;
  }
  lens.command = {
    title: data.title,
    command: "vital.showReferences",
    arguments: [
      data.uri,
      { line: data.line, character: data.character },
      locations,
    ],
  };
  return lens;
});

documents.listen(connection);

// ---- status-bar seed indicator (D9.2) ---------------------------------------
//
// Which seed-ladder rung won is the first question of every "the extension is
// doing nothing" debugging session, and it used to live only in the output
// channel. Forward `loadWasmChecker`'s origin callback to the client as a
// custom notification; `extension.ts` renders it in a status-bar item (see
// `seedStatusView` in typeFeatures.ts). Payload: `SeedOrigin` (label + detail
// path/command + byte count), or `null` when NO seed loaded — the degraded
// state the survey calls out as previously invisible.
//
// Timing: the origin callback fires inside `onInitialize` (the ladder resolves
// synchronously), but a server may not send notifications before the client's
// `initialized` handshake — so the latest origin is cached and flushed on
// `onInitialized`. A later re-fire (the winning rung's mtime moved and the
// lazy reload picked a rung, possibly the same one) sends immediately.
const SEED_ORIGIN_NOTIFICATION = "vital/seedOrigin";
let clientInitialized = false;
let seedOriginKnown = false;
let lastSeedOrigin: SeedOrigin | undefined;
const sendSeedOrigin = (): void => {
  if (!clientInitialized || !seedOriginKnown) return;
  connection
    .sendNotification(SEED_ORIGIN_NOTIFICATION, lastSeedOrigin ?? null)
    .catch((err) => {
      connection.console.log(`[seed-origin] notify failed: ${err}`);
    });
};
connection.onInitialized(() => {
  clientInitialized = true;
  sendSeedOrigin();
});

connection.onInitialize((params) => {
  workspaceFolder = params.rootUri;
  // The workspace's `std/` dir (for the withStd precedence). No existence
  // check needed: a missing `<root>/std/NAME.vl` read just falls through to
  // the embedded map.
  workspaceStdDir = params.rootUri
    ? join(uriToPath(params.rootUri), "std")
    : undefined;
  connection.console.log(
    `[Server(${process.pid}) ${workspaceFolder}] Started and initialize received`,
  );
  // Load the self-hosted compiler from the wasm seed (kill-TS: the LSP runs
  // entirely on it). `compilerWasm` overrides the seed path; otherwise it's the
  // workspace's `build/vl-compiler.wasm`. A seed that can't load (absent, or no
  // WasmGC in this host) leaves `wasmChecker` undefined — every handler then
  // returns an empty/no-op result. (The legacy `vital.checker` option is ignored:
  // there is no longer a TS checker to select.)
  const opts = (params.initializationOptions ?? {}) as {
    compilerWasm?: string;
    compilerPath?: string;
  };
  const root = params.rootUri ? uriToPath(params.rootUri) : "";
  // THE SEED LADDER — see `wasmCheckerNode.ts` for why this is a ladder and not a
  // path. In short: the old single default was `<workspace>/build/vl-compiler.wasm`,
  // a gitignored artifact of the compiler repo, so the extension silently did
  // nothing in every project that is not this one. These rungs mirror the CLI's own
  // `--compiler → $VL_COMPILER_WASM → ./build/… → embedded` resolution and add the
  // two an editor needs.
  const seedSources: SeedSource[] = [];
  if (opts.compilerWasm) {
    seedSources.push({
      kind: "path",
      label: "vital.compilerWasm",
      path: opts.compilerWasm,
      explicit: true,
    });
  }
  if (process.env.VL_COMPILER_WASM) {
    seedSources.push({
      kind: "path",
      label: "$VL_COMPILER_WASM",
      path: process.env.VL_COMPILER_WASM,
      explicit: true,
    });
  }
  if (root) {
    seedSources.push({
      kind: "path",
      label: "workspace build/",
      path: join(root, "build", "vl-compiler.wasm"),
    });
  }
  // Shipped beside the server bundle. Ranked ABOVE `vl seed`: the server and its
  // bundled seed are built from ONE tree and ship as ONE artifact, and server
  // features increasingly assume the seed's BEHAVIOR (the scopeAt module filter
  // was the first live case: an installed CLI's embedded seed was ABI-compatible
  // but pre-filter, `speaksAbi` rightly accepted it, and completion silently
  // regressed — staleness is drift, not a protocol break, so no guard catches
  // it). The tension is real and unresolved by ordering alone: `vl seed` tracks
  // the PROJECT's language version (diagnostic fidelity), the bundle tracks the
  // EXTENSION's features — a comparable version stamp in the seed is the actual
  // answer; until then the artifact that ships with this code wins.
  seedSources.push({
    kind: "path",
    label: "bundled seed",
    path: join(dirname(fileURLToPath(import.meta.url)), "vl-compiler.wasm"),
  });
  // Ask an installed CLI for the seed it would use — the rung for a bundle that
  // shipped WITHOUT a seed (CI-built, or an older packaging). ONE spawn, at
  // startup.
  seedSources.push({
    kind: "exec",
    label: "`vl seed`",
    cmd: opts.compilerPath || "vl",
    args: ["seed"],
  });

  wasmChecker = loadWasmChecker(
    seedSources,
    (msg) => connection.console.log(msg),
    getStdDir,
    (origin) => {
      // Cache + forward the winning rung (or the no-seed state) to the client's
      // status bar (D9.2) — see SEED_ORIGIN_NOTIFICATION above.
      lastSeedOrigin = origin;
      seedOriginKnown = true;
      sendSeedOrigin();
      // SAY SO WHEN THERE IS NO CHECKER. Every handler returns an empty result
      // without one, which renders identically to a clean file — that is what made
      // the missing-seed case cost a debugging session rather than a glance.
      if (origin !== undefined) return;
      connection.window.showWarningMessage(
        "Vital: no compiler seed found, so diagnostics, go-to-definition and hover " +
          "are disabled. Put `vl` on PATH, or set `vital.compilerWasm`. " +
          "(The server log lists every location tried.)",
      );
    },
  );
  return {
    capabilities: {
      textDocumentSync: {
        openClose: true,
        change: TextDocumentSyncKind.Full,
        // Enable save notifications so the server can trigger the
        // project-wide unused-export workspace pass on document save.
        save: true,
      },
      completionProvider: {
        // `.` re-triggers completion so member suggestions appear right after a
        // property access; ordinary identifier completion fires on typing too.
        triggerCharacters: ["."],
      },
      definitionProvider: true,
      referencesProvider: true,
      documentHighlightProvider: true,
      documentSymbolProvider: true,
      documentFormattingProvider: true,
      codeActionProvider: {
        codeActionKinds: [CodeActionKind.QuickFix],
      },
      // Export reference-count lenses (D9.4); locations resolve on click.
      codeLensProvider: { resolveProvider: true },
      hoverProvider: true,
      inlayHintProvider: true,
      semanticTokensProvider: {
        legend: SEMANTIC_TOKEN_LEGEND,
        full: true,
      },
      workspace: { workspaceFolders: { supported: true } },
    },
  };
});

connection.listen();
