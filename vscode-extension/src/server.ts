import { inspect } from "node:util";
import {
  createConnection,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  CharStream,
  CommonTokenStream,
  ErrorListener,
  RecognitionException,
  Recognizer,
  Token,
} from "antlr4";
import VLLexer from "./antlr/VL_Lexer.ts";
import VLParser from "./antlr/VL_Parser.ts";
import { toAST } from "./toAST.ts";

declare const process: NodeJS.Process;

// Creates the LSP connection
const connection = createConnection(ProposedFeatures.all);

// Create a manager for open text documents
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// The workspace folder this server is operating on
let workspaceFolder: string | null;

class VLErrorListener<T> extends ErrorListener<T> {
  constructor(
    readonly diagnostic: (diagnostic: Diagnostic) => void,
    readonly getText: (symbol: T) => string,
  ) {
    super();
  }

  override syntaxError(
    _recognizer: Recognizer<T>,
    offendingSymbol: T | null,
    line: number,
    character: number,
    msg: string,
    _e: RecognitionException | undefined,
  ): void {
    const message = offendingSymbol != null
      ? `Syntax error at ${this.getText(offendingSymbol)}: ${msg}`
      : `Syntax error: ${msg}`;
    if (msg.includes("token reco")) {
      console.log(_e);
    }
    this.diagnostic({
      message,
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: line - 1, character },
        end: { line: line - 1, character: character + 1 },
      },
    });
  }
}

export const parse = (code: string) => {
  const chars = new CharStream(code);
  const lexer = new VLLexer(chars);
  const diagnostics: Diagnostic[] = [];
  lexer.removeErrorListeners();
  lexer.addErrorListener(
    new VLErrorListener((d) => diagnostics.push(d), (s) => s.toString()),
  );
  const tokens = new CommonTokenStream(lexer);
  const parser = new VLParser(tokens);
  parser.removeErrorListeners();
  parser.addErrorListener(
    new VLErrorListener<Token>((d) => diagnostics.push(d), (s) => s.text),
  );
  return [parser.program(), diagnostics] as const;
};

documents.onDidChangeContent((event) => {
  connection.console.log(
    `[Server(${process.pid}) ${workspaceFolder}] Document changed: ${event.document.uri}`,
  );
  const [program, diagnostics] = parse(event.document.getText());

  console.log(
    inspect(toAST(program), { depth: Infinity, compact: true }),
  );

  connection.sendDiagnostics({
    uri: event.document.uri,
    version: event.document.version,
    diagnostics,
  });
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
      workspace: { workspaceFolders: { supported: true } },
    },
  };
});
connection.listen();
