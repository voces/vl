import { inspect } from "node:util";
import { ParserRuleContext, TerminalNode } from "antlr4";
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
import { toAST, VLType } from "./toAST.ts";

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

const parse = (code: string) => {
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

const rangeFromCtx = (ctx: ParserRuleContext | TerminalNode) => {
  if (ctx instanceof TerminalNode) {
    return {
      start: {
        line: ctx.symbol.line - 1,
        character: ctx.symbol.column,
      },
      end: {
        line: ctx.symbol.line - 1,
        character: ctx.symbol.column + (ctx.symbol.stop - ctx.symbol.start) + 1,
      },
    };
  }

  const stop = ctx.stop ?? ctx.start;
  return {
    start: {
      line: ctx.start.line - 1,
      character: ctx.start.column,
    },
    end: {
      line: stop.line - 1,
      character: stop.column + (stop.stop - stop.start) + 1,
    },
  };
};

const stringifyType = (type: VLType): string => {
  if (type.type === "Alias") return type.name;
  if (type.type === "Union") {
    return type.subTypes.map((t) => stringifyType(t)).join(" | ");
  }
  if (type.type === "Nullable") return `${stringifyType(type.subType)} | null`;
  if (type.type === "Object") {
    if (
      type.properties.length === 1 &&
      type.properties[0].name.type === "Alias" &&
      type.properties[0].name.name === "number"
    ) return `${stringifyType(type.properties[0].type)}[]`;
    return `{${
      type.properties.map((p) =>
        `${stringifyType(p.name).replace(/^"(.*)"$/, "$1")}: ${
          stringifyType(p.type)
        }`
      ).join(
        ", ",
      )
    }}`;
  }
  if (type.type === "StringLiteral") return `"${type.value}"`;
  if (type.type === "NumberLiteral") return type.value.toString();
  if (type.type === "BooleanLiteral") return type.value.toString();
  if (type.type === "Unknown") return "any"; // Was null, changed to any for when doing "string".bar
  if (type.type === "Never") return "never";
  if (type.type === "Function") {
    return `(${
      type.paramaters.map((p) => `${p.name}: ${stringifyType(p.paramaterType)}`)
        .join(", ")
    }): ${stringifyType(type.return)}`;
  }
  if (type.type === "Type") return `<${stringifyType(type.subType)}>`;
  const exhaustive: never = type;
  return exhaustive;
};

documents.onDidChangeContent((event) => {
  connection.console.log(
    `[Server(${process.pid}) ${workspaceFolder}] Document changed: ${event.document.uri}`,
  );
  const [program, diagnostics] = parse(event.document.getText());

  const [ast, errors] = toAST(program);

  for (const error of errors) {
    switch (error.type) {
      case "Redeclaration":
        diagnostics.push({
          message: `Syntax error: redeclared ${error.name}`,
          severity: DiagnosticSeverity.Error,
          range: rangeFromCtx(error.ctx),
          code: error.code,
          source: "vital",
        });
        break;
      case "Undeclared":
        diagnostics.push({
          message: `Syntax error: undeclared ${error.name}`,
          severity: DiagnosticSeverity.Error,
          range: rangeFromCtx(error.ctx),
          code: error.code,
          source: "vital",
        });
        break;
      case "Type":
        diagnostics.push({
          message: `Type error: expected ${stringifyType(error.left)}, got ${
            stringifyType(error.right)
          }`,
          severity: DiagnosticSeverity.Error,
          range: rangeFromCtx(error.ctx),
          code: error.code,
          source: "vital",
        });
        break;
      case "UnmatchedParameter":
        diagnostics.push({
          message: `Type error: unmatched parameter`,
          severity: DiagnosticSeverity.Error,
          range: rangeFromCtx(error.ctx),
          code: error.code,
          source: "vital",
        });
        break;
      case "Syntax":
        diagnostics.push({
          message: error.message,
          severity: DiagnosticSeverity.Error,
          range: rangeFromCtx(error.ctx),
          code: error.code,
          source: "vital",
        });
        break;
      case "Property":
        diagnostics.push({
          message: `Unknown property \`${
            stringifyType(error.property).replace(/^"(.*)"$/, "$1")
          }\``,
          severity: DiagnosticSeverity.Error,
          range: rangeFromCtx(error.ctx),
          code: error.code,
          source: "vital",
        });
        break;
      default: {
        const exhaustive: never = error;
        console.warn(`Unhandled AST error: ${exhaustive}`);
      }
    }
  }

  console.log(inspect(ast, { depth: Infinity, compact: true }));

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
