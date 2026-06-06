// Static lint pass (roadmap B17 — "diagnostics build-out").
//
// A post-parse analysis that walks the AST + symbol table and returns extra
// `warning` diagnostics, closing part of the TS-vs-VL gap. It is intentionally a
// SEPARATE module from typecheck/parser: it consumes what those passes already
// produce (the `SymbolTable` of declarations/uses, the AST, and the `NodeSpans`
// side-table) rather than re-deriving scope/binding information. Invoked from the
// shared front end (`checkOnly` in compile.ts), so its warnings flow to the CLI,
// the LSP (which forwards compiler diagnostics verbatim), and the test harness
// alike, with no extra wiring at each consumer.
//
// Lints implemented:
//   1. Unused local variables / parameters — a `let`/`const` binding or a
//      function parameter that is declared but never read. A leading-underscore
//      name (`_x`) is the language's "intentionally unused" convention and is
//      suppressed (mirrors Go / Rust / TS `noUnusedLocals` underscore norms).
//   2. Unreachable code — any statement that follows a statement which always
//      diverges (`return` / `break` / `continue`, or an `if/else` where BOTH the
//      then- and else-branch diverge) within the same block.
//
// Pure data + AST/span lookups, no runtime globals — bundled into both the Deno
// CLI and the Node LSP (dual-runtime constraint, see AGENTS.md).

import type {
  Context,
  NodeSpans,
  VLBlockNode,
  VLExpression,
  VLIfNode,
  VLStatement,
} from "./ast.ts";
import { spanOf } from "./ast.ts";
import type { SymbolTable } from "./symbols.ts";
import type { VLDiagnostic } from "./compile.ts";

// Local copy of the diagnostic range-from-context shift. `compile.ts` owns the
// canonical `rangeFromCtx`, but importing it here would be a value-import cycle
// (compile.ts imports this module); the math is a trivial 1-line shift, so we
// inline it rather than restructure the module graph.
const rangeFromCtx = (ctx: Context) => ({
  start: { line: ctx.start.line - 1, character: ctx.start.column },
  end: { line: ctx.stop.line - 1, character: ctx.stop.column },
});

/**
 * Run all lint rules over a parsed program. `ast.statements` is the program
 * body, `symbols` is the populated binding table, `spans` maps nodes to their
 * source extents. Returns warning diagnostics (possibly empty); never throws.
 */
export const lint = (
  programStatements: VLStatement[],
  symbols: SymbolTable,
  spans: NodeSpans,
): VLDiagnostic[] => {
  const diagnostics: VLDiagnostic[] = [];
  unusedBindings(symbols, diagnostics);
  for (const stmt of programStatements) unreachableInStatement(stmt, spans, diagnostics);
  return diagnostics;
};

// ---------------------------------------------------------------------------
// 1. Unused local variables / parameters
// ---------------------------------------------------------------------------

/**
 * A binding is "unused" when the symbol table records its declaration but no
 * *use* occurrence (an occurrence with `isDecl === false`). We only flag
 * `variable` (`let`/`const`) and `parameter` bindings: functions and type
 * aliases are part of a module's surface and routinely declared-but-unused
 * within a single file (exports, public API), so flagging them would be noise.
 *
 * Underscore convention: a name beginning with `_` is the agreed "intentionally
 * unused" marker (a throwaway loop/destructure slot, an unused-but-required
 * parameter), so it is suppressed even when never read.
 *
 * Top-level (program-scope) variables are NOT flagged. A module-level binding is
 * part of the file's surface — it behaves like an export/result and is routinely
 * declared without a same-file read (and the type-check corpus leans on exactly
 * this: `let n: i32 = first(["s"])` exists to exercise inference, not to be read
 * back). Matching TS's `noUnusedLocals` (which exempts module-level
 * declarations), the rule targets locals *inside* functions/blocks plus
 * parameters. A program-scope binding is recognised by its stamped `scope` span:
 * the parser stamps top-level bindings with the whole-document span, which starts
 * at line 1, column 0 (see `parseProgram`'s `programSpan`).
 */
const unusedBindings = (
  symbols: SymbolTable,
  out: VLDiagnostic[],
): void => {
  // Tally reads per binding identity. Walk once: every declaration seeds an
  // entry; every non-decl occurrence marks its binding as used.
  const used = new Set<unknown>();
  for (const occ of symbols.occurrences) {
    if (!occ.isDecl) used.add(occ.binding);
  }

  // Emit in declaration order, de-duplicated by binding identity (a binding
  // appears once as a decl occurrence, but guard anyway).
  const reported = new Set<unknown>();
  for (const occ of symbols.occurrences) {
    if (!occ.isDecl) continue;
    const b = occ.binding;
    if (reported.has(b)) continue;
    if (b.kind !== "variable" && b.kind !== "parameter") continue;
    if (b.name.startsWith("_")) continue; // intentionally-unused convention
    if (used.has(b)) continue;
    // Module-level variables are NOT flagged *yet*. Under the current module
    // model (modules-design: top-level bindings are the file's export surface),
    // every top-level `let` is de-facto exported, so "unused" can't be inferred
    // from the single file. Once an explicit `export` keyword lands, an unused
    // *non-exported* top-level binding becomes real dead code and should warn —
    // tracked in ROADMAP B17. (A parameter is never program-scoped.) A top-level
    // binding's stamped scope is the whole-document span, anchored at line 1,
    // column 0; locals are stamped with their block's `{ … }` extent.
    if (
      b.kind === "variable" && b.scope !== undefined &&
      b.scope.start.line === 1 && b.scope.start.column === 0
    ) continue;
    reported.add(b);

    const noun = b.kind === "parameter" ? "parameter" : "variable";
    out.push({
      message:
        `Unused ${noun} \`${b.name}\` (prefix with \`_\` to suppress, or remove it)`,
      severity: "warning",
      range: rangeFromCtx(b.decl),
      code: "unused-variable",
      source: "vital",
      tags: ["unnecessary"],
    });
  }
};

// ---------------------------------------------------------------------------
// 2. Unreachable code
// ---------------------------------------------------------------------------

/**
 * Whether a statement *always* diverges — i.e. control never falls through to a
 * following sibling. The direct diverging statements are `return` / `break` /
 * `continue`. A block diverges when any of its statements diverges (everything
 * after the first divergence is itself unreachable, but the block as a whole
 * still diverges). An `if` diverges only when it has an `else` AND both the
 * then-branch and the else-branch diverge — otherwise a branch falls through.
 *
 * Conservative by design: anything we are unsure about is treated as
 * fall-through, so we never report reachable code as unreachable.
 */
const diverges = (stmt: VLStatement): boolean => {
  switch (stmt.type) {
    case "Return":
    case "Break":
    case "Continue":
      return true;
    case "Block":
      return stmt.statements.some(diverges);
    case "If": {
      if (stmt.else === undefined) return false;
      return stmt.conditionals.every((c) => diverges(c.statement)) &&
        diverges(stmt.else);
    }
    default:
      // Loops are not treated as diverging: a `while`/`for` may iterate zero
      // times, and even an infinite loop can be exited by an outer `break`. An
      // expression statement falls through. Conservative -> no false positive.
      return false;
  }
};

/**
 * Walk a statement, reporting the FIRST unreachable statement in every block it
 * contains (one diagnostic per block keeps the noise down — once you know the
 * tail is dead, flagging every line adds nothing). Recurses through nested
 * blocks, `if` branches, and loop bodies so unreachable code is found at any
 * depth.
 */
const unreachableInStatement = (
  stmt: VLStatement,
  spans: NodeSpans,
  out: VLDiagnostic[],
): void => {
  switch (stmt.type) {
    case "Block":
      unreachableInBlock(stmt, spans, out);
      break;
    case "If":
      for (const c of stmt.conditionals) {
        unreachableInExpr(c.condition, spans, out);
        unreachableInStatement(c.statement, spans, out);
      }
      if (stmt.else) unreachableInStatement(stmt.else, spans, out);
      break;
    case "While":
      unreachableInExpr(stmt.condition, spans, out);
      unreachableInStatement(stmt.statement, spans, out);
      break;
    case "For":
      unreachableInStatement(stmt.statement, spans, out);
      break;
    case "ForIn":
      unreachableInStatement(stmt.statement, spans, out);
      break;
    case "Return":
      if (stmt.value) unreachableInExpr(stmt.value, spans, out);
      break;
    case "VariableDeclaration":
      if (stmt.value) unreachableInExpr(stmt.value, spans, out);
      break;
    default:
      // Remaining `VLStatement`s are expressions; descend so blocks-as-values
      // (`let x = { … }`) and nested function bodies are still scanned.
      unreachableInExpr(stmt as VLExpression, spans, out);
      break;
  }
};

const unreachableInBlock = (
  block: VLBlockNode,
  spans: NodeSpans,
  out: VLDiagnostic[],
): void => {
  let dead = -1;
  for (let i = 0; i < block.statements.length; i++) {
    if (dead < 0 && i > 0 && diverges(block.statements[i - 1])) dead = i;
    // Always recurse into each statement so unreachable code nested deeper is
    // still reported even within an already-dead tail.
    unreachableInStatement(block.statements[i], spans, out);
  }
  if (dead >= 0) {
    const node = block.statements[dead];
    const span = spanOf(spans, node);
    if (span) {
      out.push({
        message: "Unreachable code: this statement can never execute",
        severity: "warning",
        range: rangeFromCtx(span),
        code: "unreachable-code",
        source: "vital",
        tags: ["unnecessary"],
      });
    }
  }
};

/**
 * Descend into expressions to reach embedded statements: a block can appear in
 * expression position (`let x = { stmt; value }`), and a function declaration's
 * body is a statement nested under an expression. Only the expression forms that
 * can contain statements/blocks need handling; the rest are leaves for this pass.
 */
const unreachableInExpr = (
  expr: VLExpression,
  spans: NodeSpans,
  out: VLDiagnostic[],
): void => {
  switch (expr.type) {
    case "Block":
      unreachableInBlock(expr, spans, out);
      break;
    case "If":
      unreachableInStatement(expr as VLIfNode, spans, out);
      break;
    case "FunctionDeclaration":
      unreachableInStatement(expr.body, spans, out);
      break;
    default:
      // Other expressions (calls, operators, literals, names) carry no nested
      // statement blocks relevant to reachability — nothing to descend into.
      break;
  }
};
