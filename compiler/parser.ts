// Hand-written recursive-descent + precedence-climbing (Pratt) parser for VL.
//
// This replaces BOTH the antlr4-generated parser and the CST→AST walker that
// `toAST.ts` used to be: it emits the typed AST (`VLExpression`/`VLStatement`
// from `ast.ts`) directly while driving the type algebra (`typecheck.ts`) — the
// type-checking half of the old `toAST.ts` is preserved verbatim, only the
// CST-walking half is gone. The operator-precedence cascade that the grammar's
// ordered `expr` alternatives encoded is here a Pratt loop (`parseBinary`).
//
// Significant newlines: NEWLINE terminates a statement, but the dedicated parsers
// for brackets/objects/arrays/args/groups skip newlines internally — so the
// `NEWLINE*` that the grammar sprinkled everywhere lives in a few `skipNewlines`
// calls instead.
import type { Token, TokenKind } from "./lexer.ts";
import { Narrowing } from "./typecheck.ts";
import {
  arrayElementType,
  conditionNarrowing,
  defaultIntegerType,
  elseNarrowings,
  ensureType,
  flattenType,
  getChildType,
  getConcreteType,
  getType,
  instantiateAlias,
  instantiateFunctionType,
  intersectType,
  isListType,
  listMemberType,
  makeExact,
  mapKeyValueType,
  mapMemberType,
  nonNullable,
  postGuardNarrowings,
  setElementType,
  setMemberType,
  softenImplicitType,
  thenNarrowings,
  typeFromExpression,
  typeFromStatement,
  updateType,
  validateType,
  withNarrowings,
} from "./typecheck.ts";
import { errors, flow, guards, narrowedPaths, scopes } from "./state.ts";
import { type Binding, type BindingKind, SymbolTable } from "./symbols.ts";
import type {
  Context,
  NodeSpans,
  ParseErrors,
  Scope,
  VLArgumentNode,
  VLArrayLiteralNode,
  VLBinaryOperationNode,
  VLBlockNode,
  VLBreakNode,
  VLCallNode,
  VLContinueNode,
  VLExpression,
  VLFunctionCallNode,
  VLFunctionDeclarationNode,
  VLFunctionType,
  VLIfNode,
  VLImportNode,
  VLInferType,
  VLIsNode,
  VLNullCoalesceNode,
  VLObjectLiteralNode,
  VLParameterNode,
  VLProgramNode,
  VLPropertyLiteral,
  VLReturnNode,
  VLStatement,
  VLType,
  VLTypeType,
  VLUnaryOperationNode,
  VLVariableDeclarationNode,
} from "./ast.ts";

// Token kinds that begin a statement (not an object-literal pair) — used to
// disambiguate a `{` that opens a block from one that opens an object literal.
const STATEMENT_KEYWORDS: ReadonlySet<TokenKind> = new Set<TokenKind>([
  "LET",
  "CONST",
  "RETURN",
  "IF",
  "WHILE",
  "FOR",
  "BREAK",
  "CONTINUE",
  "TYPE",
  "FUNCTION",
]);

// Operator tokens that may name a `self`-method function (`function +(self, b)`).
const OPERATOR_FUNC_NAMES: ReadonlySet<TokenKind> = new Set<TokenKind>([
  "PLUS",
  "MINUS",
  "STAR",
  "DIV",
  "MOD",
  "CARET",
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL_TO",
  "LESS_THAN",
  "LESS_THAN_OR_EQUAL_TO",
  "EQUAL_TO",
  "NOT_EQUAL_TO",
]);

// Arithmetic operators that can form a compound assignment (`+=`, `*=`, …) when
// immediately followed by `=`.
const ARITH_ASSIGN_OPS: ReadonlySet<TokenKind> = new Set<TokenKind>([
  "PLUS",
  "MINUS",
  "STAR",
  "DIV",
  "MOD",
  "CARET",
]);

export const parseProgram = (
  tokens: Token[],
  initialScope: Scope = {},
): [VLProgramNode, ParseErrors[], SymbolTable, NodeSpans] => {
  // Reset the shared pass state (mirrors the old `toAST`).
  scopes.splice(0);
  errors.splice(0);
  guards.clear();
  for (const k in narrowedPaths) delete narrowedPaths[k];

  let pos = 0;
  /**
   * Source span of each AST node. Populated by `record` as nodes are emitted and
   * returned to callers (a public `NodeSpans`) so formatter / inlay-hint /
   * doc-xref consumers can recover any node's source extent. Query via `spanOf`.
   */
  const spans: NodeSpans = new WeakMap<object, Context>();

  // ---- symbol table (go-to-definition / find-references, D2) ----------------
  // The binding-resolution piggybacks on the live `scopes` stack: each scope
  // object carries a parallel name→Binding map (keyed by the scope object's
  // identity, so push/pop sites need no changes). Resolving a use walks `scopes`
  // exactly as type lookup does (`getType`), then records the use against the
  // binding it lands on. Ephemeral narrowing scopes (`withNarrowings`) have no
  // binding map, so a use inside `if x is T {}` still resolves to x's real
  // declaration — the desired behaviour.
  const symbols = new SymbolTable();
  const scopeBindings = new WeakMap<Scope, Map<string, Binding>>();
  /** Declare `name` in `scope`, record its declaring identifier, return it. */
  const declareBinding = (
    scope: Scope,
    name: string,
    kind: BindingKind,
    decl: Context,
    type?: VLType,
    doc?: string,
    mutable?: boolean,
  ): Binding => {
    let map = scopeBindings.get(scope);
    if (!map) scopeBindings.set(scope, map = new Map());
    const binding: Binding = { name, kind, decl, type, doc, mutable };
    map.set(name, binding);
    symbols.declare(binding);
    return binding;
  };
  /** Find the binding `name` resolves to in the current scope stack, if any. */
  const resolveBinding = (name: string): Binding | undefined => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const binding = scopeBindings.get(scopes[i])?.get(name);
      if (binding) return binding;
    }
    return undefined;
  };
  /**
   * Reject a rebind of an immutable (`const`) binding. Covers `x = …` and
   * `x++`/`x--` where `x` resolves to a `const` variable. This is *binding*
   * mutability only — mutating the data behind the name (`o.x = …`, `a[i] = …`)
   * is a separate axis and stays legal regardless of how the name was declared.
   */
  const checkRebind = (name: string, ctx: Context): void => {
    const binding = resolveBinding(name);
    if (binding && binding.kind === "variable" && binding.mutable === false) {
      errors.push({
        type: "Syntax",
        message:
          `cannot reassign \`const\` ${name} — declare it \`let\` to allow reassignment`,
        ctx,
        code: 0,
      });
    }
  };
  /** Record a use of `name` at `span`, resolved through the scope stack. */
  const recordUse = (name: string, span: Context): void => {
    const binding = resolveBinding(name);
    if (binding) symbols.use(binding, span);
  };
  /**
   * Stamp every `Binding` declared in `scope` with `span`, the source extent over
   * which those bindings are visible (roadmap D3 scope-aware completion — see
   * `Binding.scope`). Called as each binding-bearing scope closes (block end,
   * function span, program end), once the closing position is known. Idempotent
   * and additive: scopes with no bindings (e.g. transient type-param scopes) are
   * no-ops, and re-stamping is harmless. Leaves `binding.scope` untouched for
   * scopes that error out before this runs (the field stays optional).
   */
  const stampScope = (scope: Scope, span: Context): void => {
    const map = scopeBindings.get(scope);
    if (!map) return;
    for (const binding of map.values()) binding.scope = span;
  };

  /** Implicit return types collected from the current function body. */
  let returnTypes: VLType[] = [];
  /** Expected return type for `return` statements in the current function. */
  let returnType: VLType | undefined;
  /**
   * Names of `type` aliases whose body is currently being parsed. A reference to
   * one of these from inside its own definition (a recursive structural type,
   * `type Tree = { …: Tree … }`) resolves to a lazy `Alias` leaf rather than being
   * eagerly inlined — so the body stays a finite structure with the recursion
   * carried by the name, resolved on demand (A11).
   */
  const typeBuilding = new Set<string>();
  /**
   * Top-level function names whose *signature* was hoisted into the module scope
   * by the forward-reference pre-pass (see `preRegisterTopLevelFunctions`), so a
   * call to a function declared later in the file — or a mutually-recursive cycle
   * (`isEven` ↔ `isOdd`) — resolves. The set lets the real `parseFunctionDeclaration`
   * pass distinguish "already in scope because I hoisted it" from a genuine B16
   * redeclaration, and avoids re-erroring on the hoisted entry.
   */
  const preregistered = new Set<string>();

  // A fresh bare `return` node — the fallback body for a malformed statement.
  // A factory (not a shared constant) so each use is a distinct AST node.
  const emptyReturn = (): VLReturnNode => ({
    type: "Return",
    value: undefined,
  });

  // ---- token cursor helpers ------------------------------------------------

  const peek = (k = 0): Token => tokens[Math.min(pos + k, tokens.length - 1)];
  const at = (kind: TokenKind): boolean => peek().kind === kind;
  const atEnd = (): boolean => at("EOF");
  const next = (): Token => tokens[pos++];
  const prev = (): Token => tokens[pos - 1];

  const expect = (kind: TokenKind): Token => {
    if (at(kind)) return next();
    const t = peek();
    errors.push({
      type: "Syntax",
      message: `Syntax error: expected ${kind} but found ${
        t.kind === "EOF" ? "end of input" : JSON.stringify(t.text)
      }`,
      ctx: spanOf(t),
      code: 0,
    });
    return t;
  };

  const skipNewlines = () => {
    while (at("NEWLINE")) pos++;
  };

  // ---- span helpers --------------------------------------------------------

  const spanOf = (t: Token): Context => ({ start: t.start, stop: t.stop });
  const between = (a: Context, b: Context): Context => ({
    start: a.start,
    stop: b.stop,
  });
  /** Span from `startTok` through the last-consumed token. */
  const spanFrom = (startTok: Token): Context => ({
    start: startTok.start,
    stop: (prev() ?? startTok).stop,
  });
  const record = <T extends object>(node: T, ctx: Context): T => {
    spans.set(node, ctx);
    return node;
  };
  const ctxOf = (node: object): Context =>
    spans.get(node) ?? { start: peek().start, stop: peek().start };

  // ---- types (the old `toType`) -------------------------------------------

  const parseType = (): VLType => {
    let left = parseIntersectionType();
    while (at("PIPE")) {
      next();
      skipNewlines();
      const right = parseIntersectionType();
      // Mirrors `toType`: flatten as we go (a little redundant, but cheap).
      left = flattenType({ type: "Union", subTypes: [left, right] });
      skipNewlines();
    }
    return left;
  };

  // Intersection `A & B` (A3). Binds tighter than union `|` (standard
  // precedence: `A | B & C` is `A | (B & C)`), looser than the prefix `!` and
  // array suffix. Flattened so `A & B & C` is one `Intersection` node; a single
  // operand passes through unwrapped.
  const parseIntersectionType = (): VLType => {
    let left = parseArrayType();
    while (at("AMPERSAND")) {
      next();
      skipNewlines();
      const right = parseArrayType();
      // Fold through the existing algebra so a finite annotation simplifies to a
      // concrete type for codegen (`(0|1|2) & !2` → `0 | 1`; `A & !B` is the
      // common "A but not B"). `intersectType` keeps an irreducible open-world
      // pair as a residual `Intersection`/`Negation` node, which `ensureType`
      // still validates as an assignment target.
      left = intersectType(left, right);
      skipNewlines();
    }
    return left;
  };

  const parseArrayType = (): VLType => {
    let t = parseTypePrimary();
    while (at("LBRACK") && peek(1).kind === "RBRACK") {
      next();
      next();
      t = {
        type: "Object",
        properties: [{ name: { type: "Alias", name: "i32" }, type: t }],
      };
    }
    return t;
  };

  // Parse the `<arg, arg, …>` of a generic alias application. The `<` is
  // unambiguous in type position (no less-than operator here). `>>` closing a
  // nested application (`Box<Pair<i32, string>>`) lexes as two GREATER_THAN
  // tokens, so each level consumes its own `>` cleanly.
  const parseTypeArgs = (): VLType[] => {
    expect("LESS_THAN");
    skipNewlines();
    const args: VLType[] = [];
    if (!at("GREATER_THAN")) {
      for (;;) {
        skipNewlines();
        args.push(parseType());
        skipNewlines();
        if (at("COMMA")) {
          next();
          // Trailing comma: a `,` immediately before `>` closes the list.
          skipNewlines();
          if (at("GREATER_THAN")) break;
          continue;
        }
        break;
      }
    }
    skipNewlines();
    expect("GREATER_THAN");
    return args;
  };

  // Apply a generic `type` alias to its type arguments (`Box<i32>`). A bare
  // reference with no `<args>` is an error (the alias needs its params); a
  // mismatched count is an arity error. Otherwise `instantiateAlias` substitutes
  // each argument for its param hole in a fresh copy of the body.
  const applyGenericAlias = (
    name: string,
    entry: VLTypeType,
    ctx: Context,
  ): VLType => {
    const arity = entry.params?.length ?? 0;
    if (!at("LESS_THAN")) {
      errors.push({
        type: "Syntax",
        message: `Generic type \`${name}\` expects ${arity} type argument${
          arity === 1 ? "" : "s"
        } but was used without any`,
        ctx,
        code: 0,
      });
      return { type: "Never" };
    }
    const argsStart = peek();
    const args = parseTypeArgs();
    const ctxWithArgs = spanFrom(argsStart);
    if (args.length !== arity) {
      errors.push({
        type: "Syntax",
        message: `Generic type \`${name}\` expects ${arity} type argument${
          arity === 1 ? "" : "s"
        } but got ${args.length}`,
        ctx: { start: ctx.start, stop: ctxWithArgs.stop },
        code: 0,
      });
      return { type: "Never" };
    }
    return instantiateAlias(entry, args);
  };

  const parseTypePrimary = (): VLType => {
    const t = peek();
    const ctx = spanOf(t);
    // Prefix negation `!A` (A4): "anything but `A`". Binds tighter than `&`, so
    // `A & !B` is `A & (!B)` = "A but not B". Recurses through the primary so
    // `!!A`, `![T]`, and `!Box<T>` parse, and so `!` distributes over a single
    // type (not the whole `&`/`|` chain to its right).
    if (at("EXCLAMATION")) {
      next();
      skipNewlines();
      return { type: "Negation", subType: parseTypePrimary() };
    }
    if (at("ID")) {
      next();
      const name = t.text;
      // A self-reference inside a recursive `type`'s own body resolves to a lazy
      // alias leaf — the recursion is carried by the name (see `typeBuilding`),
      // so the body is a finite structure resolved on demand instead of being
      // expanded forever.
      if (typeBuilding.has(name)) {
        recordUse(name, ctx);
        // A recursive reference inside a generic alias's own body still carries
        // its arguments (`Box<T>` referencing `Box`); consume them so parsing
        // stays in sync (the lazy `Alias` leaf is resolved on demand).
        if (at("LESS_THAN")) parseTypeArgs();
        return { type: "Alias", name };
      }
      for (let i = scopes.length - 1; i >= 0; i--) {
        if (name in scopes[i]) {
          recordUse(name, ctx);
          const type = scopes[i][name];
          // Generic type alias (`type Box<T> = …`). Application is substitution:
          // require `<args>`, arity-check, then substitute them into the body.
          if (type.type === "Type" && type.params && type.params.length > 0) {
            return applyGenericAlias(name, type, ctx);
          }
          // A reference to a non-generic alias resolves through to its concrete
          // body, but we wrap it in a named `Type` node (D8) so display can
          // render the alias *name* (`I32`) instead of its expansion (`i32`).
          // Typechecking unwraps `Type` nodes transparently, so this is inert
          // for everything except `stringifyType`.
          if (type.type === "Type") {
            return {
              type: "Type",
              subType: getConcreteType(type.subType, ctx),
              name: type.name ?? name,
            };
          }
          return getConcreteType(type, ctx);
        }
      }
      errors.push({ type: "Undeclared", name, ctx, code: 1 });
      return { type: "Never" };
    }
    if (at("NULL")) {
      next();
      return { type: "Alias", name: "null" };
    }
    if (at("LBRACE")) return parseObjectType();
    if (at("STRING")) {
      next();
      // `t.value` is the lexer-decoded literal (escapes resolved, quotes
      // stripped); fall back to slicing the raw lexeme for safety.
      return { type: "StringLiteral", value: t.value ?? t.text.slice(1, -1) };
    }
    if (at("NUMBER")) {
      next();
      const text = t.text;
      const value = parseFloat(text);
      return Number.isInteger(value) && !text.includes(".")
        ? { type: "IntegerLiteral", value, text }
        : { type: "RealLiteral", value };
    }
    if (at("TRUE")) {
      next();
      return { type: "BooleanLiteral", value: true };
    }
    if (at("FALSE")) {
      next();
      return { type: "BooleanLiteral", value: false };
    }
    if (at("LPAREN")) {
      next();
      skipNewlines();
      const inner = parseType();
      skipNewlines();
      expect("RPAREN");
      return inner;
    }
    errors.push({
      type: "Syntax",
      message: `Syntax error: expected a type but found ${
        JSON.stringify(t.text)
      }`,
      ctx,
      code: 0,
    });
    next();
    return { type: "Never" };
  };

  const parseObjectType = (): VLType => {
    expect("LBRACE");
    skipNewlines();
    const properties: { name: VLType; type: VLType }[] = [];
    if (!at("RBRACE")) {
      do {
        skipNewlines();
        if (at("RBRACE")) break;
        if (at("LBRACK")) {
          // Index signature `[K]: V`.
          next();
          skipNewlines();
          const keyType = parseType();
          skipNewlines();
          expect("RBRACK");
          skipNewlines();
          expect("COLON");
          skipNewlines();
          const valType = parseType();
          properties.push({ name: keyType, type: valType });
        } else {
          const key = peek();
          let keyName: string;
          if (at("ID")) {
            next();
            keyName = key.text;
          } else if (at("STRING")) {
            next();
            keyName = key.value ?? key.text.slice(1, -1);
          } else {
            // Unexpected; report and bail out of the loop.
            errors.push({
              type: "Syntax",
              message: `Syntax error: expected a property name but found ${
                JSON.stringify(key.text)
              }`,
              ctx: spanOf(key),
              code: 0,
            });
            break;
          }
          skipNewlines();
          expect("COLON");
          skipNewlines();
          const valType = parseType();
          properties.push({
            name: { type: "StringLiteral", value: keyName },
            type: valType,
          });
        }
        skipNewlines();
      } while (at("COMMA") && (next(), true));
    }
    skipNewlines();
    expect("RBRACE");
    return { type: "Object", properties };
  };

  // ---- expressions ---------------------------------------------------------

  // Precedence-climbing binding powers (higher binds tighter). A compound-assign
  // operator (`+=`) is detected here and excluded so it falls through to
  // `parseExpr`'s assignment handling.
  // Binding powers follow C/JS precedence so a mixed expression parses the way
  // a C/JS reader expects. Bitwise `| ^ &` sit BELOW equality/relational (so
  // `a & b == c` is `a & (b == c)`); shifts `<< >> >>>` sit BETWEEN relational
  // and additive (so `a + b << c` is `(a + b) << c` — shifts looser than `+`).
  // Among the new operators, looser→tighter: `|` < `^` < `&` < shifts. Note
  // bitwise binds tighter than the logical `&&`/`||`, matching C. `~` (bitwise
  // NOT) is a unary prefix handled in `parseUnary`, not here.
  //
  // The shift operators are NOT single lexer tokens: `>>`/`>>>` would collide
  // with the `>>` that closes nested generics (`Box<Pair<T, U>>`), so the lexer
  // keeps emitting individual `<`/`>` tokens and `parseBinary` recombines a run
  // of *adjacent* `<<`/`>>`/`>>>` only in expression position. `shiftAt` reports
  // the shift starting at the current token (and how many tokens it spans).
  const SHIFT_BP = 13;
  const shiftAt = (): { op: string; width: number } | undefined => {
    const a = peek();
    const b = peek(1);
    const adj = (x: Token, y: Token) =>
      x.stop.line === y.start.line && x.stop.column === y.start.column;
    if (a.kind === "GREATER_THAN" && b.kind === "GREATER_THAN" && adj(a, b)) {
      const c = peek(2);
      if (c.kind === "GREATER_THAN" && adj(b, c)) return { op: ">>>", width: 3 };
      return { op: ">>", width: 2 };
    }
    if (a.kind === "LESS_THAN" && b.kind === "LESS_THAN" && adj(a, b)) {
      return { op: "<<", width: 2 };
    }
    return undefined;
  };

  const infixBp = (t: Token): number => {
    if (ARITH_ASSIGN_OPS.has(t.kind) && peek(1).kind === "EQUAL") return 0;
    switch (t.kind) {
      case "QUESTION_QUESTION":
        return 2;
      case "OR":
        return 4;
      case "AND":
        return 6;
      case "PIPE": // bitwise OR (value position)
        return 7;
      case "CARET": // bitwise XOR
        return 8;
      case "AMPERSAND": // bitwise AND (value position)
        return 9;
      case "IS":
        return 10;
      case "EQUAL_TO":
      case "NOT_EQUAL_TO":
        return 11;
      case "GREATER_THAN":
      case "GREATER_THAN_OR_EQUAL_TO":
      case "LESS_THAN":
      case "LESS_THAN_OR_EQUAL_TO":
        return 12;
      // shifts (`<< >> >>>`) bind at SHIFT_BP (13) — see `shiftAt`.
      case "PLUS":
      case "MINUS":
        return 14;
      case "STAR":
      case "DIV":
      case "MOD":
        return 16;
      default:
        return 0;
    }
  };

  /** Top-level expression = assignment over a precedence-climbed binary expr. */
  const parseExpr = (): VLExpression => {
    const left = parseBinary(0);
    if (
      at("EQUAL") ||
      (ARITH_ASSIGN_OPS.has(peek().kind) && peek(1).kind === "EQUAL")
    ) {
      return finishAssignment(left);
    }
    return left;
  };

  const parseBinary = (minBp: number): VLExpression => {
    let left = parseUnary();
    for (;;) {
      const opTok = peek();
      // Shift `<< >> >>>` — recombined here from adjacent `<`/`>` tokens (the
      // lexer can't, lest it break nested-generic `>>`). Checked before the
      // single-token operator path so a `<<`/`>>` run isn't mistaken for two
      // relational `<`/`>`. Left-associative, like the other binary operators.
      const shift = shiftAt();
      if (shift && SHIFT_BP > minBp) {
        for (let k = 0; k < shift.width; k++) next();
        skipNewlines();
        const right = parseBinary(SHIFT_BP);
        const ctx = between(ctxOf(left), ctxOf(right));
        const node: VLBinaryOperationNode = {
          type: "BinaryOperation",
          left,
          right,
          operator: shift.op,
        };
        record(node, ctx);
        typeFromExpression(node, ctx);
        left = node;
        continue;
      }
      // `expr !is Type` (A4) — negated type guard, Kotlin-style. Two tokens
      // (`!` `is`) rather than a dedicated lexeme; shares `is`'s binding power so
      // `x !is T` precedence matches `x is T`. Detected before `infixBp` because
      // a leading `EXCLAMATION` is not itself an infix operator.
      const isNegatedIs = opTok.kind === "EXCLAMATION" && peek(1).kind === "IS";
      const bp = isNegatedIs ? infixBp(peek(1)) : infixBp(opTok);
      if (bp === 0 || bp <= minBp) break;

      // `expr is Type` / `expr !is Type` — the right side is a type, not an
      // expression (A6/A4). `!is` inverts the boolean and the narrowing.
      if (opTok.kind === "IS" || isNegatedIs) {
        next();
        if (isNegatedIs) next(); // consume the `is` after the `!`
        skipNewlines();
        const checkType = parseType();
        const node: VLIsNode = {
          type: "Is",
          value: left,
          checkType,
          negated: isNegatedIs,
        };
        const ctx = between(ctxOf(left), spanFrom(opTok));
        record(node, ctx);
        typeFromExpression(node, ctx); // assert + memoize the boolean result
        left = node;
        continue;
      }

      next();
      skipNewlines();
      const operator = opTok.text;
      const leftCtx = ctxOf(left);

      // Short-circuit narrowing (A5): the RHS of `&&` is built/type-checked with
      // the LHS's then-narrowings in scope; `||` with its else-narrowings.
      const rhsStart = peek();
      const provisionalRhsCtx = spanOf(rhsStart);
      const parseRhs = () => parseBinary(bp);
      const right = operator === "&&"
        ? withNarrowings(thenNarrowings(left), provisionalRhsCtx, parseRhs)
        : operator === "||"
        ? withNarrowings(elseNarrowings(left), provisionalRhsCtx, parseRhs)
        : parseRhs();
      const rightCtx = ctxOf(right);
      const ctx = between(leftCtx, rightCtx);

      if (operator === "??") {
        const node: VLNullCoalesceNode = {
          type: "NullCoalesce",
          left,
          right,
        };
        record(node, ctx);
        typeFromExpression(node, ctx);
        left = node;
        continue;
      }

      // Operator as a `self`-method (B13+B14): when the left operand is a user
      // object and a free `self`-function named for the operator is in scope,
      // dispatch `a op b` as `op(a, b)` (monomorphizes per call). Builtin/numeric
      // operators (left is a named object like i32) keep the native path.
      let leftT = typeFromExpression(left, leftCtx);
      if (leftT.type === "Infer") leftT = leftT.subType;
      if (leftT.type === "Object" && leftT.name === undefined) {
        let fn: VLType | undefined;
        for (let i = scopes.length - 1; i >= 0; i--) {
          if (operator in scopes[i]) {
            fn = scopes[i][operator];
            break;
          }
        }
        if (fn?.type === "Function" && fn.paramaters[0]?.name === "self") {
          const leftArg = makeArgument(undefined, left, leftCtx);
          const rightArg = makeArgument(undefined, right, rightCtx);
          const allArgs = [leftArg, rightArg];
          const node: VLFunctionCallNode = {
            type: "FunctionCall",
            function: operator,
            arguments: allArgs,
            functionType: instantiateFunctionType(
              fn,
              allArgs,
              ctx,
            ) as VLFunctionType,
          };
          record(node, ctx);
          left = node;
          continue;
        }
      }

      const node: VLBinaryOperationNode = {
        type: "BinaryOperation",
        left,
        right,
        operator,
      };
      record(node, ctx);
      typeFromExpression(node, ctx); // asserts binary operations
      left = node;
    }
    return left;
  };

  const parseUnary = (): VLExpression => {
    const t = peek();

    // Unary minus: binds tighter than `* / %` and `+ -`, looser than `^`.
    if (at("MINUS")) {
      next();
      skipNewlines();
      const operand = parseBinary(17);
      const operandCtx = ctxOf(operand);
      const ctx = spanFrom(t);
      // Fold a negated numeric literal into a proper negative literal.
      if (operand.type === "IntegerLiteral") {
        const node: VLExpression = {
          type: "IntegerLiteral",
          value: -operand.value,
          text: `-${operand.text}`,
        };
        record(node, ctx);
        typeFromExpression(node, ctx);
        return node;
      }
      if (operand.type === "RealLiteral") {
        const node: VLExpression = {
          type: "RealLiteral",
          value: -operand.value,
        };
        record(node, ctx);
        typeFromExpression(node, ctx);
        return node;
      }
      // Otherwise negate by subtracting from a type-matched zero.
      const operandType = softenImplicitType(
        typeFromExpression(operand, operandCtx),
      );
      const zero: VLExpression =
        operandType.type === "Object" && operandType.name === "f64"
          ? { type: "RealLiteral", value: 0 }
          : { type: "IntegerLiteral", value: 0, text: "0" };
      const node: VLBinaryOperationNode = {
        type: "BinaryOperation",
        left: zero,
        right: operand,
        operator: "-",
      };
      record(node, ctx);
      typeFromExpression(node, ctx);
      return node;
    }

    // Bitwise NOT `~x`: a prefix unary at the same level as `!`/unary `-`,
    // integer-only, lowered in codegen as `x ^ -1`.
    if (at("TILDE")) {
      next();
      const operand = parseUnary();
      const ctx = spanFrom(t);
      const node: VLUnaryOperationNode = {
        type: "UnaryOperation",
        operator: "~",
        operand,
        prefix: true,
      };
      record(node, ctx);
      typeFromExpression(node, ctx);
      return node;
    }

    // Prefix operators: `!`, `++`, `--`.
    if (at("EXCLAMATION") || at("PLUSPLUS") || at("MINUSMINUS")) {
      next();
      const operator = t.text;
      const operand = parseUnary();
      const ctx = spanFrom(t);
      if (operator === "++" || operator === "--") {
        if (operand.type !== "Name") {
          errors.push({
            type: "Syntax",
            message: `\`${operator}\` requires a variable operand`,
            ctx,
            code: 0,
          });
        } else checkRebind(operand.name, ctx);
      }
      // `++x` / `--x` reassign their operand — mark it a write for prefer-const.
      if ((operator === "++" || operator === "--") && operand.type === "Name") {
        symbols.markWrite(ctxOf(operand));
      }
      const node: VLUnaryOperationNode = {
        type: "UnaryOperation",
        operator,
        operand,
        prefix: true,
      };
      record(node, ctx);
      typeFromExpression(node, ctx);
      return node;
    }

    return parsePostfix(parsePrimary());
  };

  const parsePostfix = (start: VLExpression): VLExpression => {
    let left = start;
    for (;;) {
      // Member call `o.f(args)` — DOT ID LPAREN (the longer match wins).
      if (
        at("DOT") && peek(1).kind === "ID" && peek(2).kind === "LPAREN"
      ) {
        left = parseMemberCall(left);
        continue;
      }
      if (at("DOT")) {
        next();
        const id = expect("ID");
        const property = id.text;
        const objectCtx = ctxOf(left);
        getChildType(
          typeFromExpression(left, objectCtx),
          { type: "StringLiteral", value: property },
          objectCtx,
          spanOf(id),
        );
        const node = {
          type: "PropertyAccess",
          object: left,
          property,
        } as const;
        left = record(node, between(objectCtx, spanOf(id)));
        continue;
      }
      // Optional (null-safe) property read `x?.y` (A5).
      if (at("QUESTION_DOT")) {
        next();
        const id = expect("ID");
        const property = id.text;
        const objectCtx = ctxOf(left);
        getChildType(
          nonNullable(typeFromExpression(left, objectCtx)),
          { type: "StringLiteral", value: property },
          objectCtx,
          spanOf(id),
        );
        const node = {
          type: "OptionalAccess",
          object: left,
          property,
        } as const;
        left = record(node, between(objectCtx, spanOf(id)));
        continue;
      }
      // Index `a[i]`.
      if (at("LBRACK")) {
        next();
        skipNewlines();
        const index = parseExpr();
        skipNewlines();
        const close = expect("RBRACK");
        const arrayCtx = ctxOf(left);
        const indexCtx = ctxOf(index);
        const ctx = between(arrayCtx, spanOf(close));
        // Index trap (B13): a user object that carries a `"[]"` method handles
        // `o[k]` itself — dispatch through it as a member call `o."[]"(k)`,
        // reusing the field-method call path (the same shape as a `"+"` operator
        // field). A native array (i32 index signature → WasmGC array) keeps the
        // fast native `array.get`; the trap fires only for non-array objects that
        // actually declare `"[]"`.
        const trapped = indexTrap(left, [index], "[]", arrayCtx, ctx);
        if (trapped) {
          left = trapped;
          continue;
        }
        getChildType(
          typeFromExpression(left, arrayCtx),
          typeFromExpression(index, indexCtx),
          arrayCtx,
          indexCtx,
        );
        const node = { type: "IndexAccess", array: left, index } as const;
        left = record(node, ctx);
        continue;
      }
      // Postfix `++` / `--`.
      if (at("PLUSPLUS") || at("MINUSMINUS")) {
        const opTok = next();
        const operator = opTok.text;
        const ctx = between(ctxOf(left), spanOf(opTok));
        if (left.type !== "Name") {
          errors.push({
            type: "Syntax",
            message: `\`${operator}\` requires a variable operand`,
            ctx,
            code: 0,
          });
        } else {
          // `x++` / `x--` rebind their operand: enforce const-immutability, and
          // mark it a write so prefer-const won't suggest `const` for it.
          checkRebind(left.name, ctx);
          symbols.markWrite(ctxOf(left));
        }
        const node: VLUnaryOperationNode = {
          type: "UnaryOperation",
          operator,
          operand: left,
          prefix: false,
        };
        record(node, ctx);
        typeFromExpression(node, ctx);
        left = node;
        continue;
      }
      break;
    }
    return left;
  };

  /** `o.f(args)` — a callable field, a UFCS `self`-method, or an error. */
  const parseMemberCall = (object: VLExpression): VLExpression => {
    const objCtx = ctxOf(object);
    next(); // DOT
    const id = next(); // ID
    const property = id.text;
    expect("LPAREN");
    const args = parseArguments();
    const close = expect("RPAREN");
    const ctx = between(objCtx, spanOf(close));

    const objectType = typeFromExpression(object, objCtx);

    // 1. Field method (container/data): a callable field wins, no receiver.
    let shape = objectType;
    if (shape.type === "Infer") shape = shape.subType;
    const fieldType = shape.type === "Object"
      ? shape.properties.find((p) =>
        validateType(p.name, { type: "StringLiteral", value: property })
      )?.type
      : undefined;
    if (fieldType?.type === "Function") {
      const node: VLCallNode = {
        type: "Call",
        callee: record(
          { type: "PropertyAccess", object, property } as const,
          between(objCtx, spanOf(id)),
        ),
        arguments: args,
        functionType: instantiateFunctionType(
          fieldType,
          args,
          ctx,
        ) as VLFunctionType,
      };
      return record(node, ctx);
    }

    // 1b. Intrinsic list method (`l.get(i)`, `l.push(x)`, …): a `T[]` is an
    // anonymous structural type, so these aren't scope/field methods — resolve
    // their type here (`listMemberType`) and emit a `Call` toWasm lowers by name.
    if (isListType(shape)) {
      const member = listMemberType(arrayElementType(shape)!)[property];
      if (member?.type === "Function") {
        const node: VLCallNode = {
          type: "Call",
          callee: record(
            { type: "PropertyAccess", object, property } as const,
            between(objCtx, spanOf(id)),
          ),
          arguments: args,
          functionType: instantiateFunctionType(
            member,
            args,
            ctx,
          ) as VLFunctionType,
        };
        return record(node, ctx);
      }
    }

    // 1c. Intrinsic map/set method (`m.set`/`m.get`/`m.has`/…, `s.add`/`s.has`/…).
    // A `Map<K,V>` / `Set<T>` is an anonymous structural `{[K]:V}`, so its methods
    // aren't scope/field methods — resolve their type here. Crucially, a method
    // *call* on a map/set must resolve to a real intrinsic method: it must NOT be
    // swallowed by the string index-signature (which would read `m."method"` as a
    // `m[k]` value access and silently type-check). So when the receiver is a
    // map/set but the property is not one of its intrinsic methods, report an
    // explicit "Unknown property" error (C2.2: a `Set<T>` does NOT expose the Map
    // surface — `s.set`/`s.get`/`s.keys()` are rejected here).
    const mapKV = mapKeyValueType(shape);
    if (mapKV) {
      const setEl = setElementType(shape);
      const member = setEl !== null
        ? setMemberType(setEl)[property]
        : mapMemberType(mapKV.key, mapKV.value)[property];
      if (member?.type === "Function") {
        const node: VLCallNode = {
          type: "Call",
          callee: record(
            { type: "PropertyAccess", object, property } as const,
            between(objCtx, spanOf(id)),
          ),
          arguments: args,
          functionType: instantiateFunctionType(
            member,
            args,
            ctx,
          ) as VLFunctionType,
        };
        return record(node, ctx);
      }
      // A map/set receiver with an unknown method name — reject explicitly rather
      // than letting the index-signature swallow it as a value read.
      errors.push({
        type: "Property",
        property: { type: "StringLiteral", value: property },
        ctx: spanOf(id),
        code: 5,
      });
      const node: VLCallNode = {
        type: "Call",
        callee: record(
          { type: "PropertyAccess", object, property } as const,
          between(objCtx, spanOf(id)),
        ),
        arguments: args,
        functionType: undefined,
      };
      return record(node, ctx);
    }

    // 2. UFCS method: a free `self`-function. `o.f(args)` → `f(o, args)`.
    let fn: VLType | undefined;
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (property in scopes[i]) {
        fn = scopes[i][property];
        break;
      }
    }
    if (fn?.type === "Function" && fn.paramaters[0]?.name === "self") {
      const selfArg = makeArgument(undefined, object, objCtx);
      const allArgs = [selfArg, ...args];
      const node: VLFunctionCallNode = {
        type: "FunctionCall",
        function: property,
        arguments: allArgs,
        functionType: instantiateFunctionType(
          fn,
          allArgs,
          ctx,
        ) as VLFunctionType,
      };
      return record(node, ctx);
    }

    // 3. Neither — report via getChildType (not a member / not callable).
    getChildType(
      objectType,
      { type: "StringLiteral", value: property },
      objCtx,
      spanOf(id),
    );
    const node: VLCallNode = {
      type: "Call",
      callee: record(
        { type: "PropertyAccess", object, property } as const,
        between(objCtx, spanOf(id)),
      ),
      arguments: args,
      functionType: undefined,
    };
    return record(node, ctx);
  };

  /**
   * Index trap (B13): if `object` is a user object that declares an index method
   * (`"[]"` for a read, `"[]="` for a write) and is NOT a native array, dispatch
   * `o[k]` / `o[k] = v` through it as a field-method call `o."[]"(k)` /
   * `o."[]="(k, v)` — reusing the existing `Call` lowering (the same shape as a
   * `"+"` operator field). Returns the call node, or `undefined` to keep the
   * native array / index-signature path. The method's parameter types are
   * verified by `instantiateFunctionType`, so a wrong key/value type is rejected.
   */
  const indexTrap = (
    object: VLExpression,
    args: VLExpression[],
    method: "[]" | "[]=",
    objCtx: Context,
    ctx: Context,
  ): VLExpression | undefined => {
    let shape = typeFromExpression(object, objCtx);
    if (shape.type === "Infer") shape = shape.subType;
    // Only a user object (no nominal name like `string`) that is not a native
    // i32-keyed array can carry an index trap — native arrays/strings keep the
    // fast `array.get`/`array.set` path.
    if (
      shape.type !== "Object" || shape.name !== undefined ||
      arrayElementType(shape) !== null
    ) {
      return undefined;
    }
    const methodType = shape.properties.find((p) =>
      validateType(p.name, { type: "StringLiteral", value: method })
    )?.type;
    if (methodType?.type !== "Function") return undefined;
    const callArgs = args.map((a) => makeArgument(undefined, a, ctxOf(a)));
    const node: VLCallNode = {
      type: "Call",
      callee: record(
        { type: "PropertyAccess", object, property: method } as const,
        objCtx,
      ),
      arguments: callArgs,
      functionType: instantiateFunctionType(
        methodType,
        callArgs,
        ctx,
      ) as VLFunctionType,
    };
    return record(node, ctx);
  };

  const makeArgument = (
    name: string | undefined,
    value: VLExpression,
    context: Context,
  ): VLArgumentNode => {
    const arg: VLArgumentNode = { type: "Argument", name, value, context };
    Object.defineProperty(arg, "context", { enumerable: false });
    return arg;
  };

  /**
   * `arg (, arg)*` with an optional trailing comma, each `(ID COLON)? expr`.
   * Stops at the closing `)`. One trailing comma before `)` is allowed and
   * ignored (`f(a, b,)`); a doubled `,,` or a lone `,` in `()` still errors.
   */
  const parseArguments = (): VLArgumentNode[] => {
    const args: VLArgumentNode[] = [];
    skipNewlines();
    if (at("RPAREN")) return args;
    for (;;) {
      skipNewlines();
      const startTok = peek();
      let name: string | undefined;
      if (at("ID") && peek(1).kind === "COLON") {
        name = next().text;
        next(); // COLON
        skipNewlines();
      }
      const value = parseExpr();
      args.push(makeArgument(name, value, spanFrom(startTok)));
      skipNewlines();
      if (at("COMMA")) {
        next();
        // Trailing comma: a `,` immediately before `)` closes the list.
        skipNewlines();
        if (at("RPAREN")) break;
        continue;
      }
      break;
    }
    return args;
  };

  const parsePrimary = (): VLExpression => {
    const t = peek();

    // Labelled block `name: { … }` (objects never carry a label).
    if (
      at("ID") && peek(1).kind === "COLON" && peek(2).kind === "LBRACE"
    ) {
      const label = next().text;
      next(); // COLON
      return parseBlock(label);
    }

    if (at("LBRACE")) {
      return looksLikeObject(pos)
        ? parseObjectLiteral()
        : parseBlock(undefined);
    }
    if (at("LBRACK")) return parseArrayLiteral();
    if (at("IF")) return parseIf();
    if (at("FUNCTION")) return parseFunctionDeclaration();

    if (at("LPAREN")) {
      next();
      skipNewlines();
      const inner = parseExpr();
      skipNewlines();
      expect("RPAREN");
      return inner;
    }

    if (at("NUMBER")) {
      next();
      const text = t.text;
      const value = parseFloat(text);
      const isInteger = Number.isInteger(value) && !text.includes(".");
      const ctx = spanOf(t);
      if (isInteger && defaultIntegerType(text, value) === undefined) {
        errors.push({
          type: "Syntax",
          message:
            `Integer literal ${text} is too large to represent (exceeds the i64 range).`,
          ctx,
          code: 0,
        });
      }
      const node: VLExpression = isInteger
        ? { type: "IntegerLiteral", value, text }
        : { type: "RealLiteral", value };
      return record(node, ctx);
    }

    if (at("STRING")) {
      next();
      return record(
        // `t.value` is the lexer-decoded literal (escapes resolved, quotes
        // stripped); fall back to slicing the raw lexeme for safety.
        { type: "StringLiteral", value: t.value ?? t.text.slice(1, -1) },
        spanOf(t),
      );
    }
    if (at("CHAR")) {
      next();
      // A char literal `'a'` is its i32 code point (so `'a'` == 97), composing
      // with string indexing and arithmetic. Lower it to the existing
      // IntegerLiteral node carrying that code — typing and codegen then fall out
      // exactly as for a bare int literal of the same value. `t.value` is the
      // lexer-decoded single character; an empty value (recovered lex error)
      // degrades to code 0.
      const code = t.value ? t.value.codePointAt(0) ?? 0 : 0;
      return record(
        { type: "IntegerLiteral", value: code, text: String(code) },
        spanOf(t),
      );
    }
    if (at("TRUE")) {
      next();
      return record({ type: "BooleanLiteral", value: true }, spanOf(t));
    }
    if (at("FALSE")) {
      next();
      return record({ type: "BooleanLiteral", value: false }, spanOf(t));
    }
    if (at("NULL")) {
      next();
      return record({ type: "NullLiteral" }, spanOf(t));
    }

    if (at("ID")) {
      // Function call `name(args)` vs a bare name.
      if (peek(1).kind === "LPAREN") return parseFunctionCall();
      next();
      const ctx = spanOf(t);
      getType(t.text, ctx);
      recordUse(t.text, ctx);
      return record({ type: "Name", name: t.text }, ctx);
    }

    // Nothing matched — report and synthesize a placeholder so we make progress.
    errors.push({
      type: "Syntax",
      message: `Syntax error: unexpected ${
        t.kind === "EOF" ? "end of input" : JSON.stringify(t.text)
      }`,
      ctx: spanOf(t),
      code: 0,
    });
    if (!atEnd()) next();
    return record({ type: "NullLiteral" }, spanOf(t));
  };

  const parseFunctionCall = (): VLExpression => {
    const id = next(); // ID
    const name = id.text;
    expect("LPAREN");
    const args = parseArguments();
    const close = expect("RPAREN");
    const ctx = between(spanOf(id), spanOf(close));

    const funcCall: VLFunctionCallNode = {
      type: "FunctionCall",
      function: name,
      arguments: args,
      functionType: undefined,
    };

    const fnType = getType(name, spanOf(id));
    recordUse(name, spanOf(id));
    // Calling an unresolved inference hole infers the value is a function.
    if (fnType.type === "Infer" && fnType.subType.type === "Unknown") {
      const inferred: VLFunctionType = {
        type: "Function",
        paramaters: funcCall.arguments.map((arg, i) => ({
          type: "Parameter",
          name: arg.value.type === "Name" ? arg.value.name : `_${i}`,
          paramaterType: typeFromExpression(arg.value, arg.context ?? ctx),
        })),
        return: { type: "Infer", subType: { type: "Unknown" } },
      };
      updateType(fnType, inferred);
      funcCall.functionType = inferred;
    } else if (fnType.type !== "Unknown") {
      if (fnType.type !== "Function") {
        errors.push({
          type: "Type",
          left: {
            type: "Function",
            paramaters: [],
            return: { type: "Unknown" },
          },
          right: fnType,
          ctx,
          code: "function-call",
        });
      } else {
        // Instantiate a fresh copy of the signature for THIS call site.
        funcCall.functionType = instantiateFunctionType(
          fnType,
          funcCall.arguments,
          ctx,
        ) as VLFunctionType;
      }
    }

    return record(funcCall, ctx);
  };

  const parseObjectLiteral = (): VLObjectLiteralNode => {
    const open = expect("LBRACE");
    skipNewlines();
    const properties: VLPropertyLiteral[] = [];
    if (!at("RBRACE")) {
      for (;;) {
        skipNewlines();
        if (at("RBRACE")) break;
        properties.push(parsePair());
        skipNewlines();
        if (at("COMMA")) {
          next();
          continue;
        }
        break;
      }
    }
    skipNewlines();
    const close = expect("RBRACE");
    return record(
      { type: "ObjectLiteral", properties },
      between(
        spanOf(open),
        spanOf(close),
      ),
    );
  };

  const parsePair = (): VLPropertyLiteral => {
    // Computed key `[expr]: expr`.
    if (at("LBRACK")) {
      next();
      skipNewlines();
      const nameExpr = parseExpr();
      skipNewlines();
      expect("RBRACK");
      skipNewlines();
      expect("COLON");
      skipNewlines();
      const value = parseExpr();
      return { type: "PropertyLiteral", name: nameExpr, value };
    }
    if (at("STRING")) {
      const s = next();
      skipNewlines();
      expect("COLON");
      skipNewlines();
      const value = parseExpr();
      // Use the lexer-decoded value (escapes resolved, quotes stripped) so a
      // key like `"+"` matches the operator name `+`; fall back to slicing.
      return {
        type: "PropertyLiteral",
        name: { type: "StringLiteral", value: s.value ?? s.text.slice(1, -1) },
        value,
      };
    }
    // `ID` (shorthand) or `ID: expr`.
    const id = expect("ID");
    const name = { type: "Name", name: id.text } as const;
    // Method shorthand `add(a, b) { … }` → `add: function(a, b) { … }`. The
    // `(` immediately following the key (no `:`) marks the shorthand; the value
    // is parsed as an anonymous function starting at the key token.
    if (at("LPAREN")) {
      const value = parseFunctionDeclaration(id);
      return { type: "PropertyLiteral", name, value };
    }
    if (at("COLON") || (skipNewlines(), at("COLON"))) {
      next(); // COLON
      skipNewlines();
      const value = parseExpr();
      return { type: "PropertyLiteral", name, value };
    }
    // Shorthand `{ x }` → `{ x: x }`.
    return {
      type: "PropertyLiteral",
      name,
      value: record({ type: "Name", name: id.text }, spanOf(id)),
    };
  };

  const parseArrayLiteral = (): VLArrayLiteralNode => {
    const open = expect("LBRACK");
    skipNewlines();
    const values: VLExpression[] = [];
    if (!at("RBRACK")) {
      for (;;) {
        skipNewlines();
        if (at("RBRACK")) break;
        values.push(parseExpr());
        skipNewlines();
        if (at("COMMA")) {
          next();
          continue;
        }
        break;
      }
    }
    skipNewlines();
    const close = expect("RBRACK");
    return record(
      { type: "ArrayLiteral", values },
      between(
        spanOf(open),
        spanOf(close),
      ),
    );
  };

  /** Whether the `{` at `bracePos` opens an object literal (vs a block). */
  const looksLikeObject = (bracePos: number): boolean => {
    let i = bracePos + 1;
    const kind = (j: number) => tokens[Math.min(j, tokens.length - 1)].kind;
    const skipNL = () => {
      while (kind(i) === "NEWLINE") i++;
    };
    skipNL();
    const first = kind(i);
    if (first === "RBRACE") return true; // empty `{}` — object (ANTLR order)
    if (STATEMENT_KEYWORDS.has(first)) return false;
    if (first === "ID") {
      let j = i + 1;
      while (kind(j) === "NEWLINE") j++;
      const nk = kind(j);
      if (nk === "COLON" || nk === "COMMA" || nk === "RBRACE") return true;
      // Method shorthand `{ add(a,b){…} }`: an `ID` directly followed by a
      // balanced `( … )` and then a `{` body — distinguishes it from a block
      // whose first statement is a call like `{ foo() }`.
      if (nk === "LPAREN") {
        let depth = 0;
        let k = j;
        do {
          const t = kind(k);
          if (t === "LPAREN") depth++;
          else if (t === "RPAREN") depth--;
          else if (t === "EOF") return false;
          k++;
        } while (depth > 0);
        while (kind(k) === "NEWLINE") k++;
        // Optional return-type annotation `add(a): T { … }`. Scan past the type
        // to the body `{`, tracking `{`/`[`/`(` depth so an object/array type in
        // the annotation (e.g. `: { x: i32 }`) doesn't swallow the body brace.
        if (kind(k) === "COLON") {
          k++;
          let d = 0;
          for (;;) {
            const t = kind(k);
            if (t === "EOF") return false;
            if (d === 0 && t === "LBRACE") break;
            if (t === "LBRACE" || t === "LBRACK" || t === "LPAREN") d++;
            else if (t === "RBRACE" || t === "RBRACK" || t === "RPAREN") d--;
            k++;
          }
        }
        return kind(k) === "LBRACE";
      }
      return false;
    }
    if (first === "STRING") {
      let j = i + 1;
      while (kind(j) === "NEWLINE") j++;
      return kind(j) === "COLON";
    }
    if (first === "LBRACK") {
      // Skip a balanced `[ … ]`; an object pair is `[expr]: …`.
      let depth = 0;
      let j = i;
      do {
        const k = kind(j);
        if (k === "LBRACK") depth++;
        else if (k === "RBRACK") depth--;
        else if (k === "EOF") return false;
        j++;
      } while (depth > 0);
      while (kind(j) === "NEWLINE") j++;
      return kind(j) === "COLON";
    }
    return false;
  };

  const parseIf = (): VLIfNode => {
    const ifTok = expect("IF");
    skipNewlines();

    // `elseAcc` accumulates the negations of every condition seen so far (A5),
    // so a later branch is narrowed by the complement of all prior conditions.
    let elseAcc: Narrowing[] = [];
    const conditionals: VLIfNode["conditionals"] = [];

    const buildConditional = (cond: VLExpression, condCtx: Context) => {
      skipNewlines();
      if (at("THEN")) next();
      skipNewlines();
      const stmtStart = peek();
      const statement = withNarrowings(
        [...elseAcc, ...thenNarrowings(cond)],
        spanOf(stmtStart),
        () => parseStatement() ?? emptyReturn(),
      );
      elseAcc = [...elseAcc, ...elseNarrowings(cond)];
      ensureType(
        { type: "Nullable", subType: { type: "Alias", name: "boolean" } },
        typeFromExpression(cond, condCtx),
        condCtx,
      );
      conditionals.push({ condition: cond, statement });
    };

    const condStart = peek();
    const condition = parseBinary(0);
    buildConditional(condition, spanFrom(condStart));

    // `(NEWLINE* elseIf)* (NEWLINE* else)?` — newlines before else/elseif are
    // only consumed when an else/elseif actually follows.
    let elseStmt: VLStatement | undefined;
    for (;;) {
      let look = pos;
      while (tokens[look].kind === "NEWLINE") look++;
      const k = tokens[look].kind;
      if (k === "ELSEIF") {
        pos = look + 1;
        skipNewlines();
        const eStart = peek();
        const eCond = parseBinary(0);
        buildConditional(eCond, spanFrom(eStart));
        continue;
      }
      if (k === "ELSE") {
        pos = look + 1;
        skipNewlines();
        const eStart = peek();
        elseStmt = withNarrowings(
          elseAcc,
          spanOf(eStart),
          () => parseStatement() ?? emptyReturn(),
        );
      }
      break;
    }

    return record(
      { type: "If", conditionals, else: elseStmt },
      spanFrom(ifTok),
    );
  };

  const parseBlock = (label: string | undefined): VLBlockNode => {
    const open = expect("LBRACE");
    scopes.push({});
    try {
      const oldDesiredType = flow.desiredType;
      flow.desiredType = undefined;
      const blockScope = scopes[scopes.length - 1];
      const statements: [Context, VLStatement][] = [];
      skipNewlines();
      while (!at("RBRACE") && !atEnd()) {
        if (at("NEWLINE")) {
          skipNewlines();
          continue;
        }
        const startTok = peek();
        const stmt = parseStatement();
        if (stmt !== undefined) {
          const ctx = spanFrom(startTok);
          statements.push([ctx, stmt]);
          // Post-guard narrowing (A5): `if x == null { return }` narrows `x` for
          // the rest of the block. Names narrow into the block scope.
          for (const n of postGuardNarrowings(stmt)) {
            if (n.place.type !== "Name") continue;
            for (let i = scopes.length - 1; i >= 0; i--) {
              if (n.name in scopes[i]) {
                blockScope[n.name] = n.apply(scopes[i][n.name]);
                break;
              }
            }
          }
        }
        if (peek() === startTok) next(); // ensure progress
        skipNewlines();
      }
      const close = expect("RBRACE");

      // The block's value type is its last statement's type — derive it now,
      // while this block's scope (and any nested declarations) is still live.
      let valueType: VLType | undefined;
      if (statements.length > 0) {
        const [lctx, lstmt] = statements[statements.length - 1];
        valueType = typeFromStatement(lstmt, lctx);
      }
      flow.desiredType = oldDesiredType;
      if (valueType && flow.desiredType) {
        if (!validateType(flow.desiredType, { type: "Alias", name: "null" })) {
          ensureType(
            flow.desiredType,
            valueType,
            statements[statements.length - 1][0],
          );
        }
      }
      const node: VLBlockNode = {
        type: "Block",
        label,
        statements: statements.map((s) => s[1]),
        valueType,
      };
      const span = between(spanOf(open), spanOf(close));
      // Stamp the block's locals with the block's `{ … }` extent (D3 scope-aware
      // completion) before the scope is popped in `finally`.
      stampScope(blockScope, span);
      return record(node, span);
    } finally {
      scopes.pop();
    }
  };

  // `anonAt` desugars method-shorthand object fields (`{ add(a,b){…} }`): the
  // caller has already consumed the method name (used as the property key) and
  // passes that name token here so the value's span starts there. The parsed
  // value is an *anonymous* FunctionDeclaration, identical to the longhand
  // `{ add: function(a,b){…} }`, so typecheck/codegen need no changes.
  const parseFunctionDeclaration = (
    anonAt?: Token,
  ): VLFunctionDeclarationNode => {
    const fnTok = anonAt ?? expect("FUNCTION");

    // funcName: an identifier or an operator symbol (`function +(self, b)`).
    let name: string | undefined;
    let nameCtx: Context | undefined;
    if (anonAt) {
      // Method-shorthand: the field value is an anonymous function, so skip
      // name parsing — `(` already follows the consumed method name.
    } else if (at("ID")) {
      const id = next();
      name = id.text;
      nameCtx = spanOf(id);
    } else if (OPERATOR_FUNC_NAMES.has(peek().kind)) {
      const op = next();
      name = op.text;
      nameCtx = spanOf(op);
    }

    // Capture the enclosing scope BEFORE pushing the type-param scope so that
    // the forward self-registration (below) and the final-type refinement land
    // in the real enclosing scope, not the transient type-param scope.
    const enclosing = scopes[scopes.length - 1];

    // Type parameters (`function foo<T>(...)`): a `<` right after the name can
    // only be type params (the operator-overload name `function <(...)` already
    // consumed `<` as the name, leaving `(`). Each name binds to ONE shared
    // `{Infer, Unknown}` hole in a pushed scope so that param annotations, the
    // return annotation, AND the body all resolve `T` to that same hole via the
    // existing `parseTypePrimary` scope lookup — keeping the positions correlated
    // per call site (the existing monomorphization machinery does the rest).
    const typeParams: string[] = at("LESS_THAN") ? parseTypeParams() : [];
    const pushedTypeScope = typeParams.length > 0;
    if (pushedTypeScope) {
      scopes.push(
        Object.fromEntries(
          typeParams.map((
            n,
          ) => [n, { type: "Infer", subType: { type: "Unknown" } }]),
        ),
      );
    }

    expect("LPAREN");
    const { params: parameters, spans: paramSpans } = parseParams();
    expect("RPAREN");

    let annotatedReturn: VLType | undefined;
    if (at("COLON")) {
      next();
      skipNewlines();
      annotatedReturn = parseType();
    }
    skipNewlines();

    // Forward-register in the enclosing scope BEFORE walking the body so
    // recursive calls resolve (the return is refined in place once inferred).
    const selfType: VLFunctionType = {
      type: "Function",
      paramaters: parameters,
      return: annotatedReturn ??
        { type: "Infer", subType: { type: "Unknown" } },
    };
    let registered = false;
    let fnBinding: Binding | undefined;
    if (name) {
      // This top-level name is already in scope because the forward-reference
      // pre-pass hoisted its signature. That is NOT a redeclaration — it is this
      // very declaration's own hoisted entry. Consume the marker (so a genuine
      // *second* `function name` later still errors B16) and fall through to
      // register the real binding, overwriting the placeholder signature.
      const hoisted = enclosing === program.scope && preregistered.has(name);
      if (hoisted) preregistered.delete(name);
      if (name in enclosing && !hoisted) {
        errors.push({
          type: "Redeclaration",
          name,
          ctx: nameCtx ?? spanOf(fnTok),
          code: 2,
        });
      } else {
        // A forward/mutual caller resolved this name during the pre-pass and
        // captured the HOISTED signature object (`instantiateFunctionType`
        // returns a non-generic signature by reference, so the call site's
        // `functionType` *is* this object). The pre-pass scouts signatures
        // before any `type` declaration is registered, so a struct-by-value
        // param annotation (`c: Cur`) couldn't resolve `Cur` and was hoisted as
        // `Never`. Patch the hoisted object's parameters in place now that the
        // real pass has resolved them, so every forward caller observes the
        // concrete struct type instead of the `Never` placeholder — otherwise
        // codegen lowers a `Never` param and crashes. (Struct-array params
        // worked because the array's element alias is wrapped in a structural
        // `Object` whose own resolution did not hinge on the hoist ordering in
        // the same way; the bare struct alias resolved straight to `Never`.)
        const prior = enclosing[name];
        if (hoisted && prior.type === "Function") {
          prior.paramaters = selfType.paramaters;
        }
        enclosing[name] = selfType;
        if (nameCtx) {
          fnBinding = declareBinding(
            enclosing,
            name,
            "function",
            nameCtx,
            selfType,
            fnTok.docComment,
          );
        }
        registered = true;
      }
    }

    const scope = Object.fromEntries(
      parameters.map((p) => [p.name, p.paramaterType]),
    );
    scopes.push(scope);
    for (let i = 0; i < parameters.length; i++) {
      declareBinding(
        scope,
        parameters[i].name,
        "parameter",
        paramSpans[i],
        parameters[i].paramaterType,
      );
    }
    let node: VLFunctionDeclarationNode;
    const bodyStart = peek();
    try {
      let functionReturnType: VLType | undefined = annotatedReturn;

      const oldReturnTypes = returnTypes;
      returnTypes = [];
      const oldDesiredType = flow.desiredType;
      flow.desiredType = annotatedReturn ? functionReturnType : undefined;
      const oldReturnType = returnType;
      returnType = functionReturnType;

      // An empty `{}` function body is a block (a void function), NOT an empty
      // object literal. `looksLikeObject` treats `{}` as an object (the ANTLR
      // tie-break for expression position), which would give `function f() {}`
      // a spurious `{}` struct return type and crash codegen. A non-empty body
      // keeps the normal block/object-ambiguous path — an object-literal body
      // like `function add(s, b) { x: s.x + b.x }` must still parse as an
      // object. Force the block only for the empty-braces case (skipping any
      // newlines between the braces, so `function f() {\n}` is treated the same
      // as `function f() {}`).
      const emptyBraces = () => {
        if (!at("LBRACE")) return false;
        let k = 1;
        while (peek(k).kind === "NEWLINE") k++;
        return peek(k).kind === "RBRACE";
      };
      const body = emptyBraces()
        ? parseBlock(undefined)
        : (parseStatement() ?? emptyReturn());
      const bodyType = typeFromStatement(body, spanFrom(bodyStart));

      const subTypes = returnTypes;
      returnTypes = oldReturnTypes;
      flow.desiredType = oldDesiredType;
      returnType = oldReturnType;

      if (!functionReturnType) {
        if (bodyType.type !== "Never") subTypes.push(bodyType);
        functionReturnType = softenImplicitType({ type: "Union", subTypes });
      }

      for (const param of parameters) {
        if (
          param.paramaterType.type === "Infer" &&
          param.paramaterType.subType.type !== "Unknown"
        ) {
          updateType(param.paramaterType, makeExact(param.paramaterType));
        }
      }

      node = {
        type: "FunctionDeclaration",
        name,
        parameters,
        body,
        returnType: functionReturnType,
      };
      if (typeParams.length > 0) node.typeParameters = typeParams;
      scopes.pop();
    } catch (err) {
      scopes.pop();
      // Per-statement recovery in `parseProgram` resumes after a throw, so a
      // leaked type-param scope would corrupt later parsing — pop it here too.
      if (pushedTypeScope) scopes.pop();
      throw err;
    }

    // Drop the type-param scope on the success path. The remaining work
    // (`typeFromExpression`, guard detection) reads only `node` fields and the
    // already-captured `enclosing`, so the type-param scope is no longer needed.
    if (pushedTypeScope) scopes.pop();

    const ctx = spanFrom(fnTok);
    // Parameters are visible across the whole function (D3 scope-aware
    // completion). The body's block scope already carries the body's tighter
    // extent, so a param shadowed by a body local still resolves correctly.
    stampScope(scope, ctx);
    record(node, ctx);
    // Memoize the node's final type and refine the forward-registered entry.
    const finalType = typeFromExpression(node, ctx);
    if (registered) enclosing[name!] = finalType;
    // Refine the binding's type to the inferred (post-body) signature so hover
    // shows the resolved return rather than the pre-inference `Infer` hole.
    if (fnBinding) fnBinding.type = finalType;

    // Inferred type guard (A6b, degenerate case): body is exactly
    // `return <narrowing-predicate-on-a-param>`.
    if (name) {
      const result = node.body.type === "Block"
        ? (() => {
          const last = node.body.statements[node.body.statements.length - 1];
          return last?.type === "Return" ? last.value : last;
        })()
        : node.body;
      const fact = result ? conditionNarrowing(result as VLExpression) : null;
      if (fact) {
        const paramIndex = parameters.findIndex((p) => p.name === fact.name);
        if (paramIndex >= 0) {
          guards.set(name, { paramIndex, nonNullOn: fact.nonNullOn });
        }
      }
    }

    return node;
  };

  const parseTypeParams = (): string[] => {
    expect("LESS_THAN");
    skipNewlines();
    const names: string[] = [];
    if (!at("GREATER_THAN")) {
      for (;;) {
        skipNewlines();
        const id = expect("ID");
        names.push(id.text);
        skipNewlines();
        if (at("COMMA")) {
          next();
          // Trailing comma: a `,` immediately before `>` closes the list.
          skipNewlines();
          if (at("GREATER_THAN")) break;
          continue;
        }
        break;
      }
    }
    skipNewlines();
    expect("GREATER_THAN");
    return names;
  };

  const parseParams = (): { params: VLParameterNode[]; spans: Context[] } => {
    const params: VLParameterNode[] = [];
    // Span of each parameter's declaring identifier, parallel to `params`
    // (the AST node doesn't carry a span; the symbol table needs one).
    const spans: Context[] = [];
    skipNewlines();
    if (at("RPAREN")) return { params, spans };
    for (;;) {
      skipNewlines();
      const id = expect("ID");
      let paramaterType: VLType;
      if (at("COLON")) {
        next();
        skipNewlines();
        // Keep a named `Type` wrapper (a resolved `type` alias, D8) intact so the
        // parameter binding hovers with the alias *name*; only resolve a bare
        // `Alias` leaf (e.g. a recursive self-reference) through to concrete.
        const annotated = parseType();
        paramaterType = annotated.type === "Type" && annotated.name !== undefined
          ? annotated
          : getConcreteType(annotated, spanOf(id));
      } else {
        paramaterType = { type: "Infer", subType: { type: "Unknown" } };
      }
      params.push({ type: "Parameter", name: id.text, paramaterType });
      spans.push(spanOf(id));
      skipNewlines();
      if (at("COMMA")) {
        next();
        // Trailing comma: a `,` immediately before `)` closes the list.
        skipNewlines();
        if (at("RPAREN")) break;
        continue;
      }
      break;
    }
    return { params, spans };
  };

  const finishAssignment = (left: VLExpression): VLExpression => {
    // Compound operator (`+= -= *= /= %= ^=`) — an arith op then `=`.
    let operator: string | undefined;
    if (ARITH_ASSIGN_OPS.has(peek().kind) && peek(1).kind === "EQUAL") {
      operator = next().text;
    }
    expect("EQUAL");
    skipNewlines();
    const rawRight = parseExpr();
    const rightCtx = ctxOf(rawRight);
    const wholeCtx = between(ctxOf(left), rightCtx);

    if (left.type === "PropertyAccess") {
      const object = left.object;
      const property = left.property;
      const objectCtx = ctxOf(object);
      const objectType = typeFromExpression(object, objectCtx);
      const childType = getChildType(
        objectType,
        { type: "StringLiteral", value: property },
        objectCtx,
        ctxOf(left),
      );
      const right: VLExpression = operator
        ? {
          type: "BinaryOperation",
          left: { type: "PropertyAccess", object, property },
          right: rawRight,
          operator,
        }
        : rawRight;
      const rightType = typeFromExpression(right, rightCtx);
      if (childType) ensureType(childType, rightType, rightCtx);
      return record({
        type: "BinaryOperation",
        left: { type: "PropertyAccess", object, property },
        right,
        operator: "=",
        ...(operator ? { compoundOperator: operator } : {}),
      }, wholeCtx);
    }

    // Index-trap write (B13): `o[k] = v` on a user object with a `"[]="` method.
    // The LHS was already turned into a `"[]"` read-trap `Call` by `parsePostfix`
    // (the index trap fires during postfix parsing); recover the object + key and
    // re-dispatch as `o."[]="(k, v)`, reusing the field-method `Call` lowering.
    // The method's value-param type checks `v` (and the key-param type checks
    // `k`). A native array keeps the `IndexAccess` branch below (no `"[]="`).
    if (
      left.type === "Call" && left.callee.type === "PropertyAccess" &&
      left.callee.property === "[]" && left.arguments.length === 1
    ) {
      const object = left.callee.object;
      const key = left.arguments[0].value;
      const objCtx = ctxOf(object);
      // `o[k] += v` desugars to `o[k] = o[k] + v`; the read side reuses the
      // already-built `"[]"` read-trap call as the operator's left operand.
      const right: VLExpression = operator
        ? { type: "BinaryOperation", left, right: rawRight, operator }
        : rawRight;
      const trapped = indexTrap(object, [key, right], "[]=", objCtx, wholeCtx);
      if (trapped) return trapped;
      // The object had `"[]"` but no `"[]="` — assignment isn't supported. Report
      // through getChildType against `"[]="` so the error names the missing method.
      getChildType(
        typeFromExpression(object, objCtx),
        { type: "StringLiteral", value: "[]=" },
        objCtx,
        objCtx,
      );
      return record({
        type: "BinaryOperation",
        left,
        right,
        operator: "=",
        ...(operator ? { compoundOperator: operator } : {}),
      }, wholeCtx);
    }

    if (left.type === "IndexAccess") {
      const array = left.array;
      const index = left.index;
      const arrayCtx = ctxOf(array);
      const arrayType = typeFromExpression(array, arrayCtx);
      const indexCtx = ctxOf(index);
      const childType = getChildType(
        arrayType,
        typeFromExpression(index, indexCtx),
        arrayCtx,
        indexCtx,
      );
      const right: VLExpression = operator
        ? {
          type: "BinaryOperation",
          left: { type: "IndexAccess", array, index },
          right: rawRight,
          operator,
        }
        : rawRight;
      const rightType = typeFromExpression(right, rightCtx);
      if (childType) {
        if (childType.type === "Union" && childType.subTypes.length === 0) {
          updateType(childType, rightType);
        } else ensureType(childType, rightType, rightCtx);
        if (childType.type === "Infer") {
          updateType(childType, makeExact(childType));
        }
      }
      return record({
        type: "BinaryOperation",
        left: { type: "IndexAccess", array, index },
        right,
        operator: "=",
        ...(operator ? { compoundOperator: operator } : {}),
      }, wholeCtx);
    }

    // Simple `name = …`.
    if (left.type !== "Name") {
      errors.push({
        type: "Syntax",
        message: "Syntax error: invalid assignment target",
        ctx: ctxOf(left),
        code: 0,
      });
    } else checkRebind(left.name, ctxOf(left));
    const leftCtx = ctxOf(left);
    // Mark the LHS name's occurrence (recorded as a use during precedence
    // climbing) as an assignment *write* target, so the lint pass can tell a
    // never-reassigned `let` (prefer-`const`) from a mutated one.
    if (left.type === "Name") symbols.markWrite(leftCtx);
    const leftType = typeFromExpression(left, leftCtx);
    const right: VLExpression = operator
      ? { type: "BinaryOperation", left, right: rawRight, operator }
      : rawRight;
    const rightType = typeFromExpression(right, rightCtx);
    ensureType(leftType, rightType, rightCtx);
    if (leftType.type === "Infer") updateType(leftType, makeExact(leftType));
    return record({
      type: "BinaryOperation",
      left,
      right,
      operator: "=",
      ...(operator ? { compoundOperator: operator } : {}),
    }, wholeCtx);
  };

  // ---- statements ----------------------------------------------------------

  const parseVariableDeclaration = (): VLVariableDeclarationNode => {
    const kw = next(); // LET or CONST
    // JS/TS semantics: `let` is a reassignable binding, `const` is immutable
    // (the *name* cannot be rebound — data behind it may still mutate).
    const mutable = kw.kind === "LET";
    const id = expect("ID");
    let annotated: VLType | undefined;
    if (at("COLON")) {
      next();
      skipNewlines();
      annotated = parseType();
    }
    let value: VLExpression | undefined;
    let valueCtx: Context | undefined;
    if (at("EQUAL")) {
      next();
      skipNewlines();
      const vStart = peek();
      value = parseExpr();
      valueCtx = spanFrom(vStart);
    }

    const node: VLVariableDeclarationNode = {
      type: "VariableDeclaration",
      name: id.text,
      variableType: annotated ?? { type: "Unknown" },
      value,
      mutable,
      annotated: annotated !== undefined,
    };
    if (node.value) {
      const valType = typeFromExpression(node.value, valueCtx ?? spanOf(id));
      if (!annotated) {
        node.variableType = softenImplicitType(valType);
      } else ensureType(node.variableType, valType, valueCtx ?? spanOf(id));
    }
    if (node.name in scopes[scopes.length - 1]) {
      errors.push({
        type: "Redeclaration",
        name: node.name,
        ctx: spanFrom(kw),
        code: 0,
      });
    } else {
      const scope = scopes[scopes.length - 1];
      scope[node.name] = node.variableType;
      declareBinding(
        scope,
        node.name,
        "variable",
        spanOf(id),
        node.variableType,
        kw.docComment,
        mutable,
      );
    }
    return record(node, spanFrom(kw));
  };

  const parseTypeStatement = (): VLStatement => {
    const typeTok = expect("TYPE");
    const id = expect("ID");
    const name = id.text;
    // Generic type parameters (`type Box<T> = …`): a `<` after the name can only
    // be type params here (no less-than operator in type position). Each name
    // binds to ONE shared `{Infer, Unknown}` hole, pushed in a transient scope so
    // every reference to `T` inside the body resolves to that same hole (mirrors
    // the function type-param approach). Applying the alias clones the body with
    // those holes and unifies them against the arguments (see `instantiateAlias`).
    const typeParams: string[] = at("LESS_THAN") ? parseTypeParams() : [];
    const paramHoles: VLInferType[] = typeParams.map(() => ({
      type: "Infer",
      subType: { type: "Unknown" },
    }));
    const hasBody = at("EQUAL");
    if (name in scopes[scopes.length - 1]) {
      errors.push({ type: "Redeclaration", name, ctx: spanOf(id), code: 11 });
      // Still consume the body so parsing resumes cleanly after a redeclaration.
      if (hasBody) {
        next();
        skipNewlines();
        if (typeParams.length > 0) {
          scopes.push(Object.fromEntries(
            typeParams.map((n, i) => [n, paramHoles[i]]),
          ));
        }
        try {
          parseType();
        } finally {
          if (typeParams.length > 0) scopes.pop();
        }
      }
      return { type: "Block", label: `__type_${name}__`, statements: [] };
    }
    // Register the alias *before* parsing its body so a recursive reference
    // inside it resolves (to a lazy `Alias` leaf, via `typeBuilding`). The
    // bodyless form (`type Point`, no `=`) aliases the name to itself — a
    // degenerate self-cycle `getConcreteType` reports cleanly when used (A14).
    const entry: VLTypeType = {
      type: "Type",
      subType: { type: "Alias", name },
      // Carry the alias name on the `Type` node so display preserves it (D8).
      name,
    };
    if (typeParams.length > 0) entry.params = paramHoles;
    const typeScope = scopes[scopes.length - 1];
    typeScope[name] = entry;
    declareBinding(
      typeScope,
      name,
      "type",
      spanOf(id),
      entry,
      typeTok.docComment,
    );
    if (hasBody) {
      next();
      skipNewlines();
      typeBuilding.add(name);
      // Bind the param holes only while parsing the body; pop afterwards so the
      // names don't leak into the surrounding type scope.
      if (typeParams.length > 0) {
        scopes.push(Object.fromEntries(
          typeParams.map((n, i) => [n, paramHoles[i]]),
        ));
      }
      try {
        entry.subType = parseType();
      } finally {
        if (typeParams.length > 0) scopes.pop();
        typeBuilding.delete(name);
      }
    }
    return { type: "Block", label: `__type_${name}__`, statements: [] };
  };

  const parseWhile = (
    label: string | undefined,
    startTok: Token,
  ): VLStatement => {
    expect("WHILE");
    skipNewlines();
    const condStart = peek();
    const condition = parseBinary(0);
    ensureType(
      { type: "Nullable", subType: { type: "Alias", name: "boolean" } },
      typeFromExpression(condition, spanFrom(condStart)),
      spanFrom(condStart),
    );
    skipNewlines();
    const statement = parseStatement() ?? emptyReturn();
    return record(
      { type: "While", label, condition, statement },
      spanFrom(startTok),
    );
  };

  const parseFor = (
    label: string | undefined,
    startTok: Token,
  ): VLStatement => {
    const forTok = expect("FOR");
    skipNewlines();
    const variable = expect("ID").text;
    skipNewlines();
    expect("IN");
    skipNewlines();
    const firstStart = peek();
    const first = parseBinary(0);
    const firstCtx = spanFrom(firstStart);

    // `for x in arr` (no `to`) — collection iteration.
    if (!at("TO")) {
      const iterableType = typeFromExpression(first, firstCtx);
      const element = arrayElementType(iterableType);
      if (!element) {
        errors.push({
          type: "Type",
          left: {
            type: "Object",
            properties: [{
              name: { type: "Alias", name: "i32" },
              type: { type: "Unknown" },
            }],
          },
          right: iterableType,
          ctx: firstCtx,
          code: "for-in-not-array",
        });
      }
      skipNewlines();
      scopes.push({
        [variable]: softenImplicitType(element ?? { type: "Never" }),
      });
      let statement: VLStatement;
      try {
        statement = parseStatement() ?? emptyReturn();
        scopes.pop();
      } catch (err) {
        scopes.pop();
        throw err;
      }
      return record(
        { type: "ForIn", label, variable, iterable: first, statement },
        spanFrom(startTok),
      );
    }

    // `for x in from to to (step step)?`.
    const fromType = typeFromExpression(first, firstCtx);
    ensureType({ type: "Alias", name: "i32" }, fromType, firstCtx);

    next(); // TO
    skipNewlines();
    const toStart = peek();
    const to = parseBinary(0);
    const toCtx = spanFrom(toStart);
    ensureType(
      { type: "Alias", name: "i32" },
      typeFromExpression(to, toCtx),
      toCtx,
    );

    let step: VLExpression | undefined;
    scopes.push({ [variable]: softenImplicitType(fromType) });
    let statement: VLStatement;
    try {
      if (at("STEP")) {
        next();
        skipNewlines();
        const stepStart = peek();
        step = parseBinary(0);
        const stepCtx = spanFrom(stepStart);
        ensureType(
          { type: "Alias", name: "i32" },
          typeFromExpression(step, stepCtx),
          stepCtx,
        );
      }
      skipNewlines();
      statement = parseStatement() ?? emptyReturn();
      scopes.pop();
    } catch (err) {
      scopes.pop();
      throw err;
    }

    // Warn on a provably-empty literal range.
    if (first.type === "IntegerLiteral" && to.type === "IntegerLiteral") {
      const stepVal = !step
        ? 1
        : step.type === "IntegerLiteral"
        ? step.value
        : null;
      if (
        stepVal !== null && stepVal !== 0 &&
        (stepVal > 0 ? first.value > to.value : first.value < to.value)
      ) {
        errors.push({
          type: "Syntax",
          severity: "warning",
          message:
            `This \`for\` range is empty and never iterates: ${first.value} to ${to.value}${
              stepVal !== 1 ? ` step ${stepVal}` : ""
            }`,
          ctx: spanFrom(forTok),
          code: 0,
        });
      }
    }

    return record(
      { type: "For", label, variable, from: first, to, step, statement },
      spanFrom(startTok),
    );
  };

  const parseReturn = (): VLStatement => {
    const ctxStart = peek();
    expect("RETURN");
    let value: VLExpression | undefined;
    if (!at("NEWLINE") && !at("RBRACE") && !atEnd()) {
      value = parseExpr();
    }
    const ctx = spanFrom(ctxStart);
    if (value) {
      const type = typeFromExpression(value, ctx);
      if (flow.desiredType) ensureType(flow.desiredType, type, ctx);
      returnTypes.push(type);
    }
    return record({ type: "Return", value }, ctx);
  };

  // ---- module system (phase 1): import / export ----------------------------

  /**
   * Record an `export`ed top-level binding on the program node so the multi-file
   * resolver can satisfy a cross-module `import { name }`. The binding's resolved
   * type is read from the module scope (`program.scope`) — for a `function` or
   * `variable` that is the value type; for a `type` it is the `Type` alias entry.
   * Re-exporting a name already exported is a redeclaration the underlying decl
   * parser already flagged (B16), so this just overwrites the last seen record.
   */
  const recordExport = (
    name: string,
    kind: "function" | "variable" | "type",
  ): void => {
    const type = program.scope[name] ?? { type: "Unknown" };
    (program.moduleExports ??= {})[name] = { name, kind, type };
    // Mark the symbol-table binding exported so the unused-variable lint exempts
    // an exported-but-locally-unread top-level binding (it's public surface).
    const binding = scopeBindings.get(program.scope)?.get(name);
    if (binding) binding.exported = true;
  };

  /**
   * Parse `import { a, b as c } from "<specifier>"` (phase 1: named imports
   * only, relative `./`/`../` specifiers, NO `.vl` extension — resolution
   * appends it). Records a `VLImportNode` and returns it as a statement; the
   * actual cross-module binding/type-resolution is the resolver's job
   * (`compiler/modules.ts`), which pre-seeds this module's `initialScope` with
   * the imported names so references type-check. Newline-delimited, no
   * semicolons, matching VL style.
   */
  const parseImport = (): VLImportNode => {
    const kw = expect("IMPORT");
    expect("LBRACE");
    skipNewlines();
    const specifiers: { name: string; local: string }[] = [];
    if (!at("RBRACE")) {
      for (;;) {
        skipNewlines();
        if (at("RBRACE")) break;
        const nameTok = expect("ID");
        let local = nameTok.text;
        if (at("AS")) {
          next();
          skipNewlines();
          local = expect("ID").text;
        }
        specifiers.push({ name: nameTok.text, local });
        skipNewlines();
        if (at("COMMA")) {
          next();
          skipNewlines();
          if (at("RBRACE")) break;
          continue;
        }
        break;
      }
    }
    skipNewlines();
    expect("RBRACE");
    skipNewlines();
    expect("FROM");
    skipNewlines();
    const specTok = peek();
    let specifier = "";
    if (at("STRING")) {
      next();
      specifier = specTok.value ?? specTok.text.slice(1, -1);
    } else {
      errors.push({
        type: "Syntax",
        message:
          `Syntax error: expected a module specifier string after \`from\` but found ${
            JSON.stringify(specTok.text)
          }`,
        ctx: spanOf(specTok),
        code: 0,
      });
    }
    const node: VLImportNode = { type: "Import", specifier, specifiers };
    // Record the local-name uses as symbol-table declarations IF the resolver
    // pre-seeded their bindings into the module scope (it injects each imported
    // name's type before parsing). Without the graph driver the names aren't in
    // scope; the import is still recorded so the resolver/LSP can read it, and
    // bare references will surface as undeclared (single-file compile of a file
    // with imports is meaningful only through the resolver).
    for (const s of specifiers) {
      if (s.local in program.scope) {
        declareBinding(
          program.scope,
          s.local,
          program.scope[s.local].type === "Type" ? "type" : "variable",
          spanOf(kw),
          program.scope[s.local],
        );
      }
    }
    (program.moduleImports ??= []).push(node);
    return record(node, spanFrom(kw));
  };

  const parseStatement = (): VLStatement | undefined => {
    const t = peek();
    switch (t.kind) {
      case "LET":
      case "CONST":
        return parseVariableDeclaration();
      case "RETURN":
        return parseReturn();
      case "TYPE":
        return parseTypeStatement();
      case "WHILE":
        return parseWhile(undefined, t);
      case "FOR":
        return parseFor(undefined, t);
      case "BREAK": {
        const kw = next();
        const label = at("ID") ? next().text : undefined;
        const node: VLBreakNode = { type: "Break", label };
        return record(node, spanFrom(kw));
      }
      case "CONTINUE": {
        const kw = next();
        const label = at("ID") ? next().text : undefined;
        const node: VLContinueNode = { type: "Continue", label };
        return record(node, spanFrom(kw));
      }
      case "ID": {
        // Labelled loop `name: while …` / `name: for …`. The recorded span
        // starts at the label so it covers `name: while …` in full.
        if (peek(1).kind === "COLON") {
          const k = peek(2).kind;
          if (k === "WHILE") {
            const label = next().text;
            next(); // COLON
            return parseWhile(label, t);
          }
          if (k === "FOR") {
            const label = next().text;
            next(); // COLON
            return parseFor(label, t);
          }
        }
        return parseExpr();
      }
      default:
        return parseExpr();
    }
  };

  // ---- forward-reference pre-pass ------------------------------------------

  /**
   * Hoist every top-level function *signature* into the module scope BEFORE any
   * body is parsed, so a call can resolve a function declared later in the file,
   * and two top-level functions can be mutually recursive
   * (`isEven` ↔ `isOdd`). VL's parser resolves names eagerly in a single
   * top-to-bottom pass, so without this a forward/mutual call hit `getType` while
   * the callee was not yet in scope and failed with "undeclared".
   *
   * This is a SIGNATURE-only scout pass: it parses each top-level
   * `function NAME <T>? ( params ) (: ret)?` and registers a `Function` type into
   * `program.scope`, then rewinds the cursor so the real pass parses everything
   * (including the bodies) normally. The real pass detects the hoisted entry via
   * `preregistered` and adopts it instead of re-erroring as a redeclaration.
   *
   * ANNOTATION RULE: a hoisted signature with no `: returnType` annotation gets an
   * `Infer/Unknown` return hole (exactly like the existing self-recursion path).
   * A forward/mutual *call* therefore sees an unresolved return until the callee's
   * body is checked — which, for a forward reference, has not happened yet. So
   * **a function that is called before (or mutually with) its own definition must
   * declare its return type**; otherwise the call resolves against the hole and
   * reports a clean type error (`expected …, got any`) rather than crashing. This
   * mirrors how an un-annotated *self*-recursive function already behaves today.
   *
   * Side effects (parse errors, symbol-table bindings, scope mutations from
   * `parseParams`/`parseType`) are reverted: the real pass re-parses the same
   * signatures and is the single source of truth for diagnostics and symbols.
   */
  function preRegisterTopLevelFunctions(): void {
    const savedPos = pos;
    const savedErrors = errors.length;
    // Trivia kinds that do not count as the "previous real token" when deciding
    // whether a `function` sits in statement position.
    let depth = 0; // paren + brace + bracket nesting
    let prevReal: TokenKind | undefined; // last non-newline token kind at depth 0
    while (!atEnd()) {
      const k = peek().kind;
      if (k === "NEWLINE") {
        next();
        continue;
      }
      // `export` is a transparent top-level modifier: a following `function`
      // still hoists. Consume it without disturbing `prevReal` so the next token
      // is judged as if `export` weren't there.
      if (depth === 0 && k === "EXPORT") {
        next();
        continue;
      }
      // An `import { … } from "…"` statement carries no hoistable signature; skip
      // it wholesale (through its specifier string) and treat the line as ending
      // in statement position so a following `function` still hoists.
      if (depth === 0 && k === "IMPORT") {
        next();
        while (!atEnd() && peek().kind !== "FROM") next();
        if (at("FROM")) next();
        if (at("STRING")) next();
        prevReal = "RBRACE";
        continue;
      }
      if (
        depth === 0 && k === "FUNCTION" && peek(1).kind === "ID" &&
        (prevReal === undefined || prevReal === "RBRACE")
      ) {
        scoutSignature();
        prevReal = "RBRACE"; // a declaration ends like a block: next is stmt-pos
        continue;
      }
      if (k === "LPAREN" || k === "LBRACE" || k === "LBRACK") depth++;
      else if (k === "RPAREN" || k === "RBRACE" || k === "RBRACK") {
        if (depth > 0) depth--;
      }
      if (depth === 0) prevReal = k;
      next();
    }
    // Revert every side effect of the scout pass; the real pass owns diagnostics
    // and symbols. The signatures we registered into `program.scope` stay.
    errors.length = savedErrors;
    pos = savedPos;
  }

  /**
   * Scout a single top-level `function NAME <T>? ( params ) (: ret)?` and register
   * its `Function` type into the module scope. Leaves the cursor just past the
   * signature (the real pass rewinds anyway). Best-effort: a malformed signature
   * simply isn't hoisted (the real pass will report the syntax error in place).
   */
  function scoutSignature(): void {
    try {
      next(); // FUNCTION
      const name = next().text; // ID (guaranteed by caller)
      const typeParams: string[] = at("LESS_THAN") ? parseTypeParams() : [];
      const pushedTypeScope = typeParams.length > 0;
      if (pushedTypeScope) {
        scopes.push(
          Object.fromEntries(
            typeParams.map((
              n,
            ) => [n, { type: "Infer", subType: { type: "Unknown" } }]),
          ),
        );
      }
      try {
        if (!at("LPAREN")) return;
        next(); // LPAREN
        const { params } = parseParams();
        if (at("RPAREN")) next();
        let annotatedReturn: VLType | undefined;
        if (at("COLON")) {
          next();
          skipNewlines();
          annotatedReturn = parseType();
        }
        // First top-level declaration of a given name wins the hoist slot; a
        // genuine duplicate is left for the real pass to flag as a redeclaration.
        if (!(name in program.scope)) {
          program.scope[name] = {
            type: "Function",
            paramaters: params,
            return: annotatedReturn ??
              { type: "Infer", subType: { type: "Unknown" } },
          };
          preregistered.add(name);
        }
      } finally {
        if (pushedTypeScope) scopes.pop();
      }
    } catch {
      // Malformed signature: skip hoisting it. The real pass reports the error.
    }
  }

  // ---- program -------------------------------------------------------------

  const program: VLProgramNode = {
    type: "Program",
    statements: [],
    scope: initialScope,
  };
  scopes.push(program.scope);

  preRegisterTopLevelFunctions();

  /**
   * Parse one top-level item, handling the module-system surface that is only
   * legal at the top level: an `import { … } from "…"` statement and an `export`
   * modifier on a `function` / `let` / `const` / `type` declaration. Everything
   * else delegates to the ordinary `parseStatement`. The `export` path parses the
   * underlying declaration, sets its `exported` flag, and records the public
   * binding on the program node (`recordExport`) so the resolver can satisfy a
   * cross-module import.
   */
  const parseTopLevelStatement = (): VLStatement | undefined => {
    if (at("IMPORT")) return parseImport();
    if (at("EXPORT")) {
      const kw = next(); // EXPORT
      skipNewlines();
      // `export function f(…)` — register + flag + record.
      if (at("FUNCTION")) {
        const fn = parseFunctionDeclaration();
        if (fn.name) {
          fn.exported = true;
          recordExport(fn.name, "function");
        } else {
          errors.push({
            type: "Syntax",
            message: "Syntax error: cannot export an anonymous function",
            ctx: spanFrom(kw),
            code: 0,
          });
        }
        return fn;
      }
      // `export let x = …` / `export const x = …`.
      if (at("LET") || at("CONST")) {
        const decl = parseVariableDeclaration();
        decl.exported = true;
        recordExport(decl.name, "variable");
        return decl;
      }
      // `export type T = …`. The type-statement parser registers the alias and
      // returns a placeholder `Block`; recover the name from the next token
      // (already consumed by the parser, so peek before delegating).
      if (at("TYPE")) {
        const nameTok = peek(1);
        const decl = parseTypeStatement();
        if (nameTok.kind === "ID") recordExport(nameTok.text, "type");
        return decl;
      }
      errors.push({
        type: "Syntax",
        message:
          "Syntax error: `export` must precede a `function`, `let`, `const`, or `type` declaration",
        ctx: spanFrom(kw),
        code: 0,
      });
      return parseStatement();
    }
    return parseStatement();
  };

  skipNewlines();
  while (!atEnd()) {
    if (at("NEWLINE")) {
      skipNewlines();
      continue;
    }
    const startTok = peek();
    try {
      const stmt = parseTopLevelStatement();
      if (stmt !== undefined) program.statements.push(stmt);
    } catch (err) {
      console.error(err);
      // Recover: skip to the next line so the pass makes progress.
      while (!at("NEWLINE") && !atEnd()) next();
    }
    if (peek() === startTok) next(); // ensure progress
    skipNewlines();
  }

  // Stamp top-level bindings (functions, types, module-level vars) with a span
  // covering the whole document so they're "in scope" everywhere for D3
  // completion. Builtins from `defaultScope` live in `program.scope` too but are
  // never `declareBinding`'d, so `stampScope` leaves them alone (the LSP folds
  // builtins in separately).
  const programSpan: Context = {
    start: { line: 1, column: 0 },
    stop: peek().stop, // the EOF token's position
  };
  stampScope(program.scope, programSpan);
  // Record the program node's own span too, so the root is queryable via the
  // public `NodeSpans` like every other node.
  record(program, programSpan);

  return [program, errors, symbols, spans];
};
