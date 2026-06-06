import {
  createConnection,
  Diagnostic,
  DiagnosticSeverity,
  Hover,
  Location,
  Position,
  ProposedFeatures,
  Range,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  compile,
  parseSymbols,
  rangeFromCtx,
  stringifyType,
  VLDiagnostic,
  VLSeverity,
} from "../../compiler/compile.ts";
import type { Context } from "../../compiler/ast.ts";

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
};

const toLspDiagnostic = (d: VLDiagnostic): Diagnostic => ({
  message: d.message,
  severity: severityMap[d.severity],
  range: d.range,
  code: d.code,
  source: d.source,
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
    return {
      contents: {
        kind: "markdown",
        value: `\`${occ.binding.name}: ${stringifyType(occ.binding.type)}\``,
      },
    };
  }

  const word = wordAt(lineText, params.position.character);
  if (!word) return null;

  const { ast } = await compile(document.getText());
  const type = ast?.scope[word];
  if (!type) return null;

  return {
    contents: {
      kind: "markdown",
      value: `\`${word}: ${stringifyType(type)}\``,
    },
  };
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
      definitionProvider: true,
      referencesProvider: true,
      hoverProvider: true,
      workspace: { workspaceFolders: { supported: true } },
    },
  };
});

connection.listen();
