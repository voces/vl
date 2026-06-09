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
import type { OptimizeCache } from "./toWasm.ts";
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

// `hint` is the lowest tier: VS Code renders it with NO squiggle and keeps it
// out of the warning/error count. Combined with the `unnecessary` tag it greys
// out the span (used for `_`-prefixed intentionally-unused bindings). Hints must
// never count toward the CLI error/warning tally or fail the test harness.
export type VLSeverity = "error" | "warning" | "info" | "hint";
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
   * Source Map v3 (JSON string) for `wasm`, mapping wasm code offsets to VL
   * `file:line:column` (roadmap B-debug). Present whenever `wasm` is — codegen
   * always emits debug locations now. `runWasm` consumes it to turn a raw wasm
   * trap into a VL-source-located runtime error.
   */
  sourceMap: string | undefined;
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

// `maxDepth` controls how many *alias-name* layers are peeled (expanded) before
// falling back to rendering the alias name (D8). A named `Type` node (a resolved
// `type` alias) at alias-depth >= the cap renders as its NAME; a shallower layer
// (depth < cap) is peeled — expanded to its body, recursing at depth+1. So:
//   maxDepth: 0 (default for hover/inlay) — preserve every alias name (`"a" | I32`)
//   maxDepth: 1                           — peel the outermost alias one layer
//   maxDepth: 2                           — peel two layers, …
//   maxDepth: Infinity                    — fully expand (every alias → its body)
// Only *named* `Type` nodes count toward `depth`; structural types, unions, and
// the anonymous/internal `Type` wrapper are unaffected (an unnamed `Type` always
// expands, exactly as before). The default (0) preserves all names — what hover
// (D1) and inlay (D6) want; type-mismatch errors pass Infinity so the message
// still explains the concrete incompatibility.
export const stringifyType = (
  type: VLType,
  seen: Set<VLType> = new Set(),
  maxDepth: number = 0,
  depth: number = 0,
): string => {
  if (type.type === "Alias") return type.name;
  if (type.type === "Union") {
    return type.subTypes.map((t) => stringifyType(t, seen, maxDepth, depth))
      .join(" | ");
  }
  if (type.type === "Nullable") {
    return `${stringifyType(type.subType, seen, maxDepth, depth)} | null`;
  }
  if (type.type === "Intersection") {
    return type.subTypes.map((t) => stringifyType(t, seen, maxDepth, depth))
      .join(" & ");
  }
  if (type.type === "Negation") {
    return `not ${stringifyType(type.subType, seen, maxDepth, depth)}`;
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
    ) {
      return `${
        stringifyType(type.properties[0].type, seen, maxDepth, depth)
      }[]`;
    }
    return `{${
      type.properties.map((p) =>
        `${stringifyType(p.name, seen, maxDepth, depth).replace(/^"(.*)"$/, "$1")}: ${
          stringifyType(p.type, seen, maxDepth, depth)
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
        `${p.name}: ${stringifyType(p.paramaterType, seen, maxDepth, depth)}`
      )
        .join(", ")
    }): ${stringifyType(type.return, seen, maxDepth, depth)}`;
  }
  // A `Type` node wraps a named type-alias's body. When it carries an alias
  // `name` (D8) and this layer is at/below the cap, render the NAME — this is the
  // whole point: with the default cap (0), `type thing = "a" | I32` hovers as
  // `"a" | I32`, keeping the inner alias `I32` instead of expanding it to `i32`.
  // A shallower layer (depth < cap) is peeled — expanded to the body, recursing
  // at depth+1 so nested aliases peel one per step. An unnamed `Type` (the
  // internal/anonymous wrapper) always expands, exactly as before.
  if (type.type === "Type") {
    if (type.name !== undefined && depth >= maxDepth) return type.name;
    const nextDepth = type.name !== undefined ? depth + 1 : depth;
    return stringifyType(type.subType, seen, maxDepth, nextDepth);
  }
  if (type.type === "Infer") {
    return `I<${stringifyType(type.subType, seen, maxDepth, depth)}>`;
  }
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
      // A type-mismatch message must explain the *concrete* incompatibility, so
      // fully expand aliases here (maxDepth: Infinity) — `expected i32, got
      // string`, not `expected I32, got Str`. Hover/inlay keep names (default).
      return {
        ...base,
        message: `Type error: expected ${
          stringifyType(error.left, new Set(), Infinity)
        }, got ${stringifyType(error.right, new Set(), Infinity)}`,
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
  // from the symbol table + AST the front end already produced. Suppressed when
  // the file already has *error*-severity diagnostics: a broken file's "unused"
  // bindings are usually a symptom of the error (the use lives in the code that
  // failed to parse/type), so we report the real errors first rather than piling
  // style warnings on top. A diverging parse (no statements) yields none anyway.
  if (!diagnostics.some((d) => d.severity === "error")) {
    for (const d of lint(ast.statements, symbols, spans)) diagnostics.push(d);
  }
  return { ast, diagnostics, symbols, spans, comments };
};

/** Optional knobs for {@link compile}; all default to off/none. */
export type CompileOptions = {
  /**
   * Cache for the binaryen `optimize()` stage. Injected by a Deno entry point
   * (the CLI, the test suite) via `compiler/buildCache.ts`; leaving it unset
   * keeps the core free of any filesystem cache and runs `optimize()` normally.
   */
  optimizeCache?: OptimizeCache;
};

/**
 * Full pipeline: source -> diagnostics (+ wasm when clean). Runs `checkOnly`,
 * then codegen — but only when there are no error diagnostics, matching the
 * LSP's behavior. A codegen throw is surfaced as a diagnostic rather than
 * escaping. `toWasm` (and thus binaryen) is dynamically imported here so it is
 * only loaded when codegen actually runs.
 */
export const compile = async (
  source: string,
  fileName = "source.vl",
  options: CompileOptions = {},
): Promise<CompileResult> => {
  const { ast, diagnostics, symbols, spans, comments } = checkOnly(source);

  let wasm: Uint8Array | undefined;
  let sourceMap: string | undefined;
  if (!diagnostics.some((d) => d.severity === "error")) {
    try {
      const { toWasm } = await import("./toWasm.ts");
      // A single compiled file IS its own entry module (index 0), so its
      // `export function`s become host-callable wasm exports — same entry-only
      // semantics as the multi-file path, just with no name mangling, so the
      // exported (host-facing) name and the internal codegen name coincide. Only
      // FUNCTIONS export in v1 (exported `let`/`const` globals are filtered out).
      const hostExports = Object.values(ast.moduleExports ?? {})
        .filter((e) => e.type.type === "Function")
        .map((e) => ({ exportName: e.name, internalName: e.name }));
      // Thread the AST spans + file name into codegen so the emitted module
      // carries debug locations (a source map) and the name section — additive
      // metadata only; the executable behavior is unchanged. `optimizeCache`, when
      // a Deno entry point injects one, lets codegen reuse a prior binaryen
      // `optimize()` result for an unchanged module (see `OptimizeCache`).
      const emit = await toWasm(ast, {
        spans,
        fileName,
        optimizeCache: options.optimizeCache,
        hostExports,
      });
      wasm = emit.binary;
      sourceMap = emit.sourceMap;
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

  return { ast, diagnostics, wasm, sourceMap, symbols, spans, comments };
};

/**
 * Multi-file pipeline (module system, phase 1): resolve the `import` graph from
 * an ENTRY module, merge every reachable module into one whole-program AST with
 * per-module name isolation, then run codegen to emit ONE wasm module — exactly
 * the single-module output `compile` produces, just fed the merged program.
 *
 * `read(key)` returns a module's source by its resolved key, or `undefined` when
 * it doesn't exist. `entryKey` is the entry module's key (the CLI passes the
 * entry file path; tests pass an in-memory map key). The resolver appends `.vl`
 * to relative specifiers, so module KEYS carry the extension while specifiers in
 * source do not (`import … from "./util"` → key `…/util.vl`).
 *
 * Back-compat: the existing single-string `compile(source)` is unchanged and
 * stays the path for a file with no imports (a one-module graph is just this with
 * a synthetic entry). All current tests/LSP keep using `compile`.
 */
export const compileProgram = async (
  entryKey: string,
  read: (key: string) => string | undefined | Promise<string | undefined>,
  fileName = entryKey,
  options: CompileOptions = {},
): Promise<CompileResult> => {
  // Loaded lazily so `compile.ts`'s existing consumers don't pull the resolver.
  const { loadProgram } = await import("./modules.ts");
  const { ast, diagnostics, symbols, hostExports } = await loadProgram(
    entryKey,
    read,
  );

  let wasm: Uint8Array | undefined;
  let sourceMap: string | undefined;
  if (ast && !diagnostics.some((d) => d.severity === "error")) {
    try {
      const { toWasm } = await import("./toWasm.ts");
      // Forward the optimize cache so multi-file builds get the same optimize()
      // reuse as the single-file path (it was previously only wired into
      // compile()). `hostExports` carries the ENTRY module's `export function`s
      // (mangled internal names) so they become host-callable wasm exports;
      // imported modules' exports stay tree-shakeable (entry-only semantics).
      const emit = await toWasm(ast, {
        fileName,
        optimizeCache: options.optimizeCache,
        hostExports,
      });
      wasm = emit.binary;
      sourceMap = emit.sourceMap;
    } catch (err) {
      diagnostics.push({
        message: `Codegen error: ${codegenErrorMessage(err)}`,
        severity: "error",
        source: "vital",
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
      });
    }
  }

  // The merged program has no single comment list / span map (those are
  // per-module); the multi-file path is a build/run driver, not an LSP surface
  // (cross-file LSP is phase 3). Return empty trivia rather than fabricating it.
  return {
    ast,
    diagnostics,
    wasm,
    sourceMap,
    symbols,
    spans: ast ? new WeakMap() : undefined,
    comments: [],
  };
};

/**
 * Multi-file front end WITHOUT codegen: resolve + parse + type-check the import
 * graph from `entryKey`, returning diagnostics (including import/export errors).
 * This is the graph-aware analogue of `checkOnly` — `vl check` on a file with
 * imports uses it so cross-module references and bad imports surface as
 * diagnostics rather than spurious "undeclared" errors. Codegen-only diagnostics
 * are not produced (same trade-off as `checkOnly`).
 */
export const checkProgram = async (
  entryKey: string,
  read: (key: string) => string | undefined | Promise<string | undefined>,
): Promise<{ diagnostics: VLDiagnostic[] }> => {
  const { loadProgram } = await import("./modules.ts");
  const { diagnostics } = await loadProgram(entryKey, read);
  return { diagnostics };
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

// --- Trap-to-source (roadmap B-debug) --------------------------------------
//
// A wasm runtime trap (array OOB, divide-by-zero, …) surfaces in V8/Deno as a
// `WebAssembly.RuntimeError` whose `.stack` carries the failing wasm location,
// e.g. `at myFn (wasm://wasm/abcd1234:wasm-function[3]:0x42)`. We extract the
// byte offset (`0x42`) and look it up in the codegen Source Map v3 to recover
// the VL `file:line:column`, and the function name (`myFn`) comes from the wasm
// *name* section binaryen emitted. The result is a VL-source-located error
// instead of the raw wasm abort. See `mapTrap`.

/** A wasm trap re-rendered as a VL-source-located runtime error. */
export class VLRuntimeError extends Error {
  /** The mapped source location, when an offset→line mapping was available. */
  readonly location?: { file: string; line: number; column: number };
  /** The wasm function name (from the name section), when present in the trace. */
  readonly functionName?: string;
  /** The raw wasm trap reason (e.g. `unreachable`, `divide by zero`). */
  readonly reason: string;
  constructor(
    message: string,
    reason: string,
    location?: { file: string; line: number; column: number },
    functionName?: string,
  ) {
    super(message);
    this.name = "VLRuntimeError";
    this.reason = reason;
    this.location = location;
    this.functionName = functionName;
  }
}

// Decode a single base64-VLQ segment into its integer fields.
const decodeVLQ = (segment: string): number[] => {
  const CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const out: number[] = [];
  let shift = 0;
  let value = 0;
  for (const ch of segment) {
    const idx = CHARS.indexOf(ch);
    if (idx === -1) continue;
    const cont = idx & 32;
    value += (idx & 31) << shift;
    if (cont) {
      shift += 5;
    } else {
      const negative = value & 1;
      const magnitude = value >> 1;
      out.push(negative ? -magnitude : magnitude);
      shift = 0;
      value = 0;
    }
  }
  return out;
};

type SourceMapEntry = {
  offset: number;
  sourceIndex: number;
  line: number; // 0-based, as stored in the source map
  column: number; // 0-based
};

type DecodedSourceMap = { sources: string[]; entries: SourceMapEntry[] };

/**
 * Decode a Source Map v3 into a flat, offset-sorted list of mappings. For a
 * wasm source map the "generated column" is the byte offset into the code
 * section (binaryen has no line concept, so all segments live on one line),
 * which is exactly the offset V8 reports in a trap stack.
 */
const decodeSourceMap = (json: string): DecodedSourceMap | undefined => {
  let parsed: { sources?: unknown; mappings?: unknown };
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  const sources = Array.isArray(parsed.sources)
    ? parsed.sources.map((s) => String(s))
    : [];
  const mappings = typeof parsed.mappings === "string" ? parsed.mappings : "";
  const entries: SourceMapEntry[] = [];
  let genCol = 0;
  let srcIdx = 0;
  let srcLine = 0;
  let srcCol = 0;
  // wasm maps use a single "line"; segments are comma-separated. Tolerate the
  // generic `;` line separator too (resets generated column per spec).
  for (const line of mappings.split(";")) {
    genCol = 0;
    for (const seg of line.split(",")) {
      if (seg === "") continue;
      const f = decodeVLQ(seg);
      if (f.length === 0) continue;
      genCol += f[0];
      if (f.length >= 4) {
        srcIdx += f[1];
        srcLine += f[2];
        srcCol += f[3];
        entries.push({
          offset: genCol,
          sourceIndex: srcIdx,
          line: srcLine,
          column: srcCol,
        });
      }
    }
  }
  entries.sort((a, b) => a.offset - b.offset);
  return { sources, entries };
};

/** The mapping whose offset is the greatest ≤ `offset` (the active location). */
const lookupOffset = (
  map: DecodedSourceMap,
  offset: number,
): SourceMapEntry | undefined => {
  let found: SourceMapEntry | undefined;
  for (const e of map.entries) {
    if (e.offset <= offset) found = e;
    else break;
  }
  return found;
};

// Pull the function name + byte offset out of a V8/Deno wasm stack frame. The
// first wasm frame looks like:
//   at <name> (wasm://wasm/<hash>:wasm-function[<idx>]:0x<offset>)
// `<name>` is absent (anonymous) when the function is unnamed. Returns the
// offset (and optional name) of the innermost wasm frame.
const parseWasmFrame = (
  stack: string | undefined,
): { offset: number; functionName?: string } | undefined => {
  if (!stack) return undefined;
  for (const rawLine of stack.split("\n")) {
    const line = rawLine.trim();
    const m = line.match(
      /at\s+(?:([^\s(]+)\s+\()?wasm:\/\/[^\s:]+:wasm-function\[\d+\]:0x([0-9a-fA-F]+)/,
    );
    if (m) {
      const functionName = m[1] && m[1] !== "<anonymous>" ? m[1] : undefined;
      return { offset: parseInt(m[2], 16), functionName };
    }
  }
  return undefined;
};

// Map a raw wasm trap message to a friendlier VL reason. V8 phrasing varies by
// version, so match on substrings.
const trapReason = (message: string): string => {
  const lower = message.toLowerCase();
  if (lower.includes("out of bounds") || lower.includes("array")) {
    return "array index out of bounds";
  }
  if (lower.includes("divide by zero") || lower.includes("division")) {
    return "division by zero";
  }
  if (lower.includes("unreachable")) {
    // VL emits `unreachable` for a failed bounds check, so report that intent.
    return "array index out of bounds";
  }
  if (lower.includes("null")) return "null dereference";
  return message;
};

/**
 * Turn a caught wasm `RuntimeError` into a `VLRuntimeError` carrying a
 * VL-source location when the source map resolves the trap offset, else a
 * function-level (name-section) location. Non-wasm errors pass through
 * unchanged.
 */
export const mapTrap = (
  err: unknown,
  sourceMap?: string,
): unknown => {
  const isRuntime = err instanceof WebAssembly.RuntimeError ||
    (err instanceof Error && err.name === "RuntimeError");
  if (!isRuntime) return err;
  const e = err as Error;
  const reason = trapReason(e.message);
  const frame = parseWasmFrame(e.stack);
  const map = sourceMap ? decodeSourceMap(sourceMap) : undefined;
  const hit = frame && map ? lookupOffset(map, frame.offset) : undefined;
  if (hit) {
    const file = map!.sources[hit.sourceIndex] ?? "source";
    // Source map stores 0-based line/col; VL diagnostics present 1-based line.
    const line = hit.line + 1;
    const column = hit.column;
    return new VLRuntimeError(
      `runtime error at ${file}:${line}:${column} — ${reason}`,
      reason,
      { file, line, column },
      frame?.functionName,
    );
  }
  // No precise offset mapping — fall back to a function-level location from the
  // name section, still better than the raw wasm abort.
  if (frame?.functionName && frame.functionName !== "__program__") {
    return new VLRuntimeError(
      `runtime error in ${frame.functionName} — ${reason}`,
      reason,
      undefined,
      frame.functionName,
    );
  }
  return new VLRuntimeError(`runtime error — ${reason}`, reason);
};

/**
 * Instantiate compiled wasm with a memory + `__log__` import, capturing each
 * `__log__` call as a formatted line. Mirrors the tagged-value decoding.
 *
 * When `sourceMap` is supplied (the codegen Source Map v3 from `compile`), a
 * wasm trap is rethrown as a {@link VLRuntimeError} with a VL-source location
 * instead of the raw `WebAssembly.RuntimeError`. Without it, a trap propagates
 * unchanged.
 */
export const runWasm = async (
  wasm: Uint8Array,
  sourceMap?: string,
): Promise<RunResult> => {
  const logs: string[] = [];
  // Accumulates code points streamed by `__print_char__` until `__print_str_flush__`.
  const printChars: number[] = [];
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536 });
  try {
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
          // Chunk the code-point→string conversion: `String.fromCodePoint(...spread)`
          // blows the JS call-argument limit (RangeError: Maximum call stack size
          // exceeded) on very large prints — e.g. a self-compiled module serialized to
          // a decimal string. Build the line in bounded slices instead.
          let s = "";
          for (let i = 0; i < printChars.length; i += 8192) {
            s += String.fromCodePoint(...printChars.slice(i, i + 8192));
          }
          logs.push(s);
          printChars.length = 0;
        },
      },
    });
  } catch (err) {
    // The wasm executes inside `instantiate` because the entry runs as the
    // module's start function; a trap therefore throws here. Map it to a
    // VL-source-located error (or rethrow non-trap errors unchanged).
    throw mapTrap(err, sourceMap);
  }
  return { logs };
};
