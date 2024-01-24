import { ParserRuleContext, TerminalNode } from "antlr4";
import VL_Parser, {
  AssignStatementContext,
  ExprContext,
  FunctionDeclContext,
  ObjectContext,
  ParamContext,
  ProgramContext,
  StatementContext,
  TypeContext,
  VarDeclContext,
} from "./antlr/VL_Parser.ts";

type VLParameterNode = {
  type: "Parameter";
  name: string;
  paramaterType: VLType;
};

type VLFunctionDeclarationNode = {
  type: "FunctionDeclaration";
  name: string | undefined;
  parameters: VLParameterNode[];
  body: VLStatement[];
  returnType: VLType;
  scope: Scope;
};

type VLNameNode = {
  type: "Name";
  name: string;
};

type VLBlockNode = {
  type: "Block";
  label: string | undefined;
  statements: VLStatement[];
};

type VLPropertyAccessNode = {
  type: "PropertyAccess";
  left: VLExpression;
  right: VLNameNode;
};

type VLIndexAccessNode = {
  type: "IndexAccess";
  left: VLExpression;
  right: VLExpression;
};

type VLArgumentNode = {
  type: "Argument";
  name: string | undefined;
  value: VLExpression;
};

type VLFunctionCallNode = {
  type: "FunctionCall";
  function: string;
  arguments: VLArgumentNode[];
};

type VLStringLiteralNode = {
  type: "StringLiteral";
  value: string;
};

type VLNumberLiteralNode = {
  type: "NumberLiteral";
  value: number;
};

type VLBooleanLiteralNode = {
  type: "BooleanLiteral";
  value: boolean;
};

type VLNullLiteral = { type: "NullLiteral" };

type VLPropertyLiteral = {
  type: "PropertyLiteral";
  name: VLNameNode | VLStringLiteralNode | VLExpression;
  value: VLExpression;
};

type VLObjectLiteralNode = {
  type: "ObjectLiteral";
  properties: VLPropertyLiteral[];
};

type VLBinaryOperationNode = {
  type: "BinaryOperation";
  left: VLExpression;
  right: VLExpression;
  operator: string;
};

type VLVariableDeclarationNode = {
  type: "VariableDeclaration";
  name: string;
  variableType: VLType;
  value: VLExpression | undefined;
};

type VLValue =
  | VLStringLiteralNode
  | VLNumberLiteralNode
  | VLBooleanLiteralNode
  | VLNullLiteral
  | VLObjectLiteralNode
  | VLFunctionDeclarationNode;

type VLExpression =
  | VLNameNode
  | VLBlockNode
  | VLValue
  | VLPropertyAccessNode
  | VLIndexAccessNode
  | VLBinaryOperationNode
  | VLFunctionCallNode;

type VLReturnNode = {
  type: "Return";
  value: VLExpression | undefined;
};

type VLStatement =
  | VLReturnNode
  | VLExpression
  | VLVariableDeclarationNode;

type VLAliasType = { type: "Alias"; name: string };
type VLFunctionType = {
  type: "Function";
  paramaters: VLParameterNode[];
  return: VLType;
  exceptions: VLType[];
};
type VLObjectType = {
  type: "Object";
  properties: { name: string; type: VLType; readonly: boolean }[];
};
type VLUnknownType = { type: "Unknown" };
type VLNullableType = { type: "Nullable"; subType: VLType };
type VLUnionType = { type: "Union"; left: VLType; right: VLType };
export type VLType =
  | VLAliasType
  | VLFunctionType
  | VLObjectType
  | VLStringLiteralNode
  | VLNumberLiteralNode
  | VLUnknownType
  | VLNullableType
  | VLUnionType;

type Scope = Record<string, VLType>;

export type VLProgramNode = {
  type: "Program";
  statements: VLStatement[];
  scope: Scope;
};

const scopes: Scope[] = [];

type ParseErrors =
  | {
    type: "Redeclaration";
    name: string;
    ctx: ParserRuleContext | TerminalNode;
  }
  | { type: "Undeclared"; name: string; ctx: ParserRuleContext | TerminalNode }
  | {
    type: "Type";
    left: VLType;
    right: VLType;
    ctx: ParserRuleContext | TerminalNode;
  }
  | {
    type: "UnmatchedParameter";
    ctx: ParserRuleContext;
  };

const errors: ParseErrors[] = [];

const typeFromExpression = (
  expr: VLExpression,
): VLType => {
  switch (expr.type) {
    case "BinaryOperation":
      return typeFromExpression(expr.right);
    case "Block":
      console.warn("Not inferring type from block yet...");
      return { type: "Unknown" };
    case "FunctionDeclaration":
      return {
        type: "Function",
        paramaters: expr.parameters,
        return: expr.returnType,
        exceptions: [],
      };
    case "IndexAccess":
      console.warn("Not inferring type from index yet...");
      return { type: "Unknown" };
    case "Name":
      for (let i = scopes.length - 1; i >= 0; i--) {
        if (expr.name in scopes[i]) return scopes[i][expr.name];
      }
      console.warn("Undefined name?", expr.name);
      return { type: "Unknown" };
    case "NumberLiteral":
      return { type: "Alias", name: "number" };
    case "StringLiteral":
      return { type: "Alias", name: "string" };
    case "ObjectLiteral":
      return {
        type: "Object",
        properties: expr.properties.map((
          p,
        ): [VLExpression, VLPropertyLiteral] => [p.name, p]).filter(
          (p): p is [VLNameNode | VLStringLiteralNode, VLPropertyLiteral] => {
            if (p[0].type === "Name" || p[0].type === "StringLiteral") {
              return true;
            }
            console.warn("Non-string properties are not typechecked!");
            return false;
          },
        ).map((p) => ({
          name: p[0].type === "Name" ? p[0].name : p[0].value,
          type: typeFromExpression(p[1].value),
          readonly: false,
        })),
      };
    case "PropertyAccess":
      console.warn("Not inferring type from property yet...");
      return { type: "Unknown" };
    case "BooleanLiteral":
      return { type: "Alias", name: "boolean" };
    case "NullLiteral":
      // We can assume this is meant as a nullable value, though that's slightly different than a complex inference
      return { type: "Alias", name: "null" };
    case "FunctionCall":
      for (let i = scopes.length - 1; i >= 0; i--) {
        if (expr.function in scopes[i]) return scopes[i][expr.function];
      }
      console.warn("Undefined function?", expr.function);
      return { type: "Unknown" };
    default: {
      const exhaustive: never = expr;
      throw new Error(
        `Unhandled AST error for directly inference: ${exhaustive}`,
      );
    }
  }
};

const toVariableDeclaration = (ctx: VarDeclContext) => {
  const expr = ctx.expr();
  const type = ctx.type_();
  const node: VLVariableDeclarationNode = {
    type: "VariableDeclaration",
    name: ctx.ID().getText(),
    variableType: type ? toType(type) : { type: "Unknown" },
    value: expr ? toExpression(expr) : undefined,
  };
  if (node.name in scopes[scopes.length - 1]) {
    errors.push({ type: "Redeclaration", name: node.name, ctx });
  }
  if (node.variableType.type === "Unknown" && node.value) {
    node.variableType = typeFromExpression(node.value);
    if (
      node.variableType.type === "Alias" && node.variableType.name === "null"
    ) {
      node.variableType = { type: "Nullable", subType: { type: "Unknown" } };
    }
  }
  scopes[scopes.length - 1][node.name] = node.variableType;
  return node;
};

const toParameter = (ctx: ParamContext): VLParameterNode => {
  const type = ctx.type_();
  return {
    type: "Parameter",
    name: ctx.ID().getText(),
    paramaterType: type ? toType(type) : { type: "Unknown" },
  };
};

const toType = (ctx: TypeContext): VLType => {
  {
    const id = ctx.ID();
    if (id) return { type: "Alias", name: id.getText() };
  }

  {
    const pipe = ctx.PIPE();
    if (pipe) {
      const union: VLUnionType = {
        type: "Union",
        left: toType(ctx.type_(0)),
        right: toType(ctx.type_(1)),
      };
      return union;
    }
  }

  {
    const null_ = ctx.NULL();
    if (null_) return { type: "Alias", name: "null" };
  }

  throw new Error(`toType not implemented ${ctx.getText()}`);
};

const toFunctionDeclaration = (ctx: FunctionDeclContext) => {
  // TODO: scope...
  const parameters = ctx.params()?.param_list().map(toParameter) ?? [];
  const scope = Object.fromEntries(
    parameters.map((p) => [p.name, p.paramaterType]),
  );
  scopes.push(scope);
  try {
    const stmt = ctx.statement();
    const block = stmt.expr()?.block();
    const statements = block
      ? block.blockStatement_list().map((b) => b.statement())
        .filter(Boolean).map(toStatement)
      : [toStatement(stmt)];
    const returnType = ctx.type_();
    const node: VLFunctionDeclarationNode = {
      type: "FunctionDeclaration",
      name: ctx.ID()?.getText(),
      parameters,
      body: statements,
      returnType: returnType ? toType(returnType) : { type: "Unknown" },
      scope,
    };

    if (node.name) {
      if (node.name in scopes[scopes.length - 1]) {
        errors.push({ type: "Redeclaration", name: node.name, ctx: ctx.ID()! });
      }
      scopes[scopes.length - 1][node.name] = typeFromExpression(node);
    }

    return node;
  } finally {
    scopes.pop();
  }
};

const toObjectLiteral = (ctx: ObjectContext): VLObjectLiteralNode => {
  return {
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
          name: { type: "StringLiteral", value: string.getText() },
          value: toExpression(p.expr(0)),
        };
      }
      return {
        type: "PropertyLiteral",
        name: toExpression(p.expr(0)),
        value: toExpression(p.expr(1)),
      };
    }),
  };
};

const getType = (
  name: string,
  ctx: ParserRuleContext | TerminalNode,
): VLType => {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (name in scopes[i]) return scopes[i][name];
  }
  errors.push({ type: "Undeclared", name, ctx });
  return { type: "Unknown" };
};

const validateType = (
  left: VLType,
  right: VLType,
  ctx: ParserRuleContext,
): boolean => {
  const pushError = () => {
    errors.push({ type: "Type", left, right, ctx });
    return false;
  };

  switch (left.type) {
    // Unknown is inferrable
    case "Unknown": {
      Object.assign(left, structuredClone(right));
      return true;
    }
    case "Alias": {
      if (left.name === "number") {
        if (right.type === "Alias") {
          if (right.name !== "number") return pushError();
        } else if (right.type !== "NumberLiteral") return pushError();
      } else if (left.name === "string") {
        if (right.type === "Alias") {
          if (right.name !== "string") return pushError();
        } else if (right.type !== "StringLiteral") return pushError();
      } else if (left.name === "boolean") {
        if (right.type === "Alias") {
          if (right.name !== "boolean") return pushError();
        } else return pushError();
      } else if (left.name === "null") {
        if (right.type !== "Alias" || right.name !== "null") pushError();
      } else {
        console.warn(
          `Did not type check alias ${left.name} (need to implement indirect alias...)`,
        );
      }
      return true;
    }
    case "Function": {
      if (right.type !== "Function") return pushError();
      console.warn(`Did not type check function signature`);
      return true;
    }
    case "NumberLiteral": {
      if (right.type !== "NumberLiteral") return pushError();
      return true;
    }
    case "StringLiteral": {
      if (right.type !== "StringLiteral") return pushError();
      return true;
    }
    case "Object": {
      if (
        right.type !== "Object" ||
        left.properties.length !== right.properties.length
      ) return pushError();
      if (left.properties.length !== right.properties.length) {
        return pushError();
      }
      outer: for (const lprop of left.properties) {
        for (const rprop of right.properties) {
          if (lprop.name === rprop.name) {
            if (validateType(lprop.type, rprop.type, ctx)) continue outer;
            return false;
          }
        }
        return pushError();
      }
      return true;
    }
    case "Nullable": {
      while (left.type === "Nullable") left = left.subType;
      while (right.type === "Nullable") right = right.subType;
      if (right.type === "Alias" && right.name === "null") return true;
      return validateType(left, right, ctx);
    }
    case "Union": {
      const oldErrors = [...errors];
      errors.splice(0);
      const leftValid = validateType(left.left, right, ctx);
      if (leftValid) {
        console.log("leftValid");
        errors.push(...oldErrors);
        return true;
      }
      const rightValid = validateType(left.right, right, ctx);
      if (rightValid) {
        console.log("rightValid");
        errors.splice(0, Infinity, ...oldErrors);
        return true;
      }
      errors.splice(0, Infinity, ...oldErrors);
      pushError();
      console.log("neither valid", errors[errors.length - 1]);
      return false;
    }
    default: {
      const exhaustive: never = left;
      console.warn(`Did not type check ${exhaustive}`);
      return false;
    }
  }
};

const toExpression = (ctx: ExprContext): VLExpression => {
  {
    const funcDecl = ctx.functionDecl();
    if (funcDecl) return toFunctionDeclaration(funcDecl);
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
        const statements = block.blockStatement_list().map((b) => b.statement())
          .filter(Boolean).map(toStatement);
        return {
          type: "Block",
          label: ctx.ID()?.getText(),
          statements,
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
    const num = ctx.NUMBER();
    if (num) return { type: "NumberLiteral", value: parseFloat(num.getText()) };
  }

  {
    const string = ctx.STRING();
    if (string) {
      return { type: "StringLiteral", value: string.getText().slice(1, -1) };
    }
  }

  {
    const _true = ctx.TRUE();
    if (_true) return { type: "BooleanLiteral", value: true };
  }

  {
    const _false = ctx.FALSE();
    if (_false) return { type: "BooleanLiteral", value: false };
  }

  {
    const _null = ctx.NULL();
    if (_null) return { type: "NullLiteral" };
  }

  {
    const op = ctx.binaryOp();
    if (op) {
      return {
        type: "BinaryOperation",
        left: toExpression(ctx.expr(0)),
        right: toExpression(ctx.expr(1)),
        operator: op.getText(),
      };
    }
  }

  {
    const call = ctx.functionCall();
    if (call) {
      const id = call.ID();
      const args = call.args()?.expr_list() ?? [];
      const func: VLFunctionCallNode = {
        type: "FunctionCall",
        function: id.getText(),
        arguments: args.map((e) => ({
          type: "Argument",
          name: undefined,
          value: toExpression(e),
        })),
      };

      const t = getType(func.function, id);
      if (t.type !== "Unknown") {
        if (t.type !== "Function") {
          errors.push({
            type: "Type",
            left: {
              type: "Function",
              paramaters: [],
              return: { type: "Unknown" },
              exceptions: [],
            },
            right: t,
            ctx: id,
          });
        } else {
          const args2 = func.arguments.map((
            a,
            i,
          ): [VLArgumentNode, ExprContext] => [a, args[i]]);
          const params = [...t.paramaters];
          // First consume named parameters
          for (let i = 0; i < args2.length; i++) {
            const [arg, ctx] = args2[0];
            if (arg.name) {
              const paramIndex = params.findIndex((p) => p.name === arg.name);
              if (paramIndex === -1) {
                errors.push({ type: "UnmatchedParameter", ctx });
              } else if (
                validateType(
                  params[paramIndex].paramaterType,
                  typeFromExpression(arg.value),
                  ctx,
                )
              ) {
                params.splice(paramIndex, 1);
                args2.splice(0, 1);
                i--;
              }
            }
          }
          // Then consume positional ones
          while (args2.length) {
            const [arg, ctx] = args2[0];
            if (!params.length) {
              console.log("no more params?");
              errors.push({ type: "UnmatchedParameter", ctx });
              break;
            } else {
              validateType(
                params[0].paramaterType,
                typeFromExpression(arg.value),
                ctx,
              );
              params.splice(0, 1);
              args2.splice(0, 1);
            }
          }
          const unmatchedParams = params.filter((p) =>
            p.paramaterType.type !== "Nullable"
          );
          if (unmatchedParams.length) {
            console.log("no more args?");
            // TODO: indicate how many?
            errors.push({ type: "UnmatchedParameter", ctx });
          }
        }
      }

      return func;
    }
  }

  throw new Error(`toExpression not implemented ${ctx.getText()}`);
};

const toAssignment = (ctx: AssignStatementContext): VLBinaryOperationNode => {
  if (ctx.DOT()) {
    return {
      type: "BinaryOperation",
      left: {
        type: "PropertyAccess",
        left: toExpression(ctx.expr(0)),
        right: { type: "Name", name: ctx.ID().getText() },
      },
      right: toExpression(ctx.expr(1)),
      operator: "=",
    };
  }

  if (ctx.LBRACK()) {
    return {
      type: "BinaryOperation",
      left: {
        type: "IndexAccess",
        left: toExpression(ctx.expr(0)),
        right: toExpression(ctx.expr(1)),
      },
      right: toExpression(ctx.expr(2)),
      operator: "=",
    };
  }

  const id = ctx.ID();
  const name = id.getText();
  const knownType = getType(name, id);
  const rightExpr = ctx.expr(0);
  const right = toExpression(ctx.expr(0));
  const rightType = typeFromExpression(right);
  validateType(knownType, rightType, rightExpr);
  return {
    type: "BinaryOperation",
    left: { type: "Name", name },
    right,
    operator: "=",
  };
};

const toBinaryOperation = (ctx: AssignStatementContext) => {
  return toAssignment(ctx);
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
      return { type: "Return", value: expr ? toExpression(expr) : undefined };
    }
  }

  {
    const assign = ctx.assignStatement();
    if (assign) return toBinaryOperation(assign);
  }

  const opts = {
    assignStatement: ctx.assignStatement() ? true : false,
    ifStatement: ctx.ifStatement() ? true : false,
    whileStatement: ctx.whileStatement() ? true : false,
    forStatement: ctx.forStatement() ? true : false,
    breakStatement: ctx.breakStatement() ? true : false,
    continueStatement: ctx.continueStatement() ? true : false,
    returnStatement: ctx.returnStatement() ? true : false,
    typeStatement: ctx.typeStatement() ? true : false,
  };

  throw new Error(
    `toStatement not implemented ${ctx.getText()} ${
      Object.entries(opts).filter(([, v]) => v).map(([n]) => n)
    }`,
  );
};

export const toAST = (cst: ProgramContext): [VLProgramNode, ParseErrors[]] => {
  scopes.splice(0);
  errors.splice(0);

  const program: VLProgramNode = {
    type: "Program",
    statements: [],
    scope: {},
  };

  scopes.push(program.scope);

  console.log(cst.toStringTree(VL_Parser.ruleNames, cst.parser!));

  for (const blkStmt of cst.blockStatement_list()) {
    const stmt = blkStmt.statement();
    if (stmt) program.statements.push(toStatement(stmt));
  }

  return [program, errors];
};
