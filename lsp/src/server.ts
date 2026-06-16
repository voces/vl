import {
  CodeAction,
  CodeActionKind,
  CompletionItem,
  CompletionItemKind,
  createConnection,
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticTag,
  Hover,
  InlayHint,
  InlayHintKind,
  InsertTextFormat,
  Location,
  MarkupKind,
  ProposedFeatures,
  Range,
  SemanticTokens,
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
import { format } from "../../compiler/format.ts";
import {
  buildUnusedExportUseMap,
  crossFileReferences,
  type CrossFileSource,
  detectProjectRoot,
  enumerateWorkspaceFiles,
  makeWorkspaceReader,
  pathToUri,
  type UnusedExportUseMap,
  unusedExportHints,
  uriToPath,
} from "./moduleGraph.ts";
import {
  fixableDiagnosticsForRange,
  quickFixesForDiagnostic,
} from "./codeActions.ts";
import { join } from "node:path";
import {
  loadWasmChecker,
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
  docMarkdown,
  type DocRefResolver,
  inlayHintsFromWasm,
  keywordCompletions,
  type LspRange,
  memberCompletionsFromWasm,
  scopeCompletionsFromBindings,
  SEMANTIC_TOKEN_LEGEND,
  semanticTokensDataFromWasm,
  snippetCompletions,
  typeLabelDetail,
} from "./typeFeatures.ts";

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
// length) onto the host's `CrossFileSource` (0-based LSP range + `file://` URI),
// the form go-to-definition and the doc-xref resolver consume.
const toCrossFileSource = (s: WasmImportedSource): CrossFileSource => {
  const line = s.line > 0 ? s.line - 1 : 0;
  return {
    key: s.key,
    uri: pathToUri(s.key),
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

  // Go-to-definition off the self-hosted checker (kill-TS). The single-file
  // binding declaration first (native `definitionAt`); then, on a miss, the
  // cross-file imported-name jump — an imported name resolves to the exporting
  // sibling's declaration via the native import/export pass
  // (`wasmImportedSources`). No checker (no seed / no WasmGC) → no result.
  if (wasmChecker === undefined) return null;
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
  if (wasmChecker === undefined) return null;
  if (!wordForHover) return null;
  const t = await wasmHoverType();
  if (t) return { contents: hoverMarkdown(`${wordForHover}: ${t}`) };
  const mt = await wasmMemberType();
  if (mt) return { contents: hoverMarkdown(`${wordForHover}: ${mt}`) };
  const at = await wasmTypeAlias();
  if (at) return { contents: hoverMarkdown(`${wordForHover}: ${at}`) };
  // Builtin (`print`/`i32`/…): the word in the native builtin set.
  const b = wasmChecker.builtinCompletions?.().find((x) => x.name === wordForHover);
  if (b && b.detail.length > 0) {
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
    return { data: semanticTokensDataFromWasm(idents, lexical, members) };
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
  return item;
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
  return [...identifiers, ...keywords, ...snippets];
});

// Document formatting (D4): rewrite the whole document through the AST-driven
// formatter (`compiler/format.ts`). Returned as a single full-range TextEdit —
// the formatter is whole-document and idempotent, so a full replace is correct
// and lets the editor compute a minimal on-disk diff. A parse/format failure
// yields no edits rather than a corrupting partial result.
connection.onDocumentFormatting((params): TextEdit[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const text = doc.getText();
  // The self-hosted formatter (`format.vl` via `wasmChecker.formatSrc`); on a
  // parse error / missing export it falls back to the TS `format()` (the
  // `format.ts` finale is separately gated on the playground wasm migration).
  const tsFormat = (): string | undefined => {
    try {
      return format(text);
    } catch {
      return undefined;
    }
  };
  const formatted = wasmChecker?.formatSrc !== undefined
    ? wasmChecker.formatSrc(text) ?? tsFormat()
    : tsFormat();
  if (formatted === undefined) return [];
  if (formatted === text) return [];
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

documents.listen(connection);

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
  };
  const root = params.rootUri ? uriToPath(params.rootUri) : "";
  const wasmPath = opts.compilerWasm || join(root, "build", "vl-compiler.wasm");
  wasmChecker = loadWasmChecker(
    wasmPath,
    (msg) => connection.console.log(msg),
    getStdDir,
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
      documentFormattingProvider: true,
      codeActionProvider: {
        codeActionKinds: [CodeActionKind.QuickFix],
      },
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
