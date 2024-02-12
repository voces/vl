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
import { toWasm } from "./toWasm.ts";
import { defaultScope } from "./defaultScope.ts";

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
    if (type.name) return type.name;
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
  if (type.type === "IntegerLiteral") return type.value.toString();
  if (type.type === "RealLiteral") {
    return Number.isInteger(type.value)
      ? `${type.value.toString()}.0`
      : type.value.toString();
  }
  if (type.type === "BooleanLiteral") return type.value.toString();
  if (type.type === "Unknown") return "any"; // Was null, changed to any for when doing "string".bar
  if (type.type === "Never") return "never";
  if (type.type === "Function") {
    return `(${
      type.paramaters.map((p) => `${p.name}: ${stringifyType(p.paramaterType)}`)
        .join(", ")
    }): ${stringifyType(type.return)}`;
  }
  if (type.type === "Type") return `T<${stringifyType(type.subType)}>`;
  if (type.type === "Infer") return `I<${stringifyType(type.subType)}>`;
  if (type.type === "Custom") return type.validate.toString();
  const exhaustive: never = type;
  return exhaustive;
};

documents.onDidChangeContent(async (event) => {
  connection.console.log(
    `[Server(${process.pid}) ${workspaceFolder}] Document changed: ${event.document.uri}`,
  );
  const [program, diagnostics] = parse(event.document.getText());

  const [ast, errors] = toAST(program, defaultScope());

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

  if (!diagnostics.length) {
    try {
      const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536 });
      await WebAssembly.instantiate(
        await toWasm(ast),
        {
          imports: {
            memory,
            log: (offset: number, length: number) => {
              const view = new Int32Array(memory.buffer, offset, length / 4);
              const args: (number | bigint)[] = [];
              for (let i = 0; i < length / 4; i++) {
                if (view[i] === 1) {
                  const low = BigInt(view[++i]) & BigInt(0xFFFFFFFF);
                  const high = BigInt(view[++i]) << BigInt(32);
                  args.push(high | low);
                } else if (view[i] === 2) {
                  i++;
                  args.push(
                    new Float32Array(memory.buffer, offset + i * 4, 1)[0],
                  );
                } else if (view[i] === 3) {
                  const swap = new Int32Array(2);
                  swap[0] = view[++i];
                  swap[1] = view[++i];
                  args.push(new Float64Array(swap.buffer, 0, 1)[0]);
                } // 0 and fallback
                else args.push(view[++i]);
              }
              console.log(...args);
            },
          },
        },
      );
      // console.log(module.instance.exports);
    } catch (err) {
      console.error(err);
    }
  }

  // console.log(inspect(ast, { depth: Infinity, compact: true }));

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
