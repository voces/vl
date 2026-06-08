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
//      name (`_x`) is the language's "intentionally unused" convention: it is
//      NOT warned but emits a `hint` (greyed/faded, no squiggle, not counted as
//      a warning), mirroring Go / Rust / TS `noUnusedLocals` underscore norms.
//      An unused IMPORT binding is reported separately (code `unused-import`,
//      "remove it" message) — there is no `_`-prefix suppression for an import,
//      so its quick-fix removes the specifier (or the whole `import` line).
//   2. Unreachable code — any statement that follows a statement which always
//      diverges (`return` / `break` / `continue`, or an `if/else` where BOTH the
//      then- and else-branch diverge) within the same block.
//   3. prefer-`const` — a `let` (VL's reassignable keyword) binding that is
//      never reassigned should be the immutable `const`. VL matches TS/JS:
//      `const` is immutable and `let` is the reassignable cell, so the "prefer
//      the more restrictive form" lint flags an unmutated `let` and suggests
//      `const`. Underscore bindings are skipped, and an unused binding is left
//      to the unused-variable rule (more specific).
//   4. Dead / constant branch — a literal-boolean `if` condition makes a branch
//      dead: `if false { … }` (dead then-branch) or `if true { … } else { … }`
//      (dead else-branch); a `while false { … }` body never runs. Flagged from
//      the literal boolean only — no general constant folding.
//   5. Degenerate `for` step — a range `for` with a literal `step 0` never makes
//      progress (an infinite/degenerate loop); flagged as an error.
//   6. Empty intersection — a `type X = A & B` (or a binding so annotated) whose
//      two CONCRETE operands share no values, so the intersection folds to
//      `never`. A real value can never have this type (forming one is a separate
//      error); the declaration is flagged as a warning. Scoped to concrete
//      operands — a generic `T & U` (empty only for some instantiation) is not
//      flagged.
//
// Pure data + AST/span lookups, no runtime globals — bundled into both the Deno
// CLI and the Node LSP (dual-runtime constraint, see AGENTS.md).

import type {
  Context,
  NodeSpans,
  VLBlockNode,
  VLExpression,
  VLForNode,
  VLIfNode,
  VLStatement,
  VLType,
  VLWhileNode,
} from "./ast.ts";
import { spanOf } from "./ast.ts";
import { emptyIntersectionInfo } from "./typecheck.ts";
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
  preferConst(symbols, diagnostics);
  emptyIntersections(symbols, diagnostics);
  for (const stmt of programStatements) {
    unreachableInStatement(stmt, spans, diagnostics);
    constantBranchInStatement(stmt, spans, diagnostics);
    degenerateStepInStatement(stmt, spans, diagnostics);
  }
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
 * parameter). It is NOT a warning — an unread `_x` emits a `hint`-severity,
 * `unnecessary`-tagged diagnostic instead, so editors grey/fade the span without
 * a squiggle and without bumping the warning count. A USED `_x` emits nothing.
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
    if (used.has(b)) continue;
    // An `export`ed top-level binding is public surface, not dead code — exempt
    // it even if nothing in its own module reads it (module system, phase 1).
    if (b.exported) continue;

    // An unused IMPORT binding is its own case. Unlike a local/parameter there is
    // no meaningful `_`-prefix suppression — prefixing the local would have to go
    // through aliasing (`{ x as _x }`), which a bare `_`-insert does not do — so
    // we do NOT offer the underscore option. The actionable fix is to remove the
    // specifier (and the whole `import` line when it was the only one). Emitted
    // under the distinct `unused-import` code so the quick-fix (LSP) dispatches to
    // the remove-import edit instead of the prefix/remove-binding pair.
    if (b.isImport) {
      reported.add(b);
      out.push({
        message: `Unused import \`${b.name}\` (remove it)`,
        severity: "warning",
        range: rangeFromCtx(b.decl),
        code: "unused-import",
        source: "vital",
        tags: ["unnecessary"],
      });
      continue;
    }

    const noun = b.kind === "parameter" ? "parameter" : "variable";

    // A leading-underscore name is the "intentionally unused" convention. We no
    // longer fully suppress it: instead we emit a `hint`-severity diagnostic
    // (still tagged `unnecessary`) so VS Code GREYS/FADES the span without a
    // squiggle and without counting it as a warning. This confirms to the reader
    // that the binding is recognised as deliberately unused. A USED `_x` is
    // filtered out above by the `used` guard, so only genuinely-unread
    // underscore bindings reach here.
    if (b.name.startsWith("_")) {
      reported.add(b);
      out.push({
        message:
          `Intentionally-unused ${noun} \`${b.name}\` (leading \`_\` marks it unused)`,
        severity: "hint",
        range: rangeFromCtx(b.decl),
        code: "unused-variable",
        source: "vital",
        tags: ["unnecessary"],
      });
      continue;
    }
    // Module-level variables ARE flagged: an unused top-level `let` is dead in a
    // whole-program compile. When an explicit `export` keyword lands, an
    // *exported* top-level binding will be exempt (it's consumer-facing surface,
    // not dead) — until then there is no export marker, so every unread top-level
    // binding is genuinely unused. (`_`-prefix downgrades to a hint above;
    // functions are excluded via the `kind` guard — unused-function is future.)
    reported.add(b);

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
// 2. prefer-`const` (a never-reassigned `let` should be `const`)
// ---------------------------------------------------------------------------

/**
 * A `let` binding (VL's reassignable keyword — `Binding.mutable === true`) that
 * is never the target of an assignment can be the immutable `const` form
 * instead. The standard "prefer the more restrictive declaration" lint; VL's
 * `const`/`let` match JS/TS (`const` immutable, `let` reassignable).
 *
 * "Reassigned" = the binding has at least one occurrence flagged `isWrite` (an
 * `x = …` / `x += …` / `x++` target — the parser stamps these). A binding with
 * no write occurrence is a prefer-`const` candidate.
 *
 * Interactions / exemptions:
 *   - Only `variable` bindings with `mutable === true` (declared `let`).
 *   - `_`-prefixed names are skipped (intentional, like unused-variable).
 *   - An *unused* binding (no non-decl occurrence at all) is reported by the
 *     unused-variable rule instead — the more specific diagnostic — so we skip
 *     it here to avoid double-flagging the same span.
 *
 * Emitted as `info` (a style nudge, not a correctness problem) tagged
 * `code: "prefer-const"`.
 */
const preferConst = (symbols: SymbolTable, out: VLDiagnostic[]): void => {
  // Per binding: does it have any non-decl occurrence (a use), and any write?
  const used = new Set<unknown>();
  const written = new Set<unknown>();
  for (const occ of symbols.occurrences) {
    if (occ.isDecl) continue;
    used.add(occ.binding);
    if (occ.isWrite) written.add(occ.binding);
  }

  const reported = new Set<unknown>();
  for (const occ of symbols.occurrences) {
    if (!occ.isDecl) continue;
    const b = occ.binding;
    if (reported.has(b)) continue;
    if (b.kind !== "variable" || b.mutable !== true) continue;
    if (b.name.startsWith("_")) continue;
    // Unused → unused-variable owns it (more specific); don't also prefer-const.
    if (!used.has(b)) continue;
    if (written.has(b)) continue;
    reported.add(b);
    out.push({
      message:
        `\`${b.name}\` is never reassigned; use \`const\` instead of \`let\``,
      severity: "info",
      // Point at the `let` keyword — that is the token the fix changes
      // (`let`→`const`), so the squiggle lands on the actionable word rather than
      // the variable name. Falls back to the identifier span if the parser didn't
      // stamp a keyword span (defensive; always present for `let` decls today).
      range: rangeFromCtx(b.declKeyword ?? b.decl),
      code: "prefer-const",
      source: "vital",
    });
  }
};

// ---------------------------------------------------------------------------
// 6. Empty intersection (a concrete `A & B` that folds to `never`)
// ---------------------------------------------------------------------------

/**
 * Find the empty-intersection record on a `never` reachable inside `type` — its
 * own node, the body of a `Type` wrapper, the operand of a `Nullable`, or a
 * member of a `Union`. The record is attached by `intersectType` (typecheck.ts)
 * ONLY when two CONCRETE, non-`never` operands fold to `never`, so a generic
 * `T & U` (which may be non-empty for some instantiation) carries no record and
 * is never reported here. Returns the human-readable text/reason or undefined.
 */
const findEmptyIntersection = (
  type: VLType | undefined,
  seen = new Set<VLType>(),
): ReturnType<typeof emptyIntersectionInfo> => {
  if (!type || seen.has(type)) return undefined;
  seen.add(type);
  const direct = emptyIntersectionInfo(type);
  if (direct) return direct;
  if (type.type === "Type" || type.type === "Nullable") {
    return findEmptyIntersection(type.subType, seen);
  }
  if (type.type === "Union") {
    for (const s of type.subTypes) {
      const hit = findEmptyIntersection(s, seen);
      if (hit) return hit;
    }
  }
  return undefined;
};

/**
 * Flag a `type X = A & B` (or a binding annotated with such an intersection)
 * whose two CONCRETE operands share no values, so the intersection is `never`.
 * A real value can never have this type — the binding-site `ensureType` already
 * errors if you try to *form* one — but the declaration itself is almost always
 * a mistake, so a `warning` at the declaration points it out even when no value
 * is constructed. Walks the symbol table's `type`/`variable` declarations (so it
 * sees ONLY annotated, source-level intersections, never a transient `never`
 * from narrowing). De-duplicated by binding identity.
 */
const emptyIntersections = (
  symbols: SymbolTable,
  out: VLDiagnostic[],
): void => {
  const reported = new Set<unknown>();
  for (const occ of symbols.occurrences) {
    if (!occ.isDecl) continue;
    const b = occ.binding;
    if (reported.has(b)) continue;
    if (b.kind !== "type" && b.kind !== "variable") continue;
    const info = findEmptyIntersection(b.type);
    if (!info) continue;
    reported.add(b);
    // A self-referential definition (`type E = A & E`) collapses to `never`
    // because the alias is defined in terms of itself — an honest, self-cycle
    // message rather than the disjoint-operands wording. Otherwise it's a
    // genuinely disjoint concrete pair (`A & B`).
    const message = info.selfRef
      ? `Type \`${info.selfRef}\` refers to itself inside an intersection ` +
        `(\`${info.text}\`), so it reduces to \`never\``
      : `Intersection \`${info.text}\` is empty (\`never\`) — ${info.reason}`;
    out.push({
      message,
      severity: "warning",
      // Range the warning on the `A & B` intersection EXPRESSION (the type
      // annotation span captured by the parser), not the alias name — matching
      // the never-value error. Fall back to the declaration span if no
      // annotation span was threaded.
      range: rangeFromCtx(info.span ?? b.decl),
      code: "empty-intersection",
      source: "vital",
    });
  }
};

// ---------------------------------------------------------------------------
// 3. Dead / constant branch (literal-boolean condition)
// ---------------------------------------------------------------------------

/**
 * Detect statically-dead branches driven by a *literal* boolean condition (no
 * general constant folding — only a `BooleanLiteral` in condition position):
 *   - `if false { … }`            → the then-branch is dead.
 *   - `if true { … } else { … }`  → the else-branch is dead.
 *   - `while false { … }`         → the body never runs.
 * One warning per dead construct, pointing at the dead branch/body. Recurses so
 * nested constructs are still scanned (including the live branch's contents).
 */
const constantBranchInStatement = (
  stmt: VLStatement,
  spans: NodeSpans,
  out: VLDiagnostic[],
): void => {
  switch (stmt.type) {
    case "If":
      reportConstantIf(stmt, spans, out);
      for (const c of stmt.conditionals) {
        constantBranchInStatement(c.statement, spans, out);
      }
      if (stmt.else) constantBranchInStatement(stmt.else, spans, out);
      break;
    case "While":
      reportConstantWhile(stmt, spans, out);
      constantBranchInStatement(stmt.statement, spans, out);
      break;
    case "Block":
      for (const s of stmt.statements) {
        constantBranchInStatement(s, spans, out);
      }
      break;
    case "For":
    case "ForIn":
      constantBranchInStatement(stmt.statement, spans, out);
      break;
    case "Return":
      if (stmt.value) constantBranchInExpr(stmt.value, spans, out);
      break;
    case "VariableDeclaration":
      if (stmt.value) constantBranchInExpr(stmt.value, spans, out);
      break;
    default:
      constantBranchInExpr(stmt as VLExpression, spans, out);
      break;
  }
};

/** Descend expressions that can host statements (blocks-as-values, fn bodies). */
const constantBranchInExpr = (
  expr: VLExpression,
  spans: NodeSpans,
  out: VLDiagnostic[],
): void => {
  switch (expr.type) {
    case "Block":
      for (const s of expr.statements) constantBranchInStatement(s, spans, out);
      break;
    case "If":
      constantBranchInStatement(expr as VLIfNode, spans, out);
      break;
    case "FunctionDeclaration":
      constantBranchInStatement(expr.body, spans, out);
      break;
    default:
      break;
  }
};

/** The literal boolean a condition is, or undefined if it is not a literal. */
const literalBool = (expr: VLExpression): boolean | undefined =>
  expr.type === "BooleanLiteral" ? expr.value : undefined;

const reportConstantIf = (
  node: VLIfNode,
  spans: NodeSpans,
  out: VLDiagnostic[],
): void => {
  // Only the leading `if`/`else if` chain head carries a meaningful literal; we
  // check each conditional, but a dead branch only makes sense for the first
  // (a chained `else if false` body is dead too — flag any literal-false arm).
  for (let i = 0; i < node.conditionals.length; i++) {
    const cond = node.conditionals[i];
    const lit = literalBool(cond.condition);
    if (lit === false) {
      const span = spanOf(spans, cond.statement);
      if (span) {
        out.push({
          message:
            "This branch is never taken: its condition is always `false`",
          severity: "warning",
          range: rangeFromCtx(span),
          code: "constant-condition",
          source: "vital",
          tags: ["unnecessary"],
        });
      }
    } else if (lit === true) {
      // `if true { … } else { … }`: the else (and any later arms) is dead.
      const deadStmt = node.conditionals[i + 1]?.statement ?? node.else;
      if (deadStmt) {
        const span = spanOf(spans, deadStmt);
        if (span) {
          out.push({
            message:
              "This branch is never taken: a preceding condition is always `true`",
            severity: "warning",
            range: rangeFromCtx(span),
            code: "constant-condition",
            source: "vital",
            tags: ["unnecessary"],
          });
        }
      }
      // A `true` arm short-circuits the rest of the chain — stop scanning.
      break;
    }
  }
};

const reportConstantWhile = (
  node: VLWhileNode,
  spans: NodeSpans,
  out: VLDiagnostic[],
): void => {
  if (literalBool(node.condition) !== false) return;
  const span = spanOf(spans, node.statement);
  if (!span) return;
  out.push({
    message: "This loop body never runs: its condition is always `false`",
    severity: "warning",
    range: rangeFromCtx(span),
    code: "constant-condition",
    source: "vital",
    tags: ["unnecessary"],
  });
};

// ---------------------------------------------------------------------------
// 4. Degenerate `for` step (literal `step 0`)
// ---------------------------------------------------------------------------

/**
 * A range `for` written with a literal `step 0` never advances its loop
 * variable — a degenerate / infinite loop. The parser already warns on a
 * provably-EMPTY range (`for i = 5 to 0` etc.) but deliberately excludes step 0
 * (an empty-range check can't fire when the step is zero); this rule covers it.
 * Reported as an ERROR — unlike an empty range (which is a harmless no-op), a
 * zero step that the program reaches loops forever. Recurses into nested bodies.
 */
const degenerateStepInStatement = (
  stmt: VLStatement,
  spans: NodeSpans,
  out: VLDiagnostic[],
): void => {
  switch (stmt.type) {
    case "For":
      reportDegenerateStep(stmt, spans, out);
      degenerateStepInStatement(stmt.statement, spans, out);
      break;
    case "ForIn":
    case "While":
      degenerateStepInStatement(stmt.statement, spans, out);
      break;
    case "If":
      for (const c of stmt.conditionals) {
        degenerateStepInStatement(c.statement, spans, out);
      }
      if (stmt.else) degenerateStepInStatement(stmt.else, spans, out);
      break;
    case "Block":
      for (const s of stmt.statements) {
        degenerateStepInStatement(s, spans, out);
      }
      break;
    case "Return":
      if (stmt.value) degenerateStepInExpr(stmt.value, spans, out);
      break;
    case "VariableDeclaration":
      if (stmt.value) degenerateStepInExpr(stmt.value, spans, out);
      break;
    default:
      degenerateStepInExpr(stmt as VLExpression, spans, out);
      break;
  }
};

const degenerateStepInExpr = (
  expr: VLExpression,
  spans: NodeSpans,
  out: VLDiagnostic[],
): void => {
  switch (expr.type) {
    case "Block":
      for (const s of expr.statements) degenerateStepInStatement(s, spans, out);
      break;
    case "If":
      degenerateStepInStatement(expr as VLIfNode, spans, out);
      break;
    case "FunctionDeclaration":
      degenerateStepInStatement(expr.body, spans, out);
      break;
    default:
      break;
  }
};

const reportDegenerateStep = (
  node: VLForNode,
  spans: NodeSpans,
  out: VLDiagnostic[],
): void => {
  const step = node.step;
  if (!step || step.type !== "IntegerLiteral" || step.value !== 0) return;
  // Point at the `step 0` expression where possible, else the whole loop.
  const span = spanOf(spans, step) ?? spanOf(spans, node);
  if (!span) return;
  out.push({
    message:
      "`for` step is 0: the loop variable never advances (degenerate/infinite loop)",
    severity: "error",
    range: rangeFromCtx(span),
    code: "for-step-zero",
    source: "vital",
  });
};

// ---------------------------------------------------------------------------
// 5. Unreachable code
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
        message: "Unreachable code: this can never execute",
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
