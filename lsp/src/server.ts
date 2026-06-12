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
  Position,
  ProposedFeatures,
  Range,
  SemanticTokens,
  TextDocuments,
  TextDocumentSyncKind,
  TextEdit,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  checkOnly,
  parseSymbols,
  rangeFromCtx,
  stringifyType,
  VLDiagnostic,
  VLDiagnosticTag,
  VLSeverity,
} from "../../compiler/compile.ts";
import { format } from "../../compiler/format.ts";
import {
  buildUnusedExportUseMap,
  checkDocument,
  crossFileReferences,
  type CrossFileSource,
  detectProjectRoot,
  enumerateWorkspaceFiles,
  importedNameSource,
  importedNameSources,
  makeWorkspaceReader,
  type UnusedExportUseMap,
  unusedExportHints,
  uriToPath,
} from "./moduleGraph.ts";
import { parseProgram } from "../../compiler/parser.ts";
import { defaultScope } from "../../compiler/defaultScope.ts";
import { tokenize as tokenizeSource } from "../../compiler/lexer.ts";
import { SymbolTable } from "../../compiler/symbols.ts";
import {
  fixableDiagnosticsForRange,
  quickFixesForDiagnostic,
} from "./codeActions.ts";
import type { Context } from "../../compiler/ast.ts";
import { tokenize } from "../../compiler/lexer.ts";
import { join } from "node:path";
import {
  diffDiagnostics,
  loadWasmChecker,
  type WasmChecker,
} from "./wasmChecker.ts";
import {
  type Completion,
  type CompletionKind,
  deriveInlayHints,
  docMarkdown,
  type DocRefResolver,
  identifierCompletions,
  keywordCompletions,
  type LspRange,
  memberCompletions,
  receiverObjectType,
  resolveMemberAt,
  SEMANTIC_TOKEN_LEGEND,
  semanticTokensData,
  snippetCompletions,
  typeLabelDetail,
} from "./typeFeatures.ts";

// The language id the extension registers (`package.json` → contributes.languages,
// id `vital`, scope `source.vital`). Used as the markdown fence info string so
// hover code blocks render syntax-highlighted via the TextMate grammar.
const VL_LANGUAGE_ID = "vital";

// ---- D7: doc-comment cross-reference resolver --------------------------------

/**
 * Build a {@link DocRefResolver} for a document's symbol table (D7). The
 * resolver maps a symbol name to a markdown link URL that jumps to that
 * symbol's definition inside `documentUri`.
 *
 * Resolution scope (single-file): we collect every top-level declaration from
 * the symbol table — any `isDecl` occurrence whose binding's `scope` is the
 * widest-reaching span (the whole file). A top-level `let`/`const`, `function`
 * declaration, or `type` alias all have the whole-file span as their scope.
 * The outermost scope has the maximum line span, so we select declarations
 * whose scope length equals the maximum across all observed scopes.
 *
 * Link format: `documentUri#L<1-based line>` — the convention LSP clients
 * (VS Code) honour for `file://` URIs; clicking the link in a hover panel
 * navigates to the definition line.
 *
 * Cross-import (H0 phase 3): when `name` is an IMPORTED binding rather than a
 * local declaration, it resolves through `importedSources` — the imported
 * name → exporting-sibling source map produced by the module graph
 * (`importedNameSources`). An imported `` [`Name`] `` then links to the SIBLING
 * module's definition line (`siblingUri#L…`) instead of the local import line.
 * A local declaration of the same name takes precedence (it's the in-file
 * definition the reader means). `importedSources` is empty for a no-import file,
 * so single-file behaviour is unchanged.
 */
const buildDocRefResolver = (
  symbols: ReturnType<typeof parseSymbols>,
  documentUri: string,
  importedSources: Record<string, CrossFileSource> = {},
): DocRefResolver => {
  // Walk all declaration occurrences and record each name's definition line.
  // For a given name, prefer the binding with the widest scope span (most
  // lines) — that is the outermost (top-level) declaration when nesting exists.
  // We avoid the O(n²) re-scan by tracking the max scope width seen per name.
  const byName = new Map<string, { line: number; scopeLines: number }>();
  for (const occ of symbols.occurrences) {
    if (!occ.isDecl) continue;
    const { binding } = occ;
    const declLine = occ.span.start.line; // 1-based VL line
    const scopeLines = binding.scope
      ? binding.scope.stop.line - binding.scope.start.line
      : 0;
    const existing = byName.get(binding.name);
    if (existing === undefined || scopeLines > existing.scopeLines) {
      byName.set(binding.name, { line: declLine, scopeLines });
    }
  }
  return (name: string): string | undefined => {
    // A local declaration is the in-file definition the reader means.
    const entry = byName.get(name);
    if (entry !== undefined) {
      // `file://path#Lline` is the VS Code convention for "jump to line".
      return `${documentUri}#L${entry.line}`;
    }
    // Otherwise, an imported name links to its exporting sibling's definition.
    // `range.start.line` is 0-based (LSP); the `#L` anchor is 1-based.
    const imported = importedSources[name];
    if (imported) return `${imported.uri}#L${imported.range.start.line + 1}`;
    return undefined;
  };
};

declare const process: NodeJS.Process;

// Creates the LSP connection
const connection = createConnection(ProposedFeatures.all);

// Create a manager for open text documents
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Module-aware analysis reads sibling `.vl` files: it prefers the open document
// buffers (so unsaved edits are seen) and falls back to disk. Keyed on the
// open-document URIs the manager tracks (see `makeWorkspaceReader`).
const workspaceReader = makeWorkspaceReader({
  get: (uri: string) => documents.get(uri),
});

// The current document's module key: its filesystem path (resolveSpecifier
// resolves relative imports against this). Falls back to a synthetic key for a
// non-`file:` URI (e.g. untitled buffers) — such a doc has no resolvable
// relative imports, so analysis degrades to single-file, which is correct.
const entryKeyOf = (uri: string): string => uriToPath(uri);

/**
 * Imported names' resolved types for the document at `uri`, seeded so the
 * synchronous symbol/AST helpers (`parseSymbols`/`checkOnly`) resolve imported
 * references instead of flagging them undeclared. Returns an empty scope for a
 * file with no (resolvable) imports — the common case behaves exactly as before.
 */
const importedScopeFor = async (
  uri: string,
  text: string,
): Promise<Record<string, ReturnType<typeof defaultScope>[string]>> => {
  const { importedScope } = await checkDocument(text, entryKeyOf(uri), workspaceReader);
  return importedScope;
};

/**
 * `parseSymbols` SEEDED with imported names' types — so a symbol-table query over
 * an imported name resolves to its real type (hover) instead of nothing. Mirrors
 * `parseSymbols` but threads a non-empty initial scope.
 */
const parseSymbolsSeeded = (
  text: string,
  importedScope: Record<string, ReturnType<typeof defaultScope>[string]>,
): SymbolTable => {
  const { tokens } = tokenizeSource(text);
  const [, , symbols] = parseProgram(tokens, {
    ...defaultScope(),
    ...importedScope,
  });
  return symbols;
};

// The workspace folder this server is operating on
let workspaceFolder: string | null;

// LSP-on-wasm Stage 1 state (see `wasmChecker.ts` and `onInitialize`): which
// checker publishes diagnostics, and the loaded self-hosted compiler when the
// mode wants one. `"ts"` is the default and the universal fallback.
let checkerMode: "ts" | "wasm" | "both" = "ts";
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
  const useMap = await buildUnusedExportUseMap(diskFiles, workspaceReader);
  lastUseMap = useMap;

  // Re-publish diagnostics for every open document so hints update atomically.
  for (const doc of documents.all()) {
    const cached = diagnosticsByUri.get(doc.uri) ?? [];
    const hints = unusedExportHints(
      doc.getText(),
      uriToPath(doc.uri),
      useMap,
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
  // Stage 1 of LSP-on-wasm (`vital.checker`): `"wasm"` publishes the
  // self-hosted compiler's diagnostics instead of the TS checker's (no lint
  // tier yet — that's Stage 3); `"both"` publishes the TS diagnostics and LOGS
  // structural divergence from the wasm checker — the parity instrument the
  // TS-host teardown gates on. Any wasm-side failure falls back to TS.
  let diagnostics: VLDiagnostic[];
  if (checkerMode === "wasm" && wasmChecker !== undefined) {
    diagnostics = await wasmChecker
      .check(
        event.document.getText(),
        entryKeyOf(event.document.uri),
        workspaceReader,
      )
      .catch(async (err) => {
        connection.console.log(`[wasm-checker] check failed (${err}) — TS fallback`);
        return (await checkDocument(
          event.document.getText(),
          entryKeyOf(event.document.uri),
          workspaceReader,
        )).diagnostics;
      });
  } else {
    diagnostics = (await checkDocument(
      event.document.getText(),
      entryKeyOf(event.document.uri),
      workspaceReader,
    )).diagnostics;
    if (checkerMode === "both" && wasmChecker !== undefined) {
      try {
        const wasmDiags = await wasmChecker.check(
          event.document.getText(),
          entryKeyOf(event.document.uri),
          workspaceReader,
        );
        const diff = diffDiagnostics(diagnostics, wasmDiags);
        if (diff !== undefined) {
          connection.console.log(
            `[wasm-parity] divergence in ${event.document.uri}\n${diff}`,
          );
        }
      } catch (err) {
        connection.console.log(`[wasm-parity] wasm check failed: ${err}`);
      }
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
  const hints = unusedExportHints(
    event.document.getText(),
    entryKeyOf(event.document.uri),
    lastUseMap,
  );

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

// LSP positions are 0-based line / 0-based character; VL's `Position` (and the
// spans in the symbol table) are 1-based line / 0-based column. Bridge here.
const toVLPosition = (p: Position) => ({ line: p.line + 1, column: p.character });
const ctxToRange = (ctx: Context): Range => rangeFromCtx(ctx);

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

  // Is the cursor on an imported name? If so, resolve cross-file.
  const lineText = doc.getText({
    start: { line: params.position.line, character: 0 },
    end: { line: params.position.line + 1, character: 0 },
  });
  const word = wordAt(lineText, params.position.character);
  if (word) {
    const source = await importedNameSource(
      word,
      text,
      entryKeyOf(params.textDocument.uri),
      workspaceReader,
    );
    if (source) return Location.create(source.uri, source.range);
  }

  // Local definition (single-file, unchanged).
  const symbols = parseSymbols(text);
  const decl = symbols.definitionAt(toVLPosition(params.position));
  if (!decl) return null;
  return Location.create(params.textDocument.uri, ctxToRange(decl));
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

  // Cross-file: only attempt when the cursor sits on an identifier.
  const lineText = doc.getText({
    start: { line: params.position.line, character: 0 },
    end: { line: params.position.line + 1, character: 0 },
  });
  const word = wordAt(lineText, params.position.character);
  if (word) {
    const openDocs = documents.all().map((d) => ({
      uri: d.uri,
      text: d.getText(),
    }));

    // Determine the project root for the on-disk crawl. Prefer the LSP workspace
    // folder root (set during `onInitialize`); fall back to detecting it by
    // walking up from the current file's path.
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
      includeDeclaration,
      diskFiles,
    );
    // A defined (possibly empty) result means the symbol is cross-module: use it.
    // `undefined` means a purely-local symbol → fall through to single-file.
    if (crossRefs !== undefined) {
      return crossRefs.map((r) => Location.create(r.uri, r.range));
    }
  }

  // Single-file references (a local binding), unchanged.
  const symbols = parseSymbols(text);
  const spans = symbols.referencesAt(toVLPosition(params.position), includeDeclaration);
  return spans.map((ctx) =>
    Location.create(params.textDocument.uri, ctxToRange(ctx))
  );
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

  const lineText = document.getText({
    start: { line: params.position.line, character: 0 },
    end: { line: params.position.line + 1, character: 0 },
  });
  // Hover resolves through the D2 symbol table first: it maps the cursor to its
  // `Binding` (locals/params/functions/type aliases included) and reads the type
  // each binding carries. Falls back to the top-level scope lookup below for
  // anything the symbol table doesn't carry.
  //
  // Module-aware: seed the parse with imported names' resolved types so a hover
  // over an imported name (`foo` from `./x`) shows its REAL type rather than
  // resolving to nothing. A no-import file seeds an empty scope (unchanged).
  const importedScope = await importedScopeFor(
    params.textDocument.uri,
    document.getText(),
  );
  const symbols = parseSymbolsSeeded(document.getText(), importedScope);
  // D7: build the doc-comment cross-reference resolver for this document. It is
  // used by `docMarkdown` to rewrite `` [`Name`] `` / `[Name]` spans in `///`
  // doc-comments into clickable links to the named symbol's definition.
  // H0 phase 3: imported names link cross-file to their exporting sibling.
  const importedSources = await importedNameSources(
    document.getText(),
    entryKeyOf(params.textDocument.uri),
    workspaceReader,
  );
  const docResolver = buildDocRefResolver(
    symbols,
    params.textDocument.uri,
    importedSources,
  );
  const occ = symbols.occurrenceAt(toVLPosition(params.position));
  if (occ?.binding.type) {
    // Feature 1(b) — "declared vs flow-refined type" — is DEFERRED. The symbol
    // table carries only the binding's *declared/inferred* type (`binding.type`),
    // shared by all occurrences. Flow narrowing (`if x is T { … }`) lives in the
    // type checker's transient `narrowedPaths` (compiler/typecheck.ts) and is not
    // recorded per occurrence, so the *refined* type at this exact cursor isn't
    // obtainable without a compiler-core change (recording a narrowed type on
    // each `SymbolOccurrence` during the typecheck/toAST pass). That change is
    // out of scope here (compiler/*.ts is owned by other agents). When it lands,
    // render both via separate labelled markdown sections — the LSP convention
    // for two types in one hover — e.g. "declared `T`" then "narrowed `U`".
    // Render the authored `///` doc (if any) as markdown above the type block.
    // `docMarkdown` collapses to the bare type fence when there's no doc, so
    // undocumented bindings hover exactly as before. Pass `docResolver` so any
    // `` [`Name`] `` / `[Name]` spans in the doc are linkified (D7).
    //
    // D8 alias display: a *value* binding (`x: thing`) renders at maxDepth 0 —
    // every alias name preserved (hover `x: thing`, not its body). A *type*
    // binding (`type thing = …`) peels exactly one layer (maxDepth 1) so hovering
    // the alias shows its BODY while keeping any inner alias names (`type thing =
    // "a" | I32` hovers as `"a" | I32`) — otherwise it would render its own name.
    const aliasDepth = occ.binding.kind === "type" ? 1 : 0;
    return {
      contents: {
        kind: "markdown",
        value: docMarkdown(
          `${occ.binding.name}: ${
            stringifyType(occ.binding.type, new Set(), aliasDepth)
          }`,
          VL_LANGUAGE_ID,
          occ.binding.doc,
          docResolver,
        ),
      },
    };
  }

  // Member-aware hover: when the cursor is on the `.member` half of a
  // `receiver.member` (`o.x`, `xs.get`, `s.length`) — which is NOT a symbol-table
  // binding — locate the member-access AST node, type its receiver, and render
  // the resolved member type. Driven by the public AST node spans (`.spans`) +
  // the checker's member typing (one mechanism shared with semantic tokens).
  const { ast: checkedAst, spans } = checkOnly(document.getText());
  if (checkedAst && spans) {
    const member = resolveMemberAt(checkedAst, spans, toVLPosition(params.position));
    if (member) {
      return {
        contents: hoverMarkdown(`${member.name}: ${stringifyType(member.type)}`),
      };
    }
  }

  const word = wordAt(lineText, params.position.character);
  if (!word) return null;

  // An imported name resolves through the graph-seeded scope first (its REAL
  // type), then through the program scope (builtins + top-level names). The
  // single-file `compile`/`checkOnly` AST scope doesn't carry imports, so the
  // seeded `importedScope` is consulted explicitly here.
  const importedType = importedScope[word];
  if (importedType) {
    return { contents: hoverMarkdown(`${word}: ${stringifyType(importedType)}`) };
  }
  const { ast } = checkOnly(document.getText());
  const type = ast?.scope[word];
  if (!type) return null;

  return {
    contents: hoverMarkdown(`${word}: ${stringifyType(type)}`),
  };
});

// Inlay hints (D6): for every declaration that *lacks* a visible annotation,
// surface the inferred type after the identifier (`x: i32`) — the headline
// feature for a language that otherwise hides its types. Driven by the symbol
// table (see `deriveInlayHints`); honours the request's `range`.
connection.languages.inlayHint.on((params): InlayHint[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const text = doc.getText();
  const symbols = parseSymbols(text);
  const range: LspRange = params.range;
  // Pass the source so annotated declarations are suppressed — only *inferred*
  // positions are hinted, never an annotation the user already wrote.
  return deriveInlayHints(symbols, stringifyType, range, text).map((h) => ({
    position: { line: h.line, character: h.char },
    label: h.label, // `: <type>`
    kind: InlayHintKind.Type,
    paddingLeft: true, // keep it unobtrusive: a space before `: type`
  }));
});

// Semantic tokens (D5): richer, semantically-accurate highlighting beyond the
// TextMate grammar. Identifiers are classified by their resolved binding kind
// (local vs parameter vs function vs type) via the D2 symbol table — something a
// grammar can't tell apart — and merged with a lexical pass over the token
// stream for literals/keywords/operators plus recovered `//` comments. The
// `data` array is the delta-encoded form LSP mandates (see `semanticTokensData`).
connection.languages.semanticTokens.on((params): SemanticTokens => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return { data: [] };
  const text = doc.getText();
  const { tokens } = tokenize(text);
  // `checkOnly` (synchronous, binaryen-free) gives the symbol table AND the AST
  // node spans, so member names (`o.x`, `xs.get`) get `property`/`method` tokens
  // alongside the binding-classified identifiers.
  const { symbols, ast, spans } = checkOnly(text);
  return { data: semanticTokensData(symbols, tokens, text, ast, spans) };
});

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

// Completion (D3): scope-aware identifier suggestions everywhere, structural
// member suggestions after `.`, plus keyword and snippet completions for
// statement-position typing. Driven by the pure helpers in `typeFeatures.ts`
// over the compiler's symbol table + program scope (which folds in builtins).
connection.onCompletion(async (params): Promise<CompletionItem[]> => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const text = doc.getText();
  const vlPos = toVLPosition(params.position);

  // The text on the current line up to the cursor — to detect a `.` trigger and
  // find the receiver name before it.
  const linePrefix = doc.getText({
    start: { line: params.position.line, character: 0 },
    end: params.position,
  });

  // Module-aware: seed the parse with imported names' resolved types so imported
  // names appear as completions with their real types (and resolve as receivers).
  const importedScope = await importedScopeFor(params.textDocument.uri, text);
  const symbols = parseSymbolsSeeded(text, importedScope);
  // D7: build the doc-comment resolver once for all completion items in this
  // request — identifier completions carry `///` docs that may contain xrefs.
  // H0 phase 3: imported names link cross-file to their exporting sibling.
  const importedSources = await importedNameSources(
    text,
    entryKeyOf(params.textDocument.uri),
    workspaceReader,
  );
  const docResolver = buildDocRefResolver(
    symbols,
    params.textDocument.uri,
    importedSources,
  );
  const charBeforeCursor = linePrefix[linePrefix.length - 1];

  // Member completion: cursor follows `<receiver>.`. Only the simple `name.`
  // receiver is resolved (see `receiverObjectType` / the D3 report); a more
  // complex receiver yields no member suggestions rather than wrong ones.
  // Keywords and snippets are suppressed after `.` (never valid as member names).
  if (charBeforeCursor === ".") {
    const receiver = wordEndingBefore(linePrefix, linePrefix.length - 1);
    if (!receiver) return [];
    const { ast } = checkOnly(text);
    if (!ast) return [];
    // Fold imported names in so an imported object can be a member receiver.
    const scope = { ...ast.scope, ...importedScope };
    const objectType = receiverObjectType(receiver, symbols, vlPos, scope);
    if (!objectType) return [];
    // Member completions don't carry source `///` docs (no source binding), so
    // passing the resolver is a no-op but keeps the call shape consistent.
    return memberCompletions(objectType, stringifyType).map((c) =>
      toCompletionItem(c, docResolver)
    );
  }

  // Identifier completion: in-scope names + builtins. `ast.scope` carries the
  // builtins (from `defaultScope`) plus top-level names; user bindings from the
  // symbol table override same-named builtins inside `identifierCompletions`.
  // Keyword and snippet completions are appended for statement-position typing.
  const { ast } = checkOnly(text);
  // Fold imported names into the completion scope so they're suggested with
  // their real types alongside builtins + top-level names.
  const builtins = { ...(ast?.scope ?? {}), ...importedScope };
  const identifiers = identifierCompletions(symbols, vlPos, builtins, stringifyType)
    .map((c) => toCompletionItem(c, docResolver));
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
  let formatted: string;
  try {
    formatted = format(text);
  } catch {
    return [];
  }
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
  connection.console.log(
    `[Server(${process.pid}) ${workspaceFolder}] Started and initialize received`,
  );
  // `vital.checker` rides initializationOptions (static per session — the
  // extension passes the workspace config at client start). A requested wasm
  // checker that cannot load (no seed, no WasmGC in this host) degrades to
  // `"ts"` after one log line.
  const opts = (params.initializationOptions ?? {}) as {
    checker?: string;
    compilerWasm?: string;
  };
  if (opts.checker === "wasm" || opts.checker === "both") {
    const root = params.rootUri ? uriToPath(params.rootUri) : "";
    const wasmPath = opts.compilerWasm ||
      join(root, "build", "vl-compiler.wasm");
    wasmChecker = loadWasmChecker(
      wasmPath,
      (msg) => connection.console.log(msg),
    );
    checkerMode = wasmChecker !== undefined ? opts.checker : "ts";
  }
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
