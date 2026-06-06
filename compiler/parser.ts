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
  makeExact,
  nonNullable,
  postGuardNarrowings,
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
  ParseErrors,
  Scope,
  VLArgumentNode,
  VLArrayLiteralNode,
  VLBinaryOperationNode,
  VLBlockNode,
  VLCallNode,
  VLExpression,
  VLFunctionCallNode,
  VLFunctionDeclarationNode,
  VLFunctionType,
  VLIfNode,
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
): [VLProgramNode, ParseErrors[], SymbolTable] => {
  // Reset the shared pass state (mirrors the old `toAST`).
  scopes.splice(0);
  errors.splice(0);
  guards.clear();
  for (const k in narrowedPaths) delete narrowedPaths[k];

  let pos = 0;
  /** Source span of each AST node, for diagnostics. */
  const spans = new WeakMap<object, Context>();

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
  ): Binding => {
    let map = scopeBindings.get(scope);
    if (!map) scopeBindings.set(scope, map = new Map());
    const binding: Binding = { name, kind, decl, type };
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

  // A fresh bare `return` node — the fallback body for a malformed statement.
  // A factory (not a shared constant) so each use is a distinct AST node.
  const emptyReturn = (): VLReturnNode => ({ type: "Return", value: undefined });

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
    let left = parseArrayType();
    while (at("PIPE")) {
      next();
      skipNewlines();
      const right = parseArrayType();
      // Mirrors `toType`: flatten as we go (a little redundant, but cheap).
      left = flattenType({ type: "Union", subTypes: [left, right] });
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
        message:
          `Generic type \`${name}\` expects ${arity} type argument${
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
        message:
          `Generic type \`${name}\` expects ${arity} type argument${
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
          if (type.type === "Type") return getConcreteType(type.subType, ctx);
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
      return { type: "StringLiteral", value: t.text.slice(1, -1) };
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
            keyName = key.text.slice(1, -1);
          } else {
            // Unexpected; report and bail out of the loop.
            errors.push({
              type: "Syntax",
              message:
                `Syntax error: expected a property name but found ${
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
  const infixBp = (t: Token): number => {
    if (ARITH_ASSIGN_OPS.has(t.kind) && peek(1).kind === "EQUAL") return 0;
    switch (t.kind) {
      case "QUESTION_QUESTION":
        return 2;
      case "OR":
        return 4;
      case "AND":
        return 6;
      case "IS":
        return 8;
      case "EQUAL_TO":
      case "NOT_EQUAL_TO":
        return 10;
      case "GREATER_THAN":
      case "GREATER_THAN_OR_EQUAL_TO":
      case "LESS_THAN":
      case "LESS_THAN_OR_EQUAL_TO":
        return 12;
      case "PLUS":
      case "MINUS":
        return 14;
      case "STAR":
      case "DIV":
      case "MOD":
        return 16;
      case "CARET":
        return 18;
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
      const bp = infixBp(opTok);
      if (bp === 0 || bp <= minBp) break;

      // `expr is Type` — the right side is a type, not an expression (A6).
      if (opTok.kind === "IS") {
        next();
        skipNewlines();
        const checkType = parseType();
        const node: VLIsNode = { type: "Is", value: left, checkType };
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
        const node: VLExpression = { type: "RealLiteral", value: -operand.value };
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

    // Prefix operators: `!`, `++`, `--`.
    if (at("EXCLAMATION") || at("PLUSPLUS") || at("MINUSMINUS")) {
      next();
      const operator = t.text;
      const operand = parseUnary();
      const ctx = spanFrom(t);
      if ((operator === "++" || operator === "--") && operand.type !== "Name") {
        errors.push({
          type: "Syntax",
          message: `\`${operator}\` requires a variable operand`,
          ctx,
          code: 0,
        });
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
        const node = { type: "PropertyAccess", object: left, property } as const;
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
        const node = { type: "OptionalAccess", object: left, property } as const;
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
        getChildType(
          typeFromExpression(left, arrayCtx),
          typeFromExpression(index, indexCtx),
          arrayCtx,
          indexCtx,
        );
        const node = { type: "IndexAccess", array: left, index } as const;
        left = record(node, between(arrayCtx, spanOf(close)));
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

  const makeArgument = (
    name: string | undefined,
    value: VLExpression,
    context: Context,
  ): VLArgumentNode => {
    const arg: VLArgumentNode = { type: "Argument", name, value, context };
    Object.defineProperty(arg, "context", { enumerable: false });
    return arg;
  };

  /** `arg (, arg)*`, each `(ID COLON)? expr`. Stops at the closing `)`. */
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
      return looksLikeObject(pos) ? parseObjectLiteral() : parseBlock(undefined);
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
        { type: "StringLiteral", value: t.text.slice(1, -1) },
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
          left: { type: "Function", paramaters: [], return: { type: "Unknown" } },
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
    return record({ type: "ObjectLiteral", properties }, between(
      spanOf(open),
      spanOf(close),
    ));
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
      // Strip the quotes so a key like `"+"` matches the operator name `+`.
      return {
        type: "PropertyLiteral",
        name: { type: "StringLiteral", value: s.text.slice(1, -1) },
        value,
      };
    }
    // `ID` (shorthand) or `ID: expr`.
    const id = expect("ID");
    const name = { type: "Name", name: id.text } as const;
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
    return record({ type: "ArrayLiteral", values }, between(
      spanOf(open),
      spanOf(close),
    ));
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
      return nk === "COLON" || nk === "COMMA" || nk === "RBRACE";
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
    expect("IF");
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

    return { type: "If", conditionals, else: elseStmt };
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

  const parseFunctionDeclaration = (): VLFunctionDeclarationNode => {
    const fnTok = expect("FUNCTION");

    // funcName: an identifier or an operator symbol (`function +(self, b)`).
    let name: string | undefined;
    let nameCtx: Context | undefined;
    if (at("ID")) {
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
      return: annotatedReturn ?? { type: "Infer", subType: { type: "Unknown" } },
    };
    let registered = false;
    let fnBinding: Binding | undefined;
    if (name) {
      if (name in enclosing) {
        errors.push({
          type: "Redeclaration",
          name,
          ctx: nameCtx ?? spanOf(fnTok),
          code: 2,
        });
      } else {
        enclosing[name] = selfType;
        if (nameCtx) {
          fnBinding = declareBinding(enclosing, name, "function", nameCtx, selfType);
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

      const body = parseStatement() ?? emptyReturn();
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
      const fact = result
        ? conditionNarrowing(result as VLExpression)
        : null;
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
        paramaterType = getConcreteType(parseType(), spanOf(id));
      } else {
        paramaterType = { type: "Infer", subType: { type: "Unknown" } };
      }
      params.push({ type: "Parameter", name: id.text, paramaterType });
      spans.push(spanOf(id));
      skipNewlines();
      if (at("COMMA")) {
        next();
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
    }
    const leftCtx = ctxOf(left);
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
    }, wholeCtx);
  };

  // ---- statements ----------------------------------------------------------

  const parseVariableDeclaration = (): VLVariableDeclarationNode => {
    const kw = next(); // LET or CONST
    const mutable = kw.kind === "CONST";
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
      declareBinding(scope, node.name, "variable", spanOf(id), node.variableType);
    }
    return record(node, spanFrom(kw));
  };

  const parseTypeStatement = (): VLStatement => {
    expect("TYPE");
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
    };
    if (typeParams.length > 0) entry.params = paramHoles;
    const typeScope = scopes[scopes.length - 1];
    typeScope[name] = entry;
    declareBinding(typeScope, name, "type", spanOf(id), entry);
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

  const parseWhile = (label: string | undefined): VLStatement => {
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
    return { type: "While", label, condition, statement };
  };

  const parseFor = (label: string | undefined): VLStatement => {
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
      return { type: "ForIn", label, variable, iterable: first, statement };
    }

    // `for x in from to to (step step)?`.
    const fromType = typeFromExpression(first, firstCtx);
    ensureType({ type: "Alias", name: "i32" }, fromType, firstCtx);

    next(); // TO
    skipNewlines();
    const toStart = peek();
    const to = parseBinary(0);
    const toCtx = spanFrom(toStart);
    ensureType({ type: "Alias", name: "i32" }, typeFromExpression(to, toCtx), toCtx);

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
          message: `This \`for\` range is empty and never iterates: ${first.value} to ${to.value}${
            stepVal !== 1 ? ` step ${stepVal}` : ""
          }`,
          ctx: spanFrom(forTok),
          code: 0,
        });
      }
    }

    return { type: "For", label, variable, from: first, to, step, statement };
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
    return { type: "Return", value };
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
        return parseWhile(undefined);
      case "FOR":
        return parseFor(undefined);
      case "BREAK": {
        next();
        const label = at("ID") ? next().text : undefined;
        return { type: "Break", label };
      }
      case "CONTINUE": {
        next();
        const label = at("ID") ? next().text : undefined;
        return { type: "Continue", label };
      }
      case "ID": {
        // Labelled loop `name: while …` / `name: for …`.
        if (peek(1).kind === "COLON") {
          const k = peek(2).kind;
          if (k === "WHILE") {
            const label = next().text;
            next(); // COLON
            return parseWhile(label);
          }
          if (k === "FOR") {
            const label = next().text;
            next(); // COLON
            return parseFor(label);
          }
        }
        return parseExpr();
      }
      default:
        return parseExpr();
    }
  };

  // ---- program -------------------------------------------------------------

  const program: VLProgramNode = {
    type: "Program",
    statements: [],
    scope: initialScope,
  };
  scopes.push(program.scope);

  skipNewlines();
  while (!atEnd()) {
    if (at("NEWLINE")) {
      skipNewlines();
      continue;
    }
    const startTok = peek();
    try {
      const stmt = parseStatement();
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

  return [program, errors, symbols];
};
