// AST + type-system node definitions for VL. Pure types, no runtime.
import { ParserRuleContext, TerminalNode } from "antlr4";

export type Context = ParserRuleContext | TerminalNode;

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
};

// Unary operators: logical not (`!` / `not`) and in/decrement (`++` / `--`).
// `prefix` distinguishes `++x` (returns the new value) from `x++` (the old).
export type VLUnaryOperationNode = {
  type: "UnaryOperation";
  operator: string;
  operand: VLExpression;
  prefix: boolean;
};

export type VLVariableDeclarationNode = {
  type: "VariableDeclaration";
  name: string;
  variableType: VLType;
  value: VLExpression | undefined;
  mutable: boolean;
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
  | VLBinaryOperationNode
  | VLUnaryOperationNode
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
export type VLNeverType = { type: "Never" };
export type VLTypeType = { type: "Type"; subType: VLType };
export type VLInferType = { type: "Infer"; subType: VLType };
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

