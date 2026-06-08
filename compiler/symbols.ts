// Symbol/binding table for go-to-definition and find-references (roadmap D2).
//
// Pure data + position math, no runtime globals — bundled into both the Deno
// CLI and the Node LSP (see AGENTS.md "dual-runtime" constraint).
//
// The model: every *declaration* of a name (a `let`/`const` binding, a function
// parameter, a function declaration, a `type` alias) is a `Binding` carrying the
// span of its defining identifier. Every *occurrence* of a name (the declaration
// itself, plus each use that resolves to it) is a `SymbolOccurrence` pointing at
// its `Binding`. The parser populates this while it already walks the lexical
// `scopes` stack, so resolution reuses the existing scope machinery rather than
// running a second resolver (D2 design note → DECISIONS.md).
//
// The LSP queries by cursor position: `definitionAt` maps a cursor to the
// defining span of the binding it lands on; `referencesAt` maps it to every
// occurrence of that binding.

import type { Context, Position, VLType } from "./ast.ts";

/** What kind of thing a name binds to (drives nothing yet; useful for clients). */
export type BindingKind = "variable" | "parameter" | "function" | "type";

/** A single declaration: its name and the span of its defining identifier. */
export type Binding = {
  name: string;
  kind: BindingKind;
  /** Span of the declaring identifier (what go-to-definition jumps to). */
  decl: Context;
  /**
   * For a `variable` binding, the span of its declaration KEYWORD (`let` /
   * `const`). The prefer-`const` lint points its diagnostic here — the keyword is
   * the actionable token (`let`→`const`), not the variable name. Stamped by the
   * parser at the variable-declaration site; undefined for kinds with no such
   * keyword (parameters, functions, types) and for bindings created before this
   * field existed.
   */
  declKeyword?: Context;
  /**
   * The binding's declared/inferred type — what hover renders; holes
   * (`Infer`/`Unknown`) may appear for still-generic params.
   */
  type?: VLType;
  /**
   * Source span over which this binding is *visible* — its enclosing lexical
   * scope's extent (the program span for top-level decls, the enclosing `{ … }`
   * block for locals, the function span for parameters). Stamped by the parser
   * when the scope it lives in closes (see `parseProgram`). Drives scope-aware
   * completion (roadmap D3): a name is in scope at position P iff `scope`
   * contains P. We do *not* require the declaration to textually precede P — a
   * function/type may be used before its declaration, and a `let` is visible for
   * the whole block; ordering filters (if wanted) are the caller's concern.
   * Optional because a binding declared in a scope that errored out before
   * closing may never be stamped (and pre-D3 callers never set it).
   */
  scope?: Context;
  /**
   * Markdown doc-comment authored on the declaration: the run of consecutive
   * `///` lines immediately preceding it, concatenated (each line's `///` + one
   * leading space stripped). Surfaced as rendered markdown in LSP hover and
   * completion `documentation`. Undefined when the declaration has no `///` doc.
   */
  doc?: string;
  /**
   * Whether this binding's *name* may be rebound. True for `let` variables (and
   * by default for parameters, which are local copies); false for `const`
   * variables. Governs only rebind/reassignment of the name (`x = …`, `x++`),
   * NOT mutation of the data behind it (`obj.x = …` / `a[i] = …` stay legal
   * regardless — that's the separate A9 readonly / immutable-value-type axis).
   * The lint pass's prefer-`const` rule pairs this with occurrence `isWrite`
   * flags to flag a `let` that is never reassigned (it should be a `const`).
   * Undefined for kinds where it doesn't apply (functions, types).
   */
  mutable?: boolean;
  /**
   * Module system (phase 1): `true` when this top-level binding carried an
   * `export` modifier. An exported binding is consumer-facing surface, not dead
   * code, so the unused-variable lint exempts it (an exported top-level `let`
   * unread *within* its own module is still part of the module's public API).
   * Undefined for non-exported / nested bindings.
   */
  exported?: boolean;
  /**
   * The span of the `export` keyword token for this binding, when it was declared
   * with an explicit `export` modifier. Stamped by the parser alongside
   * `binding.exported = true`. Used by the LSP unused-export pass to range the
   * "redundant export" hint on the keyword itself (not the name) — when an export
   * is used only within its own module but never imported by another module, the
   * hint greys the `export` keyword to signal it can be dropped.
   * Undefined for non-exported bindings or bindings created before this field.
   */
  exportKeywordSpan?: Context;
  /**
   * Module system: `true` when this binding was introduced by an `import { … }`
   * specifier (stamped in `parseImport`). The unused-variable lint treats an
   * unused IMPORT differently from an unused local/parameter: there is no
   * meaningful `_`-prefix suppression for an import (prefixing the local would
   * have to go through aliasing — `{ x as _x }` — which is not what a bare
   * `_`-insert does), so the rule emits an "Unused import … (remove it)" message
   * under the distinct `unused-import` code, and the quick-fix removes the
   * specifier (and the whole `import` line when it was the only one) rather than
   * offering a `_`-prefix. Undefined for ordinary (non-import) bindings.
   */
  isImport?: boolean;
};

/** One textual appearance of a name, resolved to the binding it refers to. */
export type SymbolOccurrence = {
  /** Span of this identifier in the source. */
  span: Context;
  binding: Binding;
  /** True for the declaration's own identifier; false for a use. */
  isDecl: boolean;
  /**
   * True when this occurrence is the *target* of an assignment (`x = …`,
   * `x += …`, `x++`) rather than a read. The lint pass uses this to tell a
   * never-reassigned `let` (a prefer-`const` candidate) from a `let` that is
   * mutated. A write occurrence is still a (non-decl) occurrence, so it also
   * counts as a "use" for the unused-variable rule — assigning to a binding
   * keeps it from being reported unused. Absent/`false` is a plain read.
   */
  isWrite?: boolean;
};

/**
 * Position-indexed symbol information for one document. `occurrences` is the
 * flat list the parser appends to; the query helpers scan it (documents are
 * small and edits recompile, so a linear scan is plenty — no interval tree).
 */
export class SymbolTable {
  readonly occurrences: SymbolOccurrence[] = [];

  /** Record the declaration's own identifier as an occurrence of its binding. */
  declare(binding: Binding): Binding {
    this.occurrences.push({ span: binding.decl, binding, isDecl: true });
    return binding;
  }

  /** Record a use of `binding` at `span`. */
  use(binding: Binding, span: Context): void {
    this.occurrences.push({ span, binding, isDecl: false });
  }

  /**
   * Mark an already-recorded use occurrence at `span` as an assignment *write*
   * target (`x = …`). The parser records the LHS name as an ordinary use first
   * (while precedence-climbing the expression), then — once it knows the
   * expression is an assignment — calls this to upgrade that occurrence's
   * `isWrite` flag. Matches by the exact span of the most recent occurrence so it
   * touches only the LHS name, not an unrelated same-name read elsewhere. No-op
   * if no matching occurrence is found (defensive).
   */
  markWrite(span: Context): void {
    for (let i = this.occurrences.length - 1; i >= 0; i--) {
      const occ = this.occurrences[i];
      if (
        !occ.isDecl &&
        occ.span.start.line === span.start.line &&
        occ.span.start.column === span.start.column &&
        occ.span.stop.line === span.stop.line &&
        occ.span.stop.column === span.stop.column
      ) {
        occ.isWrite = true;
        return;
      }
    }
  }

  /** The occurrence whose span contains `pos`, if any (innermost wins). */
  occurrenceAt(pos: Position): SymbolOccurrence | undefined {
    let best: SymbolOccurrence | undefined;
    for (const occ of this.occurrences) {
      if (!spanContains(occ.span, pos)) continue;
      // Prefer the tightest span (a use nested in a larger node, e.g. a name
      // inside a call, shouldn't be shadowed by an outer occurrence).
      if (best === undefined || spanShorter(occ.span, best.span)) best = occ;
    }
    return best;
  }

  /** The defining span for the binding under `pos` (go-to-definition). */
  definitionAt(pos: Position): Context | undefined {
    return this.occurrenceAt(pos)?.binding.decl;
  }

  /**
   * Every occurrence (declaration + uses) of the binding under `pos`
   * (find-references). `includeDeclaration` controls whether the declaring
   * identifier itself is included (LSP passes this through the request).
   */
  referencesAt(pos: Position, includeDeclaration = true): Context[] {
    const occ = this.occurrenceAt(pos);
    if (!occ) return [];
    return this.occurrences
      .filter((o) =>
        o.binding === occ.binding && (includeDeclaration || !o.isDecl)
      )
      .map((o) => o.span);
  }

  /**
   * Every distinct `Binding` *visible* at `pos` — the data behind scope-aware
   * identifier completion (roadmap D3). A binding is visible when its stamped
   * `scope` span contains `pos` (locals/params/functions/types alike; see
   * `Binding.scope`). Builtins live in `defaultScope` and have no source span,
   * so they are *not* returned here — the caller folds those in separately.
   *
   * Shadowing: when several bindings of the same name are visible (an inner
   * `let x` shadows an outer one), the one with the *tightest* enclosing scope
   * wins, matching lexical resolution. Returns one binding per name.
   *
   * Each binding is also de-duplicated by identity first: the parser may re-stamp
   * the same binding via nested closing scopes, but the occurrence list still
   * holds it once per textual appearance, so we collapse to unique bindings.
   */
  bindingsInScopeAt(pos: Position): Binding[] {
    // name -> the visible binding with the tightest enclosing scope so far.
    const byName = new Map<string, Binding>();
    const seen = new Set<Binding>();
    for (const occ of this.occurrences) {
      const { binding } = occ;
      if (seen.has(binding)) continue;
      seen.add(binding);
      if (!binding.scope || !spanContains(binding.scope, pos)) continue;
      const incumbent = byName.get(binding.name);
      // Tighter (more specific) scope shadows a looser one of the same name.
      if (incumbent === undefined || scopeTighter(binding.scope, incumbent.scope!)) {
        byName.set(binding.name, binding);
      }
    }
    return [...byName.values()];
  }
}

/** `a <= b` over positions (1-based line, 0-based column). */
const posLE = (a: Position, b: Position): boolean =>
  a.line < b.line || (a.line === b.line && a.column <= b.column);

/**
 * Whether `span` covers `pos`. `start` is inclusive, `stop` is exclusive (one
 * past the last character — the lexer/parser convention, see ast.ts). The
 * cursor at the end column of an identifier still counts as "on" it, so a click
 * just past the last char resolves; clamp by treating `stop` inclusively here.
 */
export const spanContains = (span: Context, pos: Position): boolean =>
  posLE(span.start, pos) && posLE(pos, span.stop);

/** True when `a` is a strictly shorter (more specific) span than `b`. */
const spanShorter = (a: Context, b: Context): boolean => {
  const aSameLine = a.start.line === a.stop.line;
  const bSameLine = b.start.line === b.stop.line;
  if (aSameLine && bSameLine) {
    return (a.stop.column - a.start.column) < (b.stop.column - b.start.column);
  }
  const aLines = a.stop.line - a.start.line;
  const bLines = b.stop.line - b.start.line;
  return aLines < bLines;
};

/**
 * True when scope `a` is *tighter* (more deeply nested) than scope `b`, used to
 * decide which of two equally-named visible bindings shadows the other. A nested
 * scope is enclosed by its parent, so `a` is tighter when `b` contains `a`'s
 * bounds. Falls back to {@link spanShorter} when neither strictly encloses the
 * other (defensive — sibling scopes can't both be visible at one position).
 */
const scopeTighter = (a: Context, b: Context): boolean => {
  const bEnclosesA = posLE(b.start, a.start) && posLE(a.stop, b.stop);
  const aEnclosesB = posLE(a.start, b.start) && posLE(b.stop, a.stop);
  if (bEnclosesA && !aEnclosesB) return true;
  if (aEnclosesB && !bEnclosesA) return false;
  return spanShorter(a, b);
};

