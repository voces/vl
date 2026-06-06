// AST + type-system node definitions for VL. Pure types, no runtime.

// A source position: 1-based line, 0-based column (matching the convention the
// diagnostics layer expects — see `rangeFromCtx` in compile.ts).
export type Position = { line: number; column: number };

// A source span attached to AST/diagnostic nodes for error reporting. `start` is
// the first character (inclusive); `stop` is one past the last character
// (exclusive). The type algebra only stores a `Context` on diagnostics — it
// never inspects it — so a plain span is all that is needed.
export type Context = { start: Position; stop: Position };

/**
 * Public side-table mapping an AST node (by object identity) to its source span
 * (`Context`). The parser builds this while emitting the AST and now returns it
 * (see `parseProgram` / `compile` / `checkOnly`) so consumers — an AST-driven
 * formatter, real inlay-hint `annotated` flags, doc-comment cross-refs — can
 * recover the source extent of any node without re-walking tokens. A WeakMap so
 * it never retains nodes; query it with the `spanOf` accessor exported alongside
 * the AST. Not every node is guaranteed present (synthesized/desugared nodes may
 * be absent), so `spanOf` returns `Context | undefined`.
 */
export type NodeSpans = WeakMap<object, Context>;

/**
 * Look up the source span recorded for `node` in `spans`, or `undefined` if the
 * node carries no recorded span (e.g. a synthesized node). Thin, intentional
 * indirection so consumers don't depend on the side-table being a WeakMap.
 */
export const spanOf = (
  spans: NodeSpans,
  node: object,
): Context | undefined => spans.get(node);

export type VLParameterNode = {
  type: "Parameter";
  name: string;
  paramaterType: VLType;
};

export type VLFunctionDeclarationNode = {
  type: "FunctionDeclaration";
  name: string | undefined;
  parameters: VLParameterNode[];
  body: VLStatement;
  returnType: VLType;
  /**
   * Surface names of declared type parameters (`function foo<T>(...)`). Each is
   * bound to a single shared `{Infer, Unknown}` hole during parsing so that all
   * annotation positions naming it stay correlated per call (monomorphization).
   * Additive metadata for LSP/diagnostics; not load-bearing for typechecking.
   */
  typeParameters?: string[];
};

export type VLNameNode = {
  type: "Name";
  name: string;
};

export type VLBlockNode = {
  type: "Block";
  label: string | undefined;
  statements: VLStatement[];
  /**
   * The block's fall-through value type (type of its last statement), computed
   * during the walk while the block's scope is still live. Cached because the
   * scope — including any nested declarations the last statement references — is
   * popped before return-type inference would re-derive the type.
   */
  valueType?: VLType;
};

export type VLPropertyAccessNode = {
  type: "PropertyAccess";
  object: VLExpression;
  property: string;
};

export type VLIndexAccessNode = {
  type: "IndexAccess";
  array: VLExpression;
  index: VLExpression;
};

/** Optional (null-safe) property read `x?.y`: `null` if `x` is null, else `x.y`. */
export type VLOptionalAccessNode = {
  type: "OptionalAccess";
  object: VLExpression;
  property: string;
};

/** Null-coalescing `x ?? y`: `x` when non-null, else `y`. */
export type VLNullCoalesceNode = {
  type: "NullCoalesce";
  left: VLExpression;
  right: VLExpression;
};

export type VLArgumentNode = {
  type: "Argument";
  name: string | undefined;
  value: VLExpression;
  context: Context;
};

export type VLFunctionCallNode = {
  type: "FunctionCall";
  function: string;
  arguments: VLArgumentNode[];
  functionType: VLFunctionType | undefined;
};

/** Calling an arbitrary expression value (e.g. `o.f(args)`), vs a named call. */
export type VLCallNode = {
  type: "Call";
  callee: VLExpression;
  arguments: VLArgumentNode[];
  functionType: VLFunctionType | undefined;
};

export type VLStringLiteralNode = {
  type: "StringLiteral";
  value: string;
};

export type VLIntegerLiteralNode = {
  type: "IntegerLiteral";
  value: number;
  text: string;
};

export type VLRealLiteralNode = {
  type: "RealLiteral";
  value: number;
};

export type VLBooleanLiteralNode = {
  type: "BooleanLiteral";
  value: boolean;
};

export type VLNullLiteral = { type: "NullLiteral" };

export type VLPropertyLiteral = {
  type: "PropertyLiteral";
  name: VLNameNode | VLStringLiteralNode | VLExpression;
  value: VLExpression;
};

export type VLObjectLiteralNode = {
  type: "ObjectLiteral";
  properties: VLPropertyLiteral[];
};

export type VLArrayLiteralNode = {
  type: "ArrayLiteral";
  values: VLExpression[];
};

export type VLBinaryOperationNode = {
  type: "BinaryOperation";
  left: VLExpression;
  right: VLExpression;
  operator: string;
  /**
   * Reprint fidelity (Track G, gap 3): the surface compound-assignment operator a
   * `=` assignment was written with, e.g. `"+"` for `a += b`. The parser desugars
   * `a += b` to `a = a + b` (an `operator: "="` node whose `right` is itself a
   * `BinaryOperation`), which loses the `+=` spelling. This field records it on
   * the outer assignment node so an AST→source printer can reprint `a += b`
   * rather than `a = a + b`. Present ONLY on the outer assignment node of a
   * compound assignment; absent for a plain `a = b` and for every non-assignment
   * binary op. Additive metadata: typecheck/codegen ignore it (they read the
   * already-desugared `right`).
   */
  compoundOperator?: string;
};

// Unary operators: logical not (`!`) and in/decrement (`++` / `--`).
// `prefix` distinguishes `++x` (returns the new value) from `x++` (the old).
export type VLUnaryOperationNode = {
  type: "UnaryOperation";
  operator: string;
  operand: VLExpression;
  prefix: boolean;
};

// Type guard (A6): `x is T` — tests whether `value` is currently of `checkType`,
// yielding a boolean and (in an `if`) narrowing `value` to `checkType`.
export type VLIsNode = {
  type: "Is";
  value: VLExpression;
  checkType: VLType;
  /**
   * `x !is T` (A4): the negation of `x is T`. The result boolean is inverted and
   * the then/else narrowings are swapped — then-branch subtracts `T`, else-branch
   * intersects `T`. Absent/`false` is a plain `x is T`.
   */
  negated?: boolean;
};

export type VLVariableDeclarationNode = {
  type: "VariableDeclaration";
  name: string;
  variableType: VLType;
  value: VLExpression | undefined;
  mutable: boolean;
  /**
   * Reprint fidelity (Track G, gap 4): whether the binding was written with an
   * explicit type annotation (`let x: T = …`) vs. left to inference (`let x =
   * …`). When inferred, `variableType` holds the *inferred* type, which is
   * indistinguishable from an explicit annotation — so an AST→source printer
   * would otherwise synthesize a `: T` the user never wrote. `true` only when a
   * `:` annotation was actually present in source. Also lets inlay hints (D6)
   * show an inferred-type hint exactly where no annotation exists. Additive
   * metadata: typecheck/codegen ignore it.
   */
  annotated: boolean;
};

export type VLIfNode = {
  type: "If";
  conditionals: { condition: VLExpression; statement: VLStatement }[];
  else: VLStatement | undefined;
};

export type VLValue =
  | VLStringLiteralNode
  | VLIntegerLiteralNode
  | VLRealLiteralNode
  | VLBooleanLiteralNode
  | VLNullLiteral
  | VLObjectLiteralNode
  | VLFunctionDeclarationNode
  | VLArrayLiteralNode;

export type VLExpression =
  | VLNameNode
  | VLBlockNode
  | VLValue
  | VLPropertyAccessNode
  | VLIndexAccessNode
  | VLOptionalAccessNode
  | VLNullCoalesceNode
  | VLBinaryOperationNode
  | VLUnaryOperationNode
  | VLIsNode
  | VLFunctionCallNode
  | VLCallNode
  | VLIfNode;

export type VLReturnNode = {
  type: "Return";
  value: VLExpression | undefined;
};

export type VLWhileNode = {
  type: "While";
  condition: VLExpression;
  statement: VLStatement;
  label: string | undefined;
};

export type VLForNode = {
  type: "For";
  variable: string;
  from: VLExpression;
  to: VLExpression;
  step: VLExpression | undefined;
  statement: VLStatement;
  label: string | undefined;
};

// `for x in arr` — iterate an array's elements (the `to`-less form of `for`).
export type VLForInNode = {
  type: "ForIn";
  variable: string;
  iterable: VLExpression;
  statement: VLStatement;
  label: string | undefined;
};

export type VLBreakNode = {
  type: "Break";
  label: string | undefined;
};

export type VLContinueNode = {
  type: "Continue";
  label: string | undefined;
};

export type VLStatement =
  | VLReturnNode
  | VLExpression
  | VLVariableDeclarationNode
  | VLWhileNode
  | VLForNode
  | VLForInNode
  | VLBreakNode
  | VLContinueNode;

export type VLAliasType = { type: "Alias"; name: string };
// TODO: exceptions
export type VLFunctionType = {
  type: "Function";
  paramaters: VLParameterNode[];
  return: VLType;
};
export type VLObjectType = {
  type: "Object";
  properties: { name: VLType; type: VLType }[];
  name?: string;
};
export type VLUnknownType = { type: "Unknown" };
export type VLNullableType = { type: "Nullable"; subType: VLType };
export type VLUnionType = { type: "Union"; subTypes: VLType[] };
// Set-theoretic refinement types (A3/A4). Produced by flow narrowing AND by
// surface annotations (`A & B`, `!A`): an `Intersection` is `A & B` (both hold —
// the then-branch refinement), a `Negation` is `not A` (the false-branch
// subtraction). Both simplify aggressively against finite unions, so they
// rarely survive into codegen; an open-world residual is dropped to its
// positive part (see `intersectType`/`subtractType`). A surface intersection is
// folded through `intersectType` at parse time, so a finite annotation reaches
// codegen as its concrete simplification (`(0|1|2) & !2` → `0 | 1`).
export type VLIntersectionType = { type: "Intersection"; subTypes: VLType[] };
export type VLNegationType = { type: "Negation"; subType: VLType };
export type VLNeverType = { type: "Never" };
// A `type` alias binding. `params` is present (and non-empty) for a *generic*
// alias (`type Box<T> = …`): each entry is the shared `{Infer, Unknown}` hole
// that `T` resolves to inside `subType`. Applying the alias (`Box<i32>`) clones
// `subType` together with the params, unifies each param hole against a type
// argument, then collapses to a concrete type (see `instantiateAlias`). A
// non-generic alias omits `params` and resolves directly through `subType`.
export type VLTypeType = {
  type: "Type";
  subType: VLType;
  params?: VLInferType[];
  // The source-level name of the alias this `Type` node stands for (D8). Set
  // when a named `type` alias is resolved into a `Type` node, so display
  // (hover/inlay) can render the alias *name* (`I32`) rather than its expanded
  // body (`i32`) — mirroring TS's `aliasSymbol`. Purely additive: typechecking
  // already unwraps `Type` nodes transparently, so anything that ignores `name`
  // behaves exactly as before. Absent for the internal/anonymous `Type` wrapper.
  name?: string;
};
export type VLInferType = {
  type: "Infer";
  subType: VLType;
  // Set when this hole is the return of a `Map()` / `Set()` constructor whose
  // concrete type is to be pinned from context (B6a). Lets the diagnostic checks
  // recognize an unpinned / wrongly-pinned map constructor and report a clear
  // error instead of failing opaquely in codegen.
  mapCtor?: "Map" | "Set";
};
export type VLCustomType = {
  type: "Custom";
  validate: (right: VLType) => boolean;
  name?: string;
};
export type VLType =
  | VLAliasType
  | VLFunctionType
  | VLObjectType
  | VLStringLiteralNode
  | VLIntegerLiteralNode
  | VLRealLiteralNode
  | VLBooleanLiteralNode
  | VLUnknownType
  | VLNullableType
  | VLUnionType
  | VLIntersectionType
  | VLNegationType
  | VLNeverType
  | VLTypeType
  | VLInferType
  | VLCustomType;

export type Scope = Record<string, VLType>;

export type VLProgramNode = {
  type: "Program";
  statements: VLStatement[];
  scope: Scope;
};

export type VLNode = VLProgramNode;

export type ParseErrors =
  | {
    type: "Redeclaration";
    name: string;
    ctx: Context;
    code: number;
  }
  | { type: "Undeclared"; name: string; ctx: Context; code: number | string }
  | {
    type: "Type";
    left: VLType;
    right: VLType;
    ctx: Context;
    code: number | string;
  }
  | { type: "UnmatchedParameter"; ctx: Context; code: number }
  | {
    type: "Syntax";
    message: string;
    ctx: Context;
    code: number;
    // Defaults to "error" when omitted (see `diagnosticFromError`). Lets a
    // diagnostic be a non-fatal warning (e.g. a provably-empty `for` range).
    severity?: "error" | "warning" | "info";
  }
  | { type: "Property"; property: VLType; ctx: Context; code: number };
