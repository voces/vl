import { Scope, VLObjectType, VLType, withScope } from "./toAST.ts";

const symmetricOps = (
  name: string,
  paramaterType: VLType,
): VLObjectType["properties"] => [{
  name: {
    type: "Union",
    subTypes: [
      { type: "StringLiteral", value: "-" },
      { type: "StringLiteral", value: "*" },
      { type: "StringLiteral", value: "/" },
      { type: "StringLiteral", value: "%" },
      { type: "StringLiteral", value: "+" },
      { type: "StringLiteral", value: "=" },
    ],
  },
  type: {
    type: "Function",
    paramaters: [{ type: "Parameter", name: "right", paramaterType }],
    return: { type: "Alias", name },
  },
}, {
  name: {
    type: "Union",
    subTypes: [
      { type: "StringLiteral", value: "!=" },
      { type: "StringLiteral", value: "<" },
      { type: "StringLiteral", value: "<=" },
      { type: "StringLiteral", value: "==" },
      { type: "StringLiteral", value: ">" },
      { type: "StringLiteral", value: ">=" },
    ],
  },
  type: {
    type: "Function",
    paramaters: [{ type: "Parameter", name: "right", paramaterType }],
    return: { type: "Alias", name: "boolean" },
  },
}];

export const defaultScope = () => {
  const scope: Scope = {
    i32: {
      type: "Object",
      properties: symmetricOps("i32", {
        type: "Custom",
        validate: Object.assign(
          (right: VLType) =>
            // TODO: should use union type?
            right === scope.i32 || right.type === "IntegerLiteral",
          { toString: () => "i32" },
        ),
        name: "i32",
      }),
      name: "i32",
    },
    i64: {
      type: "Object",
      properties: symmetricOps("i64", {
        type: "Union",
        subTypes: [{ type: "Alias", name: "i32" }, {
          type: "Custom",
          validate: Object.assign(
            (right: VLType) =>
              right === scope.i64 || right.type === "IntegerLiteral",
            { toString: () => "i64" },
          ),
          name: "i64",
        }],
      }),
      name: "i64",
    },
    f32: {
      type: "Object",
      properties: symmetricOps("f32", {
        type: "Custom",
        validate: Object.assign(
          (right: VLType) =>
            right === scope.f32 ||
            right.type === "IntegerLiteral" ||
            right.type === "RealLiteral",
          { toString: () => "f32" },
        ),
        name: "f32",
      }),
      name: "f32",
    },
    f64: {
      type: "Object",
      properties: symmetricOps("f64", {
        type: "Union",
        subTypes: [
          { type: "Alias", name: "i32" },
          { type: "Alias", name: "f32" },
          {
            type: "Custom",
            validate: Object.assign(
              (right: VLType) =>
                right === scope.f64 ||
                right.type === "IntegerLiteral" ||
                right.type === "RealLiteral",
              { toString: () => "f64" },
            ),
            name: "f64",
          },
        ],
      }),
      name: "f64",
    },
    // string: { type: "Type", subType: { type: "Object", properties: [] } },
    boolean: {
      type: "Object",
      properties: [{
        name: {
          type: "Union",
          subTypes: [
            { type: "StringLiteral", value: "!=" },
            { type: "StringLiteral", value: "&&" },
            { type: "StringLiteral", value: "=" },
            { type: "StringLiteral", value: "==" },
            { type: "StringLiteral", value: "||" },
          ],
        },
        type: {
          type: "Function",
          paramaters: [{
            type: "Parameter",
            name: "right",
            paramaterType: {
              type: "Custom",
              validate: Object.assign(
                (right: VLType) =>
                  right === scope.boolean ||
                  right.type === "BooleanLiteral" ||
                  (right.type === "Alias" && right.name === "boolean"),
                { toString: () => "boolean" },
              ),
            },
          }],
          return: { type: "Alias", name: "boolean" },
        },
      }],
      name: "boolean",
    },
  };

  withScope(scope, () => {
    scope.__store_i32__ = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "address",
        paramaterType: { type: "Alias", name: "i32" },
      }, {
        type: "Parameter",
        name: "value",
        paramaterType: { type: "Alias", name: "i32" },
      }],
      return: { type: "Alias", name: "null" },
    };

    scope.__load_i32__ = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "address",
        paramaterType: { type: "Alias", name: "i32" },
      }],
      return: { type: "Alias", name: "i32" },
    };

    scope.__store_i64__ = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "address",
        paramaterType: { type: "Alias", name: "i32" },
      }, {
        type: "Parameter",
        name: "value",
        paramaterType: { type: "Alias", name: "i64" },
      }],
      return: { type: "Alias", name: "null" },
    };

    scope.__store_f32__ = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "address",
        paramaterType: { type: "Alias", name: "i32" },
      }, {
        type: "Parameter",
        name: "value",
        paramaterType: { type: "Alias", name: "f32" },
      }],
      return: { type: "Alias", name: "null" },
    };

    scope.__store_f64__ = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "address",
        paramaterType: { type: "Alias", name: "i32" },
      }, {
        type: "Parameter",
        name: "value",
        paramaterType: { type: "Alias", name: "f64" },
      }],
      return: { type: "Alias", name: "null" },
    };

    scope.__memory_grow__ = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "pages",
        paramaterType: { type: "Alias", name: "i32" },
      }],
      return: {
        // TODO: Should instead return null and be throwable
        type: "Union",
        subTypes: [
          { type: "IntegerLiteral", value: 0, text: "0" },
          { type: "IntegerLiteral", value: 1, text: "1" },
        ],
      },
    };

    scope.log = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "address",
        paramaterType: { type: "Alias", name: "i32" },
      }, {
        type: "Parameter",
        name: "length",
        paramaterType: { type: "Alias", name: "i32" },
      }],
      return: { type: "Alias", name: "null" },
    };
  });

  return scope;
};
