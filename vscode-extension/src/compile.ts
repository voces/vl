// Headless compiler core — no editor/LSP dependencies.
//
// This is the single source of truth shared by the LSP server, the CLI, the
// browser playground, and the test suite. It exposes:
//   - compile(source) -> { ast, diagnostics, wasm }
//   - runWasm(wasm)   -> { logs }   (instantiate + capture `log` output)
//   - stringifyType / rangeFromCtx  (diagnostic rendering helpers)
//
// Diagnostics use a neutral, LSP-agnostic shape (VLDiagnostic). The LSP server
// adapts these to vscode-languageserver Diagnostics; everyone else consumes
// them directly.

import { ParserRuleContext, TerminalNode } from "antlr4";
import {
  CharStream,
  CommonTokenStream,
  ErrorListener,
  RecognitionException,
  Recognizer,
  Token,
} from "antlr4";
import VLLexer from "./antlr/VL_Lexer.ts";
import VLParser, { ProgramContext } from "./antlr/VL_Parser.ts";
import { ParseErrors, toAST, VLProgramNode, VLType } from "./toAST.ts";
import { toWasm } from "./toWasm.ts";
import { defaultScope } from "./defaultScope.ts";

type Context = ParserRuleContext | TerminalNode;

export type VLSeverity = "error" | "warning" | "info";
export type VLPosition = { line: number; character: number };
export type VLRange = { start: VLPosition; end: VLPosition };
export type VLDiagnostic = {
  message: string;
  severity: VLSeverity;
  range: VLRange;
  code?: string | number;
  source: "vital";
};

export type CompileResult = {
  /** undefined only if parsing/AST construction threw catastrophically. */
  ast: VLProgramNode | undefined;
  diagnostics: VLDiagnostic[];
  /** Present only when there are no error diagnostics. */
  wasm: Uint8Array | undefined;
};

class VLErrorListener<T> extends ErrorListener<T> {
  constructor(
    readonly diagnostic: (diagnostic: VLDiagnostic) => void,
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
    this.diagnostic({
      message,
      severity: "error",
      source: "vital",
      range: {
        start: { line: line - 1, character },
        end: { line: line - 1, character: character + 1 },
      },
    });
  }
}

/** Lex + parse, collecting syntax diagnostics. */
export const parse = (
  code: string,
): { tree: ProgramContext; diagnostics: VLDiagnostic[] } => {
  const chars = new CharStream(code);
  const lexer = new VLLexer(chars);
  const diagnostics: VLDiagnostic[] = [];
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
  return { tree: parser.program(), diagnostics };
};

export const rangeFromCtx = (ctx: Context): VLRange => {
  if (ctx instanceof TerminalNode) {
    return {
      start: { line: ctx.symbol.line - 1, character: ctx.symbol.column },
      end: {
        line: ctx.symbol.line - 1,
        character: ctx.symbol.column + (ctx.symbol.stop - ctx.symbol.start) + 1,
      },
    };
  }
  const stop = ctx.stop ?? ctx.start;
  return {
    start: { line: ctx.start.line - 1, character: ctx.start.column },
    end: {
      line: stop.line - 1,
      character: stop.column + (stop.stop - stop.start) + 1,
    },
  };
};

export const stringifyType = (type: VLType): string => {
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
      ).join(", ")
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
  if (type.type === "Unknown") return "any";
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

/** Map a semantic (toAST) error to a neutral diagnostic. */
const diagnosticFromError = (error: ParseErrors): VLDiagnostic => {
  const base = {
    severity: "error" as const,
    range: rangeFromCtx(error.ctx),
    code: error.code,
    source: "vital" as const,
  };
  switch (error.type) {
    case "Redeclaration":
      return { ...base, message: `Syntax error: redeclared ${error.name}` };
    case "Undeclared":
      return { ...base, message: `Syntax error: undeclared ${error.name}` };
    case "Type":
      return {
        ...base,
        message: `Type error: expected ${stringifyType(error.left)}, got ${
          stringifyType(error.right)
        }`,
      };
    case "UnmatchedParameter":
      return { ...base, message: `Type error: unmatched parameter` };
    case "Syntax":
      return { ...base, message: error.message };
    case "Property":
      return {
        ...base,
        message: `Unknown property \`${
          stringifyType(error.property).replace(/^"(.*)"$/, "$1")
        }\``,
      };
    default: {
      const exhaustive: never = error;
      return {
        ...base,
        message: `Unhandled error: ${JSON.stringify(exhaustive)}`,
      };
    }
  }
};

/**
 * Full pipeline: source -> diagnostics (+ wasm when clean). Codegen only runs
 * when there are no error diagnostics, matching the LSP's behavior. A codegen
 * throw is surfaced as a diagnostic rather than escaping.
 */
export const compile = async (source: string): Promise<CompileResult> => {
  const { tree, diagnostics } = parse(source);
  const [ast, errors] = toAST(tree, defaultScope());
  for (const error of errors) diagnostics.push(diagnosticFromError(error));

  let wasm: Uint8Array | undefined;
  if (!diagnostics.some((d) => d.severity === "error")) {
    try {
      wasm = await toWasm(ast);
    } catch (err) {
      diagnostics.push({
        message: `Codegen error: ${
          err instanceof Error ? err.message : String(err)
        }`,
        severity: "error",
        source: "vital",
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
      });
    }
  }

  return { ast, diagnostics, wasm };
};

export type RunResult = { logs: string[] };

/**
 * Instantiate compiled wasm with a memory + `log` import, capturing each `log`
 * call as a formatted line. Mirrors the tagged-value decoding the LSP uses.
 */
export const runWasm = async (wasm: Uint8Array): Promise<RunResult> => {
  const logs: string[] = [];
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536 });
  await WebAssembly.instantiate(wasm, {
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
            args.push(new Float32Array(memory.buffer, offset + i * 4, 1)[0]);
          } else if (view[i] === 3) {
            const swap = new Int32Array(2);
            swap[0] = view[++i];
            swap[1] = view[++i];
            args.push(new Float64Array(swap.buffer, 0, 1)[0]);
          } else args.push(view[++i]);
        }
        logs.push(args.map((a) => a.toString()).join(" "));
      },
    },
  });
  return { logs };
};
