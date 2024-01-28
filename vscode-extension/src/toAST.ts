import { ParserRuleContext, TerminalNode } from "antlr4";
import VL_Parser, {
  ArgContext,
  ArrayContext,
  AssignStatementContext,
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
};

type VLValue =
  | VLStringLiteralNode
  | VLNumberLiteralNode
  | VLBooleanLiteralNode
  | VLNullLiteral
  | VLObjectLiteralNode
  | VLFunctionDeclarationNode
  | VLArrayLiteralNode;

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
  properties: { name: VLType; type: VLType; readonly: boolean }[];
};
type VLUnknownType = { type: "Unknown" };
type VLNullableType = { type: "Nullable"; subType: VLType };
type VLUnionType = { type: "Union"; subTypes: VLType[] };
type VLNeverType = { type: "Never" };
type VLTypeType = { type: "Type"; subType: VLType };
export type VLType =
  | VLAliasType
  | VLFunctionType
  | VLObjectType
  | VLStringLiteralNode
  | VLNumberLiteralNode
  | VLBooleanLiteralNode
  | VLUnknownType
  | VLNullableType
  | VLUnionType
  | VLNeverType
  | VLTypeType;

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
    ctx: Context;
    code: number;
  }
  | { type: "Undeclared"; name: string; ctx: Context; code: number }
  | {
    type: "Type";
    left: VLType;
    right: VLType;
    ctx: Context;
    code: number | string;
  }
  | { type: "UnmatchedParameter"; ctx: ParserRuleContext; code: number }
  | { type: "Syntax"; message: string; ctx: Context; code: number }
  | { type: "Property"; property: VLType; ctx: Context; code: number };

const errors: ParseErrors[] = [];

const typeFromExpression = (
  expr: VLExpression,
): VLType => {
  switch (expr.type) {
    case "BinaryOperation": {
      const rightSide = typeFromExpression(expr.right);
      if (expr.operator === "=") return rightSide;
      // Could maybe do math?
      if (rightSide.type === "NumberLiteral") {
        return { type: "Alias", name: "number" };
      }
      // Could maybe do string math? ("a" + "b" = "ab")
      if (rightSide.type === "StringLiteral") {
        return { type: "Alias", name: "string" };
      }
      return rightSide;
    }
    case "Block":
      console.warn("Not inferring type from block yet...");
      return { type: "Never" };
    case "FunctionDeclaration":
      return {
        type: "Function",
        paramaters: expr.parameters,
        return: expr.returnType,
        exceptions: [],
      };
    case "IndexAccess": {
      const objType = typeFromExpression(expr.array);
      if (objType.type !== "Object") return { type: "Never" };
      const oldErrors = [...errors];
      const propType = typeFromExpression(expr.index);
      const property = objType.properties.find((p) =>
        validateType(p.name, propType, null as unknown as Context)
      );
      errors.splice(0, Infinity, ...oldErrors);
      if (!property) return { type: "Never" };
      return property.type;
    }
    case "Name":
      for (let i = scopes.length - 1; i >= 0; i--) {
        if (expr.name in scopes[i]) return scopes[i][expr.name];
      }
      return { type: "Never" };
    case "NumberLiteral":
      return { type: "NumberLiteral", value: expr.value };
    case "StringLiteral":
      return { type: "StringLiteral", value: expr.value };
    case "ObjectLiteral":
      return {
        type: "Object",
        properties: expr.properties
          .map((p) => ({
            name: p.name.type === "Name"
              ? { type: "StringLiteral", value: p.name.name }
              : typeFromExpression(p.name),
            type: typeFromExpression(p.value),
            readonly: false,
          })),
      };
    case "ArrayLiteral": {
      const subTypes: VLType[] = [];
      const oldErrors = [...errors];
      for (const value of expr.values) {
        let type = typeFromExpression(value);
        if (type.type === "NumberLiteral") {
          type = { type: "Alias", name: "number" };
        } else if (type.type === "StringLiteral") {
          type = { type: "Alias", name: "string" };
        }
        if (
          subTypes.every((s) =>
            !validateType(s, type, null as unknown as Context)
          )
        ) subTypes.push(type);
      }
      errors.splice(0, Infinity, ...oldErrors);
      return {
        type: "Object",
        properties: [{
          name: { type: "Alias", name: "number" },
          type: subTypes.length === 1
            ? subTypes[0]
            // Do we need to special case empty arrays? Empty arrays are contravariant, assignable to known arrays but
            // -
            // -
            : { type: "Union", subTypes },
          readonly: false,
        }],
      };
    }
    case "PropertyAccess": {
      const objType = typeFromExpression(expr.object);
      if (objType.type !== "Object") return { type: "Never" };
      const oldErrors = [...errors];
      const propType: VLStringLiteralNode = {
        type: "StringLiteral",
        value: expr.property,
      };
      const property = objType.properties.find((p) =>
        validateType(p.name, propType, null as unknown as Context)
      );
      errors.splice(0, Infinity, ...oldErrors);
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
      console.warn("Undefined function?", expr.function);
      return { type: "Never" };
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
    errors.push({ type: "Redeclaration", name: node.name, ctx, code: 0 });
  }
  if (node.value) {
    const valueType = typeFromExpression(node.value);
    if (node.variableType.type === "Unknown") {
      node.variableType = valueType;
      if (
        node.variableType.type === "Alias" && node.variableType.name === "null"
      ) {
        node.variableType = { type: "Nullable", subType: { type: "Unknown" } };
      } else if (node.variableType.type === "StringLiteral") {
        node.variableType = { type: "Alias", name: "string" };
      } else if (node.variableType.type === "NumberLiteral") {
        node.variableType = { type: "Alias", name: "number" };
      }
    } else validateType(node.variableType, valueType, expr);
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
    if (id) {
      const name = id.getText();
      if (name !== "string" && name !== "number" && name !== "boolean") {
        let found = false;
        for (let i = scopes.length - 1; i >= 0; i--) {
          if (name in scopes[i]) {
            found = true;
            break;
          }
        }
        if (!found) errors.push({ type: "Undeclared", name, ctx, code: 1 });
      }
      return { type: "Alias", name };
    }
  }

  {
    const pipe = ctx.PIPE();
    if (pipe) {
      const union: VLUnionType = {
        type: "Union",
        subTypes: [toType(ctx.type_(0)), toType(ctx.type_(1))],
      };
      return union;
    }
  }

  {
    const null_ = ctx.NULL();
    if (null_) return { type: "Alias", name: "null" };
  }

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
      return { type: "NumberLiteral", value: parseFloat(nLit.getText()) };
    }
  }

  {
    const true_ = ctx.TRUE();
    if (true_) return { type: "BooleanLiteral", value: true };
  }

  {
    const false_ = ctx.FALSE();
    if (false_) return { type: "BooleanLiteral", value: false };
  }

  {
    const paren = ctx.LPAREN();
    if (paren) return toType(ctx.type_(0));
  }

  {
    const pipe = ctx.PIPE();
    if (pipe) {
      return {
        type: "Union",
        subTypes: [toType(ctx.type_(0)), toType(ctx.type_(1))],
      };
    }
  }

  {
    const brack = ctx.LBRACK();
    if (brack) {
      return {
        type: "Object",
        properties: [{
          name: { type: "Alias", name: "number" },
          type: toType(ctx.type_(0)),
          readonly: false,
        }],
      };
    }
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
    const statements = (block
      ? block.blockStatement_list().map((b) =>
        b.statement()
      ).filter(Boolean).map(toStatement)
      : [toStatement(stmt)]).filter(<T>(s: T | undefined): s is T => !!s);
    const returnType = ctx.type_();
    const node: VLFunctionDeclarationNode = {
      type: "FunctionDeclaration",
      name: ctx.ID()?.getText(),
      parameters,
      body: statements,
      returnType: returnType ? toType(returnType) : { type: "Never" },
      scope,
    };

    scopes.pop();

    if (node.name) {
      if (node.name in scopes[scopes.length - 1]) {
        errors.push({
          type: "Redeclaration",
          name: node.name,
          ctx: ctx.ID()!,
          code: 2,
        });
      }
      scopes[scopes.length - 1][node.name] = typeFromExpression(node);
    }

    return node;
  } catch (err) {
    scopes.pop();
    throw err;
  }
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
  values: ctx.expr_list().map(toExpression),
});

const getType = (name: string, ctx: Context): VLType => {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (name in scopes[i]) return scopes[i][name];
  }
  errors.push({ type: "Undeclared", name, ctx, code: 3 });
  return { type: "Unknown" };
};

const getChildType = (
  object: VLType,
  property: VLType,
  objectCtx: Context,
  propertyCtx: Context,
) => {
  if (object.type !== "Object") {
    errors.push({
      type: "Type",
      left: {
        type: "Object",
        properties: [{
          name: property,
          type: { type: "Unknown" },
          readonly: false,
        }],
      },
      right: object,
      ctx: objectCtx,
      code: 4,
    });
    return;
  }

  const oldErrors = [...errors];
  const propertyType = object.properties.find((p) =>
    validateType(p.name, property, propertyCtx)
    // && (p.type.type !== "Union" || p.type.subTypes.length > 0)
  );
  errors.splice(0, Infinity, ...oldErrors);
  if (!propertyType) {
    errors.push({ type: "Property", property, ctx: propertyCtx, code: 5 });
    return;
  }

  return propertyType.type;
};

const validateType = (
  left: VLType,
  right: VLType,
  ctx: Context,
): boolean => {
  const pushError = (code: number | string) => {
    errors.push({ type: "Type", left, right, ctx, code });
    return false;
  };

  switch (left.type) {
    // Unknown is inferrable
    case "Unknown": {
      // TODO: we should keep the literal type if it came from a non-literal node
      // We shouldn't do this at all here, since this is greedy and complex objects may fail later
      if (right.type === "NumberLiteral") {
        Object.assign(left, { type: "Alias", name: "number" });
      } else if (right.type === "StringLiteral") {
        Object.assign(left, { type: "Alias", name: "string" });
      } else Object.assign(left, structuredClone(right));
      return true;
    }
    case "Alias":
      if (left.name === "number") {
        if (right.type === "Alias") {
          if (right.name !== "number") return pushError(6);
        } else if (right.type !== "NumberLiteral") return pushError(12);
      } else if (left.name === "string") {
        if (right.type === "Alias") {
          if (right.name !== "string") return pushError(13);
        } else if (right.type !== "StringLiteral") return pushError(14);
      } else if (left.name === "boolean") {
        if (right.type === "Alias") {
          if (right.name !== "boolean") return pushError(15);
        } else if (right.type !== "BooleanLiteral") return pushError(16);
      } else if (left.name === "null") {
        if (right.type !== "Alias" || right.name !== "null") {
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
        if (type.type === "Type") return validateType(type.subType, right, ctx);
        return validateType(type, right, ctx);
      }
      return true;
    case "Function":
      if (right.type !== "Function") return pushError(18);
      if (!validateType(left.return, right.return, ctx)) return false;
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
        const oldErrors = [...errors];
        if (
          !validateType(
            right.paramaters[i].paramaterType,
            left.paramaters[i].paramaterType,
            ctx,
          )
        ) {
          errors.splice(0, Infinity, ...oldErrors);
          return pushError("different-typed-parameters");
        }
      }
      return true;
    case "NumberLiteral":
      if (right.type !== "NumberLiteral") return pushError(19);
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
      if (right.type !== "Object") return pushError(25);
      const indexProperties = [];
      const rprops = new Set(right.properties);
      outer: for (const lprop of left.properties) {
        if (
          lprop.name.type === "StringLiteral" ||
          lprop.name.type === "NumberLiteral"
        ) {
          for (const rprop of right.properties) {
            const oldErrors = [...errors];
            if (validateType(lprop.name, rprop.name, ctx)) {
              errors.push(...oldErrors);
              if (
                (rprop.type.type === "Union" &&
                  rprop.type.subTypes.length === 0) ||
                validateType(lprop.type, rprop.type, ctx)
              ) {
                rprops.delete(rprop);
                continue outer;
              }
              return false;
            } else errors.splice(0, Infinity, ...oldErrors);
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
            const oldErrors = [...errors];
            if (validateType(lprop.name, rprop.name, ctx)) {
              errors.push(...oldErrors);
              continue outer;
            } else errors.splice(0, Infinity, ...oldErrors);
          }
          return pushError("extra-prop");
        }
      }
      return true;
    }
    case "Nullable": {
      let subLeft: VLType = left;
      let subRight = right;
      while (subLeft.type === "Nullable") subLeft = subLeft.subType;
      while (subRight.type === "Nullable") subRight = subRight.subType;
      if (
        (subRight.type === "Alias" && subRight.name === "null") ||
        subRight.type === "Unknown"
      ) return true;
      const oldErrors = [...errors];
      errors.splice(0);
      const ret = validateType(subLeft, subRight, ctx);
      if (!ret) {
        errors.splice(0, Infinity, ...oldErrors);
        return pushError(27);
      }
      return true;
    }
    case "Union": {
      const oldErrors = [...errors];
      errors.splice(0);
      for (const subType of left.subTypes) {
        const valid = validateType(subType, right, ctx);
        if (valid) {
          errors.splice(0, Infinity, ...oldErrors);
          return true;
        }
      }
      errors.splice(0, Infinity, ...oldErrors);
      return pushError(28);
    }
    case "Never":
      if (right.type !== "Never") return pushError(29);
      return true;
    case "Type":
      if (right.type !== "Type") return pushError(30);
      return validateType(left, right, ctx);
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
    const dot = ctx.DOT();
    if (dot) {
      const expr = ctx.expr(0);
      const object = toExpression(expr);
      const id = ctx.ID();
      const property = id.getText();
      getChildType(
        typeFromExpression(object),
        { type: "StringLiteral", value: property },
        expr,
        id,
      );
      return { type: "PropertyAccess", object, property };
    }
  }

  {
    const lbrack = ctx.LBRACK();
    if (lbrack) {
      const expr1 = ctx.expr(0);
      const array = toExpression(expr1);
      const expr2 = ctx.expr(1);
      const index = toExpression(expr2);
      getChildType(
        typeFromExpression(array),
        typeFromExpression(index),
        expr1,
        expr2,
      );
      return { type: "IndexAccess", array, index };
    }
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
        const statements = block.blockStatement_list()
          .map((b) => b.statement())
          .filter(Boolean)
          .map(toStatement)
          .filter(<T>(s: T | undefined): s is T => !!s);
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
    const arr = ctx.array();
    if (arr) return toArrayLiteral(arr);
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
      const args = call.args()?.arg_list() ?? [];
      const funcCall: VLFunctionCallNode = {
        type: "FunctionCall",
        function: id.getText(),
        arguments: args.map((a): VLArgumentNode => ({
          type: "Argument",
          name: a.ID()?.getText(),
          value: toExpression(a.expr()),
        })),
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
              exceptions: [],
            },
            right: t,
            ctx: id,
            code: 7,
          });
        } else {
          const args2 = funcCall.arguments.map((
            a,
            i,
          ): [VLArgumentNode, ArgContext] => [a, args[i]]);
          const params = [...t.paramaters];
          // First consume named parameters
          for (let i = 0; i < args2.length; i++) {
            const [arg, ctx] = args2[i];
            if (arg.name) {
              console.log("arg name match", arg.name);
              const paramIndex = params.findIndex((p) => p.name === arg.name);
              if (paramIndex === -1) {
                errors.push({ type: "UnmatchedParameter", ctx, code: 8 });
              } else if (
                validateType(
                  params[paramIndex].paramaterType,
                  typeFromExpression(arg.value),
                  ctx,
                )
              ) {
                params.splice(paramIndex, 1);
                args2.splice(i, 1);
                i--;
              } else {
                console.log("no matchy?", arg, ctx, params);
              }
            } else console.log("arg name no match", arg);
          }
          // Then consume positional ones
          while (args2.length) {
            const [arg, ctx] = args2[0];
            if (!params.length) {
              errors.push({ type: "UnmatchedParameter", ctx, code: 9 });
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
            // TODO: indicate how many?
            errors.push({ type: "UnmatchedParameter", ctx, code: 10 });
          }
        }
      }

      return funcCall;
    }
  }

  throw new Error(`toExpression not implemented ${ctx.getText()}`);
};

const toAssignment = (ctx: AssignStatementContext): VLBinaryOperationNode => {
  if (ctx.DOT()) {
    const objectCtx = ctx.expr(0);
    const object = toExpression(objectCtx);
    const objectType = typeFromExpression(object);
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
    const rightType = typeFromExpression(right);
    if (childType) validateType(childType, rightType, rightCtx);
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
    const arrayType = typeFromExpression(array);
    const indexCtx = ctx.expr(1);
    const index = toExpression(indexCtx);
    const childType = getChildType(
      arrayType,
      typeFromExpression(index),
      arrayCtx,
      indexCtx,
    );
    const rightCtx = ctx.expr(2);
    const right = toExpression(rightCtx);
    const rightType = typeFromExpression(right);
    if (childType) {
      if (childType.type === "Union" && childType.subTypes.length === 0) {
        if (right.type === "NumberLiteral") {
          Object.assign(childType, { type: "Alias", name: "number" });
        } else if (right.type === "StringLiteral") {
          Object.assign(childType, { type: "Alias", name: "string" });
        } else {
          Object.assign(childType, structuredClone(rightType));
          // @ts-expect-error Can't delete, but we can!
          if (rightType.type !== "Union") delete childType.subTypes;
        }
      } else validateType(childType, rightType, rightCtx);
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

const toTypeStatement = (ctx: TypeStatementContext) => {
  const name = ctx.ID().getText();
  if (name in scopes[scopes.length - 1]) {
    errors.push({ type: "Redeclaration", name: name, ctx, code: 11 });
  }
  const type = ctx.type_();
  scopes[scopes.length - 1][name] = {
    type: "Type",
    subType: type ? toType(ctx.type_()) : { type: "Alias", name },
  };
  return undefined;
};

const toStatement = (ctx: StatementContext): VLStatement | undefined => {
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

  {
    const type = ctx.typeStatement();
    if (type) return toTypeStatement(type);
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
  console.log(cst.toStringTree(VL_Parser.ruleNames, cst.parser!));

  scopes.splice(0);
  errors.splice(0);

  const program: VLProgramNode = {
    type: "Program",
    statements: [],
    scope: {
      // number: { type: "Type", subType: { type: "Object", properties: [] } },
      // string: { type: "Type", subType: { type: "Object", properties: [] } },
      // boolean: { type: "Type", subType: { type: "Object", properties: [] } },
    },
  };

  scopes.push(program.scope);

  for (const blkStmt of cst.blockStatement_list()) {
    const stmt = blkStmt.statement();
    if (stmt) {
      try {
        const ast = toStatement(stmt);
        if (ast) program.statements.push(ast);
      } catch (err) {
        console.error(err);
      }
    }
  }

  return [program, errors];
};
