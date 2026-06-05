// The CST -> AST walker for VL: lowers the antlr parse tree into the typed AST,
// driving the type algebra (typecheck.ts) as it goes. This module is also the
// public facade — it re-exports the AST types, shared `withScope`, and the
// type-algebra entry points so existing `./toAST.ts` imports keep working.
import {
  ArgContext,
  ArrayContext,
  ExprContext,
  FunctionDeclContext,
  ObjectContext,
  ParamContext,
  ProgramContext,
  StatementContext,
  TypeContext,
  TypeStatementContext,
  VarDeclContext,
} from "./antlr/VL_Parser.ts";
import type {
  ParseErrors,
  Scope,
  VLArgumentNode,
  VLArrayLiteralNode,
  VLBinaryOperationNode,
  VLCallNode,
  VLExpression,
  VLFunctionCallNode,
  VLFunctionDeclarationNode,
  VLFunctionType,
  VLIsNode,
  VLObjectLiteralNode,
  VLParameterNode,
  VLProgramNode,
  VLStatement,
  VLType,
  VLUnaryOperationNode,
  VLVariableDeclarationNode,
} from "./ast.ts";
import { errors, flow, guards, narrowedPaths, scopes } from "./state.ts";
import type { Narrowing } from "./typecheck.ts";
import {
  arrayElementType,
  conditionNarrowing,
  defaultIntegerType,
  elseNarrowings,
  ensureType,
  flattenType,
  getChildType,
  postGuardNarrowings,
  thenNarrowings,
  getConcreteType,
  getType,
  instantiateFunctionType,
  makeExact,
  softenImplicitType,
  typeFromExpression,
  typeFromStatement,
  updateType,
  validateType,
  withNarrowings,
} from "./typecheck.ts";

// Public facade: preserve the historical `./toAST.ts` surface.
export * from "./ast.ts";
export { withScope } from "./state.ts";
export {
  arrayElementType,
  conditionNarrowing,
  defaultIntegerType,
  elseNarrowings,
  getConcreteType,
  nonNullable,
  placeKey,
  postGuardNarrowings,
  thenNarrowings,
  setNodeType,
  softenImplicitType,
  validateParameters,
  validateType,
  vlType,
} from "./typecheck.ts";

/** Implicit return types collected from a function body. */
const returnTypes: VLType[] = [];
/** Expected return type for `return` statements in the current function. */
let returnType: VLType | undefined;

const toVariableDeclaration = (ctx: VarDeclContext) => {
  const expr = ctx.expr();
  const type = ctx.type_();
  const node: VLVariableDeclarationNode = {
    type: "VariableDeclaration",
    name: ctx.ID().getText(),
    variableType: type ? toType(type) : { type: "Unknown" },
    value: expr ? toExpression(expr) : undefined,
    mutable: !!ctx.CONST(),
  };
  if (node.value) {
    const valueType = typeFromExpression(node.value, ctx);
    if (!type) {
      node.variableType = softenImplicitType(valueType);
    } else ensureType(node.variableType, valueType, expr);
  }
  if (node.name in scopes[scopes.length - 1]) {
    errors.push({ type: "Redeclaration", name: node.name, ctx, code: 0 });
  } else scopes[scopes.length - 1][node.name] = node.variableType;
  return node;
};

const toParameter = (ctx: ParamContext): VLParameterNode => {
  const type = ctx.type_();
  return {
    type: "Parameter",
    name: ctx.ID().getText(),
    paramaterType: type
      ? getConcreteType(toType(type), ctx)
      : { type: "Infer", subType: { type: "Unknown" } },
  };
};

const toType = (ctx: TypeContext): VLType => {
  {
    const id = ctx.ID();
    if (id) {
      const name = id.getText();

      for (let i = scopes.length - 1; i >= 0; i--) {
        if (name in scopes[i]) {
          const type = scopes[i][name];
          if (type.type === "Type") return getConcreteType(type.subType, ctx);
          return getConcreteType(type, ctx);
        }
      }

      errors.push({ type: "Undeclared", name, ctx, code: 1 });

      return { type: "Never" };
    }
  }

  if (ctx.PIPE()) {
    // Note, we're calling flattenType in toType, so we're doing a bunch of extra work...
    return flattenType({
      type: "Union",
      subTypes: [toType(ctx.type_(0)), toType(ctx.type_(1))],
    });
  }

  if (ctx.NULL()) return { type: "Alias", name: "null" };

  {
    const obj = ctx.objectType();
    if (obj) {
      return {
        type: "Object",
        properties: obj.pairType_list().map((p) => {
          if (p.LBRACK()) {
            return {
              name: toType(p.type_(0)),
              type: toType(p.type_(1)),
              readonly: false,
            };
          } else {
            return {
              name: {
                type: "StringLiteral",
                value: p.ID()?.getText() ?? p.STRING().getText().slice(1, -1),
              },
              type: toType(p.type_(0)),
              readonly: false,
            };
          }
        }),
      };
    }
  }

  {
    const sLit = ctx.STRING();
    if (sLit) {
      return { type: "StringLiteral", value: sLit.getText().slice(1, -1) };
    }
  }

  {
    const nLit = ctx.NUMBER();
    if (nLit) {
      const text = nLit.getText();
      const value = parseFloat(text);
      return {
        type: Number.isInteger(value) && !text.includes(".")
          ? "IntegerLiteral"
          : "RealLiteral",
        value,
        text,
      };
    }
  }

  if (ctx.TRUE()) return { type: "BooleanLiteral", value: true };

  if (ctx.FALSE()) return { type: "BooleanLiteral", value: false };

  if (ctx.LPAREN()) return toType(ctx.type_(0));

  if (ctx.LBRACK()) {
    return {
      type: "Object",
      properties: [{
        name: { type: "Alias", name: "i32" },
        type: toType(ctx.type_(0)),
      }],
    };
  }

  throw new Error(`toType not implemented ${ctx.getText()}`);
};

/**
 * Called to convert an inferred parameter type to an exact parameter type so
 * that calls are typechecked.
 */
const toFunctionDeclaration = (ctx: FunctionDeclContext) => {
  const parameters = ctx.params()?.param_list().map(toParameter) ?? [];
  // The name may be an identifier or an operator symbol (`function +(self, b)`).
  const name = ctx.funcName()?.getText();
  const returnTypeExpr = ctx.type_();
  const annotatedReturn: VLType | undefined = returnTypeExpr
    ? toType(returnTypeExpr)
    : undefined;

  // Forward-register the function in the ENCLOSING scope *before* walking the
  // body, so recursive calls (`f` inside `f`) resolve. Parameters are already
  // known; the return is the annotation if given, else a placeholder hole that
  // is refined in place (`selfType.return = …`) once the body is inferred — so
  // the scope entry ends up as the final function type.
  const enclosing = scopes[scopes.length - 1];
  const selfType: VLFunctionType = {
    type: "Function",
    paramaters: parameters,
    return: annotatedReturn ?? { type: "Infer", subType: { type: "Unknown" } },
  };
  let registered = false;
  if (name) {
    if (name in enclosing) {
      errors.push({ type: "Redeclaration", name, ctx: ctx.funcName()!, code: 2 });
    } else {
      enclosing[name] = selfType;
      registered = true;
    }
  }

  const scope = Object.fromEntries(
    parameters.map((p) => [p.name, p.paramaterType]),
  );
  scopes.push(scope);
  let node: VLFunctionDeclarationNode;
  try {
    let functionReturnType: VLType | undefined = annotatedReturn;

    const oldReturnTypes = returnTypes.splice(0, Infinity);
    const oldDesiredType = flow.desiredType;
    flow.desiredType = returnTypeExpr ? functionReturnType : undefined;
    const oldReturnType = returnType;
    returnType = functionReturnType;
    const body = toStatement(ctx.statement()) ??
      { type: "Return", value: undefined };
    const bodyType = typeFromStatement(body, ctx);
    const subTypes = returnTypes.splice(0, Infinity, ...oldReturnTypes);
    flow.desiredType = oldDesiredType;
    returnType = oldReturnType;
    if (!functionReturnType) {
      if (bodyType.type !== "Never") subTypes.push(bodyType);
      functionReturnType = softenImplicitType({ type: "Union", subTypes });
    }

    for (const param of parameters) {
      // Should be recursive
      // Only "exact" a parameter the body actually constrained. A pure hole
      // (`Infer<Unknown>` — an un-annotated param never pinned down, e.g. the
      // `a`/`b` in `function apply(fn, a, b) fn(a, b)`) is left as an inference
      // variable so each call site can unify it against the real argument type.
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

    scopes.pop();
  } catch (err) {
    scopes.pop();
    throw err;
  }

  // Memoize the node's final type (codegen's `vlType(node)` needs it) and, for a
  // named function, refine the forward-registered scope entry to the final type.
  const finalType = typeFromExpression(node, ctx);
  if (registered) enclosing[name!] = finalType;

  // Inferred type guard (A6b, degenerate case): a body that is exactly `return
  // <narrowing-predicate-on-a-parameter>` (e.g. `return p != null`) makes this
  // function a guard — calling it narrows the argument. Sound (no trust): the
  // return value *is* the predicate. Only the single result-expression case.
  if (name) {
    const result = node.body.type === "Block"
      ? (() => {
        const last = node.body.statements[node.body.statements.length - 1];
        return last?.type === "Return" ? last.value : last;
      })()
      : node.body;
    // `conditionNarrowing` ignores non-predicate nodes, so a statement tail is
    // safely a no-op (it returns null).
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

const toObjectLiteral = (ctx: ObjectContext): VLObjectLiteralNode => ({
  type: "ObjectLiteral",
  properties: ctx.pair_list().map((p) => {
    const id = p.ID();
    if (id) {
      const value = p.expr(0);
      return {
        type: "PropertyLiteral",
        name: { type: "Name", name: id.getText() },
        value: value
          ? toExpression(p.expr(0))
          : { type: "Name", name: id.getText() },
      };
    }
    const string = p.STRING();
    if (string) {
      return {
        type: "PropertyLiteral",
        // Strip the surrounding quotes (as STRING handling does elsewhere), so a
        // key like `"+"` matches the operator name `+`, not the literal `"+"`.
        name: { type: "StringLiteral", value: string.getText().slice(1, -1) },
        value: toExpression(p.expr(0)),
      };
    }
    return {
      type: "PropertyLiteral",
      name: toExpression(p.expr(0)),
      value: toExpression(p.expr(1)),
    };
  }),
});

const toArrayLiteral = (ctx: ArrayContext): VLArrayLiteralNode => ({
  type: "ArrayLiteral",
  values: ctx.expr_list().map((e) => toExpression(e)),
});

const toArguments = (args: ArgContext[]): VLArgumentNode[] =>
  args.map((arg): VLArgumentNode => {
    const fullArg: VLArgumentNode = {
      type: "Argument",
      name: arg.ID()?.getText(),
      value: toExpression(arg.expr()),
      context: arg,
    };
    Object.defineProperty(fullArg, "context", { enumerable: false });
    return fullArg;
  });

const toExpression = (ctx: ExprContext): VLExpression => {
  if (ctx.EQUAL()) return toAssignment(ctx);

  {
    const funcDecl = ctx.functionDecl();
    if (funcDecl) return toFunctionDeclaration(funcDecl);
  }

  // Unary minus: a leading `-expr` (one operand). Binary `a - b` has a second
  // expr and is handled by the operator block below.
  if (ctx.MINUS() && ctx.expr(0) && !ctx.expr(1)) {
    const operandCtx = ctx.expr(0);
    const operand = toExpression(operandCtx);
    // Fold a negated numeric literal into a proper negative literal.
    if (operand.type === "IntegerLiteral") {
      const node: VLExpression = {
        type: "IntegerLiteral",
        value: -operand.value,
        text: `-${operand.text}`,
      };
      typeFromExpression(node, ctx);
      return node;
    }
    if (operand.type === "RealLiteral") {
      const node: VLExpression = { type: "RealLiteral", value: -operand.value };
      typeFromExpression(node, ctx);
      return node;
    }
    // Otherwise negate by subtracting from a type-matched zero (reuses the `-`
    // operator's type-check + codegen; no dedicated negation node needed).
    const operandType = softenImplicitType(
      typeFromExpression(operand, operandCtx),
    );
    const zero: VLExpression =
      operandType.type === "Object" && operandType.name === "f64"
        ? { type: "RealLiteral", value: 0 }
        : { type: "IntegerLiteral", value: 0, text: "0" };
    const expr: VLBinaryOperationNode = {
      type: "BinaryOperation",
      left: zero,
      right: operand,
      operator: "-",
    };
    typeFromExpression(expr, ctx);
    return expr;
  }

  // Unary operators: prefix `not x` / `!x` / `++x` / `--x`, postfix `x++` / `x--`.
  {
    const pre = ctx.prefixOp();
    const post = ctx.postfixOp();
    const opNode = pre ?? post;
    if (opNode) {
      const operator = opNode.getText();
      const operand = toExpression(ctx.expr(0));
      // `++`/`--` mutate their operand, so it must be an assignable variable.
      if (
        (operator === "++" || operator === "--") && operand.type !== "Name"
      ) {
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
        prefix: !!pre,
      };
      typeFromExpression(node, ctx);
      return node;
    }
  }

  // Member call: `o.f(args)`.
  if (ctx.DOT() && ctx.LPAREN()) {
    const objCtx = ctx.expr(0);
    const object = toExpression(objCtx);
    const objectType = typeFromExpression(object, objCtx);
    const id = ctx.ID();
    const property = id.getText();
    const args = toArguments(ctx.args()?.arg_list() ?? []);

    // 1. Field method (container/data): a callable field named `property` on the
    //    object's shape — called with the args, no receiver. (Field wins.)
    let shape = objectType;
    if (shape.type === "Infer") shape = shape.subType;
    const fieldType = shape.type === "Object"
      ? shape.properties.find((p) =>
        validateType(p.name, { type: "StringLiteral", value: property })
      )?.type
      : undefined;
    if (fieldType?.type === "Function") {
      return {
        type: "Call",
        callee: { type: "PropertyAccess", object, property },
        arguments: args,
        functionType: instantiateFunctionType(
          fieldType,
          args,
          ctx,
        ) as VLFunctionType,
      } satisfies VLCallNode;
    }

    // 2. UFCS method: a free function named `property` whose first parameter is
    //    the `self` marker. `o.f(args)` rewrites to `f(o, args)` — reusing the
    //    FunctionCall machinery, so `self` monomorphizes to o's shape per call.
    let fn: VLType | undefined;
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (property in scopes[i]) {
        fn = scopes[i][property];
        break;
      }
    }
    if (fn?.type === "Function" && fn.paramaters[0]?.name === "self") {
      const selfArg: VLArgumentNode = {
        type: "Argument",
        name: undefined,
        value: object,
        context: objCtx,
      };
      Object.defineProperty(selfArg, "context", { enumerable: false });
      const allArgs = [selfArg, ...args];
      return {
        type: "FunctionCall",
        function: property,
        arguments: allArgs,
        functionType: instantiateFunctionType(
          fn,
          allArgs,
          ctx,
        ) as VLFunctionType,
      } satisfies VLFunctionCallNode;
    }

    // 3. Neither a callable field nor a `self`-method — report via getChildType
    //    (errors that `property` isn't a member, or that it isn't callable).
    getChildType(
      objectType,
      { type: "StringLiteral", value: property },
      objCtx,
      id,
    );
    return {
      type: "Call",
      callee: { type: "PropertyAccess", object, property },
      arguments: args,
      functionType: undefined,
    } satisfies VLCallNode;
  }

  if (ctx.DOT()) {
    const expr = ctx.expr(0);
    const object = toExpression(expr);
    const id = ctx.ID();
    const property = id.getText();
    getChildType(
      typeFromExpression(object, ctx),
      { type: "StringLiteral", value: property },
      expr,
      id,
    );
    return { type: "PropertyAccess", object, property };
  }

  if (ctx.LBRACK()) {
    const expr1 = ctx.expr(0);
    const array = toExpression(expr1);
    const expr2 = ctx.expr(1);
    const index = toExpression(expr2);
    getChildType(
      typeFromExpression(array, ctx),
      typeFromExpression(index, ctx),
      expr1,
      expr2,
    );
    return { type: "IndexAccess", array, index };
  }

  {
    const id = ctx.ID();
    if (id) {
      const name = id.getText();
      getType(name, ctx);
      return { type: "Name", name };
    }
  }

  {
    const block = ctx.block();
    if (block) {
      scopes.push({});
      try {
        const oldDesiredType = flow.desiredType;
        flow.desiredType = undefined;
        const blockScope = scopes[scopes.length - 1];
        const statements: [StatementContext, VLStatement][] = [];
        for (const s of block.blockStatement_list().map((b) => b.statement())) {
          if (!s) continue;
          const stmt = toStatement(s);
          statements.push([s, stmt]);
          // Post-guard narrowing (A5): a guard clause `if x == null { return }`
          // leaves `x` non-null for the rest of this block — narrow it in the
          // block scope so subsequent statements see the non-null type.
          for (const n of postGuardNarrowings(stmt)) {
            // Path post-guard narrowing is deferred (needs block-scoped overlay
            // cleanup); names narrow into the block scope, cleared on scope pop.
            if (n.place.type !== "Name") continue;
            for (let i = scopes.length - 1; i >= 0; i--) {
              if (n.name in scopes[i]) {
                blockScope[n.name] = n.apply(scopes[i][n.name]);
                break;
              }
            }
          }
        }
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
        return {
          type: "Block",
          label: ctx.ID()?.getText(),
          statements: statements.map((s) => s[1]),
          valueType,
        };
      } finally {
        scopes.pop();
      }
    }
  }

  {
    const obj = ctx.object();
    if (obj) return toObjectLiteral(obj);
  }

  {
    const arr = ctx.array();
    if (arr) return toArrayLiteral(arr);
  }

  {
    const num = ctx.NUMBER();
    if (num) {
      const text = num.getText();
      const value = parseFloat(text);
      const isInteger = Number.isInteger(value) && !text.includes(".");
      // A literal too large for any integer type (beyond i64) can't be
      // represented; report it rather than silently wrapping.
      if (isInteger && defaultIntegerType(text, value) === undefined) {
        errors.push({
          type: "Syntax",
          message:
            `Integer literal ${text} is too large to represent (exceeds the i64 range).`,
          ctx,
          code: 0,
        });
      }
      return {
        type: isInteger ? "IntegerLiteral" : "RealLiteral",
        value,
        text,
      };
    }
  }

  {
    const string = ctx.STRING();
    if (string) {
      return { type: "StringLiteral", value: string.getText().slice(1, -1) };
    }
  }

  if (ctx.TRUE()) return { type: "BooleanLiteral", value: true };

  if (ctx.FALSE()) return { type: "BooleanLiteral", value: false };

  if (ctx.NULL()) return { type: "NullLiteral" };

  {
    if (ctx.IS()) {
      const value = toExpression(ctx.expr(0));
      const checkType = toType(ctx.type_());
      const node: VLIsNode = { type: "Is", value, checkType };
      typeFromExpression(node, ctx); // assert + memoize the boolean result
      return node;
    }
  }

  {
    const op = ctx.CARET() ?? ctx.STAR() ?? ctx.DIV() ?? ctx.MOD() ??
      ctx.PLUS() ?? ctx.MINUS() ?? ctx.GREATER_THAN() ??
      ctx.GREATER_THAN_OR_EQUAL_TO() ?? ctx.LESS_THAN() ??
      ctx.LESS_THAN_OR_EQUAL_TO() ?? ctx.EQUAL_TO() ?? ctx.NOT_EQUAL_TO() ??
      ctx.AND() ?? ctx.OR();
    if (op) {
      const leftCtx = ctx.expr(0);
      const left = toExpression(leftCtx);
      const operator = op.getText();
      const rightCtx = ctx.expr(1);
      // Short-circuit narrowing (A5): the RHS of `&&` is built/type-checked with
      // the LHS's then-narrowings in scope (the RHS only runs when the LHS held),
      // and `||` with its else-narrowings — so `x != null && x.y` resolves `x.y`.
      const right = operator === "&&"
        ? withNarrowings(
          thenNarrowings(left),
          rightCtx,
          () => toExpression(rightCtx),
        )
        : operator === "||"
        ? withNarrowings(
          elseNarrowings(left),
          rightCtx,
          () => toExpression(rightCtx),
        )
        : toExpression(rightCtx);

      // Operator as a `self`-method: when the left operand is a user object and a
      // free `self`-function named for the operator is in scope, dispatch `a op b`
      // as `op(a, b)` — reusing the FunctionCall path, so it monomorphizes per
      // call (this is what makes `vec + vec` work, where a stored-closure operator
      // field would hit the WasmGC width wall). Numeric/builtin operators (left is
      // a named object like i32) keep their native BinaryOperation path.
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
          const leftArg: VLArgumentNode = {
            type: "Argument",
            name: undefined,
            value: left,
            context: leftCtx,
          };
          const rightArg: VLArgumentNode = {
            type: "Argument",
            name: undefined,
            value: right,
            context: rightCtx,
          };
          Object.defineProperty(leftArg, "context", { enumerable: false });
          Object.defineProperty(rightArg, "context", { enumerable: false });
          const allArgs = [leftArg, rightArg];
          return {
            type: "FunctionCall",
            function: operator,
            arguments: allArgs,
            functionType: instantiateFunctionType(
              fn,
              allArgs,
              ctx,
            ) as VLFunctionType,
          } satisfies VLFunctionCallNode;
        }
      }

      const expr: VLBinaryOperationNode = {
        type: "BinaryOperation",
        left,
        right,
        operator,
      };

      // This asserts binary operations
      typeFromExpression(expr, ctx);

      return expr;
    }
  }

  {
    const call = ctx.functionCall();
    if (call) {
      const id = call.ID();
      const name = id.getText();
      const funcCall: VLFunctionCallNode = {
        type: "FunctionCall",
        function: name,
        arguments: toArguments(call.args()?.arg_list() ?? []),
        functionType: undefined,
      };

      const t = getType(funcCall.function, id);
      // Calling an unresolved inference hole (an un-annotated parameter such as
      // `fn` in `function apply(fn, a, b) fn(a, b)`) infers that the value is a
      // function: it must implement a call accepting this many arguments. This
      // mirrors how `a.foo` infers `a` is an object with a `foo` property. The
      // parameter/return types are fresh holes, unified against the actual
      // argument types at each call site; codegen monomorphizes from there.
      if (t.type === "Infer" && t.subType.type === "Unknown") {
        const inferred: VLFunctionType = {
          type: "Function",
          paramaters: funcCall.arguments.map((arg, i) => ({
            type: "Parameter",
            name: arg.value.type === "Name" ? arg.value.name : `_${i}`,
            paramaterType: typeFromExpression(arg.value, arg.context ?? ctx),
          })),
          return: { type: "Infer", subType: { type: "Unknown" } },
        };
        updateType(t, inferred);
        funcCall.functionType = inferred;
      } else if (t.type !== "Unknown") {
        if (t.type !== "Function") {
          errors.push({
            type: "Type",
            left: {
              type: "Function",
              paramaters: [],
              return: { type: "Unknown" },
            },
            right: t,
            ctx,
            code: "function-call",
          });
        } else {
          // Instantiate a fresh copy of the (possibly generic) signature for
          // THIS call site, so its inference holes unify against these arguments
          // independently of other call sites — type-level monomorphization.
          funcCall.functionType = instantiateFunctionType(
            t,
            funcCall.arguments,
            ctx,
          ) as VLFunctionType;
        }
      }

      return funcCall;
    }
  }

  if (ctx.LPAREN()) return toExpression(ctx.expr(0));

  {
    const ifCtx = ctx.if_();
    if (ifCtx) {
      // Flow narrowing (A5), now list-based to support `&&`/`||` and else-chain.
      // `elseAcc` accumulates the negations of every condition seen so far, so a
      // later `else if`'s then-branch (and the final `else`) is narrowed by the
      // complement of all prior conditions plus its own positive narrowing —
      // `if x is A {} else if x is B { /* x: (U−A) & B */ } else { /* U−A−B */ }`.
      let elseAcc: Narrowing[] = [];
      // deno-lint-ignore no-explicit-any
      const buildConditional = (cond: VLExpression, condCtx: any, stmtCtx: any) => {
        const statement = withNarrowings(
          [...elseAcc, ...thenNarrowings(cond)],
          stmtCtx,
          () => toStatement(stmtCtx),
        );
        elseAcc = [...elseAcc, ...elseNarrowings(cond)];
        const conditional = {
          condition: cond,
          statement,
          conditionContext: condCtx,
          statementContext: stmtCtx,
        };
        Object.defineProperty(conditional, "conditionContext", {
          enumerable: false,
        });
        Object.defineProperty(conditional, "statementContext", {
          enumerable: false,
        });
        return conditional;
      };
      const conditionContext = ifCtx.expr();
      const condition = toExpression(conditionContext);
      const statementContext = ifCtx.statement();
      const elseCtx = ifCtx.else_();
      const conditionals = [
        buildConditional(condition, conditionContext, statementContext),
        ...ifCtx.elseIf_list().map((e) =>
          buildConditional(toExpression(e.expr()), e.expr(), e.statement())
        ),
      ];
      for (const conditional of conditionals) {
        ensureType(
          {
            type: "Nullable",
            subType: { type: "Alias", name: "boolean" },
          },
          typeFromExpression(
            conditional.condition,
            conditional.conditionContext,
          ),
          conditional.conditionContext,
        );
      }
      return {
        type: "If",
        conditionals,
        else: elseCtx
          ? withNarrowings(
            elseAcc,
            elseCtx.statement(),
            () => toStatement(elseCtx.statement()),
          )
          : undefined,
      };
    }
  }

  throw new Error(`toExpression not implemented ${ctx.getText()}`);
};

// TODO: Should we validateType or updateType? The former will certainly make
// codegen easier; the latter is more aligned with the goals of vital
const toAssignment = (ctx: ExprContext): VLBinaryOperationNode => {
  const op = ctx.PLUS() ?? ctx.MINUS() ?? ctx.STAR() ?? ctx.DIV() ??
    ctx.MOD() ?? ctx.CARET() ?? ctx.EXCLAMATION();
  const operator = op?.getText();

  if (ctx.DOT()) {
    const objectCtx = ctx.expr(0);
    const object = toExpression(objectCtx);
    const objectType = typeFromExpression(object, objectCtx);
    const propertyCtx = ctx.ID();
    const property = propertyCtx.getText();
    const childType = getChildType(
      objectType,
      { type: "StringLiteral", value: property },
      objectCtx,
      propertyCtx,
    );
    const rightCtx = ctx.expr(1);
    const rawRight = toExpression(rightCtx);
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
    return {
      type: "BinaryOperation",
      left: { type: "PropertyAccess", object, property },
      right,
      operator: "=",
    };
  }

  if (ctx.LBRACK()) {
    const arrayCtx = ctx.expr(0);
    const array = toExpression(arrayCtx);
    const arrayType = typeFromExpression(array, arrayCtx);
    const indexCtx = ctx.expr(1);
    const index = toExpression(indexCtx);
    const childType = getChildType(
      arrayType,
      typeFromExpression(index, indexCtx),
      arrayCtx,
      indexCtx,
    );
    const rightCtx = ctx.expr(2);
    const rawRight = toExpression(rightCtx);
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
      // Why?
      if (childType.type === "Union" && childType.subTypes.length === 0) {
        updateType(childType, rightType);
      } else ensureType(childType, rightType, rightCtx);
      if (childType.type === "Infer") {
        updateType(childType, makeExact(childType));
      }
    }
    return {
      type: "BinaryOperation",
      left: { type: "IndexAccess", array, index },
      right,
      operator: "=",
    };
  }

  const id = ctx.ID();
  const name = id.getText();
  const left: VLExpression = { type: "Name", name };
  const leftType = typeFromExpression(left, id);
  const rightExpr = ctx.expr(0);
  const rawRight = toExpression(rightExpr);
  const right: VLExpression = operator
    ? {
      type: "BinaryOperation",
      left,
      right: rawRight,
      operator,
    }
    : rawRight;
  const rightType = typeFromExpression(right, rightExpr);
  ensureType(leftType, rightType, rightExpr);
  if (leftType.type === "Infer") updateType(leftType, makeExact(leftType)); // Should maybe typecheck after exacting?
  return {
    type: "BinaryOperation",
    left,
    right,
    operator: "=",
  };
};

const toTypeStatement = (ctx: TypeStatementContext) => {
  const name = ctx.ID().getText();
  const type = ctx.type_();
  if (name in scopes[scopes.length - 1]) {
    errors.push({ type: "Redeclaration", name: name, ctx, code: 11 });
  } else {
    scopes[scopes.length - 1][name] = {
      type: "Type",
      subType: type ? toType(ctx.type_()) : { type: "Alias", name },
    };
  }
  return undefined;
};

const toStatement = (ctx: StatementContext): VLStatement => {
  {
    const varDecl = ctx.varDecl();
    if (varDecl) return toVariableDeclaration(varDecl);
  }

  {
    const expr = ctx.expr();
    if (expr) return toExpression(expr);
  }

  {
    const rtrn = ctx.returnStatement();
    if (rtrn) {
      const expr = rtrn.expr();
      const value = expr ? toExpression(expr) : undefined;
      const type = value ? typeFromExpression(value, ctx) : undefined;
      if (type) {
        if (flow.desiredType) ensureType(flow.desiredType, type, ctx);
        returnTypes.push(type);
      }
      return { type: "Return", value: expr ? toExpression(expr) : undefined };
    }
  }

  {
    const type = ctx.typeStatement();
    if (type) {
      toTypeStatement(type);
      // TODO: Empty statement?
      return {
        type: "Block",
        label: `__type_${type.ID().getText()}__`,
        statements: [],
      };
    }
  }

  {
    const whileStatement = ctx.whileStatement();
    if (whileStatement) {
      const conditionCtx = whileStatement.expr();
      const condition = toExpression(conditionCtx);
      ensureType(
        { type: "Nullable", subType: { type: "Alias", name: "boolean" } },
        typeFromExpression(condition, conditionCtx),
        conditionCtx,
      );
      return {
        type: "While",
        label: whileStatement.label()?.getText(),
        condition,
        statement: toStatement(whileStatement.statement()),
      };
    }
  }

  {
    const forStatement = ctx.forStatement();
    if (forStatement) {
      const variable = forStatement.ID().getText();

      // Collection iteration: `for x in arr` (no `to`) binds `x` to each element.
      const toCtx0 = forStatement.expr(1);
      if (!toCtx0) {
        const iterableCtx = forStatement.expr(0);
        const iterable = toExpression(iterableCtx);
        const iterableType = typeFromExpression(iterable, iterableCtx);
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
            ctx: iterableCtx,
            code: "for-in-not-array",
          });
        }
        const statementCtx = forStatement.statement();
        scopes.push({ [variable]: softenImplicitType(element ?? { type: "Never" }) });
        let statement: VLStatement;
        try {
          statement = toStatement(statementCtx);
          scopes.pop();
        } catch (err) {
          scopes.pop();
          throw err;
        }
        return {
          type: "ForIn",
          label: forStatement.label()?.ID().getText(),
          variable,
          iterable,
          statement,
        };
      }

      const fromCtx = forStatement.expr(0);
      const from = toExpression(fromCtx);
      const fromType = typeFromExpression(from, fromCtx);
      ensureType({ type: "Alias", name: "i32" }, fromType, fromCtx);

      const toCtx = forStatement.expr(1);
      const to = toExpression(toCtx);
      const toType = typeFromExpression(to, toCtx);
      ensureType(
        { type: "Alias", name: "i32" },
        toType,
        toCtx,
      );

      const stepCtx = forStatement.expr(2) as ExprContext | undefined;
      let step: VLExpression | undefined = undefined;

      const statementCtx = forStatement.statement();
      let statement: VLStatement;

      scopes.push({ [variable]: softenImplicitType(fromType) });
      try {
        if (stepCtx) {
          step = toExpression(stepCtx);
          ensureType(
            { type: "Alias", name: "i32" },
            typeFromExpression(step, stepCtx ?? forStatement),
            stepCtx ?? forStatement,
          );
        }

        statement = toStatement(statementCtx);

        scopes.pop();
      } catch (err) {
        scopes.pop();
        throw err;
      }

      // Warn on a provably-empty literal range (a likely bug): with constant
      // bounds and step, the direction of `step` never carries `from` to `to`.
      // (Non-literal bounds can't be judged statically.)
      if (from.type === "IntegerLiteral" && to.type === "IntegerLiteral") {
        const stepVal = !step
          ? 1
          : step.type === "IntegerLiteral"
          ? step.value
          : null;
        if (
          stepVal !== null && stepVal !== 0 &&
          (stepVal > 0 ? from.value > to.value : from.value < to.value)
        ) {
          errors.push({
            type: "Syntax",
            severity: "warning",
            message: `This \`for\` range is empty and never iterates: ${from.value} to ${to.value}${
              stepVal !== 1 ? ` step ${stepVal}` : ""
            }`,
            ctx: forStatement,
            code: 0,
          });
        }
      }

      return {
        type: "For",
        label: forStatement.label()?.ID().getText(),
        variable,
        from,
        to,
        step,
        statement,
      };
    }
  }

  {
    const breakStatement = ctx.breakStatement();
    if (breakStatement) {
      return { type: "Break", label: breakStatement.ID()?.getText() };
    }
  }

  {
    const continueStatement = ctx.continueStatement();
    if (continueStatement) {
      return { type: "Continue", label: continueStatement.ID()?.getText() };
    }
  }

  throw new Error(
    `toStatement not implemented ${ctx.getText()}`,
  );
};

export const toAST = (
  cst: ProgramContext,
  initialScope: Scope = {},
): [VLProgramNode, ParseErrors[]] => {
  scopes.splice(0);
  errors.splice(0);
  guards.clear();
  for (const k in narrowedPaths) delete narrowedPaths[k];

  // console.log(cst.toStringTree(VL_Parser.ruleNames, cst.parser!));

  const program: VLProgramNode = {
    type: "Program",
    statements: [],
    scope: initialScope,
  };
  scopes.push(program.scope);

  for (const blkStmt of cst.blockStatement_list()) {
    const stmt = blkStmt.statement();
    if (stmt) {
      try {
        const ast = toStatement(stmt);
        program.statements.push(ast);
      } catch (err) {
        console.error(err);
      }
    }
  }

  return [program, errors];
};
