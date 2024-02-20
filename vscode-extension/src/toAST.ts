// import { inspect } from "node:util";
import { ParserRuleContext, TerminalNode } from "antlr4";
import {
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

type Context = ParserRuleContext | TerminalNode;

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
  object: VLExpression;
  property: string;
};

type VLIndexAccessNode = {
  type: "IndexAccess";
  array: VLExpression;
  index: VLExpression;
};

type VLArgumentNode = {
  type: "Argument";
  name: string | undefined;
  value: VLExpression;
  context: Context;
};

type VLFunctionCallNode = {
  type: "FunctionCall";
  function: string;
  arguments: VLArgumentNode[];
  functionType: VLFunctionType | undefined;
};

type VLStringLiteralNode = {
  type: "StringLiteral";
  value: string;
};

type VLIntegerLiteralNode = {
  type: "IntegerLiteral";
  value: number;
  text: string;
};

type VLRealLiteralNode = {
  type: "RealLiteral";
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

type VLArrayLiteralNode = {
  type: "ArrayLiteral";
  values: VLExpression[];
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
  mutable: boolean;
};

type VLIfNode = {
  type: "If";
  conditionals: { condition: VLExpression; statement: VLStatement }[];
  else: VLStatement | undefined;
};

type VLValue =
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
  | VLBinaryOperationNode
  | VLFunctionCallNode
  | VLIfNode;

type VLReturnNode = {
  type: "Return";
  value: VLExpression | undefined;
};

type VLWhileNode = {
  type: "While";
  condition: VLExpression;
  statement: VLStatement;
  label: string | undefined;
};

type VLForNode = {
  type: "For";
  variable: string;
  from: VLExpression;
  to: VLExpression;
  step: VLExpression | undefined;
  statement: VLStatement;
  label: string | undefined;
};

type VLBreakNode = {
  type: "Break";
  label: string | undefined;
};

type VLContinueNode = {
  type: "Continue";
  label: string | undefined;
};

export type VLStatement =
  | VLReturnNode
  | VLExpression
  | VLVariableDeclarationNode
  | VLWhileNode
  | VLForNode
  | VLBreakNode
  | VLContinueNode;

type VLAliasType = { type: "Alias"; name: string };
// TODO: exceptions
type VLFunctionType = {
  type: "Function";
  paramaters: VLParameterNode[];
  return: VLType;
};
export type VLObjectType = {
  type: "Object";
  properties: { name: VLType; type: VLType }[];
  name?: string;
};
type VLUnknownType = { type: "Unknown" };
type VLNullableType = { type: "Nullable"; subType: VLType };
type VLUnionType = { type: "Union"; subTypes: VLType[] };
type VLNeverType = { type: "Never" };
type VLTypeType = { type: "Type"; subType: VLType };
type VLInferType = { type: "Infer"; subType: VLType };
type VLCustomType = {
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

const scopes: Scope[] = [];
export const withScope = <T>(scope: Scope, fn: () => T) => {
  scopes.push(scope);
  try {
    return fn();
  } finally {
    scopes.pop();
  }
};

type ParseErrors =
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
  | { type: "Syntax"; message: string; ctx: Context; code: number }
  | { type: "Property"; property: VLType; ctx: Context; code: number };

const errors: ParseErrors[] = [];

/** Implicit return types */
const returnTypes: VLType[] = [];
/**
 * Expected implicit return type (used for value returning expressions, such as
 * the last statement of a block or binary operations)
 */
let desiredType: VLType | undefined = undefined;
/** Expected return type (used for return statements in a function) */
let returnType: VLType | undefined;

const _typeFromExpression = (
  expr: VLExpression,
  ctx: Context,
): VLType => {
  switch (expr.type) {
    case "BinaryOperation": {
      const leftType = typeFromExpression(expr.left, ctx);
      const rightType = typeFromExpression(expr.right, ctx);
      const op = expr.operator;
      const missingOpFunc = (variant: string): VLType => {
        errors.push({
          type: "Type",
          left: {
            type: "Object",
            properties: [{
              name: { type: "StringLiteral", value: op },
              type: {
                type: "Function",
                paramaters: [{
                  type: "Parameter",
                  name: "right",
                  paramaterType: rightType,
                }],
                return: desiredType ?? { type: "Unknown" },
              },
            }],
          },
          right: leftType,
          ctx,
          code: `binary-op-${variant}`,
        });
        return { type: "Never" };
      };
      if (leftType.type !== "Object") return missingOpFunc("left-not-object");
      const opFunc = leftType.properties.find((p) =>
        validateType(p.name, { type: "StringLiteral", value: op })
      )?.type;
      if (!opFunc || opFunc.type !== "Function") {
        return missingOpFunc("no-operator-function");
      }
      const param = opFunc.paramaters[0]?.paramaterType;
      if (!param) return missingOpFunc("bad-operator-function");
      if (!ensureType(param, rightType, ctx)) return { type: "Never" };
      return opFunc.return;
    }
    case "Block":
      // for (let i = 0; i < expr.statements.length; i++) {
      //   const t = typeFromStatement(expr.statements[expr.statements.length - 1], ctx);
      //   if (returnType);
      // }
      return typeFromStatement(
        expr.statements[expr.statements.length - 1],
        ctx,
      );
    case "FunctionDeclaration":
      return {
        type: "Function",
        paramaters: expr.parameters,
        return: expr.returnType,
      };
    case "IndexAccess": {
      const objType = typeFromExpression(expr.array, ctx);
      if (objType.type !== "Object") return { type: "Never" };
      const propType = typeFromExpression(expr.index, ctx);
      const property = objType.properties.find((p) =>
        validateType(p.name, propType)
      );
      if (!property) return { type: "Never" };
      return property.type;
    }
    case "Name":
      for (let i = scopes.length - 1; i >= 0; i--) {
        if (expr.name in scopes[i]) return scopes[i][expr.name];
      }
      return { type: "Never" };
    case "IntegerLiteral":
      return { type: "IntegerLiteral", value: expr.value, text: expr.text };
    case "RealLiteral":
      return { type: "RealLiteral", value: expr.value };
    case "StringLiteral":
      return { type: "StringLiteral", value: expr.value };
    case "ObjectLiteral":
      return {
        type: "Object",
        properties: expr.properties
          .map((p) => ({
            name: p.name.type === "Name"
              ? { type: "StringLiteral", value: p.name.name }
              : typeFromExpression(p.name, ctx),
            type: typeFromExpression(p.value, ctx),
            readonly: false,
          })),
      };
    case "ArrayLiteral":
      return {
        type: "Object",
        properties: [{
          name: { type: "Alias", name: "i32" },
          type: {
            type: "Union",
            subTypes: expr.values.map((v) => typeFromExpression(v, ctx)),
          },
        }],
      };
    case "PropertyAccess": {
      let objType = typeFromExpression(expr.object, ctx);
      if (objType.type === "Infer") objType = objType.subType;
      if (objType.type !== "Object") return { type: "Never" };
      const propType: VLStringLiteralNode = {
        type: "StringLiteral",
        value: expr.property,
      };
      const property = objType.properties.find((p) =>
        validateType(p.name, propType)
      );
      if (!property) return { type: "Never" };
      return property.type;
    }
    case "BooleanLiteral":
      return { type: "BooleanLiteral", value: expr.value };
    case "NullLiteral":
      // We can assume this is meant as a nullable value, though that's slightly different than a complex inference
      return { type: "Alias", name: "null" };
    case "FunctionCall":
      for (let i = scopes.length - 1; i >= 0; i--) {
        if (expr.function in scopes[i]) {
          const funcType = scopes[i][expr.function];
          if (funcType.type === "Function") return funcType.return;
          return { type: "Never" };
        }
      }
      return { type: "Never" };
    case "If": {
      const stmts = expr.conditionals.map((c) => c.statement);
      if (expr.else) {
        stmts.push(expr.else);
        return {
          type: "Union",
          subTypes: stmts.map((s) => typeFromStatement(s, ctx)),
        };
      }
      return {
        type: "Nullable",
        subType: {
          type: "Union",
          subTypes: stmts.map((s) => typeFromStatement(s, ctx)),
        },
      };
    }
    default: {
      const exhaustive: never = expr;
      throw new Error(
        `Unhandled AST error for directly inference: ${exhaustive}`,
      );
    }
  }
};

const typeFromExpressionMemory = new WeakMap<VLExpression, VLType>();
const typeFromExpression = (
  expr: VLExpression,
  ctx: Context,
): VLType => {
  const memoized = typeFromExpressionMemory.get(expr);
  if (memoized) return memoized;
  let type = _typeFromExpression(expr, ctx);
  while (type.type === "Alias") {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if ((type as VLAliasType).name in scopes[i]) {
        type = scopes[i][(type as VLAliasType).name];
        continue;
      }
    }
    break;
  }
  typeFromExpressionMemory.set(expr, type);
  return type;
};
export const vlType = (expr: VLExpression) => {
  const memoized = typeFromExpressionMemory.get(expr);
  if (memoized) return memoized;
  throw new Error("Expected expression's type to have been memoized");
};

const _softenImplicitType = (type: VLType): VLType => {
  if (type.type === "IntegerLiteral") return { type: "Alias", name: "i32" };
  if (type.type === "RealLiteral") return { type: "Alias", name: "f64" };
  if (type.type === "StringLiteral") return { type: "Alias", name: "string" };
  if (type.type === "BooleanLiteral") return { type: "Alias", name: "boolean" };
  if (type.type === "Nullable") {
    const subType = softenImplicitType(type.subType);
    if (subType === type.subType) return type;
    return { type: "Nullable", subType: softenImplicitType(type.subType) };
  }
  if (
    type.type === "Alias" || type.type === "Function" ||
    type.type === "Never" || type.type === "Type" || type.type === "Unknown" ||
    type.type === "Custom"
  ) return type;
  if (type.type === "Object") {
    let softenedProperty = false;
    const properties = type.properties.map((p) => {
      const next = softenImplicitType(p.type);
      if (p.type !== next) softenedProperty = true;
      return next;
    });
    if (softenedProperty) {
      return {
        type: "Object",
        properties: type.properties.map((p, i) => ({
          ...p,
          type: properties[i],
        })),
      };
    }
    return type;
  }
  if (type.type === "Union") {
    const hasSubUnions = type.subTypes.some((s) => s.type === "Union");
    if (hasSubUnions) {
      return softenImplicitType({
        type: "Union",
        subTypes: type.subTypes.flatMap((s) =>
          s.type === "Union" ? s.subTypes : s
        ),
      });
    }
    if (type.subTypes.length === 1) return softenImplicitType(type.subTypes[0]);
    let softenedSubType = false;
    const softenedSubTypes = type.subTypes.map((t) => {
      const next = softenImplicitType(t);
      if (next !== t) softenedSubType = true;
      return next;
    });
    const subTypes: VLType[] = [softenedSubTypes[0]];
    outer: for (let i = 1; i < softenedSubTypes.length; i++) {
      for (let n = 0; n < subTypes.length; n++) {
        if (validateType(subTypes[n], softenedSubTypes[i])) continue outer;
        if (validateType(softenedSubTypes[i], subTypes[n])) {
          subTypes.splice(n, 1, softenedSubTypes[i]);
          continue outer;
        }
      }
      subTypes.push(softenedSubTypes[i]);
    }
    if (subTypes.length !== type.subTypes.length || softenedSubType) {
      // if (subTypes.length === 0) Unknown? Never? Never breaks array...
      if (subTypes.length === 1) return subTypes[0];
      return { type: "Union", subTypes: subTypes };
    }
    return type;
  }
  if (type.type === "Infer") {
    const subType = softenImplicitType(type.subType);
    if (subType === type.subType) return type;
    return { type: "Infer", subType };
  }
  const exhaustive: never = type;
  throw new Error(`Unhandled soften type: ${exhaustive}`);
};

export const softenImplicitType = (type: VLType): VLType =>
  getConcreteType(_softenImplicitType(type), undefined);

const typeFromStatement = (
  stmt: VLStatement,
  ctx: Context,
): VLType => {
  switch (stmt.type) {
    case "Return":
      return stmt.value
        ? typeFromExpression(stmt.value, ctx)
        : { type: "Alias", name: "null" };
    case "VariableDeclaration":
      return stmt.variableType;
    case "While":
      return {
        type: "Nullable",
        subType: typeFromStatement(stmt.statement, ctx),
      };
    case "For":
      return {
        type: "Nullable",
        subType: typeFromStatement(stmt.statement, ctx),
      };
    case "Break":
    case "Continue":
      return { type: "Never" };
    default:
      return typeFromExpression(stmt, ctx);
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

const _flattenType = (type: VLType): VLType[] => {
  if (type.type === "Union") return type.subTypes.flatMap(_flattenType);
  if (type.type === "Nullable") {
    let flattened = _flattenType(type.subType);
    if (!Array.isArray(flattened)) flattened = [flattened];
    return [{ type: "Alias", name: "null" }, ...flattened];
  }
  return [type];
};

const flattenType = (type: VLType): VLType => {
  const flattened = _flattenType(type);
  if (flattened.length === 1 && flattened[0] === type) return type;

  const deduped: VLType[] = [flattened[0]];
  outer: for (let i = 1; i < flattened.length; i++) {
    for (let n = 0; n < deduped.length; n++) {
      if (validateType(deduped[n], flattened[i])) continue outer;
      if (validateType(flattened[i], deduped[n])) {
        deduped.splice(n, 1, flattened[i]);
        continue outer;
      }
    }
    deduped.push(flattened[i]);
  }

  if (deduped.length === 1) return deduped[0];

  let nullable = false;
  for (let i = 0; i < deduped.length; i++) {
    const t = deduped[i];
    if (t.type === "Alias" && t.name === "null") {
      nullable = true;
      deduped.splice(i, 1);
      break;
    }
  }

  if (nullable) {
    return {
      type: "Nullable",
      subType: deduped.length === 1
        ? deduped[0]
        : { type: "Union", subTypes: deduped },
    };
  }

  return { type: "Union", subTypes: deduped };
};

export const getConcreteType = (
  type: VLType,
  ctx: Context | undefined,
): VLType => {
  if (type.type !== "Alias") return type; // TODO: Should handle recursiveness (objects, params, etc)
  if (type.name === "null" || type.name === "string") return type; // TODO: remove string and make it an object type

  for (let i = scopes.length - 1; i >= 0; i--) {
    if (type.name in scopes[i]) {
      type = scopes[i][type.name];
      if (type.type === "Type") return getConcreteType(type.subType, ctx);
      return getConcreteType(type, ctx);
    }
  }

  if (ctx) errors.push({ type: "Undeclared", name: type.name, ctx, code: 1 });
  else {
    throw new Error(
      `Expected ctx to be defined or the alias ${type.name} to be resolveable`,
    );
  }

  return { type: "Never" };
};

const toType = (ctx: TypeContext): VLType => {
  {
    const id = ctx.ID();
    if (id) {
      const name = id.getText();
      // return getConcreteType()
      // TODO: kill this; all types should ultimately resolve to something concrete
      if (name === "string") return { type: "Alias", name };

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
const makeExact = (type: VLType): VLType => {
  if (type.type === "Infer") return makeExact(type.subType);
  if (type.type === "Object") {
    let exacted = false;
    const props = type.properties.map((p) => {
      const n = makeExact(p.type);
      if (n !== p.type) exacted = true;
      return n;
    });
    if (exacted) {
      return {
        type: "Object",
        properties: type.properties.map((p, i) => ({ ...p, type: props[i] })),
      };
    }
  }
  return type;
};

const toFunctionDeclaration = (ctx: FunctionDeclContext) => {
  const parameters = ctx.params()?.param_list().map(toParameter) ?? [];
  const scope = Object.fromEntries(
    parameters.map((p) => [p.name, p.paramaterType]),
  );
  scopes.push(scope);
  let name: string;
  let node: VLFunctionDeclarationNode;
  try {
    const returnTypeExpr = ctx.type_();
    let functionReturnType: VLType | undefined = returnTypeExpr
      ? toType(returnTypeExpr)
      : undefined;

    const oldReturnTypes = returnTypes.splice(0, Infinity);
    const oldDesiredType = desiredType;
    desiredType = returnTypeExpr ? functionReturnType : undefined;
    const oldReturnType = returnType;
    returnType = functionReturnType;
    const body = toStatement(ctx.statement()) ??
      { type: "Return", value: undefined };
    const bodyType = typeFromStatement(body, ctx);
    const subTypes = returnTypes.splice(0, Infinity, ...oldReturnTypes);
    desiredType = oldDesiredType;
    returnType = oldReturnType;
    if (!functionReturnType) {
      if (bodyType.type !== "Never") subTypes.push(bodyType);
      functionReturnType = softenImplicitType({ type: "Union", subTypes });
    }

    for (const param of parameters) {
      // Should be recursive
      if (param.paramaterType.type === "Infer") {
        updateType(param.paramaterType, makeExact(param.paramaterType));
      }
    }

    name = ctx.ID()?.getText();

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

  if (name) {
    if (name in scopes[scopes.length - 1]) {
      errors.push({ type: "Redeclaration", name, ctx: ctx.ID()!, code: 2 });
    } else scopes[scopes.length - 1][name] = typeFromExpression(node, ctx);
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
});

const toArrayLiteral = (ctx: ArrayContext): VLArrayLiteralNode => ({
  type: "ArrayLiteral",
  values: ctx.expr_list().map((e) => toExpression(e)),
});

const getType = (name: string, ctx: Context): VLType => {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (name in scopes[i]) return scopes[i][name];
  }
  errors.push({ type: "Undeclared", name, ctx, code: "undeclared-type" });
  return { type: "Unknown" };
};

const getChildType = (
  object: VLType,
  property: VLType,
  objectCtx: Context,
  propertyCtx: Context,
) => {
  let infer = false;
  if (object.type === "Infer") {
    infer = true;
    object = object.subType;
    if (object.type === "Unknown") {
      updateType(object, { type: "Object", properties: [] });
    }
  }
  if (object.type !== "Object") {
    errors.push({
      type: "Type",
      left: {
        type: "Object",
        properties: [{ name: property, type: { type: "Unknown" } }],
      },
      right: object,
      ctx: objectCtx,
      code: 4,
    });
    return;
  }

  let propertyType = object.properties.find((p) =>
    validateType(p.name, property)
  );
  if (!propertyType) {
    if (infer) {
      propertyType = {
        name: property,
        type: { type: "Infer", subType: { type: "Unknown" } },
      };
      object.properties.push(propertyType);
    } else {
      errors.push({ type: "Property", property, ctx: propertyCtx, code: 5 });
      return;
    }
  }

  return propertyType.type;
};

const updateType = (oldType: VLType, newType: VLType) => {
  // deno-lint-ignore no-explicit-any
  for (const prop in oldType) delete (oldType as any)[prop];
  Object.assign(oldType, structuredClone(newType));
  return oldType;
};

const nonNullable = (type: VLType): VLType => {
  if (type.type === "Alias" && type.name === "null") return { type: "Never" };
  if (type.type === "Nullable") return nonNullable(type.subType);
  if (type.type === "Union") {
    const subTypes = type.subTypes.map((s) => nonNullable(s));
    if (subTypes.some((s, i) => s !== type.subTypes[i])) {
      const filtered = subTypes.filter((v) => v.type !== "Never");
      if (!filtered.length) return { type: "Never" };
      return { type: "Union", subTypes: filtered };
    }
  }
  return type;
};

/** Registers diagnostics automatically */
const ensureType = (
  left: VLType,
  right: VLType,
  ctx: Context,
): boolean => {
  if (right.type === "Infer" && left.type !== "Infer") {
    [right, left] = [left, right];
  }

  outer: while (left.type === "Alias") {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (left.name in scopes[i]) {
        left = scopes[i][left.name];
        continue outer;
      }
    }
    break;
  }

  outer: while (right.type === "Alias") {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (right.name in scopes[i]) {
        right = scopes[i][right.name];
        continue outer;
      }
    }
    break;
  }

  if (left === right) return true;

  const pushError = (code: number | string) => {
    errors.push({ type: "Type", left, right, ctx, code });
    return false;
  };

  if (left.type === "Never" || right.type === "Never") {
    // We can assume this has already been errored?
    return false;
  }

  if (right.type === "Union") {
    if (!right.subTypes.every((s) => validateType(left, s))) {
      return pushError("union");
    }
    return true;
  }

  switch (left.type) {
    // Unknown is inferrable
    case "Unknown": {
      // TODO: we should keep the literal type if it came from a non-literal node
      // We shouldn't do this at all here, since this is greedy and complex objects may fail later
      updateType(left, softenImplicitType(right));
      return true;
    }
    case "Alias":
      // TODO: this should be inverted for safety...
      if (left.name === "string") {
        if (right.type === "Alias") {
          if (right.name !== "string") return pushError(13);
        } else if (right.type !== "StringLiteral") return pushError(14);
      } else if (left.name === "null") {
        if (
          (right.type !== "Alias" || right.name !== "null") &&
          right === nonNullable(right)
        ) {
          return pushError(17);
        }
      } else {
        let type: VLType | undefined = undefined;
        for (let i = scopes.length - 1; i >= 0; i--) {
          if (left.name in scopes[i]) {
            type = scopes[i][left.name];
            break;
          }
        }
        // We should be showing an error on the type itself
        if (!type) return false;
        if (type.type === "Type") return ensureType(type.subType, right, ctx);
        return ensureType(type, right, ctx);
      }
      return true;
    case "Function":
      if (right.type !== "Function") return pushError(18);
      if (!ensureType(left.return, right.return, ctx)) return false;
      // Could maybe allow right to have extra parameters so long as they are nullable
      if (left.paramaters.length !== right.paramaters.length) {
        return pushError("different-parameters-length");
      }
      for (let i = 0; i < left.paramaters.length; i++) {
        // TODO: eventually should support specifying a function's parameters
        // as position or positional+named, as it's annoying to have the name
        // be part of the signature
        if (left.paramaters[i].name !== right.paramaters[i].name) {
          return pushError("different-parameter-names");
        }
        if (
          !validateType(
            right.paramaters[i].paramaterType,
            left.paramaters[i].paramaterType,
          )
        ) {
          return pushError("different-typed-parameters");
        }
      }
      return true;
      // Technically we should an integer literal outside the i32 range as an exception, same as f32/f64
    case "IntegerLiteral":
      if (right.type !== "IntegerLiteral") return pushError(19);
      if (left.value !== right.value) return pushError(20);
      return true;
    case "RealLiteral":
      if (right.type !== "RealLiteral" && right.type !== "IntegerLiteral") {
        return pushError(19);
      }
      if (left.value !== right.value) return pushError(20);
      return true;
    case "StringLiteral":
      if (right.type !== "StringLiteral") return pushError(21);
      if (left.value !== right.value) return pushError(22);
      return true;
    case "BooleanLiteral":
      if (right.type !== "BooleanLiteral") return pushError(23);
      if (left.value !== right.value) return pushError(24);
      return true;
    case "Object": {
      const assignmentProp = left.properties.find((p) =>
        validateType(p.name, { type: "StringLiteral", value: "=" })
      )?.type;
      if (
        assignmentProp && assignmentProp.type === "Function" &&
        assignmentProp.paramaters.length > 0
      ) {
        return ensureType(
          assignmentProp.paramaters[0].paramaterType,
          right,
          ctx,
        );
      }

      if (right.type !== "Object") return pushError(25);
      const indexProperties = [];
      const rprops = new Set(right.properties);
      outer: for (const lprop of left.properties) {
        if (
          lprop.name.type === "StringLiteral" ||
          lprop.name.type === "IntegerLiteral"
        ) {
          for (const rprop of right.properties) {
            if (validateType(lprop.name, rprop.name)) {
              if (
                (rprop.type.type === "Union" &&
                  rprop.type.subTypes.length === 0) ||
                validateType(lprop.type, rprop.type)
              ) {
                rprops.delete(rprop);
                continue outer;
              }
              return false;
            }
          }
          return pushError("missing-prop");
        } else {
          indexProperties.push(lprop);
          continue;
        }
      }
      if (rprops.size) {
        if (!indexProperties) return pushError(31);
        outer: for (const rprop of rprops.values()) {
          for (const lprop of indexProperties) {
            if (validateType(lprop.name, rprop.name)) continue outer;
          }
          return pushError("extra-prop");
        }
      }
      return true;
    }
    case "Nullable": {
      const nonNullableLeft = nonNullable(left);
      const nonNullableRight = nonNullable(right);
      if (
        (nonNullableRight.type === "Alias" &&
          nonNullableRight.name === "null") ||
        nonNullableRight.type === "Never"
      ) return true;
      if (!validateType(nonNullableLeft, nonNullableRight)) {
        return pushError(27);
      }
      return true;
    }
    case "Union": {
      for (const subType of left.subTypes) {
        const valid = validateType(subType, right);
        if (valid) return true;
      }
      return pushError(28);
    }
    // case "Never":
    //   if (right.type !== "Never") return pushError(29);
    //   return true;
    case "Type":
      if (right.type !== "Type") return pushError(30);
      return ensureType(left, right, ctx);
    case "Infer": {
      if (!validateType(left.subType, right)) {
        if (left.subType.type === "Unknown") updateType(left.subType, right);
        else if (left.subType.type === "Union") {
          left.subType.subTypes.push(softenImplicitType(right));
        } else {
          left.subType = {
            type: "Union",
            subTypes: [left.subType, softenImplicitType(right)],
          };
        }
      }
      return true;
    }
    case "Custom":
      if (!left.validate(right)) return pushError("custom-validation");
      return true;
    default: {
      const exhaustive: never = left;
      console.warn(`Did not type check ${exhaustive}`);
      return false;
    }
  }
};

/** Does not register diangostics */
export const validateType = (left: VLType, right: VLType): boolean => {
  const oldErrors = errors.splice(0, Infinity);
  const ret = ensureType(left, right, null as unknown as Context);
  errors.splice(0, Infinity, ...oldErrors);
  return ret;
};

const ensureParameters = (
  parameters: VLParameterNode[],
  args: VLArgumentNode[],
  ctx: Context,
) => {
  let pass = false;
  const params = [...parameters];

  // First consume named parameters
  for (let i = 0; i < args.length; i++) {
    // const [arg, ctx] = args2[i];
    if (args[i].name) {
      const paramIndex = params.findIndex((p) => p.name === args[i].name);
      const argType = typeFromExpression(args[i].value, args[i].context);
      if (paramIndex === -1) {
        errors.push({ type: "UnmatchedParameter", ctx, code: 8 });
        pass = false;
      } else if (
        ensureType(
          params[paramIndex].paramaterType,
          argType,
          ctx,
        )
        // validateType(
        //   argType,
        //   params[paramIndex].paramaterType,
        //   ctx,
        // )
      ) {
        params.splice(paramIndex, 1);
        args.splice(i, 1);
        i--;
      }
    }
  }

  // Then consume positional ones
  while (args.length) {
    // const [arg, ctx] = args[0];

    if (!params.length) {
      errors.push({
        type: "UnmatchedParameter",
        ctx: args[0].context,
        code: 9,
      });
      pass = false;
      break;
    } else {
      const argType = typeFromExpression(args[0].value, ctx);
      ensureType(params[0].paramaterType, argType, ctx);
      // validateType(argType, params[0].paramaterType, ctx);
      params.splice(0, 1);
      args.splice(0, 1);
    }
  }

  const unmatchedParams = params.filter((p) =>
    p.paramaterType.type !== "Nullable"
  );
  if (unmatchedParams.length) {
    // TODO: indicate how many?
    errors.push({ type: "UnmatchedParameter", ctx, code: 10 });
    pass = false;
  }

  return pass;
};

export const validateParameters = (
  params: VLParameterNode[],
  args: VLArgumentNode[],
) => {
  const oldErrors = errors.splice(0, Infinity);
  const ret = ensureParameters(params, args, null as unknown as Context);
  errors.splice(0, Infinity, ...oldErrors);
  return ret;
};

const toExpression = (ctx: ExprContext): VLExpression => {
  if (ctx.EQUAL()) return toAssignment(ctx);

  {
    const funcDecl = ctx.functionDecl();
    if (funcDecl) return toFunctionDeclaration(funcDecl);
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
        const oldDesiredType = desiredType;
        desiredType = undefined;
        const statements = block.blockStatement_list()
          .map((b) => b.statement())
          .filter(Boolean)
          .map((s): [StatementContext, VLStatement] => [s, toStatement(s)]);
        desiredType = oldDesiredType;
        if (statements.length > 0 && desiredType) {
          const [ctx, stmt] = statements[statements.length - 1];
          if (!validateType(desiredType, { type: "Alias", name: "null" })) {
            ensureType(desiredType, typeFromStatement(stmt, ctx), ctx);
          }
        }
        return {
          type: "Block",
          label: ctx.ID()?.getText(),
          statements: statements.map((s) => s[1]),
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
      return {
        type: Number.isInteger(value) && !text.includes(".")
          ? "IntegerLiteral"
          : "RealLiteral",
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
    const op = ctx.CARET() ?? ctx.STAR() ?? ctx.DIV() ?? ctx.MOD() ??
      ctx.PLUS() ?? ctx.MINUS() ?? ctx.GREATER_THAN() ??
      ctx.GREATER_THAN_OR_EQUAL_TO() ?? ctx.LESS_THAN() ??
      ctx.LESS_THAN_OR_EQUAL_TO() ?? ctx.EQUAL_TO() ?? ctx.NOT_EQUAL_TO() ??
      ctx.AND() ?? ctx.OR();
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
      const name = id.getText();
      const args = call.args()?.arg_list() ?? [];
      const funcCall: VLFunctionCallNode = {
        type: "FunctionCall",
        function: name,
        arguments: args.map((arg): VLArgumentNode => ({
          type: "Argument",
          name: arg.ID()?.getText(),
          value: toExpression(arg.expr()),
          context: arg,
        })),
        functionType: undefined,
      };

      const t = getType(funcCall.function, id);
      if (t.type !== "Unknown") {
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
          ensureParameters(t.paramaters, funcCall.arguments, ctx);
          funcCall.functionType = t;
        }
      }

      return funcCall;
    }
  }

  if (ctx.LPAREN()) return toExpression(ctx.expr(0));

  {
    const ifCtx = ctx.if_();
    if (ifCtx) {
      const conditionCtx = ifCtx.expr();
      const condition = toExpression(conditionCtx);
      const elseCtx = ifCtx.else_();
      return {
        type: "If",
        conditionals: [
          {
            condition,
            statement: toStatement(ifCtx.statement()),
          },
          ...ifCtx.elseIf_list().map((e) => ({
            condition: toExpression(e.expr()),
            statement: toStatement(e.statement()),
          })),
        ],
        else: elseCtx ? toStatement(elseCtx.statement()) : undefined,
      };
    }
  }

  throw new Error(`toExpression not implemented ${ctx.getText()}`);
};

// TODO: Should we validateType or updateType? The former will certainly make
// codegen easier; the latter is more aligned with the goals of vital
const toAssignment = (ctx: ExprContext): VLBinaryOperationNode => {
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
    const right = toExpression(rightCtx);
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
    const right = toExpression(rightCtx);
    const rightType = typeFromExpression(right, rightCtx);
    if (childType) {
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
  const knownType = getType(name, id);
  const rightExpr = ctx.expr(0);
  const right = toExpression(rightExpr);
  const rightType = typeFromExpression(right, rightExpr);
  ensureType(knownType, rightType, rightExpr);
  if (knownType.type === "Infer") updateType(knownType, makeExact(knownType));
  return {
    type: "BinaryOperation",
    left: { type: "Name", name },
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
        if (desiredType) ensureType(desiredType, type, ctx);
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

      scopes.push({ [variable]: fromType });
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
