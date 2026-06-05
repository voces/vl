// Shared mutable state for a single parse/type-check pass. The type algebra
// (typecheck.ts) and the CST walker (toAST.ts) both read and write this.
import type { ParseErrors, Scope, VLType } from "./ast.ts";

/** The lexical scope stack (innermost last). */
export const scopes: Scope[] = [];

export const withScope = <T>(scope: Scope, fn: () => T) => {
  scopes.push(scope);
  try {
    return fn();
  } finally {
    scopes.pop();
  }
};

/** Diagnostics accumulated during the pass. */
export const errors: ParseErrors[] = [];

/**
 * Flow-narrowing overlay for *property paths* (`o.v`, `o.v.w`) — a place that a
 * lexical scope can't hold (only a bare name can). Inside `if o.v is i32 { … }`,
 * `o.v`'s type is overridden to the narrowed variant here, keyed by a canonical
 * path string. A bare `Name` keeps using the scope stack; this covers the rest.
 * Consulted by `typeFromExpression` (PropertyAccess), written by the if-walker.
 */
export const narrowedPaths: Record<string, VLType> = {};

/**
 * Expected implicit type for value-returning expressions (the last statement of
 * a block, a binary operand, etc.). A holder object because it is reassigned
 * across the typecheck.ts / toAST.ts module boundary, which a bare `let` export
 * cannot be.
 */
export const flow: { desiredType: VLType | undefined } = {
  desiredType: undefined,
};

/**
 * Inferred type-guard functions (A6b, degenerate case): function name → which
 * parameter it narrows and the direction (matching `conditionNarrowing`'s
 * `nonNullOn`). Populated when a function's body is exactly `return
 * <narrowing-predicate-on-a-param>`; read when such a function is called in a
 * condition, to narrow the argument. Cleared at the start of each pass.
 */
export const guards = new Map<
  string,
  { paramIndex: number; nonNullOn: "then" | "else" }
>();
