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
   * The binding's declared/inferred type — what hover renders; holes
   * (`Infer`/`Unknown`) may appear for still-generic params.
   */
  type?: VLType;
};

/** One textual appearance of a name, resolved to the binding it refers to. */
export type SymbolOccurrence = {
  /** Span of this identifier in the source. */
  span: Context;
  binding: Binding;
  /** True for the declaration's own identifier; false for a use. */
  isDecl: boolean;
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
