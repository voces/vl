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
  FoldingRange,
  Hover,
  InlayHint,
  InlayHintKind,
  InsertTextFormat,
  Location,
  LSPErrorCodes,
  MarkupKind,
  ProposedFeatures,
  ResponseError,
  SemanticTokens,
  SignatureHelp,
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
  crossFileUriOf,
  detectProjectRoot,
  enumerateWorkspaceFiles,
  makeWorkspaceReader,
  type UnusedExportUseMap,
  unusedExportHints,
  uriToPath,
} from "./moduleGraph.ts";
import {
  applyRatchetHold,
  invalidateRatchetBaselines,
} from "./ratchetHold.ts";
import { lintPathFor as lintPathForFile } from "./vlRoot.ts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadWasmChecker,
  type SeedOrigin,
  type SeedSource,
  type WasmChecker,
} from "./wasmCheckerNode.ts";
import {
  type Completion,
  type CompletionKind,
  type DocRefResolver,
  type HighlightKind,
  type OutlineNode,
  type OutlineSymbolKind,
  SEMANTIC_TOKEN_LEGEND,
} from "./typeFeatures.ts";
import { isStdKey, type StdSurfaceCache } from "./editorText.ts";
import {
  codeActionsAt,
  codeLensesAt,
  codeLensLocationsAt,
  completionPresentation,
  completionsAt,
  definitionAt,
  documentHighlightsAt,
  documentSymbolsAt,
  type FeatureContext,
  type FeatureWorkspace,
  foldingRangesAt,
  formattingEditsAt,
  hoverAt,
  inlayHintsAt,
  prepareRenameAt,
  type RefLensData,
  referencesAt,
  renameAt,
  semanticTokensAt,
  signatureHelpAt,
} from "./features.ts";

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

// The current document's module key: its filesystem path (modResolveSpecifier
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

// `vital.lint.showHeld` — publish the findings a per-file ratchet already HOLDS, as
// greyed hints, instead of dropping them. Off by default: the point of the hold is
// that a file at its baseline reads as clean, the way the gate reads it.
let showHeldLint = false;

// Every ratcheted code's findings for `uri`, re-graded against the committed
// baselines. One helper, because the diagnostics for an open document are published
// from two places — the edit handler and the workspace pass — and only one of them
// runs on a given keystroke.
const heldFiltered = (uri: string, diagnostics: VLDiagnostic[]): VLDiagnostic[] =>
  applyRatchetHold(
    diagnostics,
    uriToPath(uri),
    workspaceFolder ? uriToPath(workspaceFolder) : undefined,
    showHeldLint,
  );

// `uri`'s path as `lint()`'s `path` argument wants it — `vlRoot.ts`'s doc comment
// has the full story (why it walks from the FILE, never from an open workspace
// folder, and the false positives that cost it doing otherwise).
const lintPathFor = (uri: string): string | undefined => lintPathForFile(uriToPath(uri));

const toLspDiagnostic = (d: VLDiagnostic): Diagnostic => ({
  message: d.message,
  severity: severityMap[d.severity],
  range: d.range,
  code: d.code,
  // The code's structured payload (LSP 3.16 `Diagnostic.data`) — a client that
  // round-trips it hands the quick-fix its answer with no second query. One that
  // does not is covered by `ufcsImportModules`' fall back to the server's cache.
  data: d.data,
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
// Which open buffer changed when, and which module graph each document's published
// diagnostics were checked over: a document whose graph holds a module edited since
// is re-checked by the workspace pass, so an importer stops showing what its
// dependency's previous text implied.
let editStamp = 0;
const editedAt = new Map<string, number>();
const checkedOver = new Map<string, { stamp: number; graph: string[] }>();

// Re-check every open document whose graph holds a module edited after its own last
// check. The checker banks each check, so a re-check after a body-only edit serves
// every module the edit did not reach.
const recheckImporters = async (checker: WasmChecker): Promise<void> => {
  for (const doc of documents.all()) {
    const key = entryKeyOf(doc.uri);
    const was = checkedOver.get(doc.uri);
    if (was === undefined) continue;
    const stale = was.graph.some((k) => k !== key && (editedAt.get(k) ?? 0) > was.stamp);
    if (!stale) continue;
    const stamp = editStamp;
    try {
      const text = doc.getText();
      const lintDiags = await checker.lintInGraph(text, lintPathFor(doc.uri), key, workspaceReader);
      const got = await checker.recheck(text, key, workspaceReader);
      diagnosticsByUri.set(doc.uri, [...got.diagnostics, ...lintDiags]);
      checkedOver.set(doc.uri, { stamp, graph: got.graph });
      connection.console.log(`[wasm-checker] re-checked ${key}: ${got.served} modules served`);
    } catch (err) {
      connection.console.log(`[wasm-checker] re-check failed: ${err}`);
    }
  }
};

const runUnusedExportPass = async (): Promise<void> => {
  // The pass is driven entirely off the self-hosted checker (the surface scan
  // and local-use counts). A host that couldn't instantiate the seed has no
  // checker, so it skips the pass rather than crawling the workspace for nothing.
  if (wasmChecker === undefined) return;
  // The pass reads the workspace off DISK, so it is the one place that sees a
  // dependency changed by something other than an open buffer (a branch switch,
  // another editor). Bump before it crawls: the memo must not outlive a graph
  // this pass is about to read differently.
  wasmChecker.bumpReaderGeneration();
  // The pass reads the tree off disk, so it is also the moment a baseline JSON may
  // have changed under an open buffer (a branch switch, another editor).
  invalidateRatchetBaselines();
  await recheckImporters(wasmChecker);
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
      diagnostics: [...heldFiltered(doc.uri, cached), ...hints]
        .map(toLspDiagnostic),
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

  // ANY open buffer changing moves what `workspaceReader` answers, including
  // for the OTHER documents that import this one — and their own text is
  // unchanged, so the checker's prepared-state memo cannot see it. This is the
  // bump that keeps a hover in an importer from answering with the pre-edit
  // types of the module just edited.
  wasmChecker?.bumpReaderGeneration();
  const stamp = ++editStamp;
  editedAt.set(entryKeyOf(event.document.uri), stamp);

  // The most-recently-computed unused-export hints (from the last workspace
  // pass). Stale relative to this edit — the debounce timer below refreshes
  // them after idle; publishing the stale set avoids losing them on every
  // keystroke.
  const hints = wasmChecker !== undefined
    ? unusedExportHints(
      event.document.getText(),
      entryKeyOf(event.document.uri),
      lastUseMap,
      wasmChecker,
    )
    : [];

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
  //
  // Diagnostics from the self-hosted compiler: the error tier (`check`) PLUS the
  // Stage-3 lint tier (`lint`, which `check` excludes). No checker (no seed / no
  // WasmGC in this host) → no diagnostics, rather than a TS fallback.
  //
  // `check` RUNS LAST of the three, and that ordering is the keystroke's cost:
  // it is the only one that leaves a checked module graph behind, and both
  // `lint` (a parse-only pass over the same instance) and the hints'
  // `moduleSurface` (which resets the module table) would discard it. The hover
  // / semantic-tokens / inlay requests that follow an edit then answer off the
  // staging this leaves, for no second whole-graph check.
  let diagnostics: VLDiagnostic[] = [];
  if (wasmChecker !== undefined) {
    try {
      const text = event.document.getText();
      // Linted inside the document's module graph, so a rule reading an imported
      // declaration agrees with `vl check`; the staging is the one `check` reuses.
      const lintDiags = await wasmChecker.lintInGraph(
        text,
        lintPathFor(event.document.uri),
        entryKeyOf(event.document.uri),
        workspaceReader,
      );
      const errors = await wasmChecker.check(
        text,
        entryKeyOf(event.document.uri),
        workspaceReader,
      );
      diagnostics = [...errors, ...lintDiags];
      checkedOver.set(event.document.uri, { stamp, graph: wasmChecker.lastGraph() });
    } catch (err) {
      connection.console.log(`[wasm-checker] check failed: ${err}`);
    }
  }

  // Cache the raw VL diagnostics (which carry `code`/`range`/`source`) so
  // `onCodeAction` can offer fixes by line overlap, not just for the exact
  // diagnostics VS Code passes back.
  diagnosticsByUri.set(event.document.uri, diagnostics);

  connection.sendDiagnostics({
    uri: event.document.uri,
    version: event.document.version,
    diagnostics: [...heldFiltered(event.document.uri, diagnostics), ...hints]
      .map(toLspDiagnostic),
  });

  // Arm the idle debounce timer: after UNUSED_EXPORT_DEBOUNCE_MS of no edits,
  // trigger a fresh workspace pass. A subsequent edit or a save resets the timer.
  if (useMapDebounceTimer !== undefined) clearTimeout(useMapDebounceTimer);
  useMapDebounceTimer = setTimeout(() => {
    useMapDebounceTimer = undefined;
    runUnusedExportPass().catch(() => {});
  }, UNUSED_EXPORT_DEBOUNCE_MS);
});

// A closed document's reader answer changes from its BUFFER to what is on disk
// — the two differ whenever the buffer was dirty. Nothing else here notices, so
// the memo is retired the same way an edit retires it.
documents.onDidClose((event) => {
  connection.console.log(
    `[Server(${process.pid}) ${workspaceFolder}] Document closed: ${event.document.uri}`,
  );
  wasmChecker?.bumpReaderGeneration();
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


// The request context every seed-backed feature in `features.ts` takes: the
// checker, the document's module key, the workspace reader and this connection's
// log. Undefined when no seed loaded, and every handler then answers empty.
const featureContext = (uri: string): FeatureContext | undefined =>
  wasmChecker === undefined ? undefined : {
    checker: wasmChecker,
    entryKey: entryKeyOf(uri),
    reader: workspaceReader,
    log: (msg) => connection.console.log(msg),
  };

// The workspace a cross-module feature crawls: the open buffers and the capped
// disk crawl under the workspace folder, or under the project root detected from
// the document when no folder is open.
const featureWorkspace = (uri: string): FeatureWorkspace => ({
  uri,
  openDocs: () => documents.all().map((d) => ({ uri: d.uri, text: d.getText() })),
  diskFiles: () =>
    enumerateWorkspaceFiles(
      workspaceFolder
        ? uriToPath(workspaceFolder)
        : detectProjectRoot(entryKeyOf(uri)),
    ),
});

// Go-to-definition (D2): an imported name jumps to the exporting module's
// declaration, whose key maps to a `file://` URI or, for `std:`, to the
// workspace's own `std/` file or the extension's `vl-std:` scheme.
connection.onDefinition(async (params): Promise<Location | null> => {
  const doc = documents.get(params.textDocument.uri);
  const ctx = featureContext(params.textDocument.uri);
  if (!doc || ctx === undefined) return null;
  const target = await definitionAt(doc.getText(), params.position, ctx);
  if (target === null) return null;
  const uri = target.key === undefined
    ? params.textDocument.uri
    : crossFileUriOf(target.key, getStdDir);
  return Location.create(uri, target.range);
});

// Find-references: single-file first, then the open buffers and the capped disk
// crawl for a cross-module symbol (see `crossFileReferences` for the root
// detection, the file cap and the excluded dirs).
connection.onReferences(async (params): Promise<Location[] | null> => {
  const doc = documents.get(params.textDocument.uri);
  const ctx = featureContext(params.textDocument.uri);
  if (!doc || ctx === undefined) return null;
  const refs = await referencesAt(
    doc.getText(),
    params.position,
    params.context?.includeDeclaration ?? true,
    ctx,
    featureWorkspace(params.textDocument.uri),
  );
  return refs?.map((r) => Location.create(r.uri, r.range)) ?? null;
});

// Document highlights (D9.1): same-file occurrences, the declaration as a Write.
const highlightKindMap: Record<HighlightKind, DocumentHighlightKind> = {
  read: DocumentHighlightKind.Read,
  write: DocumentHighlightKind.Write,
};
connection.onDocumentHighlight(
  async (params): Promise<DocumentHighlight[] | null> => {
    const doc = documents.get(params.textDocument.uri);
    const ctx = featureContext(params.textDocument.uri);
    if (!doc || ctx === undefined) return null;
    const spans = await documentHighlightsAt(doc.getText(), params.position, ctx);
    return spans?.map((h) => ({
      range: h.range,
      kind: highlightKindMap[h.kind],
    })) ?? null;
  },
);

// Document symbols (D9.3): the nested outline that the Outline view, breadcrumbs,
// Ctrl+Shift+O and sticky scroll (`editor.stickyScroll.defaultModel` =
// `outlineModel`) read.
const outlineKindMap: Record<OutlineSymbolKind, SymbolKind> = {
  function: SymbolKind.Function,
  variable: SymbolKind.Variable,
  constant: SymbolKind.Constant,
  // VL types are structural objects, not nominal classes — same mapping as
  // completion's `type` items.
  type: SymbolKind.Struct,
};
const outlineNodeToSymbol = (n: OutlineNode): DocumentSymbol => {
  const sym: DocumentSymbol = {
    name: n.name,
    kind: outlineKindMap[n.kind],
    range: n.range,
    selectionRange: n.selection,
  };
  if (n.exported) sym.detail = "export";
  if (n.children.length > 0) {
    sym.children = n.children.map(outlineNodeToSymbol);
  }
  return sym;
};
connection.onDocumentSymbol(
  async (params): Promise<DocumentSymbol[] | null> => {
    const doc = documents.get(params.textDocument.uri);
    const ctx = featureContext(params.textDocument.uri);
    if (!doc || ctx === undefined) return null;
    const nodes = await documentSymbolsAt(doc.getText(), ctx);
    return nodes?.map(outlineNodeToSymbol) ?? null;
  },
);

// Folding ranges (D9.9): bracketed blocks, multi-line paren/bracket groups,
// `//` comment runs and the leading import block — computed by `foldingRanges`
// over the shared host tokenizer, so a brace inside a string or a comment never
// opens a region — plus one region per declaration and block from the seed's
// extents, which start at the HEADER line rather than at the brace.
//
// STILL THE ONE HANDLER THAT WORKS WITH NO SEED. The extents are an argument, not
// a requirement: with none the lexical scan alone folds every brace, so an editor
// with a missing or broken seed keeps folding while every other handler above
// returns null. That is also what `editor.stickyScroll.defaultModel` =
// `foldingProviderModel` reads, which is how an `if` or a `for` gets to stick.
connection.onFoldingRanges((params): FoldingRange[] | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  return foldingRangesAt(doc.getText(), wasmChecker);
});

// Signature help (D9.10): the callee's parameters while typing a call, the
// argument under the cursor highlighted. The protocol addresses a parameter by
// its offset pair into the label, since one substring can occur twice.
connection.onSignatureHelp(async (params): Promise<SignatureHelp | null> => {
  const doc = documents.get(params.textDocument.uri);
  const ctx = featureContext(params.textDocument.uri);
  if (!doc || ctx === undefined) return null;
  const sig = await signatureHelpAt(doc.getText(), params.position, ctx);
  if (sig === null) return null;
  return {
    signatures: [{
      label: sig.label,
      parameters: sig.parameters.map(([start, end]) => ({ label: [start, end] })),
    }],
    activeSignature: 0,
    activeParameter: sig.activeParameter,
  };
});

// ---- rename symbol (+prepare) (D9.7) ----------------------------------------
//
// `prepareRenameAt` and `renameAt` answer; a deliberate refusal (a std-declared
// binding, an unattributable alias mix, an invalid new name) becomes a
// ResponseError carrying the reason, which VS Code shows inline. `rename`
// re-plans against the request-time text, since prepare and rename are separate
// requests. Semantics table and safety refusals: `rename.ts`.

// What counts as a std declaration for rename's hard refusal: the `std:` key
// scheme, plus the workspace's own `std/` dir (dogfooding in the compiler repo
// resolves std keys to real files there — renaming those from an editor would
// corrupt the version-locked std surface just the same).
const isStdKeyForRename = (key: string): boolean => {
  if (isStdKey(key)) return true;
  const stdDir = getStdDir();
  return stdDir !== undefined && key.startsWith(stdDir + "/");
};

connection.onPrepareRename(async (params) => {
  const doc = documents.get(params.textDocument.uri);
  const ctx = featureContext(params.textDocument.uri);
  if (!doc || ctx === undefined) return null;
  const answer = await prepareRenameAt(
    doc.getText(),
    params.position,
    ctx,
    isStdKeyForRename,
  );
  if (answer !== null && "error" in answer) {
    throw new ResponseError(LSPErrorCodes.RequestFailed, answer.error);
  }
  return answer;
});

connection.onRenameRequest(async (params) => {
  const doc = documents.get(params.textDocument.uri);
  const ctx = featureContext(params.textDocument.uri);
  if (!doc || ctx === undefined) return null;
  const answer = await renameAt(
    doc.getText(),
    params.position,
    params.newName,
    ctx,
    featureWorkspace(params.textDocument.uri),
    isStdKeyForRename,
  );
  if (answer === null) return null;
  if ("error" in answer) {
    throw new ResponseError(LSPErrorCodes.RequestFailed, answer.error);
  }
  const changes: Record<string, TextEdit[]> = {};
  for (const [uri, edits] of Object.entries(answer.changes)) {
    changes[uri] = edits.map((e) => TextEdit.replace(e.range, e.newText));
  }
  return { changes };
});

// Hover: the ladder in `hoverAt`, rendered as markdown.
//
// D8 stepwise alias expansion (hover verbosity): the renderer (`stringifyType`'s
// `maxDepth`) supports peeling one alias layer per step. The interactive +/-
// controls need the proposed LSP 3.18 hover-verbosity API
// (`HoverParams.context.verbosityLevel` + `Hover.canIncrease`/`canDecrease`),
// which `vscode-languageserver@9` / protocol 3.17.5 does not have. Once it lands,
// map the requested level to `maxDepth` and set the two flags; no renderer change.
connection.onHover(async (params): Promise<Hover | null> => {
  const doc = documents.get(params.textDocument.uri);
  const ctx = featureContext(params.textDocument.uri);
  if (!doc || ctx === undefined) return null;
  const value = await hoverAt(doc.getText(), params.position, ctx);
  return value === null ? null : { contents: { kind: "markdown", value } };
});

// Inlay hints (D6): the inferred type after each declaration that lacks a visible
// annotation (`x: i32`), within the request's range.
connection.languages.inlayHint.on(async (params): Promise<InlayHint[]> => {
  const doc = documents.get(params.textDocument.uri);
  const ctx = featureContext(params.textDocument.uri);
  if (!doc || ctx === undefined) return [];
  const hints = await inlayHintsAt(doc.getText(), params.range, ctx);
  return hints.map((h): InlayHint => ({
    position: { line: h.line, character: h.char },
    label: h.label, // `: <type>`
    kind: InlayHintKind.Type,
    paddingLeft: true, // keep it unobtrusive: a space before `: type`
  }));
});

// Semantic tokens (D5): identifiers classified by resolved binding kind, which a
// TextMate grammar cannot tell apart, merged with the lexical layer.
connection.languages.semanticTokens.on(
  async (params): Promise<SemanticTokens> => {
    const doc = documents.get(params.textDocument.uri);
    const ctx = featureContext(params.textDocument.uri);
    if (!doc || ctx === undefined) return { data: [] };
    return { data: await semanticTokensAt(doc.getText(), ctx) };
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
  property: CompletionItemKind.Property,
};

// `completionPresentation` (shared with the playground) puts a typed item's type
// inline (`labelDetails.detail`) and highlighted in the markdown `documentation`.
// The top-level `detail` stays unset on purpose: VS Code echoes it on the label row
// AND in the panel header, so beside `documentation` the type would show twice.
// `resolve` (D7) turns `[Name]` spans in the doc into links to the definition.
const toCompletionItem = (
  c: Completion,
  resolve?: DocRefResolver,
): CompletionItem => {
  const item: CompletionItem = { label: c.name, kind: completionKind[c.kind] };
  const { labelDetail, documentation } = completionPresentation(c, resolve);
  if (labelDetail !== undefined) item.labelDetails = { detail: labelDetail };
  if (documentation !== undefined) {
    item.documentation = { kind: MarkupKind.Markdown, value: documentation };
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

// The std export surfaces `completionsAt` offers, cached across requests on each
// module's source text, so a workspace `std/` edit refreshes its entry.
const stdExportCache: StdSurfaceCache = new Map();

// Completion (D3): `completionsAt` composes the scope, member, UFCS, type, std
// auto-import, keyword and snippet sources; this maps them to protocol items.
connection.onCompletion(async (params): Promise<CompletionItem[]> => {
  const doc = documents.get(params.textDocument.uri);
  const ctx = featureContext(params.textDocument.uri);
  if (!doc || ctx === undefined) return [];
  const items = await completionsAt(doc.getText(), params.position, ctx, stdExportCache);
  return items.map((c) => toCompletionItem(c));
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
  return formattingEditsAt(doc.getText(), wasmChecker);
});

// Quick-fixes (code actions) for lint diagnostics (B17) + organize imports (D9),
// computed by `codeActionsAt`. The cached `vital` diagnostics are folded in, so a
// fix is still offered when the cursor sits off the diagnostic's exact range, and
// `context.only` is honoured per the protocol's kind hierarchy, so a
// `source.organizeImports` on-save request gets exactly that action.
connection.onCodeAction((params): CodeAction[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const uri = params.textDocument.uri;
  return codeActionsAt(
    doc.getText(),
    uri,
    params.range,
    params.context.diagnostics,
    () => (diagnosticsByUri.get(uri) ?? []).map(toLspDiagnostic),
    params.context.only,
    wasmChecker,
    lintPathFor(uri),
  );
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

connection.onCodeLens((params): CodeLens[] => {
  const doc = documents.get(params.textDocument.uri);
  const ctx = featureContext(params.textDocument.uri);
  if (!doc || ctx === undefined) return [];
  return codeLensesAt(doc.getText(), params.textDocument.uri, ctx, lastUseMap);
});

// A closed document or a missing seed resolves to an empty peek, not an error.
connection.onCodeLensResolve(async (lens): Promise<CodeLens> => {
  const data = lens.data as RefLensData | undefined;
  if (data === undefined) return lens;
  const doc = documents.get(data.uri);
  const ctx = featureContext(data.uri);
  const locations = doc && ctx !== undefined
    ? await codeLensLocationsAt(data, doc.getText(), ctx, featureWorkspace(data.uri))
    : [];
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
    lintShowHeld?: boolean;
  };
  showHeldLint = opts.lintShowHeld === true;
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
    // A long-lived instance: its checks bank, so an importer re-checked after a
    // dependency's body edit is served (`recheckImporters`).
    true,
  );
  return {
    capabilities: {
      // The protocol's default, said out loud: the checker converts the seed's
      // UTF-8 byte columns at its boundary (`utf16Columns.ts`, D4490).
      positionEncoding: "utf-16",
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
      // Folding ranges (D9.9) — purely lexical, so it is served even with no
      // compiler seed.
      foldingRangeProvider: true,
      documentFormattingProvider: true,
      codeActionProvider: {
        codeActionKinds: [
          CodeActionKind.QuickFix,
          CodeActionKind.SourceOrganizeImports,
        ],
      },
      // Export reference-count lenses (D9.4); locations resolve on click.
      codeLensProvider: { resolveProvider: true },
      // Rename symbol (D9.7); prepare returns the identifier range/placeholder
      // and refuses non-renameable positions before the client opens the box.
      renameProvider: { prepareProvider: true },
      hoverProvider: true,
      // Signature help (D9.10). `(` opens the popup and `,` moves the active
      // parameter; `)` RETRIGGERS rather than triggers, so closing an inner call
      // hands the popup back to the outer one instead of opening a new session.
      signatureHelpProvider: {
        triggerCharacters: ["(", ","],
        retriggerCharacters: [")"],
      },
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
