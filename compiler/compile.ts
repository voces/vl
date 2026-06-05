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

import Binaryen from "binaryen";
import type { Context, ParseErrors, VLProgramNode, VLType } from "./ast.ts";
import { tokenize } from "./lexer.ts";
import { parseProgram } from "./parser.ts";
import { toWasm } from "./toWasm.ts";
import { defaultScope } from "./defaultScope.ts";

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

// A source span (`Context`) carries 1-based lines / 0-based columns, with `stop`
// one past the last character. Diagnostics use 0-based lines, so shift here.
export const rangeFromCtx = (ctx: Context): VLRange => ({
  start: { line: ctx.start.line - 1, character: ctx.start.column },
  end: { line: ctx.stop.line - 1, character: ctx.stop.column },
});

export const stringifyType = (type: VLType, seen: Set<VLType> = new Set()): string => {
  if (type.type === "Alias") return type.name;
  if (type.type === "Union") {
    return type.subTypes.map((t) => stringifyType(t, seen)).join(" | ");
  }
  if (type.type === "Nullable") {
    return `${stringifyType(type.subType, seen)} | null`;
  }
  if (type.type === "Intersection") {
    return type.subTypes.map((t) => stringifyType(t, seen)).join(" & ");
  }
  if (type.type === "Negation") return `not ${stringifyType(type.subType, seen)}`;
  if (type.type === "Object") {
    // Cycle guard: a recursive structural type can be a cyclic object graph
    // (`Tree` whose field is `Tree`). Render a re-encountered object as `…`
    // rather than recursing forever (A11). Named/aliased recursion already
    // stops at the `Alias` leaf above; this covers a fully-expanded graph.
    if (seen.has(type)) return type.name ?? "…";
    seen = new Set(seen).add(type);
    if (type.name) return type.name;
    if (
      type.properties.length === 1 &&
      type.properties[0].name.type === "Alias" &&
      type.properties[0].name.name === "number"
    ) return `${stringifyType(type.properties[0].type, seen)}[]`;
    return `{${
      type.properties.map((p) =>
        `${stringifyType(p.name, seen).replace(/^"(.*)"$/, "$1")}: ${
          stringifyType(p.type, seen)
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
      type.paramaters.map((p) =>
        `${p.name}: ${stringifyType(p.paramaterType, seen)}`
      )
        .join(", ")
    }): ${stringifyType(type.return, seen)}`;
  }
  if (type.type === "Type") return `T<${stringifyType(type.subType, seen)}>`;
  if (type.type === "Infer") return `I<${stringifyType(type.subType, seen)}>`;
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
      return {
        ...base,
        severity: error.severity ?? "error",
        message: error.message,
      };
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
  const { tokens, diagnostics } = tokenize(source);
  const [ast, errors] = parseProgram(tokens, defaultScope());
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

/**
 * Render compiled wasm bytes as WAT text (used by `vl build --wat`). Reads the
 * binary back through binaryen and emits its textual form — `toWasm` only hands
 * out bytes, so this is the thin module-exposing variant. Pure binaryen, no
 * runtime globals, so the core stays runtime-agnostic.
 */
export const wasmToWat = async (wasm: Uint8Array): Promise<string> => {
  // Mirror toWasm's tolerance of both binaryen forms (sync object / async init).
  // deno-lint-ignore no-explicit-any
  const _Binaryen = Binaryen as any;
  const binaryen = typeof _Binaryen === "function"
    ? await _Binaryen()
    : _Binaryen;
  const m = binaryen.readBinary(wasm);
  try {
    return m.emitText();
  } finally {
    m.dispose();
  }
};

export type RunResult = { logs: string[] };

/**
 * Instantiate compiled wasm with a memory + `__log__` import, capturing each
 * `__log__` call as a formatted line. Mirrors the tagged-value decoding.
 */
export const runWasm = async (wasm: Uint8Array): Promise<RunResult> => {
  const logs: string[] = [];
  // Accumulates code points streamed by `__print_char__` until `__print_str_flush__`.
  const printChars: number[] = [];
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536 });
  await WebAssembly.instantiate(wasm, {
    imports: {
      memory,
      // Read `length` raw bytes at `offset` and render them as a UTF-8 string
      // (the byte form a `__store_string__` writes from a GC string).
      __log_string__: (offset: number, length: number) => {
        logs.push(
          new TextDecoder().decode(
            new Uint8Array(memory.buffer, offset, length),
          ),
        );
      },
      __log__: (offset: number, length: number) => {
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
      // Direct value sinks for the `print(x)` builtin. A wasm i64 arrives as a
      // JS bigint; the rest as numbers. Booleans render as `true`/`false`.
      __print_i32__: (v: number) => logs.push(String(v)),
      __print_i64__: (v: bigint) => logs.push(v.toString()),
      __print_f32__: (v: number) => logs.push(String(v)),
      __print_f64__: (v: number) => logs.push(String(v)),
      __print_bool__: (v: number) => logs.push(v ? "true" : "false"),
      // A string prints by streaming its code points (no shared memory); flush
      // assembles and emits the accumulated line.
      __print_char__: (code: number) => printChars.push(code),
      __print_str_flush__: () => {
        logs.push(String.fromCodePoint(...printChars));
        printChars.length = 0;
      },
    },
  });
  return { logs };
};
