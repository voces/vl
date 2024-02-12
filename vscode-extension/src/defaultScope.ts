import {
  getConcreteType,
  Scope,
  VLObjectType,
  VLType,
  withScope,
} from "./toAST.ts";

const symmetricOps = (
  name: string,
  paramaterType: VLType,
): VLObjectType["properties"] => [{
  name: { type: "StringLiteral", value: "=" },
  type: {
    type: "Function",
    paramaters: [{ type: "Parameter", name: "right", paramaterType }],
    return: { type: "Alias", name },
  },
}, {
  name: { type: "StringLiteral", value: "+" },
  type: {
    type: "Function",
    paramaters: [{ type: "Parameter", name: "right", paramaterType }],
    return: { type: "Alias", name },
  },
}];

export const defaultScope = () => {
  const scope: Scope = {
    i32: {
      type: "Object",
      properties: symmetricOps("i32", {
        type: "Custom",
        validate: Object.assign(
          (right: VLType) => right.type === "IntegerLiteral",
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
            (right: VLType) => right.type === "IntegerLiteral",
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
    // boolean: { type: "Type", subType: { type: "Object", properties: [] } },
  };

  withScope(scope, () => {
    scope.__allocate__ = {
      type: "Function",
      paramaters: [{
        type: "Parameter",
        name: "address",
        paramaterType: { type: "Alias", name: "i32" },
      }],
      return: getConcreteType({ type: "Alias", name: "i32" }, undefined),
    };

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
