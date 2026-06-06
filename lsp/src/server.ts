import {
  CompletionItem,
  CompletionItemKind,
  createConnection,
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticTag,
  Hover,
  InlayHint,
  InlayHintKind,
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
  compile,
  parseSymbols,
  rangeFromCtx,
  stringifyType,
  VLDiagnostic,
  VLDiagnosticTag,
  VLSeverity,
} from "../../compiler/compile.ts";
import { format } from "../../compiler/format.ts";
import type { Context } from "../../compiler/ast.ts";
import { tokenize } from "../../compiler/lexer.ts";
import {
  type Completion,
  type CompletionKind,
  deriveInlayHints,
  docMarkdown,
  identifierCompletions,
  type LspRange,
  memberCompletions,
  receiverObjectType,
  resolveMemberAt,
  SEMANTIC_TOKEN_LEGEND,
  semanticTokensData,
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

// The workspace folder this server is operating on
let workspaceFolder: string | null;

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

const toLspDiagnostic = (d: VLDiagnostic): Diagnostic => ({
  message: d.message,
  severity: severityMap[d.severity],
  range: d.range,
  code: d.code,
  source: d.source,
  // `unnecessary` → VS Code dims/greys the span (unused/unreachable code).
  tags: d.tags?.map((t) => tagMap[t]),
});

documents.onDidChangeContent(async (event) => {
  connection.console.log(
    `[Server(${process.pid}) ${workspaceFolder}] Document changed: ${event.document.uri}`,
  );

  // Diagnostics only — running a program is explicit (the `vital.runFile`
  // command / Ctrl+F5), never a side effect of editing. (Auto-running on every
  // change executed arbitrary program logic on each keystroke — e.g. an infinite
  // loop would hang the server.)
  const { diagnostics } = await compile(event.document.getText());

  connection.sendDiagnostics({
    uri: event.document.uri,
    version: event.document.version,
    diagnostics: diagnostics.map(toLspDiagnostic),
  });
});

// LSP positions are 0-based line / 0-based character; VL's `Position` (and the
// spans in the symbol table) are 1-based line / 0-based column. Bridge here.
const toVLPosition = (p: Position) => ({ line: p.line + 1, column: p.character });
const ctxToRange = (ctx: Context): Range => rangeFromCtx(ctx);

// Go-to-definition: map the cursor to the binding it lands on, return that
// binding's declaring span (D2). Single-document; cross-file is out of scope.
connection.onDefinition((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const symbols = parseSymbols(doc.getText());
  const decl = symbols.definitionAt(toVLPosition(params.position));
  if (!decl) return null;
  return Location.create(params.textDocument.uri, ctxToRange(decl));
});

// Find-references: every occurrence (declaration + uses) of the binding under
// the cursor, within this document.
connection.onReferences((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const symbols = parseSymbols(doc.getText());
  const spans = symbols.referencesAt(
    toVLPosition(params.position),
    params.context?.includeDeclaration ?? true,
  );
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
  const symbols = parseSymbols(document.getText());
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
    // undocumented bindings hover exactly as before.
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

  const { ast } = await compile(document.getText());
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
// "type". Locals/params are `Variable`; callables are `Function`.
const completionKind: Record<CompletionKind, CompletionItemKind> = {
  variable: CompletionItemKind.Variable,
  parameter: CompletionItemKind.Variable,
  function: CompletionItemKind.Function,
  type: CompletionItemKind.Struct,
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
const toCompletionItem = (c: Completion): CompletionItem => {
  const item: CompletionItem = { label: c.name, kind: completionKind[c.kind] };
  if (c.detail !== undefined) {
    item.labelDetails = { detail: typeLabelDetail(c.detail) };
  }
  if (c.detail !== undefined || (c.doc && c.doc.trim() !== "")) {
    item.documentation = {
      kind: MarkupKind.Markdown,
      value: docMarkdown(c.detail ?? "", VL_LANGUAGE_ID, c.doc),
    };
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

// Completion (D3): scope-aware identifier suggestions everywhere, and structural
// member suggestions after `.`. Driven by the pure helpers in `typeFeatures.ts`
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

  const symbols = parseSymbols(text);
  const charBeforeCursor = linePrefix[linePrefix.length - 1];

  // Member completion: cursor follows `<receiver>.`. Only the simple `name.`
  // receiver is resolved (see `receiverObjectType` / the D3 report); a more
  // complex receiver yields no member suggestions rather than wrong ones.
  if (charBeforeCursor === ".") {
    const receiver = wordEndingBefore(linePrefix, linePrefix.length - 1);
    if (!receiver) return [];
    const { ast } = await compile(text);
    if (!ast) return [];
    const objectType = receiverObjectType(receiver, symbols, vlPos, ast.scope);
    if (!objectType) return [];
    return memberCompletions(objectType, stringifyType).map(toCompletionItem);
  }

  // Identifier completion: in-scope names + builtins. `ast.scope` carries the
  // builtins (from `defaultScope`) plus top-level names; user bindings from the
  // symbol table override same-named builtins inside `identifierCompletions`.
  const { ast } = await compile(text);
  const builtins = ast?.scope ?? {};
  return identifierCompletions(symbols, vlPos, builtins, stringifyType)
    .map(toCompletionItem);
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

documents.listen(connection);

connection.onInitialize((params) => {
  workspaceFolder = params.rootUri;
  connection.console.log(
    `[Server(${process.pid}) ${workspaceFolder}] Started and initialize received`,
  );
  return {
    capabilities: {
      textDocumentSync: {
        openClose: true,
        change: TextDocumentSyncKind.Full,
      },
      completionProvider: {
        // `.` re-triggers completion so member suggestions appear right after a
        // property access; ordinary identifier completion fires on typing too.
        triggerCharacters: ["."],
      },
      definitionProvider: true,
      referencesProvider: true,
      documentFormattingProvider: true,
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
