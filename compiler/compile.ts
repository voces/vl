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

import type {
  Context,
  NodeSpans,
  ParseErrors,
  VLProgramNode,
  VLType,
} from "./ast.ts";
import type { Comment } from "./lexer.ts";
import { tokenize } from "./lexer.ts";
import { parseProgram } from "./parser.ts";
import { defaultScope } from "./defaultScope.ts";
import { SymbolTable } from "./symbols.ts";
import { lint } from "./lint.ts";

// NOTE: binaryen is NOT imported statically here. A top-level `import Binaryen
// from "binaryen"` would be evaluated whenever this module loads, dragging the
// whole wasm toolchain into every consumer — including the codegen-free `check`
// path and the LSP, which only need diagnostics/symbols. Instead `toWasm.ts`
// (which owns the binaryen import) is loaded via dynamic `import()` only when
// codegen actually runs (see `compile`), and binaryen itself is loaded lazily
// inside `wasmToWat`. This keeps `checkOnly` (and `vl check`) entirely
// binaryen-free. esbuild handles the dynamic import when bundling the LSP.

export type { Binding, BindingKind, SymbolOccurrence } from "./symbols.ts";
export { SymbolTable } from "./symbols.ts";
export type { Comment } from "./lexer.ts";

export type VLSeverity = "error" | "warning" | "info";
export type VLPosition = { line: number; character: number };
export type VLRange = { start: VLPosition; end: VLPosition };
// LSP diagnostic tags (LSP `DiagnosticTag`): `unnecessary` renders the span
// faded/greyed out (VS Code dims unused/unreachable code rather than only
// squiggling it); `deprecated` strikes it through. The lint pass tags
// unused-variable / unreachable-code as `unnecessary`.
export type VLDiagnosticTag = "unnecessary" | "deprecated";
export type VLDiagnostic = {
  message: string;
  severity: VLSeverity;
  range: VLRange;
  code?: string | number;
  source: "vital";
  tags?: VLDiagnosticTag[];
};

export type CompileResult = {
  /** undefined only if parsing/AST construction threw catastrophically. */
  ast: VLProgramNode | undefined;
  diagnostics: VLDiagnostic[];
  /** Present only when there are no error diagnostics. */
  wasm: Uint8Array | undefined;
  /**
   * Symbol/binding table for the document (go-to-definition, find-references —
   * roadmap D2). Always present; empty if nothing resolved. Query by cursor
   * position; spans use the same 1-based-line / 0-based-column `Position`
   * convention as `Context` (shift to LSP 0-based with `rangeFromCtx`).
   */
  symbols: SymbolTable;
  /**
   * Source spans for AST nodes, keyed by node identity (Track G). Query with
   * `spanOf(spans, node)` (re-exported from `./toAST.ts`). Lets AST consumers —
   * a formatter, inlay-hint `annotated` flags, doc-comment cross-refs — recover
   * any node's source extent. `undefined` only if AST construction threw (same
   * condition as `ast`).
   */
  spans: NodeSpans | undefined;
  /**
   * Every source comment (trivia), in source order, each with its span and `kind`
   * (`"line"` for `//`, `"doc"` for `///`). Comments are NOT AST nodes — they are
   * retained out of the token stream (see `lexer.ts`) — so an AST→source printer
   * (Track G) places them by position: each comment's span, paired with node
   * spans from `spans`, tells the printer which node a comment leads/trails and
   * whether it sits on its own line or after code. The per-token
   * `leadingComments`/`trailingComments` carry the same `Comment` objects by
   * identity for consumers that walk tokens. Empty when the source has none.
   */
  comments: Comment[];
};

// A source span (`Context`) carries 1-based lines / 0-based columns, with `stop`
// one past the last character. Diagnostics use 0-based lines, so shift here.
export const rangeFromCtx = (ctx: Context): VLRange => ({
  start: { line: ctx.start.line - 1, character: ctx.start.column },
  end: { line: ctx.stop.line - 1, character: ctx.stop.column },
});

// Re-escape a string-literal type's value for display: literal values are now
// decoded by the lexer (`"a\nb"` holds a real newline), so rendering them raw in
// hover/diagnostics would emit literal control chars. Mirror the source spelling.
const escapeStringLiteral = (s: string): string => {
  // Char-code loop rather than a control-char regex (avoids deno lint's
  // `no-control-regex` and any literal control bytes in source).
  let out = "";
  for (const c of s) {
    const code = c.charCodeAt(0);
    if (c === "\\") out += "\\\\";
    else if (c === '"') out += '\\"';
    else if (c === "\n") out += "\\n";
    else if (c === "\t") out += "\\t";
    else if (c === "\r") out += "\\r";
    else if (code < 0x20) out += "\\x" + code.toString(16).padStart(2, "0");
    else out += c;
  }
  return out;
};

export const stringifyType = (
  type: VLType,
  seen: Set<VLType> = new Set(),
): string => {
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
  if (type.type === "Negation") {
    return `not ${stringifyType(type.subType, seen)}`;
  }
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
  if (type.type === "StringLiteral") {
    return `"${escapeStringLiteral(type.value)}"`;
  }
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
  // A `Type` node wraps a named type-alias's body (internal bookkeeping for the
  // alias-leaf traversal). For display, render the aliased type itself, not the
  // internal `T<…>` wrapper (`type foo = "ab"` hovers as `"ab"`, not `T<"ab">`).
  if (type.type === "Type") return stringifyType(type.subType, seen);
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

// Render a thrown codegen value as a readable, single-line message. Three cases
// must be handled robustly, all dual-runtime (no Deno/process/Deno.inspect):
//   1. A stack overflow (`RangeError: Maximum call stack size exceeded`) from
//      unguarded recursion — most often the A11 array-element-recursion gap.
//      Surfaced as a clear, actionable line instead of the raw V8 text. We key
//      off the message text (not just `RangeError`) so unrelated RangeErrors
//      keep their own message rather than being mislabeled.
//   2. A real `Error` — use its `.message`.
//   3. A non-`Error` throw. Binaryen's optimizer/validator can throw an opaque
//      internal object (e.g. `{ $B: <ptr> }`), whose `String()` is the useless
//      `[object Object]`. Try `.message`, then `JSON.stringify` (guarded against
//      circular refs / BigInt), falling back to `String()`.
const STACK_OVERFLOW = /maximum call stack size exceeded|stack overflow/i;
const codegenErrorMessage = (err: unknown): string => {
  if (err instanceof Error) {
    if (err instanceof RangeError && STACK_OVERFLOW.test(err.message)) {
      return "compiler recursion limit exceeded (likely an unsupported " +
        "recursive type — e.g. recursion through an array element)";
    }
    return err.message;
  }
  if (typeof err === "object" && err !== null) {
    const maybe = (err as { message?: unknown }).message;
    if (typeof maybe === "string" && maybe !== "") return maybe;
    try {
      return JSON.stringify(err);
    } catch {
      // Circular refs or BigInt make JSON.stringify throw — fall through.
    }
  }
  return String(err);
};

/** Result of the codegen-free front end: AST, diagnostics, and symbols. */
export type CheckResult = {
  ast: VLProgramNode;
  diagnostics: VLDiagnostic[];
  symbols: SymbolTable;
  /** Source spans for AST nodes, keyed by node identity. See `CompileResult`. */
  spans: NodeSpans;
  /** Every source comment, in order, with span + kind. See `CompileResult`. */
  comments: Comment[];
};

/**
 * Front end only, synchronously: tokenize + parse (which resolves scopes,
 * type-checks, and populates the binding table) without running codegen. Returns
 * exactly what `compile` does MINUS the `wasm` — i.e. the shared head of the
 * pipeline. Used by `vl check`, which only needs diagnostics: this path never
 * loads `toWasm.ts`/binaryen, so it stays binaryen-free and synchronous.
 *
 * Trade-off vs `compile`: because codegen does not run, codegen-only diagnostics
 * (the `Codegen error:` line, e.g. the array-element-recursion stack-overflow)
 * are NOT produced here. `check` is a parse/type gate; `build`/`run` still run
 * codegen and surface those errors.
 */
export const checkOnly = (source: string): CheckResult => {
  const { tokens, diagnostics, comments } = tokenize(source);
  const [ast, errors, symbols, spans] = parseProgram(tokens, defaultScope());
  for (const error of errors) diagnostics.push(diagnosticFromError(error));
  // Static lint pass (B17): unused-variable / unreachable-code warnings, derived
  // from the symbol table + AST the front end already produced. Runs even when
  // there are errors — lint warnings are independent of codegen and useful while
  // a file still has type errors. A diverging parse (no statements) yields none.
  for (const d of lint(ast.statements, symbols, spans)) diagnostics.push(d);
  return { ast, diagnostics, symbols, spans, comments };
};

/**
 * Full pipeline: source -> diagnostics (+ wasm when clean). Runs `checkOnly`,
 * then codegen — but only when there are no error diagnostics, matching the
 * LSP's behavior. A codegen throw is surfaced as a diagnostic rather than
 * escaping. `toWasm` (and thus binaryen) is dynamically imported here so it is
 * only loaded when codegen actually runs.
 */
export const compile = async (source: string): Promise<CompileResult> => {
  const { ast, diagnostics, symbols, spans, comments } = checkOnly(source);

  let wasm: Uint8Array | undefined;
  if (!diagnostics.some((d) => d.severity === "error")) {
    try {
      const { toWasm } = await import("./toWasm.ts");
      wasm = await toWasm(ast);
    } catch (err) {
      diagnostics.push({
        message: `Codegen error: ${codegenErrorMessage(err)}`,
        severity: "error",
        source: "vital",
        // Sentinel range: a codegen throw carries no source span, so it points
        // at 0:0/0:0 with start == end. The CLI's pretty formatter keys off this
        // exact shape to skip rendering a bogus source line/caret (see cli.ts). A
        // genuine diagnostic at the very start of a file is distinguishable
        // because its `end` is past the start.
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
      });
    }
  }

  return { ast, diagnostics, wasm, symbols, spans, comments };
};

/**
 * Symbol table only, synchronously: tokenize + parse (which resolves scopes and
 * populates the binding table) without running codegen. The LSP's
 * go-to-definition / find-references handlers use this — they need symbols, not
 * wasm, and want a synchronous answer per request (D2).
 */
export const parseSymbols = (source: string): SymbolTable => {
  const { tokens } = tokenize(source);
  const [, , symbols] = parseProgram(tokens, defaultScope());
  return symbols;
};

/**
 * Render compiled wasm bytes as WAT text (used by `vl build --wat`). Reads the
 * binary back through binaryen and emits its textual form — `toWasm` only hands
 * out bytes, so this is the thin module-exposing variant. Pure binaryen, no
 * runtime globals, so the core stays runtime-agnostic.
 */
export const wasmToWat = async (wasm: Uint8Array): Promise<string> => {
  // Loaded lazily (not a top-level import) so the binaryen toolchain stays off
  // the `check`/LSP path; only `build --wat` reaches here.
  const Binaryen = (await import("binaryen")).default;
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
